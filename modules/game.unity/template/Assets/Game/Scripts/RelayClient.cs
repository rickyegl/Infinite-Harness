// Crossplay: sends the player's kart to the bridge's /relay room ten times a second and shows every other
// player as a ghost rider. Positions travel in track space (share of a lap, share of the half width,
// heading against the road), so the Roblox game can use its own scale.
// Message: {"id","eng","name","c","p","l","h","v","lap"} with v in laps per second.

using System;
using System.Collections.Generic;
using UnityEngine;
#if UNITY_WEBGL && !UNITY_EDITOR
using System.Runtime.InteropServices;
#else
using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
#endif

namespace HarnessGame
{
    [Serializable]
    public class RelayMsg
    {
        public string id, eng, name, c;
        public float p, l, h, v;
        public int lap;
    }

    public class RelayClient : MonoBehaviour
    {
        public RaceManager race;
        public string url = "";
        public bool on;
        string myId;
        float sendT;
        readonly Dictionary<string, Ghost> ghosts = new Dictionary<string, Ghost>();

        public static RelayClient Main { get; private set; }
        void OnEnable() { Main = this; }
        void Awake() { myId = "u-" + Guid.NewGuid().ToString("N").Substring(0, 8); }

#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")] static extern void RelayOpen(string url);
        [DllImport("__Internal")] static extern void RelaySend(string msg);
        [DllImport("__Internal")] static extern string RelayPoll();
        [DllImport("__Internal")] static extern void RelayClose();
        void Open(string u) => RelayOpen(u);
        void Send(string m) => RelaySend(m);
        IEnumerable<string> Drain() { var s = RelayPoll(); return string.IsNullOrEmpty(s) ? Array.Empty<string>() : s.Split('\n'); }
        void Close() => RelayClose();
#else
        ClientWebSocket ws;
        CancellationTokenSource cts;
        readonly ConcurrentQueue<string> inbox = new ConcurrentQueue<string>();
        void Open(string u)
        {
            Close();
            if (!u.StartsWith("ws")) u = "ws://127.0.0.1:7411" + (u.StartsWith("/") ? "" : "/") + u;
            ws = new ClientWebSocket(); cts = new CancellationTokenSource();
            var sock = ws; var tok = cts.Token;
            _ = System.Threading.Tasks.Task.Run(async () =>
            {
                try
                {
                    await sock.ConnectAsync(new Uri(u), tok);
                    var buf = new byte[16384];
                    while (sock.State == WebSocketState.Open && !tok.IsCancellationRequested)
                    {
                        var r = await sock.ReceiveAsync(new ArraySegment<byte>(buf), tok);
                        if (r.MessageType == WebSocketMessageType.Close) break;
                        if (inbox.Count < 512) inbox.Enqueue(Encoding.UTF8.GetString(buf, 0, r.Count));
                    }
                }
                catch (Exception e) { Debug.LogWarning("relay: " + e.Message); }
            });
        }
        void Send(string m)
        {
            if (ws == null || ws.State != WebSocketState.Open) return;
            _ = ws.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(m)), WebSocketMessageType.Text, true, cts.Token);
        }
        IEnumerable<string> Drain() { while (inbox.TryDequeue(out var s)) yield return s; }
        void Close() { try { cts?.Cancel(); ws?.Dispose(); } catch { } ws = null; }
        void OnDestroy() => Close();
#endif

        public void Set(bool enable, string u)
        {
            if (enable == on && u == url) return;
            on = enable; url = u;
            if (on && !string.IsNullOrEmpty(url)) { Open(url); Debug.Log("[harness] relay on " + url); }
            else { Close(); foreach (var g in ghosts.Values) if (g) Destroy(g.gameObject); ghosts.Clear(); }
        }

        void Update()
        {
            if (!on || race == null || race.path == null) return;
            var L = race.path.Length;
            var me = race.player;
            sendT -= Time.unscaledDeltaTime;
            if (me && sendT <= 0)
            {
                sendT = 0.1f;
                var m = new RelayMsg
                {
                    id = myId, eng = "unity", name = me.kartName, c = "#" + ColorUtility.ToHtmlStringRGB(me.color),
                    p = Mathf.Repeat(me.dist, L) / L, l = me.lateral / race.path.HalfWidth,
                    h = Mathf.Clamp(me.latVel / Mathf.Max(4f, me.speed) * 40f, -25f, 25f), v = me.speed / L, lap = me.Lap(L),
                };
                Send(JsonUtility.ToJson(m));
            }
            foreach (var line in Drain())
            {
                if (string.IsNullOrEmpty(line) || line[0] != '{') continue;
                RelayMsg m;
                try { m = JsonUtility.FromJson<RelayMsg>(line); } catch { continue; }
                if (m == null || string.IsNullOrEmpty(m.id) || m.id == myId) continue;
                if (!ghosts.TryGetValue(m.id, out var g) || !g)
                {
                    g = Ghost.Build(transform, GameKit.Load(), m);
                    ghosts[m.id] = g;
                }
                g.Receive(m);
            }
            var gone = new List<string>();
            foreach (var kv in ghosts)
            {
                if (!kv.Value) { gone.Add(kv.Key); continue; }
                kv.Value.Follow(race.path);
                if (kv.Value.Silent > 4f) { Destroy(kv.Value.gameObject); gone.Add(kv.Key); }
            }
            foreach (var k in gone) ghosts.Remove(k);
        }
    }

    /// another player's kart: a translucent kart and rider with a name tag, eased between relay updates
    public class Ghost : MonoBehaviour
    {
        float p, l, h, v, age;
        float shownP, shownL;
        bool first = true;
        public float Silent => age;
        public TextMesh tag;

        public static Ghost Build(Transform parent, GameKit kit, RelayMsg m)
        {
            var go = new GameObject("Ghost " + m.name);
            go.transform.SetParent(parent, false);
            var g = go.AddComponent<Ghost>();
            var c = GameConfig.Hex(m.c, new Color(0.6f, 0.8f, 1f));
            var mat = kit.Ghost(Color.Lerp(c, new Color(0.7f, 0.9f, 1f), 0.5f));
            Prim.Make(PrimitiveType.Cube, go.transform, new Vector3(0, 0.45f, 0), new Vector3(1.5f, 0.35f, 2.4f), mat);
            Prim.Make(PrimitiveType.Capsule, go.transform, new Vector3(0, 1.6f, -0.35f), new Vector3(0.62f, 0.45f, 0.42f), mat);
            Prim.Make(PrimitiveType.Sphere, go.transform, new Vector3(0, 2.4f, -0.35f), Vector3.one * 0.45f, mat);
            var t = new GameObject("Tag");
            t.transform.SetParent(go.transform, false);
            t.transform.localPosition = new Vector3(0, 3.3f, 0);
            g.tag = t.AddComponent<TextMesh>();
            g.tag.text = m.name + (m.eng == "roblox" ? "  [Roblox]" : "");
            g.tag.anchor = TextAnchor.MiddleCenter; g.tag.characterSize = 0.18f; g.tag.fontSize = 48; g.tag.color = c;
            g.tag.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            t.GetComponent<MeshRenderer>().sharedMaterial = g.tag.font.material;
            return g;
        }

        public void Receive(RelayMsg m)
        {
            p = m.p; l = m.l; h = m.h; v = m.v; age = 0;
            if (first) { shownP = p; shownL = l; first = false; }
        }

        public void Follow(TrackPath path)
        {
            float dt = Time.deltaTime;
            age += dt;
            p += v * dt;   // extrapolate between updates
            float dp = Mathf.DeltaAngle(shownP * 360f, p * 360f) / 360f;
            shownP = Mathf.Repeat(shownP + dp * Mathf.Min(1f, dt * 8f), 1f);
            shownL = Mathf.Lerp(shownL, l, Mathf.Min(1f, dt * 8f));
            var pose = path.PoseAt(shownP * path.Length, shownL * path.HalfWidth, h);
            transform.SetPositionAndRotation(pose.position, pose.rotation);
            if (tag && Camera.main) tag.transform.rotation = Quaternion.LookRotation(tag.transform.position - Camera.main.transform.position);
        }
    }
}
