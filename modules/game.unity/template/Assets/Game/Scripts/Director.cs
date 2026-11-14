// A camera operator for trailer captures: every few seconds it cuts to a new angle (in front looking back at the
// pursuers, behind, low behind, overhead, alongside, a three-quarter, a low trackside camera the karts race past,
// high above the pack, a slow orbit) on the fight most likely to happen next: a rider whose attack is ready and the
// kart it would go for, by the same rules the riders use (a volt dashes at a kart 3-16 m ahead in its lane, a sniper
// shoots one 8-70 m ahead, a thrower's item flies down its lane). The shot is held until that attack has gone and
// landed. Each angle is anchored in track space (Rig), so the kart's heading never shakes the view. Capture logs
// every cut, hit and attack, and the trailer's edit keeps each of its shots inside one of these angles.
// Only captures add it; the game itself always uses the chase camera.

using System.Collections.Generic;
using UnityEngine;

namespace HarnessGame
{
    [DefaultExecutionOrder(200)]
    public class Director : MonoBehaviour
    {
        public static readonly string[] Rigs = { "front", "chase", "quarter", "low", "high", "orbit", "bumper", "top", "side" };
        public float minShot = 2.8f, maxShot = 3.8f;
        public int seed = 7;

        public int shot = -1;          // counts the cuts
        public string rig = "";
        public Kart subject;
        public Kart attacker;          // the rider expected to attack in this shot (may be the subject)

        Camera cam;
        Rig anchor;
        float t, until, orbit, side = 1f, shake, fired = -1f, lift, liftV;
        Vector3 fixedPos, look;
        System.Random rnd;
        readonly Dictionary<string, int> lastUsed = new Dictionary<string, int>();
        RaceManager hooked;

        void Start()
        {
            cam = GetComponent<Camera>();
            rnd = new System.Random(seed);
        }

        void OnDestroy() { if (hooked) { hooked.onHit -= OnHit; hooked.onAttack -= OnAttack; } }

        void OnHit(Kart by, Kart target)
        {
            if (target == subject || by == subject) shake = 0.3f;
        }

        void OnAttack(Kart by)
        {
            if (by == attacker && fired < 0) fired = t;
        }

        void LateUpdate()
        {
            var race = RaceManager.Main;
            var path = TrackPath.Main;
            if (!cam || !race || !path || race.karts.Count == 0) return;
            if (hooked != race)
            {
                if (hooked) { hooked.onHit -= OnHit; hooked.onAttack -= OnAttack; }
                race.onHit += OnHit; race.onAttack += OnAttack; hooked = race;
            }
            var chase = GetComponent<ChaseCamera>();
            if (chase && chase.enabled) chase.enabled = false;   // a race rebuild turns it back on
            float dt = Time.deltaTime;
            t += dt;
            // hold past the planned length while the expected attack is still coming (up to 1.6 s), then for the
            // item or the beam to land
            bool coming = attacker && fired < 0 && attacker.cooldown <= 0.05f && attacker.stun <= 0 && t < until + 1.6f;
            bool landing = fired >= 0 && t < fired + 0.9f;
            if (!subject || subject.finishTime >= 0 || (t >= until && !coming && !landing)) Cut(race, path);
            Frame(path, dt);
        }

        /// the angles off the road's line (quarter, low, orbit, high) only work on plain flat road: in a loop or a
        /// twist they end up under the road or inside the hill. These stay on the road's own surface and up.
        public static readonly string[] OnLine = { "front", "chase", "bumper", "top", "side" };

        static bool Flat(TrackPath path, float d, float span)
        {
            for (float x = -15f; x <= span; x += 8f)
                if (path.InFeature(d + x) || path.Hover(d + x) > 0.5f) return false;
            return true;
        }

        /// the angles that hold a fight tens of metres long: in front looking back down the road, or behind the
        /// attacker (high or low)
        static readonly string[] Long = { "front", "chase", "bumper" };

        /// the angle that fits here and was used longest ago (ties broken at random), never the same one twice
        string NextRig(bool flat, bool far)
        {
            string pick = null;
            int oldest = int.MaxValue;
            double tie = 0;
            foreach (var r in Rigs)
            {
                if (r == rig) continue;
                if (!flat && System.Array.IndexOf(OnLine, r) < 0) continue;
                if (far && System.Array.IndexOf(Long, r) < 0) continue;
                int u = lastUsed.TryGetValue(r, out var n) ? n : -1;
                double roll = rnd.NextDouble();
                if (u < oldest || (u == oldest && roll > tie)) { pick = r; oldest = u; tie = roll; }
            }
            pick = pick ?? (rig == "front" ? "chase" : "front");
            lastUsed[pick] = shot + 1;
            return pick;
        }

        /// would o, once its attack is ready, go for s (ds metres ahead of it, dl metres to the side)? The riders' own
        /// rules (Abilities.Decide), loosened a little because both karts move before it fires
        static float Threat(Kart o, float ds, float dl)
        {
            switch (o.kind)
            {
                case "volt": return ds > 2f && ds < 18f && Mathf.Abs(dl) < 3.5f ? 3f : 0f;
                case "sniper": return ds > 8f && ds < 70f ? (ds < 35f ? 2.5f : 1.5f) : 0f;
                case "thrower": return ds > 0.5f && ds < 30f && Mathf.Abs(dl) < 2f ? 2f : 0f;
                default: return 0f;
            }
        }

        /// how likely a fight is around this kart in the next few seconds, and the rider most likely to start it
        float Score(Kart s, RaceManager race, out Kart foe, out float gap)
        {
            foe = null;
            gap = 0;
            if (s.finishTime >= 0) return float.MinValue;
            float score = 0, bestThreat = 0;
            foreach (var o in race.karts)
            {
                if (o == s || o.finishTime >= 0) continue;
                float ds = s.dist - o.dist;   // > 0: o is behind s
                if (o.stun <= 0 && o.cooldown < 0.8f)
                {
                    float w = Threat(o, ds, s.lateral - o.lateral) * (o.cooldown <= 0 ? 1f : 0.6f);
                    score += w;
                    if (w > bestThreat) { bestThreat = w; foe = o; gap = ds; }
                }
                if (Mathf.Abs(ds) < 12f) score += 0.6f;
                if (o.stun > 0 && Mathf.Abs(ds) < 20f) score += 0.3f;
            }
            if (s == subject) score -= 1.5f;   // move round the field
            return score + (float)rnd.NextDouble() * 0.5f;
        }

        void Cut(RaceManager race, TrackPath path)
        {
            Kart best = null, foe = null;
            float bs = float.MinValue, gap = 0;
            foreach (var k in race.karts)
            {
                float s = Score(k, race, out var f, out var g);
                if (s > bs) { bs = s; best = k; foe = f; gap = g; }
            }
            if (!best) return;
            float len = Mathf.Lerp(minShot, maxShot, (float)rnd.NextDouble());
            bool far = foe && gap > 22f;   // a long shot down the road: only some angles hold both karts
            subject = best;
            rig = NextRig(Flat(path, best.dist - (foe ? gap : 0f), Mathf.Max(30f, best.speed * len + 25f) + (foe ? gap : 0f)), far);
            // from behind, follow the attacker so the attack flies ahead of the camera to its target
            if ((rig == "chase" || rig == "bumper") && foe) subject = foe;
            attacker = foe;
            fired = -1f;
            shot++;
            until = t + len;
            anchor.Reset(subject);
            lift = liftV = 0;
            orbit = (float)rnd.NextDouble() * 360f;
            side = rnd.Next(2) == 0 ? -1f : 1f;
            if (rig == "low")
            {
                // a fixed camera on the kerb ahead; the kart passes it about halfway through the shot
                side = subject.lateral >= 0 ? 1f : -1f;
                float ahead = Mathf.Max(18f, subject.speed * len * 0.5f);
                path.Sample(subject.dist + ahead, out var c, out _, out var r, out var u);
                fixedPos = c + r * side * (path.HalfWidth + 1.5f) + u * 1.0f;
            }
            look = subject.transform.position;
            shake = 0;
        }

        void Frame(TrackPath path, float dt)
        {
            if (!subject) return;
            anchor.Step(subject, path, dt, out var at, out var fwd, out var up);
            var right = Vector3.Cross(up, fwd);
            Vector3 pos, aim;
            float fov = 58f;
            switch (rig)
            {
                case "front":   // ahead of the kart along the road, looking back at it and whoever is chasing it
                    pos = anchor.Point(path, 8f, side * 1.2f, 1.8f);
                    aim = anchor.Point(path, -6f, 0f, 0.7f);
                    up = anchor.UpAt(path, 8f);
                    fov = 52f;
                    break;
                case "quarter":
                    pos = anchor.Point(path, 4.5f, side * 5.5f, 2.2f);
                    aim = anchor.Point(path, -2.5f, 0f, 0.7f);
                    fov = 54f;
                    break;
                case "low":
                    pos = fixedPos;
                    look = Vector3.Lerp(look, at + up * 0.3f, dt > 0 ? 1f - Mathf.Exp(-dt * 10f) : 1f);
                    aim = look;
                    fov = 42f;
                    break;
                case "high":
                    pos = anchor.Point(path, -8f, side * 3f, 9f);
                    aim = anchor.Point(path, 6f, 0f, 0f);
                    fov = 55f;
                    break;
                case "orbit":
                    orbit += dt * 32f * side;
                    var dir = Quaternion.AngleAxis(orbit, up) * fwd;
                    pos = at + dir * 7f + up * 2.4f;
                    aim = at + up * 0.6f;
                    fov = 55f;
                    break;
                case "bumper":  // low behind, off the kart's line, looking up the road past it (out of the lane its
                                // dash trails sweep, which fill the frame from closer in)
                    pos = anchor.Point(path, -6f, side * 1.6f, 1.4f);
                    aim = anchor.Point(path, 10f, 0f, 0.9f);
                    up = anchor.UpAt(path, -6f);
                    fov = 62f;
                    break;
                case "top":     // above and behind the kart, looking steeply down on it and the road ahead
                    pos = anchor.Point(path, -5f, 0f, 7f);
                    aim = anchor.Point(path, 2.5f, 0f, 0f);
                    up = anchor.UpAt(path, -5f);
                    fov = 58f;
                    break;
                case "side":    // alongside at the road's height, tracking with the kart
                    pos = anchor.Point(path, 1.5f, side * 3.6f, 1.1f);
                    aim = anchor.Point(path, -0.5f, 0f, 0.8f);
                    up = anchor.UpAt(path, 1.5f);
                    fov = 56f;
                    break;
                default:        // chase: behind and above along the road, further back than the game's camera
                    pos = anchor.Point(path, -9f, 0f, 3.8f);
                    aim = anchor.Point(path, 8f, 0f, 1.2f);
                    up = anchor.UpAt(path, -9f);
                    fov = 60f;
                    break;
            }
            // another kart about to drive through the lens: rise over it, smoothly
            float need = 0;
            var race = RaceManager.Main;
            if (race)
                foreach (var k in race.karts)
                {
                    if (k == subject) continue;
                    float d = Vector3.Distance(pos, k.transform.position + k.transform.up * 0.8f);
                    if (d < 2.5f) need = Mathf.Max(need, (2.5f - d) * 1.4f);
                }
            lift = dt > 0 ? Mathf.SmoothDamp(lift, need, ref liftV, 0.12f, Mathf.Infinity, dt) : need;
            pos += up * lift;
            transform.position = pos;
            transform.LookAt(aim, up);
            cam.fieldOfView = fov;
            if (shake > 0)
            {
                shake = Mathf.Max(0, shake - dt * 1.4f);
                transform.position += Rig.Wobble(seed, Time.time, transform) * shake * 0.5f;
            }
        }
    }
}
