// The track's centre line and its "up" from a few numbers. The same formula lives in the Roblox kit
// (modules/game.roblox/template/src/shared/TrackMath.luau) so both games share one layout and the
// crossplay relay can place a remote kart by "progress along the track" instead of raw coordinates.
//
// 1. A closed base curve (shape + gentle hills), scaled so its ground length is spec.length, resampled every
//    metre or so along that ground length.
// 2. Features are placed on the straightest free stretches: loop-the-loops, corkscrew twists and a big drop.
//    Each one adds an offset to the base curve inside its window, so the lap still closes exactly.
// 3. Every sample gets an up vector worked out directly (no transport, so nothing drifts): base up, pitched
//    round the loop, rolled through a twist, banked into corners, then made square to the real tangent.
// 4. "Hover" weight per sample: 1 on loops, twists and steep banks. Karts float there and go faster.
// Only plain vector maths is used so the Luau copy can follow it line by line.

using System;
using System.Collections.Generic;
using UnityEngine;

namespace HarnessGame
{
    [Serializable]
    public class TrackSpec
    {
        public string shape = "bean";   // oval | squircle | bean | wavy | kidney
        public float length = 700f;     // metres of ground length (the 3D lap is longer: loops and drops add to it)
        public float width = 14f;       // metres, kerb to kerb
        public float hills = 1.5f;      // metres of rise and fall
        public int seed = 1;
        public int samples = 0;         // centre-line points; 0 = about one per metre
        public int loops = 1;           // loop-the-loops (0-3)
        public int twists = 1;          // corkscrew barrel rolls (0-3)
        public float bank = 0.6f;       // 0 = flat corners .. 1 = near-vertical wall rides
        public float drop = 14f;        // metres of the big climb and plunge, 0 = none
        public bool hover = true;       // loops, twists and steep banks glow, karts hover there with a boost
        public float loopRadius = 13f;  // metres
    }

    public enum FeatureKind { Loop, Twist, Drop }

    [Serializable]
    public struct TrackFeature
    {
        public FeatureKind kind;
        public int from, to;            // sample indices, from < to (never wraps the start line)
    }

    public class TrackShape
    {
        public Vector3[] points, ups;
        public float[] hover;
        public TrackFeature[] features;
    }

    public static class TrackMath
    {
        const float TwoPi = Mathf.PI * 2f;
        const float StartClearBefore = 60f, StartClearAfter = 70f;   // metres kept flat round the start line

        // ---------------------------------------------------------------- 1. base curve
        static Vector2 Shape(TrackSpec s, float t, float phase)
        {
            switch (s.shape)
            {
                case "oval": return new Vector2(1.6f * Mathf.Cos(t), 0.9f * Mathf.Sin(t));
                case "squircle": return new Vector2(1.4f * SPow(Mathf.Cos(t), 0.5f), SPow(Mathf.Sin(t), 0.5f));
                case "wavy":
                {
                    float r = 1f + 0.12f * Mathf.Sin(5f * t + phase);
                    return new Vector2(1.35f * r * Mathf.Cos(t), r * Mathf.Sin(t));
                }
                case "kidney":
                {
                    float r = 1f + 0.22f * Mathf.Cos(t + phase) - 0.12f * Mathf.Cos(2f * t);
                    return new Vector2(1.3f * r * Mathf.Cos(t), r * Mathf.Sin(t));
                }
                default: // bean
                {
                    float r = 1f + 0.22f * Mathf.Sin(2f * t + 0.6f + phase) + 0.08f * Mathf.Sin(3f * t + 1.1f);
                    return new Vector2(1.4f * r * Mathf.Cos(t), r * Mathf.Sin(t));
                }
            }
        }

        /// the base curve resampled every ds metres of ground length; y holds the hills (+ s.hills)
        static Vector3[] Base(TrackSpec s, int n)
        {
            float phase = (((s.seed % 7) + 7) % 7) * 0.37f;
            const int M = 4096;
            var raw = new Vector3[M + 1];
            var cum = new float[M + 1];
            for (int i = 0; i <= M; i++)
            {
                float t = TwoPi * i / M;
                var xz = Shape(s, t, phase);
                float y = s.hills * 0.5f * (Mathf.Sin(2f * t + 0.8f + phase) + 0.6f * Mathf.Sin(3f * t));
                raw[i] = new Vector3(xz.x, y, xz.y);
                if (i > 0) cum[i] = cum[i - 1] + new Vector2(raw[i].x - raw[i - 1].x, raw[i].z - raw[i - 1].z).magnitude;
            }
            float k = s.length / Mathf.Max(0.001f, cum[M]);
            var p = new Vector3[n];
            int j = 0;
            for (int i = 0; i < n; i++)
            {
                float want = cum[M] * i / n;
                while (j < M - 1 && cum[j + 1] < want) j++;
                float seg = Mathf.Max(1e-6f, cum[j + 1] - cum[j]);
                var q = Vector3.Lerp(raw[j], raw[j + 1], (want - cum[j]) / seg);
                p[i] = new Vector3(q.x * k, q.y + s.hills, q.z * k);
            }
            return p;
        }

        // ---------------------------------------------------------------- 2. feature placement
        struct Window { public FeatureKind kind; public int a, b, inA, inB; }

        static Window[] Place(TrackSpec s, Vector3[] b, float ds)
        {
            int n = b.Length;
            // smoothed ground curvature, 1/m, + = turning right
            var kap = new float[n];
            for (int i = 0; i < n; i++)
            {
                Vector3 t0 = b[(i + n - 1) % n], t1 = b[i], t2 = b[(i + 1) % n];
                Vector2 u = new Vector2(t1.x - t0.x, t1.z - t0.z).normalized, v = new Vector2(t2.x - t1.x, t2.z - t1.z).normalized;
                kap[i] = Mathf.Atan2(u.y * v.x - u.x * v.y, u.x * v.x + u.y * v.y) / ds;
            }
            var abs = new float[n + 1];
            for (int i = 0; i < n; i++) abs[i + 1] = abs[i] + Mathf.Abs(kap[i]) * ds;

            var taken = new List<Vector2Int>
            {
                new Vector2Int(0, Mathf.CeilToInt(StartClearAfter / ds)),
                new Vector2Int(n - Mathf.CeilToInt(StartClearBefore / ds), n),
            };
            var wins = new List<Window>();
            void Add(FeatureKind kind, float before, float body, float after)
            {
                int pre = Mathf.CeilToInt(before / ds), len = Mathf.CeilToInt(body / ds), post = Mathf.CeilToInt(after / ds);
                int total = pre + len + post, best = -1;
                float bestScore = float.MaxValue;
                int step = Mathf.Max(1, Mathf.RoundToInt(4f / ds));
                for (int a = 0; a + total <= n; a += step)
                {
                    bool free = true;
                    foreach (var r in taken) if (a < r.y && a + total > r.x) { free = false; break; }
                    if (!free) continue;
                    float score = abs[a + pre + len] - abs[a + pre];
                    // first loop close to the start so short videos show it; others just as straight as possible
                    if (kind == FeatureKind.Loop && wins.Count == 0) score += a * ds * 0.0004f;
                    if (score < bestScore - 1e-5f) { bestScore = score; best = a; }
                }
                if (best < 0) return;
                taken.Add(new Vector2Int(best, best + total));
                wins.Add(new Window { kind = kind, a = best, b = best + total, inA = best + pre, inB = best + pre + len });
            }
            float R = Mathf.Clamp(s.loopRadius, 6f, 30f);
            for (int i = 0; i < Mathf.Clamp(s.loops, 0, 3); i++) Add(FeatureKind.Loop, 12f, LoopRun(R), LoopRecover(s));
            for (int i = 0; i < Mathf.Clamp(s.twists, 0, 3); i++) Add(FeatureKind.Twist, 12f, 104f, 12f);
            if (s.drop > 0.5f) Add(FeatureKind.Drop, 0f, 170f, 0f);
            wins.Sort((x, y) => x.a.CompareTo(y.a));
            return wins.ToArray();
        }

        static float LoopRun(float R) => 3.5f * R;                       // ground metres the loop itself spans
        static float LoopShift(TrackSpec s) => 1.9f * s.width;           // sideways step so the exit clears the entry
        static float LoopRecover(TrackSpec s) => 4.5f * s.width;         // metres to drift back to the base line
        const float TwistRadius = 11f;

        // ---------------------------------------------------------------- 3. points, ups, hover
        public static TrackShape Generate(TrackSpec s)
        {
            int n = s.samples > 0 ? Mathf.Max(64, s.samples) : Mathf.Clamp(Mathf.RoundToInt(s.length), 256, 3000);
            float ds = s.length / n;
            var b = Base(s, n);
            var wins = Place(s, b, ds);

            // the drop changes the base itself, so it goes in before base frames are taken
            foreach (var w in wins)
                if (w.kind == FeatureKind.Drop)
                    for (int i = w.inA; i < w.inB; i++)
                    {
                        float u = (i - w.inA) / (float)(w.inB - w.inA);
                        float h = u < 0.72f ? Smoother(u / 0.72f) : 1f - Smoother((u - 0.72f) / 0.28f);
                        b[i].y += s.drop * h;
                    }

            // base frames: forward, up (world up made square to forward), right
            var bt = new Vector3[n]; var bu = new Vector3[n]; var br = new Vector3[n];
            for (int i = 0; i < n; i++)
            {
                bt[i] = (b[(i + 1) % n] - b[(i + n - 1) % n]).normalized;
                bu[i] = Square(Vector3.up, bt[i]);
                br[i] = Vector3.Cross(bu[i], bt[i]);
            }

            // centroid on the ground, to send loop exits outward (away from the infield)
            Vector3 mid = Vector3.zero;
            foreach (var p in b) mid += p;
            mid /= n;

            var pts = new Vector3[n]; var refUp = new Vector3[n];
            var hover = new float[n];
            var flat = new float[n];   // 1 where corners may bank, 0 inside features
            for (int i = 0; i < n; i++)
            {
                pts[i] = b[i]; refUp[i] = bu[i];
                float d = i * ds;
                flat[i] = d < StartClearAfter - 20f || d > s.length - StartClearBefore + 10f ? 0f : 1f;   // level grid and gantry
            }

            float R = Mathf.Clamp(s.loopRadius, 6f, 30f);
            int twistNo = 0;
            foreach (var w in wins)
            {
                for (int i = w.a; i < w.b; i++) flat[i] = 0f;
                if (w.kind == FeatureKind.Loop)
                {
                    int mi = (w.inA + w.inB) / 2;
                    float side = Vector3.Dot(br[mi], b[mi] - mid) >= 0 ? 1f : -1f;
                    float W = LoopShift(s) * side;
                    for (int i = w.inA; i < w.b; i++)
                    {
                        if (i < w.inB)
                        {
                            float u = (i - w.inA) / (float)(w.inB - w.inA);
                            float th = TwoPi * u - Mathf.Sin(TwoPi * u);   // eased: enters and leaves the loop gently
                            pts[i] += bt[i] * (R * Mathf.Sin(th)) + bu[i] * (R * (1f - Mathf.Cos(th))) + br[i] * (W * Smooth(u));
                            refUp[i] = bu[i] * Mathf.Cos(th) - bt[i] * Mathf.Sin(th);
                            hover[i] = 1f;
                        }
                        else
                        {
                            float u = (i - w.inB) / (float)(w.b - w.inB);
                            pts[i] += br[i] * (W * (1f - Smooth(u)));
                        }
                    }
                }
                else if (w.kind == FeatureKind.Twist)
                {
                    float dir = ((s.seed + twistNo++) & 1) == 0 ? 1f : -1f;
                    for (int i = w.inA; i < w.inB; i++)
                    {
                        float u = (i - w.inA) / (float)(w.inB - w.inA);
                        float phi = dir * TwoPi * Smoother(u);
                        // ride the inside of a tube round an axis TwistRadius above the road
                        var up = bu[i] * Mathf.Cos(phi) + br[i] * Mathf.Sin(phi);
                        pts[i] += (bu[i] - up) * TwistRadius;
                        refUp[i] = up;
                        hover[i] = 1f;
                    }
                }
            }

            // bank: smoothed ground curvature, faded out round features; steep banks become hover sections
            float maxBank = (15f + 65f * Mathf.Clamp01(s.bank)) * Mathf.Deg2Rad;
            var bank = new float[n];
            var rawBank = new float[n];
            for (int i = 0; i < n; i++)
            {
                Vector3 u3 = bt[i], v3 = bt[(i + 1) % n];
                float k = Mathf.Atan2(u3.z * v3.x - u3.x * v3.z, u3.x * v3.x + u3.z * v3.z) / ds;
                rawBank[i] = Mathf.Clamp(k / 0.022f, -1f, 1f) * maxBank;
            }
            var flatS = BoxBlur(flat, Mathf.RoundToInt(10f / ds));
            var bankS = BoxBlur(rawBank, Mathf.RoundToInt(14f / ds));
            for (int i = 0; i < n; i++) bank[i] = bankS[i] * Mathf.Clamp01(flatS[i] * 2f - 1f);
            for (int i = 0; i < n; i++) if (Mathf.Abs(bank[i]) > 32f * Mathf.Deg2Rad) hover[i] = 1f;

            // final frames
            var ups = new Vector3[n];
            for (int i = 0; i < n; i++)
            {
                var t = (pts[(i + 1) % n] - pts[(i + n - 1) % n]).normalized;
                var up = Square(refUp[i], t);
                var right = Vector3.Cross(up, t);
                ups[i] = (up * Mathf.Cos(bank[i]) + right * Mathf.Sin(bank[i])).normalized;
            }

            var hv = s.hover ? BoxBlur(hover, Mathf.RoundToInt(6f / ds)) : new float[n];
            var feats = new TrackFeature[wins.Length];
            for (int i = 0; i < wins.Length; i++) feats[i] = new TrackFeature { kind = wins[i].kind, from = wins[i].inA, to = wins[i].inB };
            return new TrackShape { points = pts, ups = ups, hover = hv, features = feats };
        }

        // ---------------------------------------------------------------- helpers
        /// v made square to t (Gram-Schmidt), falling back to any square vector if v lies along t
        static Vector3 Square(Vector3 v, Vector3 t)
        {
            var o = v - t * Vector3.Dot(v, t);
            if (o.sqrMagnitude < 1e-8f) o = Vector3.Cross(t, Mathf.Abs(t.x) < 0.9f ? Vector3.right : Vector3.forward);
            return o.normalized;
        }

        /// circular moving average over +-r samples
        static float[] BoxBlur(float[] a, int r)
        {
            int n = a.Length;
            if (r <= 0) return (float[])a.Clone();
            var o = new float[n];
            float sum = 0;
            for (int k = -r; k <= r; k++) sum += a[((k % n) + n) % n];
            for (int i = 0; i < n; i++)
            {
                o[i] = sum / (2 * r + 1);
                sum += a[(i + r + 1) % n] - a[((i - r) % n + n) % n];
            }
            return o;
        }

        static float Smooth(float u) { u = Mathf.Clamp01(u); return u * u * (3f - 2f * u); }
        static float Smoother(float u) { u = Mathf.Clamp01(u); return u * u * u * (u * (u * 6f - 15f) + 10f); }
        static float SPow(float v, float e) => Mathf.Sign(v) * Mathf.Pow(Mathf.Abs(v), e);
    }
}
