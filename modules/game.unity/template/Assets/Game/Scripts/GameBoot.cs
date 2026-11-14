// The one object in the scene. Builds the whole game from game.json under a "Generated" child:
// in the player at start, and in the editor whenever the bridge asks (so screenshots show the current state).
// Parts appear as the child cells mark them built (track, karts, riders, combat, HUD).
// With riders and combat built, a played race opens on the rider pick (ClassSelect) before the countdown.

using UnityEngine;

namespace HarnessGame
{
    [DefaultExecutionOrder(-100)]
    public class GameBoot : MonoBehaviour
    {
        public Camera cam;
        public RaceManager race;
        public Look look;
        public static GameBoot Main { get; private set; }
        /// the rider the player picked this session; null = not picked yet (the pick shows before the race)
        public static string PlayerClass;
        GameConfig cfg;

        void OnEnable() { Main = this; }

        void Awake()
        {
            if (Application.isPlaying) { PlayerClass = null; Rebuild(GameConfig.Load(), true); }
        }

        public void Rebuild(GameConfig cfg, bool playing)
        {
            this.cfg = cfg;
            var kit = GameKit.Load();
            kit.ClearCache();
            var old = transform.Find("Generated");
            if (old && cam && cam.transform.IsChildOf(old)) cam = null;   // a camera made last time goes with it
            if (old) { if (Application.isPlaying) { old.gameObject.SetActive(false); Destroy(old.gameObject); } else DestroyImmediate(old.gameObject); }
            var root = new GameObject("Generated").transform;
            root.SetParent(transform, false);

            look = Look.Build(root, kit);
            if (!cam)
            {
                var cg = new GameObject("Main Camera") { tag = "MainCamera" };
                cg.transform.SetParent(root, false);
                cam = cg.AddComponent<Camera>();
                cg.AddComponent<AudioListener>();
            }
            cam.fieldOfView = 62; cam.nearClipPlane = 0.2f; cam.farClipPlane = 2500f;

            var raceGo = new GameObject("Race");
            raceGo.transform.SetParent(root, false);
            race = raceGo.AddComponent<RaceManager>();
            race.cfg = cfg; race.kit = kit;

            if (cfg.built_track)
            {
                race.path = TrackBuilder.Build(cfg, kit, root);
                if (cfg.built_karts)
                {
                    int n = Mathf.Clamp(cfg.karts.count, 2, 8);
                    for (int i = 0; i < n; i++)
                    {
                        bool isPlayer = i == n - 1;   // the player starts at the back of the grid
                        var k = Kart.Build(raceGo.transform, kit, cfg, i, cfg.ClassFor(i, isPlayer, PlayerClass));
                        k.isPlayer = isPlayer;
                        race.karts.Add(k);
                    }
                    race.player = race.karts[race.karts.Count - 1];
                    race.Setup();
                }
            }
            race.enabled = playing;

            var chase = cam.GetComponent<ChaseCamera>();
            if (!chase) chase = cam.gameObject.AddComponent<ChaseCamera>();
            chase.target = race.player ? race.player.transform : null;
            chase.enabled = playing;
            if (race.player) chase.Snap();
            else if (race.path) Overview(cam, race.path);

            Hud hud = null;
            if (cfg.built_hud && race.path) { hud = Hud.Build(root, cam, race, cfg); hud.Refresh(); }

            // the rider pick, once per session (and again on C after a race)
            if (playing && PlayerClass == null && race.player && cfg.built_riders && cfg.built_combat && !cfg.autopilot)
            {
                race.phase = RaceManager.Phase.Grid;
                if (hud) hud.gameObject.SetActive(false);
                var current = race.player.kind;
                ClassSelect.Build(root, cam, race, cfg, current, kind =>
                {
                    PlayerClass = kind;
                    if (kind != current) { Rebuild(cfg, true); return; }
                    race.phase = RaceManager.Phase.Countdown; race.countdown = 3f;
                    if (hud) hud.gameObject.SetActive(true);
                });
            }
            look.Apply(cfg.look.night, cfg.look.realistic, cfg);

            if (playing)
            {
                var live = new GameObject("Live");
                live.transform.SetParent(root, false);
                live.AddComponent<MusicPlayer>();
                var relay = live.AddComponent<RelayClient>();
                relay.race = race;
                var flags = live.AddComponent<RuntimeFlags>();
                flags.cfg = cfg;
            }
        }

        /// back to the rider pick (C on the finish screen)
        public void ChooseAgain()
        {
            if (cfg == null) return;
            PlayerClass = null;
            Rebuild(cfg, true);
        }

        /// a high three-quarter view of the whole circuit
        public static void Overview(Camera cam, TrackPath path)
        {
            Vector3 mid = Vector3.zero; float rad = 0;
            foreach (var p in path.points) mid += p;
            mid /= path.points.Length;
            foreach (var p in path.points) rad = Mathf.Max(rad, Vector3.Distance(new Vector3(p.x, mid.y, p.z), mid));
            cam.transform.position = mid + new Vector3(0, rad * 0.9f, -rad * 1.25f);
            cam.transform.LookAt(mid);
        }
    }
}
