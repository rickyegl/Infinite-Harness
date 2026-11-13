// A humanoid rider made of primitives: torso, head with a helmet, two arms on shoulder pivots, and a weapon in
// the right hand. Swing() plays a quick overhead strike; Tick() also gives an idle bob and steering lean.

using UnityEngine;

namespace HarnessGame
{
    public class Rider : MonoBehaviour
    {
        public Transform armL, armR, head, torso;
        float swing = -1f, sideSign = 1f;
        float idle;

        public static Rider Build(Transform kartBody, GameKit kit, RiderSpec spec, Color outfit, bool visible)
        {
            var root = Prim.Node("Rider", kartBody, new Vector3(0, 0.7f, -0.35f));
            root.localScale = Vector3.one * Mathf.Clamp(spec.height, 0.6f, 1.5f);
            var r = root.gameObject.AddComponent<Rider>();
            var skin = kit.Lit(GameConfig.Hex(spec.skin, new Color(0.95f, 0.76f, 0.49f)), 0.3f);
            var cloth = kit.Lit(outfit, 0.25f);
            var dark = kit.Lit(new Color(0.12f, 0.12f, 0.14f), 0.5f);
            var visor = kit.Lit(new Color(0.15f, 0.2f, 0.3f), 0.9f, 0.3f);

            r.torso = Prim.Node("Torso", root);
            Prim.Make(PrimitiveType.Capsule, r.torso, new Vector3(0, 0.55f, 0), new Vector3(0.62f, 0.45f, 0.42f), cloth, "Chest");
            Prim.Make(PrimitiveType.Cube, r.torso, new Vector3(0, 0.3f, 0.02f), new Vector3(0.6f, 0.08f, 0.4f), dark, "Belt");
            Prim.Make(PrimitiveType.Capsule, r.torso, new Vector3(-0.17f, 0.12f, 0.35f), new Vector3(0.22f, 0.32f, 0.22f), dark, "LegL", Quaternion.Euler(80, 0, 0));
            Prim.Make(PrimitiveType.Capsule, r.torso, new Vector3(0.17f, 0.12f, 0.35f), new Vector3(0.22f, 0.32f, 0.22f), dark, "LegR", Quaternion.Euler(80, 0, 0));

            r.head = Prim.Node("Head", r.torso, new Vector3(0, 1.12f, 0));
            Prim.Make(PrimitiveType.Sphere, r.head, Vector3.zero, Vector3.one * 0.38f, skin, "Face");
            Prim.Make(PrimitiveType.Sphere, r.head, new Vector3(0, 0.06f, -0.02f), new Vector3(0.44f, 0.4f, 0.46f), cloth, "Helmet");
            Prim.Make(PrimitiveType.Cube, r.head, new Vector3(0, 0.02f, 0.19f), new Vector3(0.32f, 0.12f, 0.06f), visor, "Visor");

            r.armL = Prim.Node("ArmL", r.torso, new Vector3(-0.38f, 0.82f, 0));
            Prim.Make(PrimitiveType.Capsule, r.armL, new Vector3(0, -0.28f, 0.12f), new Vector3(0.18f, 0.3f, 0.18f), cloth, "Upper", Quaternion.Euler(40, 0, 0));
            Prim.Make(PrimitiveType.Sphere, r.armL, new Vector3(0, -0.45f, 0.38f), Vector3.one * 0.17f, skin, "Hand");
            r.armR = Prim.Node("ArmR", r.torso, new Vector3(0.38f, 0.82f, 0));
            Prim.Make(PrimitiveType.Capsule, r.armR, new Vector3(0, -0.28f, 0.12f), new Vector3(0.18f, 0.3f, 0.18f), cloth, "Upper", Quaternion.Euler(40, 0, 0));
            Prim.Make(PrimitiveType.Sphere, r.armR, new Vector3(0, -0.45f, 0.38f), Vector3.one * 0.17f, skin, "Hand");

            var w = Prim.Node("Weapon", r.armR, new Vector3(0, -0.45f, 0.38f));
            switch (spec.weapon)
            {
                case "glove":
                    Prim.Make(PrimitiveType.Sphere, w, new Vector3(0, 0, 0.1f), Vector3.one * 0.42f, kit.Lit(new Color(0.85f, 0.1f, 0.1f), 0.6f), "Glove");
                    break;
                case "noodle":
                    Prim.Make(PrimitiveType.Cylinder, w, new Vector3(0, 0.55f, 0), new Vector3(0.16f, 0.6f, 0.16f), kit.Lit(new Color(0.2f, 0.9f, 0.4f), 0.3f), "Noodle");
                    break;
                default:
                    Prim.Make(PrimitiveType.Cylinder, w, new Vector3(0, 0.35f, 0), new Vector3(0.09f, 0.38f, 0.09f), kit.Lit(new Color(0.5f, 0.33f, 0.18f), 0.2f), "Handle");
                    Prim.Make(PrimitiveType.Capsule, w, new Vector3(0, 0.8f, 0), new Vector3(0.24f, 0.22f, 0.24f), kit.Lit(new Color(0.55f, 0.36f, 0.2f), 0.2f), "Club");
                    break;
            }
            root.gameObject.SetActive(visible);
            return r;
        }

        public void Swing(float dir = 1f) { swing = 0f; sideSign = dir < 0 ? -1f : 1f; }
        public bool Swinging => swing >= 0f && swing < 0.35f;

        /// pose the arm mid-swing (for still screenshots)
        public void Freeze(float t) { swing = t; Pose(); }

        public void Tick(float dt)
        {
            idle += dt;
            if (swing >= 0f) { swing += dt; if (swing > 0.45f) swing = -1f; }
            Pose();
        }

        void Pose()
        {
            if (!armR) return;
            // wind up behind the head, then strike down and out to the side
            float a = swing < 0 ? 0f : swing < 0.12f ? Mathf.Lerp(0, -150f, swing / 0.12f) : swing < 0.3f ? Mathf.Lerp(-150f, 60f, (swing - 0.12f) / 0.18f) : Mathf.Lerp(60f, 0f, (swing - 0.3f) / 0.15f);
            float side = swing < 0 ? 0f : Mathf.Sin(Mathf.Clamp01(swing / 0.45f) * Mathf.PI) * 70f * sideSign;
            armR.localRotation = Quaternion.Euler(a, 0, side);
            armL.localRotation = Quaternion.Euler(Mathf.Sin(idle * 3f) * 4f, 0, 0);
            if (torso) torso.localRotation = Quaternion.Euler(0, swing < 0 ? Mathf.Sin(idle * 2f) * 3f : side * 0.4f, 0);
            if (head) head.localRotation = Quaternion.Euler(Mathf.Sin(idle * 1.7f) * 3f, 0, 0);
        }
    }
}
