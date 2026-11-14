// The visible side of a hit: a burst of streaking sparks, a flash and a shock ring facing the camera, and a short
// camera shake; plus the glowing lines of the rider attacks (a thick sniper beam with a muzzle flash, a double volt
// bolt) and the trails behind thrown items and dashing or shrunk karts. Bright parts blend towards a warm hot tint,
// and every effect colour goes through Fx first: a class colour in the pink-to-magenta band (the sniper's red is
// one) turns orange-red, so no effect ever reads pink.

using UnityEngine;
using UnityEngine.Rendering;

namespace HarnessGame
{
    public static class Effects
    {
        /// the hot tint sparks and flashes blend towards (a warm yellow-white, so a red class never reads pink)
        public static readonly Color Hot = new Color(1f, 0.9f, 0.55f);

        /// an effect's colour: hues from pink through magenta (300-360 degrees) become orange-red, a violet (which the
        /// tone curve turns pink on screen) becomes a deep blue-violet, the rest are kept
        public static Color Fx(Color c)
        {
            Color.RGBToHSV(c, out var h, out var sat, out var v);
            if (h >= 0.83f || h < 0.01f) return Color.HSVToRGB(0.025f, Mathf.Max(sat, 0.75f), v);
            return h >= 0.7f ? Color.HSVToRGB(0.68f, Mathf.Max(sat, 0.9f), v) : c;   // the tone curve turns violet pink
        }

        public static void Hit(GameKit kit, Vector3 at, Color color, bool simulateNow = false)
        {
            color = Fx(color);
            var go = new GameObject("HitFx");
            go.transform.position = at;
            var ps = go.AddComponent<ParticleSystem>();
            ps.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            var main = ps.main;
            main.duration = 0.5f; main.loop = false; main.playOnAwake = false;
            main.startLifetime = new ParticleSystem.MinMaxCurve(0.5f, 0.95f);
            main.startSpeed = new ParticleSystem.MinMaxCurve(6f, 16f);
            main.startSize = new ParticleSystem.MinMaxCurve(0.25f, 0.6f);
            main.startColor = new ParticleSystem.MinMaxGradient(color, Hot);
            main.gravityModifier = 1.2f;
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            var em = ps.emission;
            em.rateOverTime = 0;
            em.SetBursts(new[] { new ParticleSystem.Burst(0, 70) });
            var sh = ps.shape;
            sh.shapeType = ParticleSystemShapeType.Sphere; sh.radius = 0.3f;
            var sz = ps.sizeOverLifetime;
            sz.enabled = true; sz.size = new ParticleSystem.MinMaxCurve(1f, AnimationCurve.Linear(0, 1, 1, 0));
            var pr = go.GetComponent<ParticleSystemRenderer>();
            pr.sharedMaterial = kit.particle;
            pr.renderMode = ParticleSystemRenderMode.Stretch;   // streaks, so the burst reads at speed
            pr.velocityScale = 0.06f; pr.lengthScale = 1.5f;
            ps.Play();
            if (simulateNow) ps.Simulate(0.12f, true, true);

            // a flash ball that pops and shrinks, and a shock ring that always faces the camera
            // in the class colour at a low glow: brighter, or blended paler, and it renders as a plain white disc
            var flash = Prim.Make(PrimitiveType.Sphere, go.transform, Vector3.zero, Vector3.one, kit.Glow(color, 1.4f), "Flash");
            flash.GetComponent<Renderer>().shadowCastingMode = ShadowCastingMode.Off;
            var ring = Line(kit, new Vector3[HitRing.N], color, 0.35f, 0f);
            ring.sharedMaterial = kit.Glow(color, 1.3f);
            ring.loop = true;
            ring.transform.SetParent(go.transform, false);
            var fx = go.AddComponent<HitRing>();
            fx.ring = ring; fx.flash = flash.transform;
            fx.SetAge(simulateNow ? 0.12f : 0f);
            if (Application.isPlaying) Object.Destroy(go, 1.3f);
        }

        public static LineRenderer Line(GameKit kit, Vector3[] pts, Color color, float width, float life)
        {
            color = Fx(color);
            var go = new GameObject("Beam");
            var lr = go.AddComponent<LineRenderer>();
            lr.positionCount = pts.Length;
            lr.SetPositions(pts);
            lr.widthMultiplier = width;
            lr.numCapVertices = 3;
            lr.sharedMaterial = kit.Glow(color, 2.2f);   // brighter blows the hue out to white
            lr.shadowCastingMode = ShadowCastingMode.Off;
            lr.receiveShadows = false;
            if (Application.isPlaying && life > 0) go.AddComponent<FadeLine>().life = life;
            return lr;
        }

        /// the sniper's shot: a thick beam with a hot core, and a muzzle flash
        public static LineRenderer Beam(GameKit kit, Vector3 from, Vector3 to, Color color)
        {
            color = Fx(color);
            Line(kit, new[] { from, to }, Color.Lerp(color, Hot, 0.7f), 0.1f, 0.45f);
            Muzzle(kit, from, color);
            return Line(kit, new[] { from, to }, color, 0.3f, 0.6f);
        }

        /// the volt's zap: two jagged bolts
        public static LineRenderer Bolt(GameKit kit, Vector3 from, Vector3 to, Color color)
        {
            color = Fx(color);
            Line(kit, Jag(from, to, 0.6f), Color.Lerp(color, Hot, 0.5f), 0.12f, 0.35f);
            return Line(kit, Jag(from, to, 0.45f), color, 0.24f, 0.45f);
        }

        static Vector3[] Jag(Vector3 from, Vector3 to, float amp)
        {
            const int n = 9;
            var pts = new Vector3[n];
            for (int i = 0; i < n; i++)
                pts[i] = Vector3.Lerp(from, to, i / (float)(n - 1)) + (i == 0 || i == n - 1 ? Vector3.zero : Random.insideUnitSphere * amp);
            return pts;
        }

        /// a short pop of light where a shot leaves
        public static void Muzzle(GameKit kit, Vector3 at, Color color)
        {
            color = Fx(color);
            var go = new GameObject("MuzzleFx");
            go.transform.position = at;
            var flash = Prim.Make(PrimitiveType.Sphere, go.transform, Vector3.zero, Vector3.one * 0.6f, kit.Glow(color, 1.4f), "Flash");
            flash.GetComponent<Renderer>().shadowCastingMode = ShadowCastingMode.Off;
            go.AddComponent<HitRing>().flash = flash.transform;
            if (Application.isPlaying) Object.Destroy(go, 0.3f);
        }

        /// a glowing ribbon behind a moving thing (thrown items, dashing and shrunk karts)
        public static TrailRenderer Trail(GameKit kit, Transform on, Vector3 local, Color color, float width, float time)
        {
            color = Fx(color);
            var go = new GameObject("Trail");
            go.transform.SetParent(on, false);
            go.transform.localPosition = local;
            var tr = go.AddComponent<TrailRenderer>();
            tr.time = time;
            tr.minVertexDistance = 0.2f;
            tr.widthMultiplier = width;
            tr.widthCurve = AnimationCurve.Linear(0, 1, 1, 0);
            tr.numCapVertices = 2;
            tr.sharedMaterial = kit.Glow(color, 2.2f);
            tr.shadowCastingMode = ShadowCastingMode.Off;
            tr.receiveShadows = false;
            return tr;
        }
    }

    /// animates a hit: the flash pops then shrinks, the ring grows and thins out, facing the camera
    public class HitRing : MonoBehaviour
    {
        public const int N = 28;
        public LineRenderer ring;
        public Transform flash;
        float age;
        readonly Vector3[] pts = new Vector3[N];
        public void SetAge(float a) { age = a; Apply(); }
        void Update() { age += Time.deltaTime; Apply(); }
        void Apply()
        {
            if (flash)
            {
                float f = age < 0.06f ? age / 0.06f : Mathf.Clamp01(1f - (age - 0.06f) / 0.2f);
                flash.localScale = Vector3.one * 2.4f * f;
                flash.gameObject.SetActive(f > 0.01f);
            }
            if (!ring) return;
            float life = 0.5f, k = Mathf.Clamp01(age / life);
            ring.gameObject.SetActive(k < 1f);
            if (k >= 1f) return;
            float r = 0.6f + (1f - (1f - k) * (1f - k)) * 6f;
            var cam = Camera.main;
            var right = cam ? cam.transform.right : Vector3.right;
            var up = cam ? cam.transform.up : Vector3.up;
            for (int i = 0; i < N; i++)
            {
                float a = i * Mathf.PI * 2f / N;
                pts[i] = transform.position + (right * Mathf.Cos(a) + up * Mathf.Sin(a)) * r;
            }
            ring.SetPositions(pts);
            ring.widthMultiplier = 0.3f * (1f - k);
        }
    }
}
