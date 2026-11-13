// The visible side of a hit: a burst of sparks, an expanding shock ring and a short camera shake.

using UnityEngine;

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
