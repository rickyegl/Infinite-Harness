// The rider pick before a race: four cards, one per class, over the grid. Pick with 1-4, with Left/Right and
// Enter/Space, or with a mouse click. GameBoot rebuilds the race with the picked class as the player's rider.
// On autopilot (captures, the race test) the pick is skipped and the default class starts the countdown.

using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

namespace HarnessGame
{
    public class ClassSelect : MonoBehaviour
    {
        const float CardW = 252, CardH = 300, Gap = 26;

        RaceManager race;
        ClassSpec[] classes;
        Action<string> onPick;
        Camera cam;
        Font font;
        int sel;
        readonly List<RectTransform> cards = new List<RectTransform>();
        readonly List<Image> frames = new List<Image>();

        public static string Describe(ClassSpec c) => c.kind switch
        {
            "volt" => "SPACE: an electric dash. Every kart you run into is zapped.",
            "sniper" => "Aim with the mouse, CLICK to fire. The shot hits the kart under the crosshair.",
            "shrink" => "SPACE: small and fast for a few seconds. Get touched and you are squashed.",
            _ => "Throws an item forward on its own. It hits the first kart in your lane.",
        };

        public static ClassSelect Build(Transform parent, Camera cam, RaceManager race, GameConfig cfg, string current, Action<string> onPick)
        {
            var go = new GameObject("Class Select");
            go.transform.SetParent(parent, false);
            var canvas = go.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceCamera;
            canvas.worldCamera = cam;
            canvas.planeDistance = 0.8f;   // in front of the HUD
            var scaler = go.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1280, 720);
            scaler.matchWidthOrHeight = 0.5f;

            var s = go.AddComponent<ClassSelect>();
            s.race = race; s.cam = cam; s.onPick = onPick;
            s.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            var kinds = new List<ClassSpec>();
            foreach (var k in Abilities.Kinds) kinds.Add(cfg.Class(k));
            s.classes = kinds.ToArray();
            s.sel = Mathf.Max(0, Array.FindIndex(s.classes, c => c.kind == current));

            var dim = s.Box(go.transform, "Dim", new Color(0.02f, 0.03f, 0.06f, 0.62f));
            dim.anchorMin = Vector2.zero; dim.anchorMax = Vector2.one; dim.sizeDelta = Vector2.zero;

            var accent = GameConfig.Hex(cfg.hud.accent, new Color(1f, 0.82f, 0.24f));
            s.Text(go.transform, cfg.hud.title.ToUpperInvariant(), 26, accent, new Vector2(0, 268), TextAnchor.MiddleCenter);
            s.Text(go.transform, "CHOOSE YOUR RIDER", 54, Color.white, new Vector2(0, 222), TextAnchor.MiddleCenter);

            float total = s.classes.Length * CardW + (s.classes.Length - 1) * Gap;
            for (int i = 0; i < s.classes.Length; i++)
            {
                var c = s.classes[i];
                var col = GameConfig.Hex(c.color, Abilities.DefaultColor(c.kind));
                var frame = s.Box(go.transform, "Card " + c.kind, col);
                frame.sizeDelta = new Vector2(CardW, CardH);
                frame.anchoredPosition = new Vector2(-total / 2 + CardW / 2 + i * (CardW + Gap), -10);
                var body = s.Box(frame, "Body", new Color(0.07f, 0.08f, 0.12f, 1f));
                body.sizeDelta = new Vector2(CardW - 8, CardH - 8);
                var band = s.Box(frame, "Band", col);
                band.sizeDelta = new Vector2(CardW - 8, 64);
                band.anchoredPosition = new Vector2(0, CardH / 2 - 4 - 32);
                s.Text(frame, $"{i + 1}", 22, new Color(0, 0, 0, 0.55f), new Vector2(-CardW / 2 + 22, CardH / 2 - 22), TextAnchor.MiddleCenter);
                s.Text(frame, (string.IsNullOrEmpty(c.name) ? c.kind : c.name).ToUpperInvariant(), 38, Color.white, new Vector2(0, CardH / 2 - 36), TextAnchor.MiddleCenter);
                var d = s.Text(frame, Describe(c), 20, new Color(0.92f, 0.94f, 1f), new Vector2(0, 8), TextAnchor.UpperCenter);
                d.horizontalOverflow = HorizontalWrapMode.Wrap;
                d.rectTransform.sizeDelta = new Vector2(CardW - 36, 150);
                d.rectTransform.anchoredPosition = new Vector2(0, -6);
                d.fontStyle = FontStyle.Normal;
                string every = c.kind == "thrower" ? $"an item every {c.cooldown:0.#} s" : $"ready every {c.cooldown:0.#} s";
                s.Text(frame, every, 20, col, new Vector2(0, -CardH / 2 + 46), TextAnchor.MiddleCenter);
                s.cards.Add(frame);
                s.frames.Add(frame.GetComponent<Image>());
            }
            s.Text(go.transform, "1-4 or LEFT/RIGHT to choose     ENTER to race     or click a rider", 20, new Color(1, 1, 1, 0.75f), new Vector2(0, -232), TextAnchor.MiddleCenter);
            s.Show();
            return s;
        }

        RectTransform Box(Transform parent, string name, Color c)
        {
            var g = new GameObject(name);
            g.transform.SetParent(parent, false);
            var img = g.AddComponent<Image>();
            img.color = c;
            img.raycastTarget = false;
            return img.rectTransform;
        }

        Text Text(Transform parent, string s, int size, Color c, Vector2 pos, TextAnchor anchor)
        {
            var g = new GameObject("Text");
            g.transform.SetParent(parent, false);
            var t = g.AddComponent<Text>();
            t.font = font; t.fontSize = size; t.alignment = anchor; t.color = c; t.text = s;
            t.fontStyle = FontStyle.Bold; t.raycastTarget = false;
            t.horizontalOverflow = HorizontalWrapMode.Overflow; t.verticalOverflow = VerticalWrapMode.Overflow;
            var sh = g.AddComponent<Shadow>(); sh.effectDistance = new Vector2(2, -2); sh.effectColor = new Color(0, 0, 0, 0.6f);
            var r = t.rectTransform;
            r.sizeDelta = new Vector2(900, size * 1.4f);
            r.anchoredPosition = pos;
            return t;
        }

        /// the selected card stands out: bigger, full colour frame; the others are dimmed
        void Show()
        {
            for (int i = 0; i < cards.Count; i++)
            {
                bool on = i == sel;
                cards[i].localScale = Vector3.one * (on ? 1.07f : 0.95f);
                var col = GameConfig.Hex(classes[i].color, Abilities.DefaultColor(classes[i].kind));
                frames[i].color = on ? col : new Color(col.r, col.g, col.b, 0.35f);
            }
        }

        void Update()
        {
            if (!Application.isPlaying) return;
            if (race && race.cfg != null && race.cfg.autopilot) { Pick(); return; }   // captures and the race test
            if (Cursor.visible == false) Cursor.visible = true;
            int was = sel;
            bool go = false;
            Vector2? click = null, hover = null;
#if ENABLE_INPUT_SYSTEM
            var kb = Keyboard.current;
            if (kb != null)
            {
                if (kb.digit1Key.wasPressedThisFrame || kb.numpad1Key.wasPressedThisFrame) { sel = 0; go = true; }
                if (kb.digit2Key.wasPressedThisFrame || kb.numpad2Key.wasPressedThisFrame) { sel = 1; go = true; }
                if (kb.digit3Key.wasPressedThisFrame || kb.numpad3Key.wasPressedThisFrame) { sel = 2; go = true; }
                if (kb.digit4Key.wasPressedThisFrame || kb.numpad4Key.wasPressedThisFrame) { sel = 3; go = true; }
                if (kb.leftArrowKey.wasPressedThisFrame || kb.aKey.wasPressedThisFrame) sel--;
                if (kb.rightArrowKey.wasPressedThisFrame || kb.dKey.wasPressedThisFrame) sel++;
                if (kb.enterKey.wasPressedThisFrame || kb.numpadEnterKey.wasPressedThisFrame || kb.spaceKey.wasPressedThisFrame) go = true;
            }
            var m = Mouse.current;
            if (m != null)
            {
                hover = m.position.ReadValue();
                if (m.leftButton.wasPressedThisFrame) click = hover;
            }
            var pad = Gamepad.current;
            if (pad != null)
            {
                if (pad.dpad.left.wasPressedThisFrame) sel--;
                if (pad.dpad.right.wasPressedThisFrame) sel++;
                if (pad.buttonSouth.wasPressedThisFrame || pad.startButton.wasPressedThisFrame) go = true;
            }
#else
            for (int i = 0; i < 4; i++) if (Input.GetKeyDown(KeyCode.Alpha1 + i)) { sel = i; go = true; }
            if (Input.GetKeyDown(KeyCode.LeftArrow) || Input.GetKeyDown(KeyCode.A)) sel--;
            if (Input.GetKeyDown(KeyCode.RightArrow) || Input.GetKeyDown(KeyCode.D)) sel++;
            if (Input.GetKeyDown(KeyCode.Return) || Input.GetKeyDown(KeyCode.Space)) go = true;
            hover = Input.mousePosition;
            if (Input.GetMouseButtonDown(0)) click = hover;
#endif
            sel = (sel + classes.Length) % classes.Length;
            if (hover.HasValue && hover != lastHover) { int h = Under(hover.Value); if (h >= 0) sel = h; lastHover = hover; }
            if (click.HasValue) { int h = Under(click.Value); if (h >= 0) { sel = h; go = true; } }
            if (sel != was) Show();
            if (go) Pick();
        }

        Vector2? lastHover;

        int Under(Vector2 screen)
        {
            for (int i = 0; i < cards.Count; i++)
                if (RectTransformUtility.RectangleContainsScreenPoint(cards[i], screen, cam)) return i;
            return -1;
        }

        /// pick a class by kind, as a key press or click would (the editor bridge uses it for scripted runs)
        public void Choose(string kind)
        {
            int i = Array.FindIndex(classes, c => c.kind == kind);
            if (i < 0) throw new ArgumentException("no rider class " + kind);
            sel = i;
            Pick();
        }

        void Pick()
        {
            enabled = false;
            gameObject.SetActive(false);
            onPick?.Invoke(classes[sel].kind);
        }
    }
}
