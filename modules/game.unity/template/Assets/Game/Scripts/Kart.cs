// One kart and its rider. Arcade physics in track space: speed along the line, a sideways offset with its own
// velocity, a pull to the outside in corners, wall bounces, spin-outs. RaceManager steps every kart.

using System.Linq;
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
        public float cooldown;      // seconds until the rider's attack is ready again
        public float finishTime = -1;
        public int place = 1;

        // rider class and its attack state (see Abilities)
        public string kind = "thrower";
        public ClassSpec cls;
        public float dash;          // seconds of electric dash left (volt)
        public float small;         // seconds of being small left (shrink)
        public float size = 1f;     // current visual scale, eases towards 0.55 while small
        public Kart bumpedBy;       // the kart that touched this one this frame (set by the bump step)
        public Transform aura;      // glow shown while dashing or small

        // driver personality (AI)
        public float skill = 0.9f, lineBias, lineWobble;
        public float aim;           // the AI's chosen line across the road, eased so a new line never snaps the kart
        // the heading and lean shown, eased: the raw ones follow the sideways speed, which jumps on every bump,
        // wall and change of line, and made the karts twitch left and right
        float yawShown, yawV, leanShown, leanV;

        public Rider rider;
        public Transform body, visual;
        Renderer[] flashRenderers;
        MaterialPropertyBlock mpb;
        float flash, spinAngle;
        public Light[] headlights = new Light[0];
        // hover sections: wheels fold flat, a glow pad lights up underneath
        public float hoverAmt;
        TrailRenderer[] trails = new TrailRenderer[0];
        Transform stars;   // spin over the rider while stunned
        Transform[] tyres = new Transform[0];
        GameObject[] hubs = new GameObject[0];
        Transform pad;

        public int Lap(float trackLength) => Mathf.Max(0, Mathf.FloorToInt(dist / trackLength));

        public static Kart Build(Transform parent, GameKit kit, GameConfig cfg, int i, ClassSpec cls = null)
        {
            var ks = cfg.karts;
            var col = GameConfig.Hex(ks.colors[i % ks.colors.Length], Color.red);
            var go = new GameObject("Kart" + i);
            go.transform.SetParent(parent, false);
            var k = go.AddComponent<Kart>();
            k.index = i;
            k.kartName = ks.names[i % ks.names.Length];
            k.cls = cls ?? cfg.ClassFor(i, false);
            k.kind = k.cls.kind;
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

            // a generated kart body replaces the primitive shell; tyres, hover pad and lamps stay
            var shell = Models.Spawn(cfg, kit, "kart", k.body, new Vector3(0, 0.18f, 0.05f), 3.0f, col, 0.35f);
            if (shell != null)
                foreach (Transform c in k.body)
                    if (c.name is "Chassis" or "Nose" or "Spoiler" or "Seat" or "Wheel" or "Exhaust" or "Plate") c.gameObject.SetActive(false);

            var outfit = string.IsNullOrEmpty(cfg.riders.outfit) ? col : GameConfig.Hex(cfg.riders.outfit, col);
            var gear = GameConfig.Hex(k.cls.color, Abilities.DefaultColor(k.kind));
            k.rider = Rider.Build(k.body, kit, cfg.riders, outfit, cfg.built_riders, k.kind, gear);
            k.rider.UseModel(cfg, kit, k.kind);
            // sit the rider down in the generated body's seat (its own height varies), hips a little behind the
            // middle of the figure's box, since the legs reach forward
            var seat = shell ? Models.Seat(shell, k.body) : null;
            if (seat is Vector3 st) k.rider.transform.localPosition = new Vector3(st.x, st.y - 0.12f, st.z + 0.15f);
            k.aura = Prim.Make(PrimitiveType.Sphere, k.visual, new Vector3(0, 0.9f, 0), new Vector3(2.4f, 1.6f, 3.4f), kit.Ghost(gear), "Aura").transform;
            k.aura.gameObject.SetActive(false);
            k.flashRenderers = k.body.GetComponentsInChildren<Renderer>();
            // trails from the back corners while dashing or small, and stars that circle a stunned rider
            k.trails = new[] { -0.6f, 0.6f }.Select(x => Effects.Trail(kit, k.visual, new Vector3(x, 0.45f, -1.3f), gear, 0.5f, 0.35f)).ToArray();
            foreach (var t in k.trails) t.emitting = false;
            k.stars = Prim.Node("Stars", k.visual, new Vector3(0, 2.3f, 0));
            for (int s = 0; s < 4; s++)
            {
                float a = s * Mathf.PI * 0.5f;
                Prim.Make(PrimitiveType.Sphere, k.stars, new Vector3(Mathf.Cos(a) * 0.7f, 0, Mathf.Sin(a) * 0.7f), Vector3.one * 0.26f, kit.Glow(Effects.Hot, 2f), "Star")
                    .GetComponent<Renderer>().shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            }
            k.stars.gameObject.SetActive(false);
            return k;
        }

        public void Place(TrackPath path)
        {
            float bob = stun > 0 ? Mathf.Abs(Mathf.Sin(stun * 12f)) * 0.25f : 0f;
            float lean = Mathf.Clamp(-latVel * 1.6f, -12f, 12f);
            float yaw = Mathf.Clamp(latVel / Mathf.Max(4f, speed) * 40f, -25f, 25f);
            float dt = Application.isPlaying ? Time.deltaTime : 0f;
            if (dt > 0 && stun <= 0)
            {
                yawShown = Mathf.SmoothDamp(yawShown, yaw, ref yawV, 0.2f, Mathf.Infinity, dt);
                leanShown = Mathf.SmoothDamp(leanShown, lean, ref leanV, 0.18f, Mathf.Infinity, dt);
            }
            else { yawShown = yaw; leanShown = lean; yawV = leanV = 0; }
            lean = leanShown;
            var pose = path.PoseAt(dist, lateral, yawShown);
            float want = path.Hover(dist);
            hoverAmt = Application.isPlaying ? Mathf.MoveTowards(hoverAmt, want, Time.deltaTime * 4f) : want;
            var up = pose.rotation * Vector3.up;
            float lift = hoverAmt * (0.35f + 0.06f * Mathf.Sin(Time.time * 9f + index));
            transform.SetPositionAndRotation(pose.position + up * (bob + lift), pose.rotation);
            if (visual)
            {
                visual.localRotation = Quaternion.Euler(0, spinAngle, lean);
                visual.localScale = Vector3.one * size;
            }
            if (stars)
            {
                stars.gameObject.SetActive(stun > 0.05f);
                if (stun > 0.05f) stars.localRotation = Quaternion.Euler(0, Time.time * 400f, 0);
            }
            foreach (var t in trails) if (t) t.emitting = Application.isPlaying && (dash > 0 || small > 0);
            if (aura)
            {
                bool on = dash > 0 || small > 0;
                aura.gameObject.SetActive(on);
                if (on) aura.localScale = new Vector3(2.4f, 1.6f, 3.4f) * (1f + 0.08f * Mathf.Sin(Time.time * (dash > 0 ? 60f : 8f)));
            }
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
            if (dash > 0) dash -= dt;
            if (small > 0) small -= dt;
            size = Mathf.MoveTowards(size, small > 0 ? Abilities.SmallScale : 1f, dt * 3f);
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

        public void Hit(float knock, float slow, float stunFor = 0.7f)
        {
            speed *= slow;
            latVel += knock;
            stun = stunFor;
            flash = 0.35f;
            dash = 0;
        }

        public void ShowHeadlights(bool on) { foreach (var l in headlights) if (l) l.enabled = on; }
    }
}
