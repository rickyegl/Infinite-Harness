// One kart and its rider. Arcade physics in track space: speed along the line, a sideways offset with its own
// velocity, a pull to the outside in corners, wall bounces, spin-outs. RaceManager steps every kart.

using UnityEngine;

namespace HarnessGame
{
    public class Kart : MonoBehaviour
    {
        public int index;
        public string kartName = "Kart";
        public Color color = Color.red;
        public bool isPlayer;

        // track-space state
        public float dist;          // metres along the centre line since the start (can pass several laps)
        public float lateral;       // metres right of the centre line
        public float speed;         // m/s along the line
        public float latVel;        // m/s sideways
        public float throttle, steer;   // inputs, -1..1
        public bool wantsAttack;
        public float stun;          // seconds of spin-out left
        public float cooldown;      // seconds until the rider can swing again
        public float finishTime = -1;
        public int place = 1;

        // driver personality (AI)
        public float skill = 0.9f, lineBias, lineWobble;

        public Rider rider;
        public Transform body, visual;
        Renderer[] flashRenderers;
        MaterialPropertyBlock mpb;
        float flash, spinAngle;
        public Light[] headlights = new Light[0];
        // hover sections: wheels fold flat, a glow pad lights up underneath
        public float hoverAmt;
        Transform[] tyres = new Transform[0];
        GameObject[] hubs = new GameObject[0];
        Transform pad;

        public int Lap(float trackLength) => Mathf.Max(0, Mathf.FloorToInt(dist / trackLength));

        public static Kart Build(Transform parent, GameKit kit, GameConfig cfg, int i)
        {
            var ks = cfg.karts;
            var col = GameConfig.Hex(ks.colors[i % ks.colors.Length], Color.red);
            var go = new GameObject("Kart" + i);
            go.transform.SetParent(parent, false);
            var k = go.AddComponent<Kart>();
            k.index = i;
            k.kartName = ks.names[i % ks.names.Length];
            k.color = col;
            k.visual = Prim.Node("Visual", go.transform);
            k.body = Prim.Node("Body", k.visual);
            var paint = kit.Lit(col, 0.6f, 0.2f);
            var dark = kit.Lit(new Color(0.1f, 0.1f, 0.12f), 0.3f);
            var chrome = kit.Lit(new Color(0.75f, 0.75f, 0.8f), 0.8f, 0.9f);
            Prim.Make(PrimitiveType.Cube, k.body, new Vector3(0, 0.45f, 0), new Vector3(1.5f, 0.35f, 2.4f), paint, "Chassis");
            Prim.Make(PrimitiveType.Cube, k.body, new Vector3(0, 0.55f, 1.25f), new Vector3(1.2f, 0.25f, 0.5f), paint, "Nose", Quaternion.Euler(12, 0, 0));
            Prim.Make(PrimitiveType.Cube, k.body, new Vector3(0, 0.75f, -1.05f), new Vector3(1.6f, 0.12f, 0.35f), dark, "Spoiler");
            Prim.Make(PrimitiveType.Cube, k.body, new Vector3(0, 0.75f, -0.35f), new Vector3(0.8f, 0.3f, 0.7f), dark, "Seat");
            Prim.Make(PrimitiveType.Cylinder, k.body, new Vector3(0, 0.95f, 0.45f), new Vector3(0.5f, 0.04f, 0.5f), dark, "Wheel", Quaternion.Euler(60, 0, 0));
            var tyres = new System.Collections.Generic.List<Transform>();
            var hubs = new System.Collections.Generic.List<GameObject>();
            foreach (var w in new[] { new Vector3(-0.85f, 0.32f, 0.85f), new Vector3(0.85f, 0.32f, 0.85f), new Vector3(-0.85f, 0.34f, -0.85f), new Vector3(0.85f, 0.34f, -0.85f) })
            {
                tyres.Add(Prim.Make(PrimitiveType.Cylinder, k.body, w, new Vector3(0.62f, 0.16f, 0.62f), dark, "Tyre", Quaternion.Euler(0, 0, 90)).transform);
                hubs.Add(Prim.Make(PrimitiveType.Cylinder, k.body, w + new Vector3(Mathf.Sign(w.x) * 0.17f, 0, 0), new Vector3(0.32f, 0.02f, 0.32f), chrome, "Hub", Quaternion.Euler(0, 0, 90)));
            }
            k.tyres = tyres.ToArray();
            k.hubs = hubs.ToArray();
            k.pad = Prim.Make(PrimitiveType.Sphere, k.body, new Vector3(0, 0.12f, 0), new Vector3(1.9f, 0.04f, 2.8f), kit.Glow(new Color(0f, 0.8f, 1f), 2f), "HoverPad").transform;
            k.pad.gameObject.SetActive(false);
            Prim.Make(PrimitiveType.Cylinder, k.body, new Vector3(-0.35f, 0.5f, -1.3f), new Vector3(0.14f, 0.12f, 0.14f), chrome, "Exhaust", Quaternion.Euler(90, 0, 0));
            Prim.Make(PrimitiveType.Cylinder, k.body, new Vector3(0.35f, 0.5f, -1.3f), new Vector3(0.14f, 0.12f, 0.14f), chrome, "Exhaust", Quaternion.Euler(90, 0, 0));
            // number plate disc in the kart colour's opposite
            Prim.Make(PrimitiveType.Cylinder, k.body, new Vector3(0, 0.66f, 1.0f), new Vector3(0.45f, 0.02f, 0.45f), kit.Lit(Color.white, 0.4f), "Plate");

            var lights = new System.Collections.Generic.List<Light>();
            foreach (var x in new[] { -0.45f, 0.45f })
            {
                var lamp = Prim.Make(PrimitiveType.Sphere, k.body, new Vector3(x, 0.55f, 1.42f), Vector3.one * 0.2f, kit.Glow(new Color(1f, 0.95f, 0.8f), 3f), "Headlamp");
                lamp.AddComponent<NightOnly>().glow = true;
            }
            var hl = new GameObject("Headlight").AddComponent<Light>();
            hl.transform.SetParent(k.body, false);
            hl.transform.localPosition = new Vector3(0, 0.8f, 1.4f);
            hl.transform.localRotation = Quaternion.Euler(12, 0, 0);
            hl.type = LightType.Spot; hl.range = 30; hl.spotAngle = 70; hl.intensity = 8; hl.color = new Color(1f, 0.95f, 0.85f);
            hl.enabled = false; hl.shadows = LightShadows.None;
            hl.gameObject.AddComponent<NightOnly>();
            lights.Add(hl);
            k.headlights = lights.ToArray();

            var outfit = string.IsNullOrEmpty(cfg.riders.outfit) ? col : GameConfig.Hex(cfg.riders.outfit, col);
            k.rider = Rider.Build(k.body, kit, cfg.riders, outfit, cfg.built_riders);
            k.flashRenderers = k.body.GetComponentsInChildren<Renderer>();
            return k;
        }

        public void Place(TrackPath path)
        {
            float bob = stun > 0 ? Mathf.Abs(Mathf.Sin(stun * 12f)) * 0.25f : 0f;
            float lean = Mathf.Clamp(-latVel * 1.6f, -12f, 12f);
            var pose = path.PoseAt(dist, lateral, Mathf.Clamp(latVel / Mathf.Max(4f, speed) * 40f, -25f, 25f));
            float want = path.Hover(dist);
            hoverAmt = Application.isPlaying ? Mathf.MoveTowards(hoverAmt, want, Time.deltaTime * 4f) : want;
            var up = pose.rotation * Vector3.up;
            float lift = hoverAmt * (0.35f + 0.06f * Mathf.Sin(Time.time * 9f + index));
            transform.SetPositionAndRotation(pose.position + up * (bob + lift), pose.rotation);
            if (visual) visual.localRotation = Quaternion.Euler(0, spinAngle, lean);
            ShowHover(hoverAmt);
        }

        /// wheels turn flat into hover pads and a glow lights up under the kart
        void ShowHover(float h)
        {
            if (tyres == null) return;
            var flat = Quaternion.Euler(0, 0, 90f * (1f - h));
            foreach (var t in tyres) if (t) t.localRotation = flat;
            foreach (var g in hubs) if (g) g.SetActive(h < 0.3f);
            if (pad)
            {
                pad.gameObject.SetActive(h > 0.05f);
                pad.localScale = new Vector3(1.9f, 0.04f, 2.8f) * Mathf.Max(0.2f, h);
            }
        }

        public void Tick(float dt)
        {
            if (cooldown > 0) cooldown -= dt;
            if (stun > 0)
            {
                stun -= dt;
                spinAngle += dt * 720f;
                if (stun <= 0) spinAngle = 0;
            }
            if (flash > 0)
            {
                flash -= dt;
                mpb ??= new MaterialPropertyBlock();
                foreach (var r in flashRenderers)
                {
                    if (!r) continue;
                    if (flash > 0) { mpb.SetColor("_BaseColor", Color.Lerp(Color.white, new Color(1, 0.3f, 0.2f), Mathf.PingPong(flash * 10f, 1f))); r.SetPropertyBlock(mpb); }
                    else r.SetPropertyBlock(null);
                }
            }
            if (rider) rider.Tick(dt);
        }

        public void Hit(float knock, float slow)
        {
            speed *= slow;
            latVel += knock;
            stun = 0.7f;
            flash = 0.35f;
        }

        public void ShowHeadlights(bool on) { foreach (var l in headlights) if (l) l.enabled = on; }
    }
}
