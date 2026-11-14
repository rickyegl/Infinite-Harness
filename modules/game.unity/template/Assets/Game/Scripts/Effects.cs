// The visible side of a hit: a burst of sparks, an expanding shock ring and a short camera shake; plus the
// glowing lines of the rider attacks (a straight sniper beam, a jagged volt bolt).

using UnityEngine;
using UnityEngine.Rendering;

namespace HarnessGame
{
    public static class Effects
    {
        public static void Hit(GameKit kit, Vector3 at, Color color, bool simulateNow = false)
        {
            var go = new GameObject("HitFx");
            go.transform.position = at;
            var ps = go.AddComponent<ParticleSystem>();
            ps.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            var main = ps.main;
            main.duration = 0.5f; main.loop = false; main.playOnAwake = false;
            main.startLifetime = new ParticleSystem.MinMaxCurve(0.35f, 0.7f);
            main.startSpeed = new ParticleSystem.MinMaxCurve(5f, 12f);
            main.startSize = new ParticleSystem.MinMaxCurve(0.18f, 0.45f);
            main.startColor = new ParticleSystem.MinMaxGradient(color, Color.white);
            main.gravityModifier = 1.2f;
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            var em = ps.emission;
            em.rateOverTime = 0;
            em.SetBursts(new[] { new ParticleSystem.Burst(0, 40) });
            var sh = ps.shape;
            sh.shapeType = ParticleSystemShapeType.Sphere; sh.radius = 0.3f;
            var sz = ps.sizeOverLifetime;
            sz.enabled = true; sz.size = new ParticleSystem.MinMaxCurve(1f, AnimationCurve.Linear(0, 1, 1, 0));
            var pr = go.GetComponent<ParticleSystemRenderer>();
            pr.sharedMaterial = kit.particle;
            ps.Play();
            if (simulateNow) ps.Simulate(0.12f, true, true);

            var ring = Prim.Make(PrimitiveType.Cylinder, go.transform, Vector3.zero, new Vector3(0.5f, 0.02f, 0.5f), kit.Glow(color, 4f), "Ring");
            var fx = go.AddComponent<HitRing>();
            fx.ring = ring.transform;
            if (simulateNow) fx.SetAge(0.12f);
            if (Application.isPlaying) Object.Destroy(go, 1.2f);
        }

        public static LineRenderer Line(GameKit kit, Vector3[] pts, Color color, float width, float life)
        {
            var go = new GameObject("Beam");
            var lr = go.AddComponent<LineRenderer>();
            lr.positionCount = pts.Length;
            lr.SetPositions(pts);
            lr.widthMultiplier = width;
            lr.numCapVertices = 3;
            lr.sharedMaterial = kit.Glow(color, 5f);
            lr.shadowCastingMode = ShadowCastingMode.Off;
            lr.receiveShadows = false;
            if (Application.isPlaying) go.AddComponent<FadeLine>().life = life;
            return lr;
        }

        public static LineRenderer Beam(GameKit kit, Vector3 from, Vector3 to, Color color) => Line(kit, new[] { from, to }, color, 0.2f, 0.4f);

        public static LineRenderer Bolt(GameKit kit, Vector3 from, Vector3 to, Color color)
        {
            const int n = 9;
            var pts = new Vector3[n];
            for (int i = 0; i < n; i++)
            {
                float t = i / (float)(n - 1);
                pts[i] = Vector3.Lerp(from, to, t) + (i == 0 || i == n - 1 ? Vector3.zero : Random.insideUnitSphere * 0.45f);
            }
            return Line(kit, pts, color, 0.12f, 0.3f);
        }
    }

    public class HitRing : MonoBehaviour
    {
        public Transform ring;
        float age;
        public void SetAge(float a) { age = a; Apply(); }
        void Update() { age += Time.deltaTime; Apply(); }
        void Apply()
        {
            if (!ring) return;
            float s = 0.5f + age * 14f;
            ring.localScale = new Vector3(s, 0.02f, s);
            ring.gameObject.SetActive(age < 0.35f);
        }
    }
}
