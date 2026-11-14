// Generated 3D models (GameConfig.models): the kart body, one rider per class, track-side landmarks and the
// trophy. Each is an OBJ imported into Resources/Models/<slot>/ with its painted texture. Spawn() puts one under a
// parent, normalised: longest side `size` metres, centred on X/Z, standing on y = 0, turned by the slot's yaw so
// it faces +Z. When a slot has no model the caller keeps its primitive version.

using System.Collections.Generic;
using UnityEngine;

namespace HarnessGame
{
    public static class Models
    {
        public static bool Has(GameConfig cfg, string slot)
        {
            var m = cfg.Model(slot);
            return m != null && Resources.Load<GameObject>(m.path) != null;
        }

        /// tint lerps the texture toward a colour (0 keeps the painted look)
        public static Transform Spawn(GameConfig cfg, GameKit kit, string slot, Transform parent, Vector3 localPos, float size, Color tint = default, float tintAmount = 0f, float extraYaw = 0f)
        {
            var spec = cfg.Model(slot);
            if (spec == null) return null;
            var src = Resources.Load<GameObject>(spec.path);
            if (!src) return null;
            var tex = string.IsNullOrEmpty(spec.texture) ? null : Resources.Load<Texture2D>(spec.texture);
            var mat = kit.Lit(tintAmount > 0f ? Color.Lerp(Color.white, tint, tintAmount) : Color.white, 0.3f, 0f, tex);

            var holder = Prim.Node("Model_" + slot, parent, localPos);
            holder.localRotation = Quaternion.Euler(0, spec.yaw + extraYaw, 0);
            var inst = Object.Instantiate(src, holder, false);
            inst.name = "Mesh";
            foreach (var r in inst.GetComponentsInChildren<Renderer>())
            {
                var mats = new Material[r.sharedMaterials.Length];
                for (int i = 0; i < mats.Length; i++) mats[i] = mat;
                r.sharedMaterials = mats;
                r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.On;
            }
            foreach (var c in inst.GetComponentsInChildren<Collider>()) Object.Destroy(c);

            // bounds in the instance's own space, from the meshes (works before the parent is placed)
            var b = new Bounds();
            bool any = false;
            var toRoot = inst.transform.worldToLocalMatrix;
            foreach (var mf in inst.GetComponentsInChildren<MeshFilter>())
            {
                if (!mf.sharedMesh) continue;
                var mb = mf.sharedMesh.bounds;
                var m = toRoot * mf.transform.localToWorldMatrix;
                for (int i = 0; i < 8; i++)
                {
                    var p = m.MultiplyPoint3x4(mb.center + Vector3.Scale(mb.extents, new Vector3((i & 1) == 0 ? -1 : 1, (i & 2) == 0 ? -1 : 1, (i & 4) == 0 ? -1 : 1)));
                    if (!any) { b = new Bounds(p, Vector3.zero); any = true; }
                    else b.Encapsulate(p);
                }
            }
            if (!any) return holder;
            float longest = Mathf.Max(b.size.x, Mathf.Max(b.size.y, b.size.z));
            float s = size / Mathf.Max(longest, 1e-4f);
            inst.transform.localScale = Vector3.one * s;
            inst.transform.localPosition = -new Vector3(b.center.x, b.min.y, b.center.z) * s;
            return holder;
        }

        /// the floor of a model's seat in `space` (the kart body): the lowest top surface in the middle third across
        /// and from the middle to the back, read from the vertices on a coarse grid (the recessed seat socket of a
        /// kart). The meshes are imported readable (ModelImport.cs). Null when there is no mesh to read.
        public static Vector3? Seat(Transform model, Transform space)
        {
            var pts = new List<Vector3>();
            foreach (var mf in model.GetComponentsInChildren<MeshFilter>())
            {
                if (!mf.sharedMesh || !mf.sharedMesh.isReadable) continue;
                var m = space.worldToLocalMatrix * mf.transform.localToWorldMatrix;
                foreach (var v in mf.sharedMesh.vertices) pts.Add(m.MultiplyPoint3x4(v));
            }
            if (pts.Count < 8) return null;
            var b = new Bounds(pts[0], Vector3.zero);
            foreach (var p in pts) b.Encapsulate(p);
            const int G = 6;
            float x0 = b.center.x - b.size.x / 6f, x1 = b.center.x + b.size.x / 6f;
            float z0 = b.min.z + b.size.z * 0.12f, z1 = b.center.z + b.size.z * 0.08f;
            var top = new float[G, G];
            for (int a = 0; a < G; a++) for (int c = 0; c < G; c++) top[a, c] = float.NegativeInfinity;
            foreach (var p in pts)
            {
                if (p.x < x0 || p.x > x1 || p.z < z0 || p.z > z1) continue;
                int ix = Mathf.Min(G - 1, (int)((p.x - x0) / (x1 - x0) * G)), iz = Mathf.Min(G - 1, (int)((p.z - z0) / (z1 - z0) * G));
                top[ix, iz] = Mathf.Max(top[ix, iz], p.y);
            }
            float best = float.PositiveInfinity, bz = b.center.z;
            for (int a = 1; a < G - 1; a++)
                for (int c = 0; c < G; c++)
                    if (!float.IsNegativeInfinity(top[a, c]) && top[a, c] < best) { best = top[a, c]; bz = z0 + (c + 0.5f) / G * (z1 - z0); }
            if (float.IsPositiveInfinity(best)) return null;
            return new Vector3(b.center.x, Mathf.Clamp(best, b.min.y + b.size.y * 0.2f, b.min.y + b.size.y * 0.75f), bz);
        }
    }
}
