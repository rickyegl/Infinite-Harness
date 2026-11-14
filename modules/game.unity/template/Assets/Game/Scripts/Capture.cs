// Records the game camera to numbered JPGs at a fixed frame rate (Time.captureFramerate), so a 10 s capture
// is smooth however slow the machine renders. The editor bridge turns the frames into an mp4 with ffmpeg.
// With director on, a Director moves the camera between angles, and events.json beside the frames logs each cut
// (frame, angle, kart), each landed hit (frame, class, whether its target was on screen and where across it) and
// each attack (the same, for the attacker: a dash, a shot or a throw shows even when it misses), so the trailer's
// edit can keep a shot inside one angle and put the fights in.

using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using UnityEngine;

namespace HarnessGame
{
    [DefaultExecutionOrder(1000)]   // after the cameras have moved
    public class Capture : MonoBehaviour
    {
        public string outDir;
        public int fps = 30, width = 1280, height = 720;
        public float seconds = 10f, warmup = 0.5f;
        public bool hud = true;         // false: hide every HUD canvas while recording
        public bool director;           // true: a Director cuts between angles on the fights (trailers)
        public float startDist = -1f;   // when >= 0, wait until the player's kart is this far along the lap
        public int frame;
        public bool done;
        public int hitCount;
        RenderTexture rt;
        Texture2D tex;
        float t;
        Director dir;
        RaceManager hooked;
        int loggedShot = -1;
        readonly List<(Kart by, Kart target)> pending = new List<(Kart, Kart)>();
        readonly List<Kart> attacking = new List<Kart>();
        readonly StringBuilder cuts = new StringBuilder(), hits = new StringBuilder(), attacks = new StringBuilder();

        void Start()
        {
            Directory.CreateDirectory(outDir);
            Time.captureFramerate = fps;
            rt = new RenderTexture(width, height, 24, RenderTextureFormat.ARGB32) { antiAliasing = 4 };
            tex = new Texture2D(width, height, TextureFormat.RGB24, false);
        }

        void OnHit(Kart by, Kart target) => pending.Add((by, target));
        void OnAttack(Kart by) => attacking.Add(by);

        void LateUpdate()
        {
            if (done) return;
            var race = RaceManager.Main;
            if (hooked != race) { Unhook(); if (race) { race.onHit += OnHit; race.onAttack += OnAttack; } hooked = race; }
            var cam = Camera.main;
            if (director && cam && !dir) { dir = cam.GetComponent<Director>(); if (!dir) dir = cam.gameObject.AddComponent<Director>(); }
            t += Time.deltaTime;
            bool rolling = t >= warmup && !(startDist >= 0 && race && race.player && race.player.dist < startDist) && cam;
            if (!rolling) { pending.Clear(); attacking.Clear(); return; }
            if (dir && dir.shot != loggedShot && dir.subject)
            {
                loggedShot = dir.shot;
                cuts.Append(cuts.Length > 0 ? "," : "").Append("{\"f\":").Append(frame).Append(",\"rig\":\"").Append(dir.rig).Append("\",\"kart\":\"").Append(Esc(dir.subject.kartName)).Append("\"}");
            }
            foreach (var (by, target) in pending)
            {
                if (!by || !target) continue;
                Log(hits, cam, by.kind, target);
                hitCount++;
            }
            foreach (var by in attacking) if (by) Log(attacks, cam, by.kind, by);
            pending.Clear();
            attacking.Clear();
            if (!hud)
                foreach (var c in Object.FindObjectsByType<Canvas>(FindObjectsSortMode.None))
                    if (c.enabled) c.enabled = false;
            Shots.Render(cam, rt);
            var prev = RenderTexture.active;
            RenderTexture.active = rt;
            tex.ReadPixels(new Rect(0, 0, width, height), 0, 0);
            tex.Apply(false);
            RenderTexture.active = prev;
            File.WriteAllBytes(Path.Combine(outDir, $"frame_{frame:00000}.jpg"), tex.EncodeToJPG(88));
            frame++;
            if (frame >= Mathf.RoundToInt(seconds * fps))
            {
                done = true;
                Time.captureFramerate = 0;
                File.WriteAllText(Path.Combine(outDir, "events.json"), "{\"fps\":" + fps + ",\"frames\":" + frame + ",\"cuts\":[" + cuts + "],\"hits\":[" + hits + "],\"attacks\":[" + attacks + "]}");
                File.WriteAllText(Path.Combine(outDir, "done.json"), "{\"frames\":" + frame + ",\"fps\":" + fps + "}");
            }
        }

        /// one fight event: the frame, the class, and whether the kart was on screen and where across it
        void Log(StringBuilder sb, Camera cam, string kind, Kart k)
        {
            var v = cam.WorldToViewportPoint(k.transform.position + k.transform.up * 0.8f);
            bool seen = v.z > 0 && v.x > 0.04f && v.x < 0.96f && v.y > 0.04f && v.y < 0.96f;
            sb.Append(sb.Length > 0 ? "," : "").Append("{\"f\":").Append(frame).Append(",\"kind\":\"").Append(kind)
                .Append("\",\"seen\":").Append(seen ? "true" : "false").Append(",\"x\":").Append(Mathf.Clamp01(v.x).ToString("0.###", CultureInfo.InvariantCulture)).Append('}');
        }

        void Unhook()
        {
            if (hooked) { hooked.onHit -= OnHit; hooked.onAttack -= OnAttack; }
        }

        static string Esc(string s) => (s ?? "").Replace("\\", "").Replace("\"", "");

        void OnDestroy()
        {
            Unhook();
            Time.captureFramerate = 0;
            if (rt) rt.Release();
        }
    }

    public static class Shots
    {
        /// render one camera into a texture (works in edit mode and in play mode, with the HUD canvas)
        public static void Render(Camera cam, RenderTexture rt)
        {
            // the HUD canvas lays itself out for the camera's target, so point the camera at the texture first
            var old = cam.targetTexture;
            cam.targetTexture = rt;
            Relayout();
            var req = new UnityEngine.Rendering.RenderPipeline.StandardRequest { destination = rt };
            if (UnityEngine.Rendering.RenderPipeline.SupportsRenderRequest(cam, req))
                UnityEngine.Rendering.RenderPipeline.SubmitRenderRequest(cam, req);
            else
                cam.Render();
            cam.targetTexture = old;
            Relayout();
        }

        static void Relayout()
        {
            foreach (var s in Object.FindObjectsByType<UnityEngine.UI.CanvasScaler>(FindObjectsSortMode.None))
                if (s.enabled) { s.enabled = false; s.enabled = true; }
            Canvas.ForceUpdateCanvases();
        }

        public static void Save(Camera cam, string file, int w = 1280, int h = 720)
        {
            var rt = new RenderTexture(w, h, 24, RenderTextureFormat.ARGB32) { antiAliasing = 4 };
            rt.Create();
            Render(cam, rt);
            var tex = new Texture2D(w, h, TextureFormat.RGB24, false);
            var prev = RenderTexture.active;
            RenderTexture.active = rt;
            tex.ReadPixels(new Rect(0, 0, w, h), 0, 0);
            tex.Apply(false);
            RenderTexture.active = prev;
            Directory.CreateDirectory(Path.GetDirectoryName(file));
            File.WriteAllBytes(file, file.EndsWith(".png") ? tex.EncodeToPNG() : tex.EncodeToJPG(90));
            rt.Release();
            Object.DestroyImmediate(rt);
            Object.DestroyImmediate(tex);
        }
    }
}
