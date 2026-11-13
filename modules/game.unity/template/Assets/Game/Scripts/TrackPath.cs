// The built track's centre line at run time, measured in metres along the line, with an up vector per point
// (the road loops, twists and banks, so "up" is the road's, not the world's).
// Karts live in "track space" (distance along, metres from the centre), which keeps the race on the road,
// makes laps exact, and lets the crossplay relay place a remote kart by progress instead of world coordinates.

using UnityEngine;

namespace HarnessGame
{
    public class TrackPath : MonoBehaviour
    {
        public Vector3[] points = new Vector3[0];
        public Vector3[] ups = new Vector3[0];
        public float[] hover = new float[0];
        public TrackFeature[] features = new TrackFeature[0];
        public float width = 14f;
        float[] cum;
        float length;

        public static TrackPath Main { get; private set; }
        void OnEnable() { Main = this; Measure(); }

        public float Length { get { if (cum == null) Measure(); return length; } }
        public float HalfWidth => width * 0.5f;

        public void Set(TrackShape s)
        {
            points = s.points; ups = s.ups; hover = s.hover; features = s.features;
            Measure();
        }

        public void Measure()
        {
            int n = points.Length;
            cum = new float[n + 1];
            for (int i = 0; i < n; i++) cum[i + 1] = cum[i] + Vector3.Distance(points[i], points[(i + 1) % n]);
            length = n > 1 ? cum[n] : 1f;
        }

        public Vector3 Point(int i) { int n = points.Length; return points[((i % n) + n) % n]; }
        Vector3 Up(int i) { int n = ups.Length; return n == points.Length && n > 0 ? ups[((i % n) + n) % n] : Vector3.up; }

        /// metres along the line where sample i sits
        public float DistOfIndex(int i) { if (cum == null) Measure(); return cum[Mathf.Clamp(i, 0, points.Length)]; }

        int Find(float dist, out float u)
        {
            if (cum == null || cum.Length != points.Length + 1) Measure();
            float d = Mathf.Repeat(dist, length);
            int lo = 0, hi = points.Length;
            while (hi - lo > 1) { int mid = (lo + hi) >> 1; if (cum[mid] <= d) lo = mid; else hi = mid; }
            u = (d - cum[lo]) / Mathf.Max(0.0001f, cum[lo + 1] - cum[lo]);
            return lo;
        }

        /// centre, tangent, right and up at a distance along the line (wraps)
        public void Sample(float dist, out Vector3 centre, out Vector3 tangent, out Vector3 right, out Vector3 up)
        {
            int lo = Find(dist, out float u);
            centre = Vector3.Lerp(Point(lo), Point(lo + 1), u);
            tangent = Vector3.Lerp(Point(lo + 1) - Point(lo - 1), Point(lo + 2) - Point(lo), u).normalized;
            up = Vector3.Lerp(Up(lo), Up(lo + 1), u);
            up = (up - tangent * Vector3.Dot(up, tangent)).normalized;
            right = Vector3.Cross(up, tangent);
        }

        public void Sample(float dist, out Vector3 centre, out Vector3 tangent, out Vector3 right)
            => Sample(dist, out centre, out tangent, out right, out _);

        /// 0 on plain road, 1 on loops, twists and steep banks (hover sections)
        public float Hover(float dist)
        {
            if (hover == null || hover.Length != points.Length || hover.Length == 0) return 0f;
            int lo = Find(dist, out float u);
            return Mathf.Lerp(hover[lo], hover[(lo + 1) % hover.Length], u);
        }

        /// world pose for a kart at (distance along, metres from centre, heading offset in degrees)
        public Pose PoseAt(float dist, float lateral, float headingDeg = 0f)
        {
            Sample(dist, out var c, out var t, out var r, out var up);
            return new Pose(c + r * lateral, Quaternion.LookRotation(t, up) * Quaternion.Euler(0, headingDeg, 0));
        }

        /// the middle of the first feature of a kind, in metres along the line; -1 when there is none
        public float FeatureMid(FeatureKind kind)
        {
            if (features == null) return -1f;
            foreach (var f in features) if (f.kind == kind) return (DistOfIndex(f.from) + DistOfIndex(f.to)) * 0.5f;
            return -1f;
        }

        /// is distance d inside (or within pad metres of) any loop, twist or drop?
        public bool InFeature(float d, float pad = 0f)
        {
            if (features == null) return false;
            d = Mathf.Repeat(d, Length);
            foreach (var f in features) if (d > DistOfIndex(f.from) - pad && d < DistOfIndex(f.to) + pad) return true;
            return false;
        }

        /// nearest distance along the line for a world position (coarse, for spawning things near the road)
        public float DistanceOf(Vector3 p)
        {
            if (cum == null) Measure();
            int best = 0; float bd = float.MaxValue;
            for (int i = 0; i < points.Length; i++) { float m = (points[i] - p).sqrMagnitude; if (m < bd) { bd = m; best = i; } }
            return cum[best];
        }

        /// how far a world position is from the nearest bit of road (any part of the lap)
        public float Clearance(Vector3 p)
        {
            float bd = float.MaxValue;
            for (int i = 0; i < points.Length; i++) bd = Mathf.Min(bd, (points[i] - p).sqrMagnitude);
            return Mathf.Sqrt(bd);
        }
    }
}
