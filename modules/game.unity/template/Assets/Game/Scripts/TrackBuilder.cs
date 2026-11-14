// Builds the circuit from a TrackSpec: road slab (top, underside, striped kerbs, low walls) that follows the
// track's own up through loops, twists and banks; glowing hover sections with boost chevrons; pillars under
// raised road; grass, start line and gantry, lamps (lit at night), trees and track-side boards, then the scenery
// (Scenery.cs: mountains, rocks, flags, a grandstand, balloons, islands, clouds, a blimp, arches).
// All meshes are made in code so the same builder runs in the editor (for screenshots) and in the player.

using System.Collections.Generic;
using UnityEngine;

namespace HarnessGame
{
    public static class TrackBuilder
    {
        public static TrackPath Build(GameConfig cfg, GameKit kit, Transform root)
        {
            var spec = cfg.track;
            var go = new GameObject("Track");
            go.transform.SetParent(root, false);
            var path = go.AddComponent<TrackPath>();
            path.width = spec.width;
            path.Set(TrackMath.Generate(spec));

            float hw = spec.width * 0.5f;
            var look = cfg.look;
            var asphalt = Prim.Noise(new Color(0.23f, 0.23f, 0.25f), 0.05f, 64, spec.seed);
            Ribbon(path, go.transform, "Road", -hw, hw, 0.02f, kit.Lit(Color.white, 0.35f, 0, asphalt), spec.width);
            // the road is a slab: a dark underside, so loops and twists read from outside and below
            Ribbon(path, go.transform, "Underside", hw + 2.6f, -hw - 2.6f, -0.45f, kit.Lit(new Color(0.16f, 0.17f, 0.2f), 0.3f, 0.4f), spec.width);
            var kerbTex = Prim.Stripes(new Color(0.85f, 0.12f, 0.1f), Color.white);
            Ribbon(path, go.transform, "KerbL", -hw - 1.2f, -hw, 0.05f, kit.Lit(Color.white, 0.2f, 0, kerbTex), 2.4f);
            Ribbon(path, go.transform, "KerbR", hw, hw + 1.2f, 0.05f, kit.Lit(Color.white, 0.2f, 0, kerbTex), 2.4f);
            var wallM = kit.Lit(new Color(0.85f, 0.86f, 0.9f), 0.1f);
            Wall(path, go.transform, "WallL", -hw - 2.4f, wallM);
            Wall(path, go.transform, "WallR", hw + 2.4f, wallM);

            // ground: a big disc under the circuit, a little below the lowest road point
            float minY = float.MaxValue; Vector3 mid = Vector3.zero; float rad = 0;
            foreach (var p in path.points) { minY = Mathf.Min(minY, p.y); mid += p; }
            mid /= path.points.Length;
            foreach (var p in path.points) rad = Mathf.Max(rad, new Vector2(p.x - mid.x, p.z - mid.z).magnitude);
            float groundY = minY - 0.6f + 0.5f;   // top of the disc
            var grass = Prim.Noise(GameConfig.Hex(look.ground, new Color(0.37f, 0.62f, 0.29f)), 0.04f, 64, spec.seed + 1);
            var ground = Prim.Make(PrimitiveType.Cylinder, go.transform, new Vector3(mid.x, minY - 0.6f, mid.z), new Vector3(rad * 2.6f, 0.5f, rad * 2.6f), kit.Lit(Color.white, 0.05f, 0, grass), "Ground");
            ground.GetComponent<MeshRenderer>().sharedMaterial.SetTextureScale("_BaseMap", new Vector2(40, 40));

            if (spec.hover) HoverSections(path, go.transform, kit, hw);
            Struts(path, go.transform, kit, groundY);
            StartLine(path, go.transform, kit, cfg);
            Lamps(path, go.transform, kit, hw + 4f);
            Decor(path, go.transform, kit, spec, groundY);
            Boards(path, go.transform, kit, cfg, hw + 6f);
            Landmarks(path, go.transform, kit, cfg, groundY);
            Trophy(path, go.transform, kit, cfg);
            // scenery last, round the landmarks and the trophy
            var taken = new List<Vector4>();
            foreach (var n in new[] { "Landmarks", "Trophy" })
            {
                var t = go.transform.Find(n);
                if (!t) continue;
                if (n == "Trophy") taken.Add(new Vector4(t.position.x, t.position.y, t.position.z, 6f));
                else foreach (Transform c in t) taken.Add(new Vector4(c.position.x, c.position.y, c.position.z, 18f));
            }
            Scenery.Build(path, go.transform, kit, cfg, groundY, mid, rad, taken);
            return path;
        }

        /// a strip between two lateral offsets, following the centre line (a > b flips it to face down);
        /// keep(i) leaves out the quad after sample i when false
        static void Ribbon(TrackPath path, Transform parent, string name, float a, float b, float lift, Material m, float uvWidth, System.Func<int, bool> keep = null)
        {
            int n = path.points.Length;
            var v = new List<Vector3>(); var uv = new List<Vector2>(); var tri = new List<int>();
            for (int i = 0; i <= n; i++)
            {
                float d = path.DistOfIndex(i);
                path.Sample(d, out var c, out _, out var r, out var up);
                v.Add(c + r * a + up * lift);
                v.Add(c + r * b + up * lift);
                float vv = d / uvWidth;
                uv.Add(new Vector2(0, vv)); uv.Add(new Vector2(1, vv));
                if (i < n && (keep == null || keep(i))) { int k = i * 2; tri.AddRange(new[] { k, k + 2, k + 1, k + 1, k + 2, k + 3 }); }
            }
            if (tri.Count > 0) MeshObject(parent, name, v, uv, tri, m);
        }

        static void Wall(TrackPath path, Transform parent, string name, float off, Material m)
        {
            int n = path.points.Length;
            var v = new List<Vector3>(); var uv = new List<Vector2>(); var tri = new List<int>();
            float h = 0.9f, t = 0.35f;
            for (int i = 0; i <= n; i++)
            {
                float d = path.DistOfIndex(i);
                path.Sample(d, out var c, out _, out var r, out var up);
                Vector3 inner = c + r * (off - Mathf.Sign(off) * t * 0.5f), outer = c + r * (off + Mathf.Sign(off) * t * 0.5f);
                v.Add(inner); v.Add(inner + up * h); v.Add(outer + up * h); v.Add(outer + up * -0.45f);
                for (int q = 0; q < 4; q++) uv.Add(new Vector2(q / 3f, d / 4f));
                if (i < n)
                {
                    int k = i * 4;
                    for (int s = 0; s < 3; s++)
                    {
                        int a0 = k + s, a1 = k + s + 1, b0 = a0 + 4, b1 = a1 + 4;
                        if (off < 0) tri.AddRange(new[] { a0, b0, a1, a1, b0, b1 });
                        else tri.AddRange(new[] { a0, a1, b0, a1, b1, b0 });
                    }
                }
            }
            MeshObject(parent, name, v, uv, tri, m);
        }

        static void MeshObject(Transform parent, string name, List<Vector3> v, List<Vector2> uv, List<int> tri, Material m)
        {
            var mesh = new Mesh { name = name, indexFormat = UnityEngine.Rendering.IndexFormat.UInt32 };
            mesh.SetVertices(v); mesh.SetUVs(0, uv); mesh.SetTriangles(tri, 0);
            mesh.RecalculateNormals(); mesh.RecalculateBounds();
            var g = new GameObject(name);
            g.transform.SetParent(parent, false);
            g.AddComponent<MeshFilter>().sharedMesh = mesh;
            g.AddComponent<MeshRenderer>().sharedMaterial = m;
        }

        /// glowing kerbs and a dashed centre line where karts hover, and boost chevrons just before each one
        static void HoverSections(TrackPath path, Transform parent, GameKit kit, float hw)
        {
            var h = path.hover;
            if (h == null || h.Length != path.points.Length) return;
            var root = Prim.Node("Hover", parent);
            var cyan = kit.Glow(new Color(0f, 0.8f, 1f), 1.6f);
            var magenta = kit.Glow(new Color(1f, 0.1f, 0.75f), 1.5f);
            System.Func<int, bool> on = i => h[i] > 0.5f;
            Ribbon(path, root, "GlowL", -hw - 1.1f, -hw - 0.2f, 0.08f, cyan, 2f, on);
            Ribbon(path, root, "GlowR", hw + 0.2f, hw + 1.1f, 0.08f, cyan, 2f, on);
            Ribbon(path, root, "GlowCentre", -0.25f, 0.25f, 0.04f, magenta, 2f, i => h[i] > 0.5f && (i / 4) % 2 == 0);
            int n = h.Length, placed = 0;
            for (int i = 0; i < n && placed < 12; i++)
            {
                if (!(h[i] > 0.5f && h[(i + n - 1) % n] <= 0.5f)) continue;
                float d0 = path.DistOfIndex(i);
                for (int c = 0; c < 3; c++)
                {
                    var pose = path.PoseAt(d0 - 6f - c * 5f, 0);
                    var t = Prim.Node("Chevron" + placed + "_" + c, root);
                    t.SetPositionAndRotation(pose.position, pose.rotation);
                    Prim.Make(PrimitiveType.Cube, t, new Vector3(-1.4f, 0.06f, 0), new Vector3(3.6f, 0.06f, 0.7f), cyan, "A", Quaternion.Euler(0, -35f, 0));
                    Prim.Make(PrimitiveType.Cube, t, new Vector3(1.4f, 0.06f, 0), new Vector3(3.6f, 0.06f, 0.7f), cyan, "B", Quaternion.Euler(0, 35f, 0));
                }
                placed++;
            }
        }

        /// pillars under raised road (the big drop), with a cross beam under the slab
        static void Struts(TrackPath path, Transform parent, GameKit kit, float groundY)
        {
            var root = Prim.Node("Struts", parent);
            var steel = kit.Lit(new Color(0.55f, 0.57f, 0.62f), 0.5f, 0.7f);
            float L = path.Length;
            for (float d = 0; d < L; d += 11f)
            {
                path.Sample(d, out var c, out var tan, out var r, out var up);
                if (up.y < 0.45f) continue;                       // loops and twists hold themselves up
                var under = c - up * 0.5f;
                if (under.y - groundY < 2.2f) continue;
                foreach (float side in new[] { -1f, 1f })
                {
                    var foot = under + r * (side * (path.HalfWidth - 1f));
                    float hh = foot.y - groundY;
                    if (hh < 0.8f) continue;                       // the low side of a banked corner
                    Prim.Make(PrimitiveType.Cylinder, root, new Vector3(foot.x, groundY + hh * 0.5f, foot.z), new Vector3(0.7f, hh * 0.5f, 0.7f), steel, "Pillar");
                }
                Prim.Make(PrimitiveType.Cube, root, under, new Vector3(path.width + 1f, 0.5f, 0.8f), steel, "Beam", Quaternion.LookRotation(tan, up));
            }
        }

        static void StartLine(TrackPath path, Transform parent, GameKit kit, GameConfig cfg)
        {
            var pose = path.PoseAt(0, 0);
            var t = Prim.Node("StartLine", parent);
            t.SetPositionAndRotation(pose.position, pose.rotation);
            float w = path.width;
            var chk = kit.Lit(Color.white, 0.2f, 0, Prim.Checker());
            chk.SetTextureScale("_BaseMap", new Vector2(w / 1.5f, 1));
            Prim.Make(PrimitiveType.Cube, t, new Vector3(0, 0.03f, 0), new Vector3(w, 0.02f, 1.6f), chk, "Checker");
            var post = kit.Lit(new Color(0.15f, 0.15f, 0.18f), 0.5f, 0.6f);
            Prim.Make(PrimitiveType.Cube, t, new Vector3(-w * 0.5f - 2.6f, 3.5f, 0), new Vector3(0.6f, 7f, 0.6f), post, "PostL");
            Prim.Make(PrimitiveType.Cube, t, new Vector3(w * 0.5f + 2.6f, 3.5f, 0), new Vector3(0.6f, 7f, 0.6f), post, "PostR");
            Prim.Make(PrimitiveType.Cube, t, new Vector3(0, 7.2f, 0), new Vector3(w + 6f, 1.6f, 0.5f), kit.Lit(GameConfig.Hex(cfg.hud.accent, Color.yellow), 0.3f), "Banner");
            for (int i = 0; i < 5; i++)
                Prim.Make(PrimitiveType.Sphere, t, new Vector3(-2f + i, 6.1f, -0.3f), Vector3.one * 0.45f, kit.Glow(new Color(1f, 0.15f, 0.1f), 2f), "StartLight" + i);
        }

        /// is this stretch plain, level road where upright things (lamps, boards) can stand beside it?
        internal static bool Plain(TrackPath path, float d)
        {
            if (path.InFeature(d, 25f)) return false;
            for (float k = -8f; k <= 8f; k += 4f)
            {
                path.Sample(d + k, out _, out _, out _, out var up);
                if (up.y < 0.97f) return false;
            }
            return true;
        }

        internal static Quaternion Upright(Quaternion q)
        {
            var f = q * Vector3.forward; f.y = 0;
            return f.sqrMagnitude > 1e-6f ? Quaternion.LookRotation(f.normalized, Vector3.up) : Quaternion.identity;
        }

        static void Lamps(TrackPath path, Transform parent, GameKit kit, float off)
        {
            var root = Prim.Node("Lamps", parent);
            var pole = kit.Lit(new Color(0.3f, 0.3f, 0.33f), 0.4f, 0.5f);
            var head = kit.Glow(new Color(1f, 0.85f, 0.6f), 4f);
            float L = path.Length;
            int count = Mathf.Clamp(Mathf.RoundToInt(L / 45f), 6, 40);
            for (int i = 0; i < count; i++)
            {
                float d = L * (i + 0.5f) / count;
                if (!Plain(path, d)) continue;
                float side = i % 2 == 0 ? 1 : -1;
                var pose = path.PoseAt(d, side * off);
                var t = Prim.Node("Lamp" + i, root);
                t.SetPositionAndRotation(pose.position, Upright(pose.rotation));
                Prim.Make(PrimitiveType.Cylinder, t, new Vector3(0, 3f, 0), new Vector3(0.18f, 3f, 0.18f), pole);
                Prim.Make(PrimitiveType.Cube, t, new Vector3(-side * 1.1f, 6f, 0), new Vector3(2.4f, 0.15f, 0.15f), pole);
                var h = Prim.Make(PrimitiveType.Sphere, t, new Vector3(-side * 2.1f, 5.85f, 0), new Vector3(0.7f, 0.35f, 0.7f), head, "Head");
                var l = new GameObject("Light").AddComponent<Light>();
                l.transform.SetParent(h.transform, false);
                l.transform.localPosition = new Vector3(0, -0.6f, 0);
                l.type = LightType.Point; l.range = 22f; l.intensity = 6f; l.color = new Color(1f, 0.82f, 0.55f);
                l.shadows = LightShadows.None;
                l.enabled = false;
                l.gameObject.AddComponent<NightOnly>();
                h.AddComponent<NightOnly>().glow = true;
            }
        }

        static void Decor(TrackPath path, Transform parent, GameKit kit, TrackSpec spec, float groundY)
        {
            var root = Prim.Node("Decor", parent);
            var rnd = new System.Random(spec.seed * 31 + 7);
            var trunk = kit.Lit(new Color(0.42f, 0.29f, 0.18f), 0.1f);
            var leaves = new[] { kit.Lit(new Color(0.2f, 0.5f, 0.22f), 0.1f), kit.Lit(new Color(0.27f, 0.58f, 0.25f), 0.1f), kit.Lit(new Color(0.16f, 0.42f, 0.2f), 0.1f) };
            float L = path.Length;
            int placed = 0;
            for (int tries = 0; tries < 900 && placed < 140; tries++)
            {
                float d = (float)rnd.NextDouble() * L;
                float side = rnd.NextDouble() < 0.5 ? -1 : 1;
                float off = side * (path.HalfWidth + 9f + (float)rnd.NextDouble() * 40f);
                var pos = path.PoseAt(d, off).position;
                pos.y = groundY;
                // keep clear of every part of the road (loops and twists included), not just this stretch
                var flat = pos;
                float clear = float.MaxValue;
                foreach (var p in path.points) clear = Mathf.Min(clear, new Vector2(p.x - flat.x, p.z - flat.z).magnitude);
                if (clear < path.HalfWidth + 7f) continue;
                var t = Prim.Node("Tree" + placed, root, pos - Vector3.up * 0.4f);
                float s = 0.8f + (float)rnd.NextDouble() * 0.8f;
                t.localScale = Vector3.one * s;
                Prim.Make(PrimitiveType.Cylinder, t, new Vector3(0, 1.2f, 0), new Vector3(0.45f, 1.2f, 0.45f), trunk);
                Prim.Make(PrimitiveType.Sphere, t, new Vector3(0, 3.6f, 0), new Vector3(3f, 3.4f, 3f), leaves[rnd.Next(leaves.Length)]);
                placed++;
            }
        }

        /// the generated landmarks: big set pieces off the road where nothing of the circuit passes, turned to face it
        static void Landmarks(TrackPath path, Transform parent, GameKit kit, GameConfig cfg, float groundY)
        {
            var root = Prim.Node("Landmarks", parent);
            float L = path.Length;
            for (int n = 1; n <= 4; n++)
            {
                string slot = "landmark." + n;
                if (!Models.Has(cfg, slot)) continue;
                float size = 26f;
                // try spots along the lap, both sides, nearer first, until one is clear of all of the road
                bool placed = false;
                for (int k = 0; k < 40 && !placed; k++)
                {
                    float d = L * (0.12f + 0.45f * (n - 1) + 0.03f * k) % L;
                    float side = (k + n) % 2 == 0 ? 1 : -1;
                    float off = side * (path.HalfWidth + size * 0.6f + 6f + (k / 2) * 3f);
                    var pose = path.PoseAt(d, off);
                    var pos = pose.position; pos.y = groundY;
                    float clear = float.MaxValue;
                    foreach (var p in path.points) clear = Mathf.Min(clear, new Vector2(p.x - pos.x, p.z - pos.z).magnitude);
                    if (clear < path.HalfWidth + size * 0.55f + 3f) continue;
                    var centre = path.PoseAt(d, 0).position; centre.y = pos.y;
                    var t = Prim.Node("Landmark" + n, root, pos);
                    t.rotation = Quaternion.LookRotation((centre - pos).normalized, Vector3.up);
                    Models.Spawn(cfg, kit, slot, t, Vector3.zero, size);
                    placed = true;
                }
            }
        }

        /// the generated trophy on a podium beside the start/finish line
        static void Trophy(TrackPath path, Transform parent, GameKit kit, GameConfig cfg)
        {
            if (!Models.Has(cfg, "trophy")) return;
            var pose = path.PoseAt(6f, path.HalfWidth + 6.5f);
            var t = Prim.Node("Trophy", parent);
            t.SetPositionAndRotation(pose.position, Upright(pose.rotation) * Quaternion.Euler(0, -90f, 0));
            var stone = kit.Lit(new Color(0.9f, 0.9f, 0.92f), 0.4f);
            Prim.Make(PrimitiveType.Cylinder, t, new Vector3(0, 0.6f, 0), new Vector3(3.2f, 0.6f, 3.2f), stone, "Podium");
            Prim.Make(PrimitiveType.Cylinder, t, new Vector3(0, 1.25f, 0), new Vector3(2.4f, 0.05f, 2.4f), kit.Glow(GameConfig.Hex(cfg.hud.accent, Color.yellow), 1.5f), "Rim");
            var m = Models.Spawn(cfg, kit, "trophy", t, new Vector3(0, 1.3f, 0), 3.6f);
            if (m) m.gameObject.AddComponent<Spin>();
        }

        /// boards along the outside of the track; they show requested art when it is a texture in Resources
        static void Boards(TrackPath path, Transform parent, GameKit kit, GameConfig cfg, float off)
        {
            var root = Prim.Node("Boards", parent);
            var frame = kit.Lit(new Color(0.12f, 0.12f, 0.14f), 0.4f);
            var accent = GameConfig.Hex(cfg.hud.accent, Color.yellow);
            int count = 6;
            for (int i = 0; i < count; i++)
            {
                float d = path.Length * (i + 0.25f) / count;
                for (int tries = 0; tries < 12 && !Plain(path, d); tries++) d += 15f;
                if (!Plain(path, d)) continue;
                float side = i % 2 == 0 ? -1 : 1;
                var pose = path.PoseAt(d, side * off);
                var t = Prim.Node("Board" + i, root);
                t.SetPositionAndRotation(pose.position, Upright(pose.rotation) * Quaternion.Euler(0, side * 90f, 0));
                Prim.Make(PrimitiveType.Cube, t, new Vector3(0, 2.2f, 0), new Vector3(8.4f, 3.4f, 0.3f), frame);
                Texture tex = null;
                if (cfg.banners != null && cfg.banners.Length > 0) tex = Resources.Load<Texture2D>(cfg.banners[i % cfg.banners.Length]);
                var face = tex ? kit.Flat(Color.white, tex) : kit.Lit(i % 2 == 0 ? accent : new Color(0.2f, 0.45f, 0.9f), 0.3f);
                Prim.Make(PrimitiveType.Quad, t, new Vector3(0, 2.2f, side * 0.17f), new Vector3(8f, 3f, 1f), face, "Face", Quaternion.Euler(0, side < 0 ? 0 : 180f, 0));
                Prim.Make(PrimitiveType.Cube, t, new Vector3(-3.6f, 0.4f, 0), new Vector3(0.25f, 1.2f, 0.25f), frame);
                Prim.Make(PrimitiveType.Cube, t, new Vector3(3.6f, 0.4f, 0), new Vector3(0.25f, 1.2f, 0.25f), frame);
            }
        }
    }

    /// turns slowly about its own up axis (the trophy)
    public class Spin : MonoBehaviour
    {
        public float speed = 30f;
        void Update() => transform.Rotate(0, speed * Time.deltaTime, 0, Space.Self);
    }

    /// marks lights and lamp heads that the night preset switches on
    public class NightOnly : MonoBehaviour
    {
        public bool glow;
        public float baseIntensity = -1, baseRange = -1;
        Material on, off;
        public void SetGlow(bool lit)
        {
            var r = GetComponent<Renderer>();
            if (!r) return;
            if (on == null) { on = r.sharedMaterial; off = GameKit.Load().Lit(on.GetColor("_BaseColor") * 0.8f, 0.6f); }
            r.sharedMaterial = lit ? on : off;
        }
    }
}
