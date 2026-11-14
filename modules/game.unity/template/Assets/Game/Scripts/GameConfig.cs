// Everything the agents decide, as one JSON file (Assets/Game/Resources/game.json).
// The editor bridge edits one section per child cell; GameBoot builds the whole scene from it, in the editor
// (for screenshots) and in the player. Live flags (night, realistic, music, relay) also live in
// StreamingAssets/harness.json so a finished build changes without being rebuilt.

using System;
using UnityEngine;

namespace HarnessGame
{
    [Serializable]
    public class KartSpec
    {
        public int count = 6;
        public float topSpeed = 26f;      // m/s
        public float accel = 9f;
        public float grip = 6f;           // how fast lateral drift settles
        public float steer = 9f;          // m/s of sideways speed at full lock
        public string[] colors = { "#e8463c", "#3c8ee8", "#f2c230", "#3cc47a", "#b25ce8", "#f08a3c", "#e8e8e8", "#3cd6d6" };
        public string[] names = { "Blaze", "Volt", "Sunny", "Moss", "Grape", "Ember", "Ghost", "Teal" };
    }

    [Serializable]
    public class RiderSpec
    {
        public string weapon = "club";    // club | glove | noodle
        public float height = 1.0f;       // scale
        public string skin = "#f1c27d";
        public string outfit = "";        // empty = kart colour
        public ClassSpec[] classes = ClassSpec.Defaults();   // handed out round the grid
        public string player = "sniper";  // the class the player drives
    }

    /// a rider class and its attack: volt (electric dash), sniper (aimed shot), shrink (small and fast, fragile),
    /// thrower (throws an item forward on its own)
    [Serializable]
    public class ClassSpec
    {
        public string kind = "thrower";
        public string name = "";
        public float cooldown = 3f;       // seconds between attacks
        public string color = "";         // gear colour; empty = the class default

        public static ClassSpec[] Defaults() => new[]
        {
            new ClassSpec { kind = "volt", name = "Volt", cooldown = 4f, color = "#3cd6ff" },
            new ClassSpec { kind = "sniper", name = "Sniper", cooldown = 10f, color = "#ff3c5a" },
            new ClassSpec { kind = "shrink", name = "Shrink", cooldown = 9f, color = "#c45cff" },
            new ClassSpec { kind = "thrower", name = "Thrower", cooldown = 3f, color = "#ffb23c" },
        };
    }

    /// a generated model that replaces a primitive part: slot is kart, rider.<kind>, landmark.<n> or trophy;
    /// path is Resources-relative (Models/<slot>/model), yaw turns it to face +Z, size is its longest side in metres
    [Serializable]
    public class ModelSpec
    {
        public string slot = "";
        public string path = "";
        public string texture = "";
        public float yaw = 0f;
        public float size = 0f;
    }

    [Serializable]
    public class CombatSpec
    {
        public float range = 4.5f;        // metres
        public float cooldown = 1.6f;     // seconds
        public float knock = 7f;          // sideways m/s added to the victim
        public float slow = 0.45f;        // victim keeps this share of its speed
        public float aiAggression = 0.6f; // chance an AI swings when someone is in range
        public string hitColor = "#ffd23c";
    }

    [Serializable]
    public class HudSpec
    {
        public string title = "Brawl Karts";
        public string accent = "#ffd23c";
        public bool minimap = true;
    }

    [Serializable]
    public class LookSpec
    {
        public bool night = false;
        public bool realistic = false;
        public string sky = "#7fb4e6";
        public string ground = "#5f9e4a";
    }

    [Serializable]
    public class LiveFlags
    {
        public bool night = false;
        public bool realistic = false;
        public bool music = false;
        public string musicFile = "";     // StreamingAssets-relative
        public bool relay = false;
        public string relayUrl = "";      // ws://host:port/relay/<room>
        public int version = 0;
    }

    [Serializable]
    public class GameConfig
    {
        public string title = "Brawl Karts";
        public int laps = 2;
        public bool autopilot = false;    // the player's kart drives itself (captures, attract mode)
        public TrackSpec track = new TrackSpec();
        public KartSpec karts = new KartSpec();
        public RiderSpec riders = new RiderSpec();
        public CombatSpec combat = new CombatSpec();
        public HudSpec hud = new HudSpec();
        public LookSpec look = new LookSpec();
        public string[] banners = new string[0];   // Resources-relative textures shown on track-side boards
        public ModelSpec[] models = new ModelSpec[0];
        public bool built_track, built_karts, built_riders, built_combat, built_hud;

        public static GameConfig Load()
        {
            var ta = Resources.Load<TextAsset>("game");
            if (ta == null) return new GameConfig();
            try { return JsonUtility.FromJson<GameConfig>(ta.text) ?? new GameConfig(); }
            catch (Exception e) { Debug.LogWarning("game.json: " + e.Message); return new GameConfig(); }
        }

        public ModelSpec Model(string slot)
        {
            if (models != null) foreach (var m in models) if (m != null && m.slot == slot && !string.IsNullOrEmpty(m.path)) return m;
            return null;
        }

        public ClassSpec Class(string kind)
        {
            var cs = riders.classes != null && riders.classes.Length > 0 ? riders.classes : ClassSpec.Defaults();
            foreach (var c in cs) if (c.kind == kind) return c;
            foreach (var c in ClassSpec.Defaults()) if (c.kind == kind) return c;
            return cs[0];
        }

        /// the class of kart i: the player gets riders.player, the rest go round the class list
        public ClassSpec ClassFor(int i, bool isPlayer, string picked = null)
        {
            if (isPlayer && !string.IsNullOrEmpty(picked)) return Class(picked);
            if (isPlayer && !string.IsNullOrEmpty(riders.player)) return Class(riders.player);
            var cs = riders.classes != null && riders.classes.Length > 0 ? riders.classes : ClassSpec.Defaults();
            return cs[i % cs.Length];
        }

        public static Color Hex(string s, Color fallback)
        {
            return !string.IsNullOrEmpty(s) && ColorUtility.TryParseHtmlString(s, out var c) ? c : fallback;
        }
    }
}
