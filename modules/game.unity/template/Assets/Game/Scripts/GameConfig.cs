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
        public bool built_track, built_karts, built_riders, built_combat, built_hud;

        public static GameConfig Load()
        {
            var ta = Resources.Load<TextAsset>("game");
            if (ta == null) return new GameConfig();
            try { return JsonUtility.FromJson<GameConfig>(ta.text) ?? new GameConfig(); }
            catch (Exception e) { Debug.LogWarning("game.json: " + e.Message); return new GameConfig(); }
        }

        public static Color Hex(string s, Color fallback)
        {
            return !string.IsNullOrEmpty(s) && ColorUtility.TryParseHtmlString(s, out var c) ? c : fallback;
        }
    }
}
