// The four rider classes and their attacks, stepped by RaceManager around the kart physics:
//   volt     SPACE: an electric dash (0.7 s at 1.55x top speed); every kart it runs into is zapped
//   sniper   mouse to aim, click (or SPACE) to shoot, once every 10 s; the beam hits the kart under the crosshair
//   shrink   SPACE: small and fast for 4 s (1.3x top speed), but a kart that touches it squashes it (big slow)
//   thrower  throws an item forward on its own every 3 s; the item hits the first kart in its lane
// AI riders (and the player on autopilot) use the same attacks with simple rules. Every landed attack goes
// through Land(), which writes the hit feed and the per-class counts the race test reports.

using System.Collections.Generic;
using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

namespace HarnessGame
{
    public class Abilities
    {
        public const float DashTime = 0.7f, DashBoost = 1.55f, SmallTime = 4f, SmallBoost = 1.3f, SmallScale = 0.55f;
        public const float ShotRange = 150f, ShotRadius = 1.8f, ThrowSpeed = 22f, ThrowLife = 2.2f;
        public static readonly string[] Kinds = { "volt", "sniper", "shrink", "thrower" };

        public static Color DefaultColor(string kind) => kind switch
        {
            "volt" => new Color(0.24f, 0.84f, 1f),
            "sniper" => new Color(1f, 0.24f, 0.35f),
            "shrink" => new Color(0.77f, 0.36f, 1f),
            _ => new Color(1f, 0.7f, 0.24f),
        };

        public static Color ColorOf(Kart k) => GameConfig.Hex(k.cls != null ? k.cls.color : "", DefaultColor(k.kind));

        /// top-speed multiplier while dashing or small
        public static float SpeedMul(Kart k) => k.dash > 0 ? DashBoost : k.small > 0 ? SmallBoost : 1f;

        public static string Help(string kind) => kind switch
        {
            "volt" => "W/S drive  A/D steer  SPACE electric dash",
            "sniper" => "W/S drive  A/D steer  MOUSE aim  CLICK shoot",
            "shrink" => "W/S drive  A/D steer  SPACE shrink (don't get touched)",
            _ => "W/S drive  A/D steer  items fly forward every 3 s",
        };

        class Item { public Kart owner; public float dist, lateral, speed, life; public Transform vis; }

        readonly RaceManager race;
        readonly List<Item> items = new List<Item>();
        /// attacks used and landed per class (for shrink, "hits" counts squashes)
        public readonly Dictionary<string, int> uses = new Dictionary<string, int>(), hits = new Dictionary<string, int>();
        /// where the sniper aims, in screen pixels (the HUD crosshair follows it), and whether a kart is under it
        public Vector2 aim;
        public bool aimActive, aimOnKart;

        public Abilities(RaceManager race) { this.race = race; }

        public void Reset()
        {
            foreach (var it in items) if (it.vis) Kill(it.vis.gameObject);
            items.Clear(); uses.Clear(); hits.Clear();
        }

        static void Kill(GameObject g) { if (Application.isPlaying) Object.Destroy(g); else Object.DestroyImmediate(g); }
        static void Count(Dictionary<string, int> d, string k) => d[k] = d.TryGetValue(k, out var n) ? n + 1 : 1;
        bool Human(Kart k) => k.isPlayer && !race.cfg.autopilot;
        bool Chance(float dt, float rate) => Random.value < race.cfg.combat.aiAggression * dt * rate;

        /// the closest kart ahead in track space, between min and max metres, within lat metres sideways
        Kart Ahead(Kart k, float min, float max, float lat)
        {
            Kart best = null; float bd = max;
            foreach (var o in race.karts)
            {
                if (o == k || o.stun > 0 || o.finishTime >= 0) continue;
                float ds = o.dist - k.dist;
                if (ds >= min && ds < bd && Mathf.Abs(o.lateral - k.lateral) < lat) { bd = ds; best = o; }
            }
            return best;
        }

        float Nearest(Kart k)
        {
            float best = float.MaxValue;
            foreach (var o in race.karts)
                if (o != k) best = Mathf.Min(best, new Vector2(o.dist - k.dist, o.lateral - k.lateral).magnitude);
            return best;
        }

        // ------------------------------------------------------------------ before the karts move

        public void Decide(float dt)
        {
            UpdateAim();
            var cfg = race.cfg;
            if (!cfg.built_combat || race.clock < 3f) return;   // let the pack spread out first
            foreach (var k in race.karts)
            {
                if (k.finishTime >= 0 || k.stun > 0) continue;
                if (k.dash > 0 && !Human(k))
                {
                    // an AI volt steers into whoever it is dashing at
                    var t = Ahead(k, 0f, 20f, 4f);
                    if (t != null) k.steer = Mathf.Clamp((t.lateral - k.lateral) * 0.6f - k.latVel * 0.25f, -1f, 1f);
                    k.throttle = 1f;
                }
                else if (!Human(k))
                {
                    // a shrunken kart just ahead is fair game: AI riders try to touch it
                    var t = Ahead(k, 0f, 14f, 5f);
                    if (t != null && t.small > 0) k.steer = Mathf.Clamp((t.lateral - k.lateral) * 0.5f - k.latVel * 0.25f, -1f, 1f);
                }
                if (k.cooldown > 0) continue;
                switch (k.kind)
                {
                    case "volt":
                        if (Human(k) ? k.wantsAttack : Ahead(k, 3f, 16f, 3f) != null && Chance(dt, 3f)) Dash(k);
                        break;
                    case "sniper":
                        if (Human(k)) { if (k.wantsAttack) Shoot(k, UnderAim(), null); }
                        else
                        {
                            var t = Ahead(k, 8f, 70f, 99f);
                            if (t != null && Chance(dt, 1.5f)) Shoot(k, Random.value < 0.7f ? t : null, t);
                        }
                        break;
                    case "shrink":
                        if (Human(k) ? k.wantsAttack : Nearest(k) > 6f && Chance(dt, 0.6f)) Shrink(k);
                        break;
                    default:
                        Throw(k);   // on its own, whenever the cooldown is up
                        break;
                }
            }
        }

        void Used(Kart k)
        {
            k.cooldown = k.cls != null ? k.cls.cooldown : 3f;
            Count(uses, k.kind);
            race.onAttack?.Invoke(k);
        }

        public void Dash(Kart k)
        {
            Used(k);
            k.dash = DashTime;
            if (k.rider) k.rider.Swing(1f);
            Effects.Hit(race.kit, k.transform.position + k.transform.up * 0.6f, ColorOf(k));
        }

        public void Shrink(Kart k)
        {
            Used(k);
            k.small = SmallTime;
            Effects.Hit(race.kit, k.transform.position + k.transform.up * 0.8f, ColorOf(k));
        }

        public void Throw(Kart k)
        {
            Used(k);
            if (k.rider) k.rider.Swing(1f);
            var vis = Prim.Make(PrimitiveType.Sphere, null, Vector3.zero, Vector3.one * 0.55f, race.kit.Lit(ColorOf(k), 0.6f), "Item").transform;
            Prim.Make(PrimitiveType.Cube, vis, Vector3.zero, new Vector3(1.25f, 0.25f, 0.25f), race.kit.Glow(ColorOf(k), 2f), "Band");
            var trail = Effects.Trail(race.kit, vis, Vector3.zero, ColorOf(k), 0.45f, 0.3f);
            trail.transform.SetParent(null, true);   // the item spins; the trail follows its centre, not its tumble
            vis.gameObject.AddComponent<Follow>().trail = trail.transform;
            items.Add(new Item { owner = k, dist = k.dist + 1.6f, lateral = k.lateral, speed = k.speed + ThrowSpeed, life = ThrowLife, vis = vis });
        }

        /// fire the sniper beam; target is the kart that gets hit (null for a miss), aimedAt where a missed AI shot goes
        public void Shoot(Kart k, Kart target, Kart aimedAt)
        {
            Used(k);
            var from = k.rider ? k.rider.armR.position + k.transform.forward * 0.9f : k.transform.position + k.transform.up * 1.6f;
            Vector3 to;
            if (target) to = target.transform.position + target.transform.up * 0.9f;
            else if (aimedAt) to = aimedAt.transform.position + aimedAt.transform.up * 2.5f + aimedAt.transform.right * (Random.value < 0.5f ? -3f : 3f);
            else
            {
                var cam = Camera.main;
                var ray = cam ? cam.ScreenPointToRay(aim) : new Ray(from, k.transform.forward);
                to = ray.origin + ray.direction * ShotRange;
            }
            Effects.Beam(race.kit, from, to, ColorOf(k));
            if (target) Land(k, target, "sniper", race.cfg.combat.knock * 0.5f * Side(k, target), race.cfg.combat.slow * 0.75f, 1.0f, "sniped", ColorOf(k));
        }

        static float Side(Kart by, Kart target) => Mathf.Sign(target.lateral - by.lateral + 0.001f);

        // ------------------------------------------------------------------ the sniper's crosshair

        void UpdateAim()
        {
            var p = race.player;
            var cam = Camera.main;
            aimActive = p && p.kind == "sniper" && race.phase != RaceManager.Phase.Finished;
            if (!aimActive || !cam) { aimOnKart = false; SetCursor(true); return; }
            if (Human(p))
            {
#if ENABLE_INPUT_SYSTEM
                var m = Mouse.current;
                aim = m != null ? m.position.ReadValue() : new Vector2(Screen.width * 0.5f, Screen.height * 0.55f);
#else
                aim = Input.mousePosition;
#endif
                SetCursor(false);
            }
            else
            {
                // on autopilot the crosshair follows the kart the AI would shoot at
                var t = Ahead(p, 8f, 70f, 99f);
                var target = t ? cam.WorldToScreenPoint(t.transform.position + t.transform.up * 0.9f) : new Vector3(Screen.width * 0.5f, Screen.height * 0.55f, 1f);
                aim = Vector2.Lerp(aim, target, 0.25f);
                SetCursor(true);
            }
            aimOnKart = UnderAim() != null;
        }

        static void SetCursor(bool visible) { if (Application.isPlaying && Cursor.visible != visible) Cursor.visible = visible; }

        /// the kart nearest the camera within ShotRadius of the aim ray
        Kart UnderAim()
        {
            var cam = Camera.main;
            if (!cam) return null;
            var ray = cam.ScreenPointToRay(aim);
            Kart best = null; float bt = ShotRange;
            foreach (var o in race.karts)
            {
                if (o == race.player || o.finishTime >= 0) continue;
                var v = o.transform.position + o.transform.up * 0.9f - ray.origin;
                float t = Vector3.Dot(v, ray.direction);
                if (t < 0 || t > bt) continue;
                if ((v - ray.direction * t).magnitude < ShotRadius) { bt = t; best = o; }
            }
            return best;
        }

        // ------------------------------------------------------------------ after the karts move

        public void Run(float dt)
        {
            var c = race.cfg.combat;
            // volt: zap every kart the dash runs into (a zapped kart is stunned, so once per dash)
            foreach (var k in race.karts)
            {
                if (k.dash <= 0) continue;
                foreach (var o in race.karts)
                {
                    if (o == k || o.stun > 0 || o.finishTime >= 0) continue;
                    float ds = o.dist - k.dist, dl = o.lateral - k.lateral;
                    if (Mathf.Abs(ds) < 3f && Mathf.Abs(dl) < 2.2f)
                    {
                        Effects.Bolt(race.kit, k.transform.position + k.transform.up * 1.2f, o.transform.position + o.transform.up * 1.0f, ColorOf(k));
                        Land(k, o, "volt", c.knock * Side(k, o), c.slow, 0.8f, "zapped", ColorOf(k));
                    }
                }
            }
            // shrink: a touch while small squashes it flat
            foreach (var k in race.karts)
            {
                if (k.small > 0 && k.bumpedBy && k.stun <= 0)
                {
                    k.small = 0;
                    k.size = 1f;
                    Land(k.bumpedBy, k, "shrink", 0f, 0.25f, 1.2f, "squashed", ColorOf(k));
                }
            }
            foreach (var k in race.karts) k.bumpedBy = null;
            // thrower: items fly down the track and hit the first kart in their lane
            for (int i = items.Count - 1; i >= 0; i--)
            {
                var it = items[i];
                it.life -= dt;
                it.dist += it.speed * dt;
                Kart hit = null;
                foreach (var o in race.karts)
                {
                    if (o == it.owner || o.finishTime >= 0 || o.stun > 0) continue;
                    if (Mathf.Abs(o.dist - it.dist) < 1.8f && Mathf.Abs(o.lateral - it.lateral) < 1.4f) { hit = o; break; }
                }
                if (hit) Land(it.owner, hit, "thrower", c.knock * 0.6f * Side(it.owner, hit), Mathf.Lerp(c.slow, 1f, 0.3f), 0.6f, "beaned", ColorOf(it.owner));
                if (hit || it.life <= 0)
                {
                    if (it.vis) Kill(it.vis.gameObject);
                    items.RemoveAt(i);
                    continue;
                }
                var pose = race.path.PoseAt(it.dist, it.lateral, 0f);
                float age = ThrowLife - it.life;
                it.vis.SetPositionAndRotation(pose.position + pose.rotation * Vector3.up * (1.1f + Mathf.Sin(Mathf.Min(age * 3f, Mathf.PI)) * 0.8f), pose.rotation * Quaternion.Euler(age * 720f, 0, 0));
            }
        }

        public void Land(Kart by, Kart target, string kind, float knock, float slow, float stun, string verb, Color color)
        {
            target.Hit(knock, slow, stun);
            Effects.Hit(race.kit, target.transform.position + target.transform.up * 1.2f, color);
            Count(hits, kind);
            race.Feed($"{by.kartName} {verb} {target.kartName}!");
            race.onHit?.Invoke(by, target);
            if ((by.isPlayer || target.isPlayer) && ChaseCamera.Main) ChaseCamera.Main.Shake(kind == "sniper" ? 0.5f : 0.35f);
        }
    }

    /// keeps a thrown item's trail on the item (not spinning with it) and lets it fade out after the item goes
    public class Follow : MonoBehaviour
    {
        public Transform trail;
        void LateUpdate() { if (trail) trail.position = transform.position; }
        void OnDestroy()
        {
            if (!trail) return;
            if (Application.isPlaying) Object.Destroy(trail.gameObject, 0.35f);
            else Object.DestroyImmediate(trail.gameObject);
        }
    }

    /// a glowing line that thins out and goes (sniper beams, volt bolts)
    public class FadeLine : MonoBehaviour
    {
        public float life = 0.35f;
        float age, width;
        LineRenderer lr;
        void Start() { lr = GetComponent<LineRenderer>(); width = lr.widthMultiplier; }
        void Update()
        {
            age += Time.deltaTime;
            if (lr) lr.widthMultiplier = width * Mathf.Clamp01(1f - age / life);
            if (age >= life) Destroy(gameObject);
        }
    }
}
