// Records the game camera to numbered JPGs at a fixed frame rate (Time.captureFramerate), so a 10 s capture
// is smooth however slow the machine renders. The editor bridge turns the frames into an mp4 with ffmpeg.

using System.IO;
using UnityEngine;

namespace HarnessGame
{
    public class Capture : MonoBehaviour
    {
        public string outDir;
        public int fps = 30, width = 1280, height = 720;
        public float seconds = 10f, warmup = 0.5f;
        public bool hud = true;         // false: hide every HUD canvas while recording
        public float startDist = -1f;   // when >= 0, wait until the player's kart is this far along the lap
        public int frame;
        public bool done;
        RenderTexture rt;
        Texture2D tex;
        float t;

        void Start()
        {
            Directory.CreateDirectory(outDir);
            Time.captureFramerate = fps;
            rt = new RenderTexture(width, height, 24, RenderTextureFormat.ARGB32) { antiAliasing = 4 };
            tex = new Texture2D(width, height, TextureFormat.RGB24, false);
        }

        void LateUpdate()
        {
            if (done) return;
            t += Time.deltaTime;
            if (t < warmup) return;
            var race = RaceManager.Main;
            if (startDist >= 0 && race && race.player && race.player.dist < startDist) return;
            var cam = Camera.main;
            if (!cam) return;
            if (!hud)
                foreach (var c in Object.FindObjectsByType<Canvas>(FindObjectsSortMode.None))
                    if (c.enabled) c.enabled = false;
            Shots.Render(cam, rt);
            var prev = RenderTexture.active;
            RenderTexture.active = rt;
            tex.ReadPixels(new Rect(0, 0, width, height), 0, 0);
            tex.Apply(false);
            RenderTexture.active = prev;
            File.WriteAllBytes(Path.Combine(outDir, $"frame_{frame:00000}.jpg"), tex.EncodeToJPG(88));
            frame++;
            if (frame >= Mathf.RoundToInt(seconds * fps))
            {
                done = true;
                Time.captureFramerate = 0;
                File.WriteAllText(Path.Combine(outDir, "done.json"), "{\"frames\":" + frame + ",\"fps\":" + fps + "}");
            }
        }

        void OnDestroy()
        {
            Time.captureFramerate = 0;
            if (rt) rt.Release();
        }
    }

    public static class Shots
    {
        /// render one camera into a texture (works in edit mode and in play mode, with the HUD canvas)
        public static void Render(Camera cam, RenderTexture rt)
        {
            // the HUD canvas lays itself out for the camera's target, so point the camera at the texture first
            var old = cam.targetTexture;
            cam.targetTexture = rt;
            Relayout();
            var req = new UnityEngine.Rendering.RenderPipeline.StandardRequest { destination = rt };
            if (UnityEngine.Rendering.RenderPipeline.SupportsRenderRequest(cam, req))
                UnityEngine.Rendering.RenderPipeline.SubmitRenderRequest(cam, req);
            else
                cam.Render();
            cam.targetTexture = old;
            Relayout();
        }

        static void Relayout()
        {
            foreach (var s in Object.FindObjectsByType<UnityEngine.UI.CanvasScaler>(FindObjectsSortMode.None))
                if (s.enabled) { s.enabled = false; s.enabled = true; }
            Canvas.ForceUpdateCanvases();
        }

        public static void Save(Camera cam, string file, int w = 1280, int h = 720)
        {
            var rt = new RenderTexture(w, h, 24, RenderTextureFormat.ARGB32) { antiAliasing = 4 };
            rt.Create();
            Render(cam, rt);
            var tex = new Texture2D(w, h, TextureFormat.RGB24, false);
            var prev = RenderTexture.active;
            RenderTexture.active = rt;
            tex.ReadPixels(new Rect(0, 0, w, h), 0, 0);
            tex.Apply(false);
            RenderTexture.active = prev;
            Directory.CreateDirectory(Path.GetDirectoryName(file));
            File.WriteAllBytes(file, file.EndsWith(".png") ? tex.EncodeToPNG() : tex.EncodeToJPG(90));
            rt.Release();
            Object.DestroyImmediate(rt);
            Object.DestroyImmediate(tex);
        }
    }
}
