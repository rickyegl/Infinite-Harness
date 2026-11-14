// Runs the race: countdown, driving (player input or autopilot, AI drivers), kart-to-kart bumps, the rider
// classes' attacks (Abilities), laps, places and the finish. Everything steps here in one place.

using System.Collections.Generic;
using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

namespace HarnessGame
{
    public class RaceManager : MonoBehaviour
    {
        public enum Phase { Grid, Countdown, Racing, Finished }

        public GameConfig cfg;
        public GameKit kit;
        public TrackPath path;
        public List<Kart> karts = new List<Kart>();
        public Kart player;
        public Phase phase = Phase.Grid;
        public float clock;           // seconds since the green light
        public float countdown = 3f;
        public readonly List<string> feed = new List<string>();
        public float feedAge;
        public System.Action<Kart, Kart> onHit;
        public Abilities abilities;

        public static RaceManager Main { get; private set; }
        void OnEnable() { Main = this; }

        public void Setup()
        {
            float L = path.Length;
            abilities ??= new Abilities(this);
            abilities.Reset();
            for (int i = 0; i < karts.Count; i++)
            {
                var k = karts[i];
                int row = i / 2, col = i % 2;
                k.dist = -6f - row * 5.5f;
                k.lateral = (col == 0 ? -1 : 1) * path.HalfWidth * 0.4f;
                k.speed = 0; k.latVel = 0; k.stun = 0; k.finishTime = -1;
                k.cooldown = 0; k.dash = 0; k.small = 0; k.size = 1f; k.bumpedBy = null;
                var rnd = new System.Random(cfg.track.seed * 97 + i * 13);
                k.skill = 0.86f + (float)rnd.NextDouble() * 0.12f;
                k.lineBias = ((float)rnd.NextDouble() * 2f - 1f) * 0.45f;
                k.lineWobble = (float)rnd.NextDouble() * 6.28f;
                k.Place(path);
            }
            phase = Application.isPlaying ? Phase.Countdown : Phase.Grid;
            countdown = 3f;
            clock = 0;
        }

        void Update()
        {
            float dt = Mathf.Min(Time.deltaTime, 0.05f);
            if (phase == Phase.Countdown)
            {
                countdown -= dt;
                if (countdown <= 0) { phase = Phase.Racing; clock = 0; }
            }
            else if (phase == Phase.Racing || phase == Phase.Finished)
            {
                clock += dt;
                Inputs();
                abilities?.Decide(dt);
                // fixed sub-steps keep the bumps stable at low frame rates
                int steps = Mathf.CeilToInt(dt / 0.02f);
                for (int s = 0; s < steps; s++) Step(dt / steps);
                abilities?.Run(dt);
                Places();
            }
#if ENABLE_INPUT_SYSTEM
            if (phase == Phase.Finished && Keyboard.current != null && Keyboard.current.rKey.wasPressedThisFrame) Restart();
            if (phase == Phase.Finished && Keyboard.current != null && Keyboard.current.cKey.wasPressedThisFrame && cfg.built_riders && GameBoot.Main) { GameBoot.Main.ChooseAgain(); return; }
#endif
            foreach (var k in karts) { k.Tick(dt); k.Place(path); }
            if (feed.Count > 0) { feedAge += dt; if (feedAge > 2.5f) { feed.RemoveAt(0); feedAge = 0; } }
        }

        public void Restart() { Setup(); feed.Clear(); }

        float Curvature(float d)
        {
            // sideways curvature in the road's own plane: loops pitch the road, they do not turn it,
            // and a banked corner needs less grip than a flat one
            path.Sample(d, out _, out var t0, out var r0);
            path.Sample(d + 12f, out _, out var t1, out _);
            return Vector3.Dot(t1 - t0, r0) / 12f;   // 1/m, + = turning right
        }

        void Inputs()
        {
            foreach (var k in karts)
            {
                bool done = k.finishTime >= 0;
                if (k.isPlayer && !cfg.autopilot && !done)
                {
                    k.throttle = 0; k.steer = 0; k.wantsAttack = false;
#if ENABLE_INPUT_SYSTEM
                    var kb = Keyboard.current;
                    if (kb != null)
                    {
                        if (kb.wKey.isPressed || kb.upArrowKey.isPressed) k.throttle = 1;
                        if (kb.sKey.isPressed || kb.downArrowKey.isPressed) k.throttle = -1;
                        if (kb.aKey.isPressed || kb.leftArrowKey.isPressed) k.steer -= 1;
                        if (kb.dKey.isPressed || kb.rightArrowKey.isPressed) k.steer += 1;
                        k.wantsAttack = kb.spaceKey.wasPressedThisFrame || kb.fKey.wasPressedThisFrame;
                    }
                    var mouse = Mouse.current;
                    if (mouse != null && mouse.leftButton.wasPressedThisFrame) k.wantsAttack = true;
                    var pad = Gamepad.current;
                    if (pad != null)
                    {
                        k.throttle = Mathf.Max(k.throttle, pad.rightTrigger.ReadValue()) - pad.leftTrigger.ReadValue();
                        k.steer = Mathf.Clamp(k.steer + pad.leftStick.ReadValue().x, -1, 1);
                        k.wantsAttack |= pad.buttonSouth.wasPressedThisFrame;
                    }
#endif
                    continue;
                }
                // AI (and the player on autopilot): follow a personal racing line, ease off for corners
                float look = Mathf.Max(8f, k.speed * 0.9f);
                float curve = Curvature(k.dist + look);
                float target = (k.lineBias + 0.25f * Mathf.Sin(clock * 0.4f + k.lineWobble)) * path.HalfWidth - Mathf.Clamp(curve * 260f, -1f, 1f) * path.HalfWidth * 0.45f;
                // move over for a slower kart just ahead
                foreach (var o in karts)
                {
                    if (o == k) continue;
                    float ds = Gap(o.dist, k.dist);
                    if (ds > 0 && ds < 9f && Mathf.Abs(o.lateral - k.lateral) < 2.2f && o.speed < k.speed)
                        target = o.lateral + (o.lateral > 0 ? -3f : 3f);
                }
                k.steer = Mathf.Clamp((target - k.lateral) * 0.35f - k.latVel * 0.25f, -1, 1);
                float cornerCap = cfg.karts.topSpeed * Mathf.Lerp(1f, 0.62f, Mathf.Clamp01(Mathf.Abs(curve) * 60f));
                k.throttle = k.speed < cornerCap * k.skill ? 1f : 0.2f;
                if (done) k.throttle = k.speed > 8f ? 0f : 0.4f;
                k.wantsAttack = false;
            }
        }

        public const float HoverBoost = 0.18f;   // extra top speed on hover sections

        static float Gap(float a, float b) => a - b;   // dist is unbounded, so plain difference is the real gap

        void Step(float dt)
        {
            var ks = cfg.karts;
            float hw = path.HalfWidth;
            foreach (var k in karts)
            {
                float top = ks.topSpeed * (k.isPlayer ? 1f : k.skill) * (1f + HoverBoost * path.Hover(k.dist)) * Abilities.SpeedMul(k);
                float a = k.stun > 0 ? -6f : k.throttle > 0 ? ks.accel * k.throttle * (1f - k.speed / top) : k.throttle < 0 ? -ks.accel * 1.8f : -2f;
                if (k.dash > 0 && k.stun <= 0) a = Mathf.Max(a, ks.accel * 3f);   // the electric dash kicks in at once
                if (Mathf.Abs(k.lateral) > hw) a -= 6f;   // on the kerb
                k.speed = Mathf.Clamp(k.speed + a * dt, 0, top * 1.05f);
                float curve = Curvature(k.dist);
                // steering moves you sideways; corners pull you to the outside unless you steer against them
                float pull = -curve * k.speed * k.speed * 0.6f;
                float steerVel = k.stun > 0 ? 0 : k.steer * ks.steer * Mathf.Clamp01(k.speed / 6f);
                k.latVel = Mathf.MoveTowards(k.latVel, steerVel, ks.grip * dt * 4f) + pull * dt;
                k.lateral += k.latVel * dt;
                k.dist += k.speed * dt;
                float wall = hw + 1.4f;
                if (Mathf.Abs(k.lateral) > wall)
                {
                    k.lateral = Mathf.Sign(k.lateral) * wall;
                    k.latVel = -k.latVel * 0.4f;
                    k.speed *= 0.97f;
                }
            }
            // bumps: push apart, the one behind loses a little speed
            for (int i = 0; i < karts.Count; i++)
                for (int j = i + 1; j < karts.Count; j++)
                {
                    var a = karts[i]; var b = karts[j];
                    float ds = Gap(a.dist, b.dist), dl = a.lateral - b.lateral;
                    if (Mathf.Abs(ds) < 2.6f && Mathf.Abs(dl) < 1.7f)
                    {
                        float push = (1.7f - Mathf.Abs(dl)) * 0.5f * (dl >= 0 ? 1 : -1);
                        a.lateral += push; b.lateral -= push;
                        a.latVel += push * 2f; b.latVel -= push * 2f;
                        a.bumpedBy = b; b.bumpedBy = a;   // a small (shrink) rider gets squashed by this
                        var back = ds > 0 ? b : a; var front = ds > 0 ? a : b;
                        back.speed = Mathf.Min(back.speed, front.speed * 0.98f);
                    }
                }
        }

        public void Feed(string line)
        {
            feed.Add(line);
            if (feed.Count > 3) feed.RemoveAt(0);
            feedAge = 0;
        }

        void Places()
        {
            float L = path.Length;
            var order = new List<Kart>(karts);
            order.Sort((a, b) =>
            {
                if (a.finishTime >= 0 && b.finishTime >= 0) return a.finishTime.CompareTo(b.finishTime);
                if (a.finishTime >= 0) return -1;
                if (b.finishTime >= 0) return 1;
                return b.dist.CompareTo(a.dist);
            });
            for (int i = 0; i < order.Count; i++) order[i].place = i + 1;
            foreach (var k in karts)
                if (k.finishTime < 0 && k.dist >= cfg.laps * L)
                {
                    k.finishTime = clock;
                    if (k == player) phase = Phase.Finished;
                }
            if (cfg.autopilot && phase == Phase.Racing && karts.TrueForAll(k => k.finishTime >= 0)) phase = Phase.Finished;
        }
    }
}
