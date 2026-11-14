// Scenery round the circuit, so the world never looks empty.
// On the ground: a ring of low-poly mountains on the edge of the grass, rock clusters, bushes, flower beds, flag
// poles beside the road, and a grandstand with a crowd by the start.
// In the air: hot-air balloons, floating islands, drifting clouds, a blimp circling the circuit, and glowing
// arches over the straights.
// Everything is seeded from the track, so a rebuild looks the same. Balloons and islands bob, clouds drift, the
// blimp circles and flags wave; the rest is static. Nothing has a collider: karts follow the track path.

using System.Collections.Generic;
using UnityEngine;

namespace HarnessGame
{
    public static class Scenery
    {
        public static void Build(TrackPath path, Transform parent, GameKit kit, GameConfig cfg, float groundY, Vector3 mid, float rad, List<Vector4> taken)
        {
            var root = Prim.Node("Scenery", parent);
            var rnd = new System.Random(cfg.track.seed * 97 + 3);
            float R() => (float)rnd.NextDouble();
            var pal = new List<Color>();
            foreach (var c in cfg.karts.colors) pal.Add(GameConfig.Hex(c, Color.white));
            if (pal.Count == 0) pal.Add(Color.white);
            var accent = GameConfig.Hex(cfg.hud.accent, new Color(1f, 0.82f, 0.24f));
            var grassC = GameConfig.Hex(cfg.look.ground, new Color(0.37f, 0.62f, 0.29f));

            // the road, thinned out, for clearance checks
            var road = new List<Vector3>();
            float topY = float.MinValue;
            for (int i = 0; i < path.points.Length; i += 3) { road.Add(path.points[i]); topY = Mathf.Max(topY, path.points[i].y); }
            float Clear(Vector3 p)
            {
                float m = float.MaxValue;
                foreach (var q in road) m = Mathf.Min(m, new Vector2(q.x - p.x, q.z - p.z).sqrMagnitude);
                return Mathf.Sqrt(m);
            }
            bool Free(Vector3 p, float r)
            {
                foreach (var t in taken) if (new Vector2(t.x - p.x, t.z - p.z).magnitude < r + t.w) return false;
                return true;
            }
            // a random ground spot inside the grass, clear of the road by `margin` and of the big things in `taken`
            // (x, y, z, radius) by `keep`
            bool Spot(float margin, float keep, out Vector3 p)
            {
                for (int k = 0; k < 30; k++)
                {
                    float a = R() * Mathf.PI * 2f, r = Mathf.Sqrt(R()) * rad * 1.22f;
                    p = new Vector3(mid.x + Mathf.Cos(a) * r, groundY, mid.z + Mathf.Sin(a) * r);
                    if (Clear(p) < path.HalfWidth + margin || !Free(p, keep)) continue;
                    return true;
                }
                p = default;
                return false;
            }

            // ------------------------------------------------------------------ ground
            // mountains on the rim of the grass (it ends at 1.3 x the circuit's radius), pushed out until clear
            var mRoot = Prim.Node("Mountains", root);
            var rockA = kit.Lit(Color.Lerp(grassC, new Color(0.35f, 0.38f, 0.45f), 0.65f), 0.05f);
            var rockB = kit.Lit(Color.Lerp(grassC, new Color(0.45f, 0.42f, 0.5f), 0.75f), 0.05f);
            var snow = kit.Lit(new Color(0.95f, 0.96f, 1f), 0.2f);
            int peaks = 26;
            for (int i = 0; i < peaks; i++)
            {
                float a = (i + R() * 0.6f) / peaks * Mathf.PI * 2f;
                float h = 45f + R() * 85f, br = h * (0.6f + R() * 0.35f);
                float r = rad * 1.3f + br * 0.15f;
                var p = new Vector3(mid.x + Mathf.Cos(a) * r, groundY - 1f, mid.z + Mathf.Sin(a) * r);
                for (int k = 0; k < 20 && Clear(p) < path.HalfWidth + br + 8f; k++) { r += 8f; p = new Vector3(mid.x + Mathf.Cos(a) * r, p.y, mid.z + Mathf.Sin(a) * r); }
                Cone(mRoot, "Peak" + i, p, br, h, i % 2 == 0 ? rockA : rockB, 7, rnd);
                if (h > 85f) Cone(mRoot, "Snow" + i, p + Vector3.up * h * 0.68f, br * 0.33f, h * 0.32f + 0.5f, snow, 7, rnd);
            }

            // rock clusters, bushes and flower beds scattered over the grass
            var greys = new[] { kit.Lit(new Color(0.52f, 0.52f, 0.55f), 0.1f), kit.Lit(new Color(0.62f, 0.6f, 0.58f), 0.1f), kit.Lit(new Color(0.42f, 0.43f, 0.47f), 0.1f) };
            var bushes = new[] { kit.Lit(new Color(0.17f, 0.45f, 0.2f), 0.1f), kit.Lit(new Color(0.24f, 0.55f, 0.22f), 0.1f), kit.Lit(Color.Lerp(grassC, Color.black, 0.35f), 0.1f) };
            var gRoot = Prim.Node("Ground", root);
            for (int i = 0; i < 45; i++)
            {
                if (!Spot(8f, 10f, out var p)) continue;
                var t = Prim.Node("Rocks" + i, gRoot, p);
                t.localRotation = Quaternion.Euler(0, R() * 360f, 0);
                int n = 1 + rnd.Next(3);
                for (int k = 0; k < n; k++)
                {
                    float s = 1.2f + R() * 2.8f;
                    Prim.Make(PrimitiveType.Sphere, t, new Vector3(k * 1.6f - 1.5f, s * 0.25f, R() * 1.5f), new Vector3(s * 1.2f, s * 0.8f, s), greys[rnd.Next(greys.Length)], null, Quaternion.Euler(R() * 30f, R() * 360f, R() * 20f));
                }
            }
            for (int i = 0; i < 80; i++)
            {
                if (!Spot(6f, 8f, out var p)) continue;
                var t = Prim.Node("Bush" + i, gRoot, p);
                int n = 2 + rnd.Next(3);
                for (int k = 0; k < n; k++)
                {
                    float s = 1f + R() * 1.4f;
                    Prim.Make(PrimitiveType.Sphere, t, new Vector3((R() - 0.5f) * 2.2f, s * 0.35f, (R() - 0.5f) * 2.2f), new Vector3(s * 1.3f, s, s * 1.3f), bushes[rnd.Next(bushes.Length)]);
                }
            }
            var bed = kit.Lit(Color.Lerp(grassC, Color.black, 0.45f), 0.05f);
            for (int i = 0; i < 30; i++)
            {
                if (!Spot(7f, 9f, out var p)) continue;
                var t = Prim.Node("Flowers" + i, gRoot, p);
                Prim.Make(PrimitiveType.Cylinder, t, new Vector3(0, 0.05f, 0), new Vector3(5f, 0.05f, 5f), bed, "Bed");
                var fc = kit.Lit(Color.Lerp(pal[rnd.Next(pal.Count)], Color.white, 0.15f), 0.3f);
                var fc2 = kit.Lit(Color.Lerp(accent, Color.white, 0.2f), 0.3f);
                for (int k = 0; k < 14; k++)
                {
                    float a = R() * Mathf.PI * 2f, r = Mathf.Sqrt(R()) * 2.2f;
                    Prim.Make(PrimitiveType.Sphere, t, new Vector3(Mathf.Cos(a) * r, 0.3f, Mathf.Sin(a) * r), Vector3.one * (0.35f + R() * 0.25f), k % 3 == 0 ? fc2 : fc);
                }
            }

            // flag poles in pairs beside the road, on level stretches near the ground, in the karts' colours
            var fRoot = Prim.Node("Flags", root);
            var poleM = kit.Lit(new Color(0.85f, 0.86f, 0.9f), 0.5f, 0.6f);
            float L = path.Length;
            int flags = Mathf.Clamp(Mathf.RoundToInt(L / 38f), 8, 50), fi = 0;
            for (int i = 0; i < flags; i++)
            {
                float d = L * (i + 0.7f) / flags;
                if (!TrackBuilder.Plain(path, d)) continue;
                float side = (i % 2 == 0) ? 1f : -1f;
                var pose = path.PoseAt(d, side * (path.HalfWidth + 8.5f));
                if (pose.position.y - groundY > 1.2f) continue;
                var p = pose.position; p.y = groundY;
                if (Clear(p) < path.HalfWidth + 6f) continue;
                var t = Prim.Node("Flag" + fi, fRoot, p);
                t.rotation = TrackBuilder.Upright(pose.rotation);
                Prim.Make(PrimitiveType.Cylinder, t, new Vector3(0, 4.5f, 0), new Vector3(0.18f, 4.5f, 0.18f), poleM, "Pole");
                Prim.Make(PrimitiveType.Sphere, t, new Vector3(0, 9.1f, 0), Vector3.one * 0.4f, kit.Lit(accent, 0.6f, 0.5f), "Knob");
                var cloth = Prim.Node("Cloth", t, new Vector3(0, 8f, 0));
                Prim.Make(PrimitiveType.Cube, cloth, new Vector3(0, 0, -1.3f), new Vector3(0.06f, 1.6f, 2.6f), kit.Lit(pal[fi % pal.Count], 0.2f), "Banner");
                cloth.gameObject.AddComponent<Wave>().phase = R() * 6f;
                fi++;
            }

            Grandstand(path, root, kit, pal, accent, groundY, rnd, Clear, taken);

            // ------------------------------------------------------------------ air
            // above everything the road reaches near a spot, with room to spare
            float AirY(Vector3 p, float lo, float hi)
            {
                float y = groundY + lo + R() * (hi - lo);
                float near = float.MinValue;
                foreach (var q in road) if (new Vector2(q.x - p.x, q.z - p.z).sqrMagnitude < 40f * 40f) near = Mathf.Max(near, q.y);
                return near > float.MinValue ? Mathf.Max(y, near + 22f) : y;
            }
            Vector3 AirSpot(float spread)
            {
                float a = R() * Mathf.PI * 2f, r = (0.25f + 0.85f * Mathf.Sqrt(R())) * rad * spread;
                return new Vector3(mid.x + Mathf.Cos(a) * r, 0, mid.z + Mathf.Sin(a) * r);
            }

            var aRoot = Prim.Node("Air", root);
            // hot-air balloons: striped envelope, basket on ropes
            var basket = kit.Lit(new Color(0.55f, 0.36f, 0.2f), 0.1f);
            var rope = kit.Lit(new Color(0.3f, 0.25f, 0.2f), 0.1f);
            for (int i = 0; i < 9; i++)
            {
                var p = AirSpot(1.15f); p.y = AirY(p, 38f, 85f);
                var t = Prim.Node("Balloon" + i, aRoot, p);
                float s = 0.8f + R() * 0.6f;
                t.localScale = Vector3.one * s;
                var a = pal[rnd.Next(pal.Count)];
                var b = i % 2 == 0 ? accent : Color.white;
                Prim.Make(PrimitiveType.Sphere, t, new Vector3(0, 0, 0), new Vector3(9f, 10f, 9f), kit.Lit(a, 0.4f), "Envelope");
                Prim.Make(PrimitiveType.Cylinder, t, new Vector3(0, 0.6f, 0), new Vector3(9.15f, 1.1f, 9.15f), kit.Lit(b, 0.4f), "Band");
                Prim.Make(PrimitiveType.Cylinder, t, new Vector3(0, -2.6f, 0), new Vector3(7.6f, 0.6f, 7.6f), kit.Lit(b, 0.4f), "Band2");
                Prim.Make(PrimitiveType.Sphere, t, new Vector3(0, -4.8f, 0), new Vector3(4.2f, 3.4f, 4.2f), kit.Lit(a, 0.4f), "Neck");
                Prim.Make(PrimitiveType.Cube, t, new Vector3(0, -9.2f, 0), new Vector3(1.8f, 1.3f, 1.8f), basket, "Basket");
                for (int k = 0; k < 4; k++)
                {
                    float x = (k & 1) == 0 ? -0.8f : 0.8f, z = (k & 2) == 0 ? -0.8f : 0.8f;
                    Prim.Make(PrimitiveType.Cylinder, t, new Vector3(x * 1.2f, -7.4f, z * 1.2f), new Vector3(0.06f, 1.4f, 0.06f), rope);
                }
                var bob = t.gameObject.AddComponent<Bob>(); bob.amp = 1.5f + R() * 1.5f; bob.period = 7f + R() * 5f; bob.phase = R() * 6f; bob.spin = 3f;
            }

            // floating islands: a rock cone point down, a grass top, a tree or a glowing crystal
            var islandRock = kit.Lit(new Color(0.48f, 0.4f, 0.34f), 0.05f);
            var islandGrass = kit.Lit(grassC, 0.05f);
            var trunk = kit.Lit(new Color(0.42f, 0.29f, 0.18f), 0.1f);
            for (int i = 0; i < 6; i++)
            {
                var p = AirSpot(1.05f); p.y = AirY(p, 28f, 60f);
                var t = Prim.Node("Island" + i, aRoot, p);
                float s = 5f + R() * 5f;
                Cone(t, "Rock", new Vector3(0, 0.2f, 0), s, -s * 1.6f, islandRock, 8, rnd);
                Prim.Make(PrimitiveType.Cylinder, t, new Vector3(0, 0.25f, 0), new Vector3(s * 2f, 0.25f, s * 2f), islandGrass, "Top");
                if (i % 2 == 0)
                {
                    Prim.Make(PrimitiveType.Cylinder, t, new Vector3(0, 1.6f, 0), new Vector3(0.5f, 1.4f, 0.5f), trunk);
                    Prim.Make(PrimitiveType.Sphere, t, new Vector3(0, 4f, 0), new Vector3(3.4f, 3.6f, 3.4f), bushes[i % bushes.Length]);
                }
                else Prim.Make(PrimitiveType.Cube, t, new Vector3(0, 2.2f, 0), new Vector3(1.2f, 3.6f, 1.2f), kit.Glow(Color.Lerp(accent, Color.cyan, 0.5f), 2f), "Crystal", Quaternion.Euler(0, 45f, 12f));
                var bob = t.gameObject.AddComponent<Bob>(); bob.amp = 1.2f; bob.period = 9f + R() * 6f; bob.phase = R() * 6f; bob.spin = 2f;
            }

            // clouds drift round the circuit as one slow carousel; they cast no shadows
            var cloudRoot = Prim.Node("Clouds", aRoot, mid);
            cloudRoot.gameObject.AddComponent<Spin>().speed = 0.7f;
            var cloud = kit.Lit(new Color(0.97f, 0.97f, 1f), 0.05f);
            for (int i = 0; i < 16; i++)
            {
                var p = AirSpot(1.4f) - mid; p.y = Mathf.Max(groundY + 85f + R() * 50f, topY + 30f) - mid.y;
                var t = Prim.Node("Cloud" + i, cloudRoot, p);
                int n = 4 + rnd.Next(4);
                for (int k = 0; k < n; k++)
                {
                    float s = 7f + R() * 9f;
                    var g = Prim.Make(PrimitiveType.Sphere, t, new Vector3((k - n * 0.5f) * 6f + R() * 3f, R() * 3f, (R() - 0.5f) * 8f), new Vector3(s * 1.4f, s * 0.7f, s), cloud);
                    g.GetComponent<MeshRenderer>().shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
                }
            }

            // a blimp circling the circuit
            var pivot = Prim.Node("BlimpPivot", aRoot, new Vector3(mid.x, Mathf.Max(groundY + 70f, topY + 25f), mid.z));
            pivot.gameObject.AddComponent<Spin>().speed = 4f;
            var blimp = Prim.Node("Blimp", pivot, new Vector3(rad * 0.75f, 0, 0));
            blimp.localRotation = Quaternion.Euler(0, 180f, 0);
            var hull = kit.Lit(new Color(0.92f, 0.93f, 0.96f), 0.5f, 0.2f);
            var trim = kit.Lit(pal[0], 0.4f);
            Prim.Make(PrimitiveType.Capsule, blimp, Vector3.zero, new Vector3(8f, 15f, 8f), hull, "Hull", Quaternion.Euler(90f, 0, 0));
            Prim.Make(PrimitiveType.Cylinder, blimp, Vector3.zero, new Vector3(8.15f, 1.4f, 8.15f), kit.Glow(accent, 1.4f), "Stripe", Quaternion.Euler(90f, 0, 0));
            Prim.Make(PrimitiveType.Cube, blimp, new Vector3(0, -4.6f, 1f), new Vector3(2f, 1.4f, 5f), trim, "Gondola");
            for (int k = 0; k < 4; k++)
                Prim.Make(PrimitiveType.Cube, blimp, new Vector3(0, 0, -12.5f), new Vector3(0.3f, 6f, 3.5f), trim, "Fin" + k, Quaternion.Euler(0, 0, k * 90f));

            // glowing arches over the straights (wall to wall, high above the karts)
            var arch = kit.Glow(Color.Lerp(accent, Color.white, 0.15f), 2.2f);
            var archB = kit.Glow(new Color(0f, 0.8f, 1f), 1.8f);
            int arches = 0;
            for (float d = 90f; d < L - 60f && arches < 7; d += 37f)
            {
                if (!TrackBuilder.Plain(path, d) || path.InFeature(d, 45f)) continue;
                var pose = path.PoseAt(d, 0);
                var t = Prim.Node("Arch" + arches, aRoot);
                t.SetPositionAndRotation(pose.position, TrackBuilder.Upright(pose.rotation));
                float r = path.HalfWidth + 3.4f;
                for (int k = 0; k <= 12; k++)
                {
                    float th = Mathf.PI * k / 12f;
                    Prim.Make(PrimitiveType.Cube, t, new Vector3(Mathf.Cos(th) * r, 2.4f + Mathf.Sin(th) * r, 0), new Vector3(1.9f, 0.55f, 0.55f), k % 2 == 0 ? arch : archB, null, Quaternion.Euler(0, 0, th * Mathf.Rad2Deg + 90f));
                }
                Prim.Make(PrimitiveType.Cube, t, new Vector3(-r, 1.2f, 0), new Vector3(0.55f, 2.4f, 0.55f), arch);
                Prim.Make(PrimitiveType.Cube, t, new Vector3(r, 1.2f, 0), new Vector3(0.55f, 2.4f, 0.55f), arch);
                arches++;
                d += 110f;
            }
        }

        /// a stepped stand facing the start straight, with a crowd in the karts' colours and a roof in the accent
        static void Grandstand(TrackPath path, Transform root, GameKit kit, List<Color> pal, Color accent, float groundY, System.Random rnd, System.Func<Vector3, float> clear, List<Vector4> taken)
        {
            float off = path.HalfWidth + 13f;
            var pose = path.PoseAt(-14f, -off);
            var p = pose.position; p.y = groundY;
            if (clear(p) < path.HalfWidth + 9f) return;
            var t = Prim.Node("Grandstand", root, p);
            t.rotation = TrackBuilder.Upright(pose.rotation) * Quaternion.Euler(0, 90f, 0);   // its front (+Z) to the road
            taken.Add(new Vector4(p.x, p.y, p.z, 26f));
            var concrete = kit.Lit(new Color(0.78f, 0.78f, 0.8f), 0.15f);
            var seat = kit.Lit(new Color(0.25f, 0.3f, 0.4f), 0.3f);
            const float len = 40f;
            for (int row = 0; row < 6; row++)
            {
                float z = 3f - row * 1.6f, h = 0.6f + row * 0.9f;
                Prim.Make(PrimitiveType.Cube, t, new Vector3(0, h * 0.5f, z), new Vector3(len, h, 1.6f), row % 2 == 0 ? concrete : seat, "Step" + row);
                for (int k = 0; k < 26; k++)
                {
                    if (rnd.NextDouble() < 0.18) continue;
                    float x = -len * 0.5f + 1f + k * (len - 2f) / 25f + (float)(rnd.NextDouble() - 0.5) * 0.5f;
                    var c = kit.Lit(pal[rnd.Next(pal.Count)], 0.3f);
                    Prim.Make(PrimitiveType.Capsule, t, new Vector3(x, h + 0.55f, z), new Vector3(0.55f, 0.5f, 0.5f), c, "Fan");
                    Prim.Make(PrimitiveType.Sphere, t, new Vector3(x, h + 1.25f, z), Vector3.one * 0.38f, kit.Lit(new Color(0.85f, 0.68f, 0.5f), 0.3f), "Head");
                }
            }
            var steel = kit.Lit(new Color(0.3f, 0.3f, 0.34f), 0.5f, 0.6f);
            foreach (float x in new[] { -len * 0.5f, 0f, len * 0.5f })
                Prim.Make(PrimitiveType.Cube, t, new Vector3(x, 5.5f, -6f), new Vector3(0.4f, 11f, 0.4f), steel, "Mast");
            Prim.Make(PrimitiveType.Cube, t, new Vector3(0, 11f, -2f), new Vector3(len + 2f, 0.4f, 10f), kit.Lit(accent, 0.4f), "Roof", Quaternion.Euler(-8f, 0, 0));
        }

        /// a low-poly cone (flat-shaded faces), base centred at pos; a negative height points it down
        static void Cone(Transform parent, string name, Vector3 pos, float radius, float height, Material m, int segs, System.Random rnd)
        {
            var v = new List<Vector3>(); var uv = new List<Vector2>(); var tri = new List<int>();
            var ring = new Vector3[segs];
            for (int i = 0; i < segs; i++)
            {
                float a = (i + (float)rnd.NextDouble() * 0.35f) / segs * Mathf.PI * 2f;
                float r = radius * (0.8f + (float)rnd.NextDouble() * 0.3f);
                ring[i] = new Vector3(Mathf.Cos(a) * r, 0, Mathf.Sin(a) * r);
            }
            var tip = new Vector3(((float)rnd.NextDouble() - 0.5f) * radius * 0.2f, height, ((float)rnd.NextDouble() - 0.5f) * radius * 0.2f);
            bool down = height < 0;
            for (int i = 0; i < segs; i++)
            {
                var a = ring[i]; var b = ring[(i + 1) % segs];
                int k = v.Count;
                v.Add(a); v.Add(tip); v.Add(b);
                uv.Add(Vector2.zero); uv.Add(Vector2.up); uv.Add(Vector2.right);
                if (down) tri.AddRange(new[] { k, k + 2, k + 1 }); else tri.AddRange(new[] { k, k + 1, k + 2 });
                // the cap (seen on the islands from above, and closes the mountains' base)
                k = v.Count;
                v.Add(Vector3.zero); v.Add(a); v.Add(b);
                uv.Add(Vector2.zero); uv.Add(Vector2.zero); uv.Add(Vector2.zero);
                if (down) tri.AddRange(new[] { k, k + 2, k + 1 }); else tri.AddRange(new[] { k, k + 1, k + 2 });
            }
            var mesh = new Mesh { name = name };
            mesh.SetVertices(v); mesh.SetUVs(0, uv); mesh.SetTriangles(tri, 0);
            mesh.RecalculateNormals(); mesh.RecalculateBounds();
            var g = new GameObject(name);
            g.transform.SetParent(parent, false);
            g.transform.localPosition = pos;
            g.AddComponent<MeshFilter>().sharedMesh = mesh;
            g.AddComponent<MeshRenderer>().sharedMaterial = m;
        }
    }

    /// floats up and down (balloons, islands), turning slowly
    public class Bob : MonoBehaviour
    {
        public float amp = 1f, period = 8f, phase, spin;
        Vector3 home; bool set;
        void Update()
        {
            if (!set) { home = transform.localPosition; set = true; }
            transform.localPosition = home + Vector3.up * (Mathf.Sin(Time.time * Mathf.PI * 2f / period + phase) * amp);
            if (spin != 0) transform.Rotate(0, spin * Time.deltaTime, 0, Space.Self);
        }
    }

    /// a flag's cloth swinging in the wind
    public class Wave : MonoBehaviour
    {
        public float phase;
        void Update() => transform.localRotation = Quaternion.Euler(0, Mathf.Sin(Time.time * 2.3f + phase) * 18f, Mathf.Sin(Time.time * 3.1f + phase) * 4f);
    }
}
