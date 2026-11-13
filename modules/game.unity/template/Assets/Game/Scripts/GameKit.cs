// Shared materials and profiles, saved as assets by the editor bridge ("setup") so the player build keeps
// their shaders. Everything that needs a colour clones one of these.

using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace HarnessGame
{
    public class GameKit : ScriptableObject
    {
        public Material lit, emissive, unlit, particle, ghost, skyDay, skyNight;
        public VolumeProfile baseProfile, realisticProfile, nightProfile, realNightProfile;

        static GameKit cached;
        public static GameKit Load()
        {
            if (cached == null) cached = Resources.Load<GameKit>("GameKit");
            return cached;
        }

        readonly Dictionary<string, Material> cache = new Dictionary<string, Material>();

        public Material Lit(Color c, float smooth = 0.25f, float metal = 0f, Texture tex = null)
        {
            string key = "L" + ColorUtility.ToHtmlStringRGBA(c) + smooth + metal + (tex ? tex.GetInstanceID() : 0);
            if (cache.TryGetValue(key, out var m) && m) return m;
            m = new Material(lit) { name = key };
            m.SetColor("_BaseColor", c);
            m.SetFloat("_Smoothness", smooth);
            m.SetFloat("_Metallic", metal);
            if (tex) m.SetTexture("_BaseMap", tex);
            cache[key] = m;
            return m;
        }

        public Material Glow(Color c, float power = 3f)
        {
            string key = "E" + ColorUtility.ToHtmlStringRGBA(c) + power;
            if (cache.TryGetValue(key, out var m) && m) return m;
            m = new Material(emissive) { name = key };
            m.SetColor("_BaseColor", c);
            m.SetColor("_EmissionColor", c * power);
            cache[key] = m;
            return m;
        }

        public Material Flat(Color c, Texture tex = null)
        {
            string key = "U" + ColorUtility.ToHtmlStringRGBA(c) + (tex ? tex.GetInstanceID() : 0);
            if (cache.TryGetValue(key, out var m) && m) return m;
            m = new Material(unlit) { name = key };
            m.SetColor("_BaseColor", c);
            if (tex) m.SetTexture("_BaseMap", tex);
            cache[key] = m;
            return m;
        }

        public Material Ghost(Color c)
        {
            string key = "G" + ColorUtility.ToHtmlStringRGBA(c);
            if (cache.TryGetValue(key, out var m) && m) return m;
            m = new Material(ghost) { name = key };
            c.a = 0.45f;
            m.SetColor("_BaseColor", c);
            cache[key] = m;
            return m;
        }

        public void ClearCache() => cache.Clear();
    }

    /// small helpers to build things out of primitives without colliders
    public static class Prim
    {
        public static GameObject Make(PrimitiveType t, Transform parent, Vector3 pos, Vector3 scale, Material m, string name = null, Quaternion? rot = null)
        {
            var g = GameObject.CreatePrimitive(t);
            if (name != null) g.name = name;
            var col = g.GetComponent<Collider>();
            if (col) Object.DestroyImmediate(col);
            g.transform.SetParent(parent, false);
            g.transform.localPosition = pos;
            g.transform.localRotation = rot ?? Quaternion.identity;
            g.transform.localScale = scale;
            g.GetComponent<MeshRenderer>().sharedMaterial = m;
            return g;
        }

        public static Transform Node(string name, Transform parent, Vector3 pos = default)
        {
            var t = new GameObject(name).transform;
            t.SetParent(parent, false);
            t.localPosition = pos;
            return t;
        }

        public static Texture2D Stripes(Color a, Color b, int w = 4, int h = 16)
        {
            var t = new Texture2D(w, h, TextureFormat.RGBA32, true) { wrapMode = TextureWrapMode.Repeat, filterMode = FilterMode.Bilinear };
            for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) t.SetPixel(x, y, (y / (h / 2)) % 2 == 0 ? a : b);
            t.Apply();
            return t;
        }

        public static Texture2D Checker(int n = 8)
        {
            var t = new Texture2D(n, n, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Repeat, filterMode = FilterMode.Point };
            for (int y = 0; y < n; y++) for (int x = 0; x < n; x++) t.SetPixel(x, y, (x + y) % 2 == 0 ? Color.white : new Color(0.08f, 0.08f, 0.08f));
            t.Apply();
            return t;
        }

        /// asphalt-like noise, so the road reads as a surface and not a flat colour
        public static Texture2D Noise(Color baseC, float amount, int size, int seed)
        {
            var t = new Texture2D(size, size, TextureFormat.RGBA32, true) { wrapMode = TextureWrapMode.Repeat };
            var rnd = new System.Random(seed);
            for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                {
                    float v = (float)rnd.NextDouble() * 2f - 1f;
                    t.SetPixel(x, y, new Color(baseC.r + v * amount, baseC.g + v * amount, baseC.b + v * amount, 1));
                }
            t.Apply();
            return t;
        }
    }
}
