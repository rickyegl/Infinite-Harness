// Heads-up display on a camera-space canvas (so it also shows in rendered screenshots and captures):
// title, place, lap, speed, countdown, hit feed, finish banner and a minimap of the track with kart dots.

using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

namespace HarnessGame
{
    public class Hud : MonoBehaviour
    {
        public RaceManager race;
        Text title, place, lap, speed, big, feed, help;
        RectTransform map;
        readonly List<RectTransform> dots = new List<RectTransform>();
        Vector2 mapMin, mapMax;
        Font font;

        public static Hud Build(Transform parent, Camera cam, RaceManager race, GameConfig cfg)
        {
            var go = new GameObject("HUD");
            go.transform.SetParent(parent, false);
            var canvas = go.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceCamera;
            canvas.worldCamera = cam;
            canvas.planeDistance = 1f;
            var scaler = go.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1280, 720);
            scaler.matchWidthOrHeight = 0.5f;
            var h = go.AddComponent<Hud>();
            h.race = race;
            h.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            var accent = GameConfig.Hex(cfg.hud.accent, new Color(1f, 0.82f, 0.24f));

            h.title = h.Label(go.transform, cfg.hud.title.ToUpperInvariant(), 26, TextAnchor.UpperLeft, new Vector2(0, 1), new Vector2(24, -18), accent);
            h.place = h.Label(go.transform, "1/6", 64, TextAnchor.UpperLeft, new Vector2(0, 1), new Vector2(24, -50), Color.white);
            h.lap = h.Label(go.transform, "LAP 1/2", 28, TextAnchor.UpperRight, new Vector2(1, 1), new Vector2(-24, -18), Color.white);
            h.speed = h.Label(go.transform, "0 km/h", 30, TextAnchor.LowerRight, new Vector2(1, 0), new Vector2(-24, 20), Color.white);
            h.big = h.Label(go.transform, "", 120, TextAnchor.MiddleCenter, new Vector2(0.5f, 0.5f), new Vector2(0, 60), accent);
            h.feed = h.Label(go.transform, "", 26, TextAnchor.LowerLeft, new Vector2(0, 0), new Vector2(24, 20), new Color(1f, 0.9f, 0.7f));
            h.help = h.Label(go.transform, "W/S drive  A/D steer  SPACE swing", 18, TextAnchor.LowerCenter, new Vector2(0.5f, 0), new Vector2(0, 12), new Color(1, 1, 1, 0.7f));

            if (cfg.hud.minimap && race.path) h.BuildMap(go.transform, race.path, accent);
            return h;
        }

        Text Label(Transform parent, string s, int size, TextAnchor anchor, Vector2 pivot, Vector2 pos, Color c)
        {
            var g = new GameObject("Text");
            g.transform.SetParent(parent, false);
            var t = g.AddComponent<Text>();
            t.font = font; t.fontSize = size; t.alignment = anchor; t.color = c; t.text = s;
            t.fontStyle = FontStyle.Bold;
            t.horizontalOverflow = HorizontalWrapMode.Overflow; t.verticalOverflow = VerticalWrapMode.Overflow;
            var sh = g.AddComponent<Shadow>(); sh.effectDistance = new Vector2(2, -2); sh.effectColor = new Color(0, 0, 0, 0.6f);
            var r = t.rectTransform;
            r.anchorMin = r.anchorMax = r.pivot = pivot;
            r.sizeDelta = new Vector2(900, size * 1.4f);
            r.anchoredPosition = pos;
            return t;
        }

        void BuildMap(Transform parent, TrackPath path, Color accent)
        {
            var g = new GameObject("Minimap");
            g.transform.SetParent(parent, false);
            map = g.AddComponent<RectTransform>();
            map.anchorMin = map.anchorMax = map.pivot = new Vector2(1, 1);
            map.anchoredPosition = new Vector2(-24, -64);
            map.sizeDelta = new Vector2(200, 150);
            var bg = g.AddComponent<Image>(); bg.color = new Color(0, 0, 0, 0.35f);
            mapMin = new Vector2(float.MaxValue, float.MaxValue); mapMax = -mapMin;
            foreach (var p in path.points) { mapMin = Vector2.Min(mapMin, new Vector2(p.x, p.z)); mapMax = Vector2.Max(mapMax, new Vector2(p.x, p.z)); }
            for (int i = 0, step = Mathf.Max(3, path.points.Length / 90); i < path.points.Length; i += step) Dot(MapPos(path.points[i]), 4, new Color(1, 1, 1, 0.7f));
        }

        Vector2 MapPos(Vector3 w)
        {
            var size = map.sizeDelta - new Vector2(20, 20);
            float sx = size.x / Mathf.Max(1, mapMax.x - mapMin.x), sy = size.y / Mathf.Max(1, mapMax.y - mapMin.y);
            float s = Mathf.Min(sx, sy);
            var c = (mapMin + mapMax) * 0.5f;
            return new Vector2((w.x - c.x) * s, (w.z - c.y) * s);
        }

        RectTransform Dot(Vector2 at, float size, Color c)
        {
            var g = new GameObject("Dot");
            g.transform.SetParent(map, false);
            var r = g.AddComponent<RectTransform>();
            r.anchorMin = r.anchorMax = new Vector2(0.5f, 0.5f);
            r.sizeDelta = new Vector2(size, size);
            r.anchoredPosition = at;
            g.AddComponent<Image>().color = c;
            return r;
        }

        void LateUpdate() => Refresh();

        public void Refresh()
        {
            if (!race || race.karts.Count == 0) return;
            var p = race.player ? race.player : race.karts[0];
            var cfg = race.cfg;
            place.text = $"{p.place}<size=28>/{race.karts.Count}</size>";
            place.supportRichText = true;
            int lapN = Mathf.Clamp(p.Lap(race.path.Length) + 1, 1, cfg.laps);
            lap.text = $"LAP {lapN}/{cfg.laps}   {race.clock:0.0}s";
            speed.text = $"{Mathf.RoundToInt(p.speed * 3.6f)} km/h";
            switch (race.phase)
            {
                case RaceManager.Phase.Countdown: big.text = race.countdown > 0 ? Mathf.CeilToInt(race.countdown).ToString() : "GO!"; break;
                case RaceManager.Phase.Racing: big.text = race.clock < 1f ? "GO!" : ""; break;
                case RaceManager.Phase.Finished: big.text = $"FINISH!\n<size=48>{Ordinal(p.place)} place</size>"; big.supportRichText = true; break;
                default: big.text = ""; break;
            }
            feed.text = string.Join("\n", race.feed);
            if (map)
            {
                while (dots.Count < race.karts.Count) dots.Add(Dot(Vector2.zero, 10, Color.white));
                for (int i = 0; i < race.karts.Count; i++)
                {
                    var k = race.karts[i];
                    dots[i].anchoredPosition = MapPos(k.transform.position);
                    dots[i].GetComponent<Image>().color = k.color;
                    dots[i].sizeDelta = Vector2.one * (k == p ? 14 : 9);
                }
            }
        }

        static string Ordinal(int n) => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : (n % 10) switch { 1 => "st", 2 => "nd", 3 => "rd", _ => "th" });
    }
}
