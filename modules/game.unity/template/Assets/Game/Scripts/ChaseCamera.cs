// Follows the player's kart from behind and above, with a little lag and a shake on hits.
//
// The camera is built in track space: from the road's own direction and up at the kart's distance, and a smoothed
// copy of its sideways offset. It never reads the kart's heading, which swings with every steering correction and
// bump (the kart yaws up to 25 degrees with its sideways speed); following that made the view twitch side to side.

using UnityEngine;

namespace HarnessGame
{
    [DefaultExecutionOrder(100)]
    public class ChaseCamera : MonoBehaviour
    {
        public Transform target;
        public float back = 7.5f, up = 3.2f, lookAhead = 6f;
        float shake, seed;
        Kart kart;
        Rig rig;

        public static ChaseCamera Main { get; private set; }
        void OnEnable() { Main = this; seed = Random.value * 100f; }

        public void Shake(float s) { shake = Mathf.Max(shake, s); }

        public void Snap()
        {
            if (!target) return;
            kart = target.GetComponent<Kart>();
            rig.Reset(kart);
            Apply(0f);
        }

        void LateUpdate()
        {
            if (!target) return;
            if (!kart || kart.transform != target) { kart = target.GetComponent<Kart>(); rig.Reset(kart); }
            Apply(Time.deltaTime);
        }

        void Apply(float dt)
        {
            var path = TrackPath.Main;
            if (!kart || !path)
            {
                transform.position = target.position - target.forward * back + target.up * up;
                transform.LookAt(target.position + target.forward * lookAhead, target.up);
                return;
            }
            rig.Step(kart, path, dt, out var at, out var fwd, out var camUp);
            transform.position = at - fwd * back + camUp * up;
            transform.LookAt(at + fwd * lookAhead + camUp * 1.2f, camUp);
            if (shake > 0)
            {
                shake = Mathf.Max(0, shake - dt * 1.6f);
                transform.position += Rig.Wobble(seed, Time.time, transform) * shake * 0.5f;
            }
        }
    }

    /// a smoothed track-space anchor on a kart: where it is along the road and across it, with the road's own
    /// direction and up (shared by the chase camera and the capture director)
    public struct Rig
    {
        float d, dv, lat, lv;
        Vector3 fwd, camUp;
        bool ready;

        public void Reset(Kart k)
        {
            ready = false;
            if (k) { d = k.dist; lat = k.lateral; dv = lv = 0; }
        }

        public void Step(Kart k, TrackPath path, float dt, out Vector3 at, out Vector3 forward, out Vector3 upDir)
        {
            if (!ready || Mathf.Abs(k.dist - d) > 40f) { d = k.dist; lat = k.lateral; dv = lv = 0; ready = false; }   // a restart jumps
            if (dt > 0)
            {
                d = Mathf.SmoothDamp(d, k.dist, ref dv, 0.06f, Mathf.Infinity, dt);
                lat = Mathf.SmoothDamp(lat, k.lateral, ref lv, 0.35f, Mathf.Infinity, dt);
            }
            path.Sample(d, out var c, out var t, out var r, out var u);
            float a = ready ? 1f - Mathf.Exp(-dt * 6f) : 1f;
            fwd = ready ? Vector3.Slerp(fwd, t, a).normalized : t;
            camUp = ready ? Vector3.Slerp(camUp, u, a).normalized : u;
            ready = true;
            at = c + r * lat + u * 0.6f;
            forward = fwd;
            upDir = camUp;
        }

        /// a point placed along the road from the smoothed anchor: along metres down the line (so it follows loops and
        /// twists instead of leaving the road on a straight tangent), across metres right of the kart's line, height
        /// metres above the road there
        public Vector3 Point(TrackPath path, float along, float across, float height)
        {
            path.Sample(d + along, out var c, out _, out var r, out var u);
            return c + r * (lat + across) + u * height;
        }

        /// the road's up a few metres along from the anchor
        public Vector3 UpAt(TrackPath path, float along)
        {
            path.Sample(d + along, out _, out _, out _, out var u);
            return u;
        }

        /// a smooth, frame-rate independent wobble in the camera's own plane (for hit shakes)
        public static Vector3 Wobble(float seed, float time, Transform cam)
        {
            float x = Mathf.PerlinNoise(seed, time * 14f) - 0.5f, y = Mathf.PerlinNoise(seed + 37f, time * 14f) - 0.5f;
            return cam.right * x + cam.up * y;
        }
    }
}
