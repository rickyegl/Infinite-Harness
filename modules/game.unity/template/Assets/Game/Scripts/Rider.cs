// A humanoid rider made of primitives: torso, head with a helmet, two arms on shoulder pivots, and the gear of
// its class (volt: a coil pack and charged hands; sniper: a scoped rifle; shrink: a potion; thrower: a satchel and
// a ball). Swing() plays the attack motion; Tick() also gives an idle bob and steering lean.

using UnityEngine;

namespace HarnessGame
{
    public class Rider : MonoBehaviour
    {
        public Transform armL, armR, head, torso;
        float swing = -1f, sideSign = 1f;
        float idle;

        public static Rider Build(Transform kartBody, GameKit kit, RiderSpec spec, Color outfit, bool visible, string kind = "", Color gear = default)
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
            var glow = kit.Glow(gear, 3f);
            var metal = kit.Lit(new Color(0.22f, 0.22f, 0.26f), 0.7f, 0.8f);
            switch (kind)
            {
                case "volt":
                    // a coil pack on the back and charged hands
                    Prim.Make(PrimitiveType.Cylinder, r.torso, new Vector3(0, 0.6f, -0.3f), new Vector3(0.34f, 0.26f, 0.34f), metal, "Coil");
                    Prim.Make(PrimitiveType.Sphere, r.torso, new Vector3(0, 0.95f, -0.3f), Vector3.one * 0.26f, glow, "Charge");
                    Prim.Make(PrimitiveType.Cylinder, r.head, new Vector3(0.14f, 0.3f, -0.04f), new Vector3(0.03f, 0.14f, 0.03f), metal, "Antenna");
                    Prim.Make(PrimitiveType.Sphere, w, Vector3.zero, Vector3.one * 0.24f, glow, "SparkR");
                    Prim.Make(PrimitiveType.Sphere, r.armL, new Vector3(0, -0.45f, 0.38f), Vector3.one * 0.24f, glow, "SparkL");
                    goto done;
                case "sniper":
                    // a long scoped rifle held forward
                    Prim.Make(PrimitiveType.Cylinder, w, new Vector3(0, 0.05f, 0.55f), new Vector3(0.08f, 0.55f, 0.08f), metal, "Barrel", Quaternion.Euler(90, 0, 0));
                    Prim.Make(PrimitiveType.Cube, w, new Vector3(0, -0.02f, -0.05f), new Vector3(0.12f, 0.16f, 0.4f), kit.Lit(new Color(0.35f, 0.22f, 0.12f), 0.3f), "Stock");
                    Prim.Make(PrimitiveType.Cylinder, w, new Vector3(0, 0.16f, 0.3f), new Vector3(0.09f, 0.14f, 0.09f), metal, "Scope", Quaternion.Euler(90, 0, 0));
                    Prim.Make(PrimitiveType.Sphere, w, new Vector3(0, 0.16f, 0.45f), Vector3.one * 0.08f, glow, "Lens");
                    Prim.Make(PrimitiveType.Cube, r.head, new Vector3(0, 0.02f, 0.2f), new Vector3(0.34f, 0.08f, 0.04f), glow, "Goggles");
                    goto done;
                case "shrink":
                    // a glowing potion and a cap with a little propeller
                    Prim.Make(PrimitiveType.Sphere, w, new Vector3(0, 0.12f, 0.05f), Vector3.one * 0.3f, kit.Ghost(Color.white), "Flask");
                    Prim.Make(PrimitiveType.Sphere, w, new Vector3(0, 0.1f, 0.05f), Vector3.one * 0.22f, glow, "Potion");
                    Prim.Make(PrimitiveType.Cylinder, w, new Vector3(0, 0.3f, 0.05f), new Vector3(0.08f, 0.06f, 0.08f), metal, "Neck");
                    Prim.Make(PrimitiveType.Cylinder, r.head, new Vector3(0, 0.27f, 0), new Vector3(0.04f, 0.06f, 0.04f), metal, "Mast");
                    Prim.Make(PrimitiveType.Cube, r.head, new Vector3(0, 0.33f, 0), new Vector3(0.5f, 0.02f, 0.06f), glow, "Propeller");
                    goto done;
                case "thrower":
                    // a satchel of items on the back and one in the hand
                    Prim.Make(PrimitiveType.Cube, r.torso, new Vector3(0, 0.55f, -0.32f), new Vector3(0.5f, 0.42f, 0.24f), kit.Lit(new Color(0.45f, 0.3f, 0.16f), 0.2f), "Satchel");
                    Prim.Make(PrimitiveType.Sphere, r.torso, new Vector3(0.1f, 0.82f, -0.32f), Vector3.one * 0.2f, kit.Lit(gear, 0.5f), "Spare");
                    Prim.Make(PrimitiveType.Sphere, w, new Vector3(0, 0.08f, 0.05f), Vector3.one * 0.3f, kit.Lit(gear, 0.5f), "Item");
                    goto done;
            }
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
            done:
            root.gameObject.SetActive(visible);
            return r;
        }

        /// swaps the primitive body for the class's generated model; it hangs on the torso, so lean and bob still
        /// apply. The primitive parts (arms and class gear included) are hidden, not removed.
        public bool UseModel(GameConfig cfg, GameKit kit, string kind)
        {
            var t = Models.Spawn(cfg, kit, "rider." + kind, torso, new Vector3(0, -0.05f, 0.08f), 1.45f);
            if (!t) return false;
            foreach (Transform c in torso) if (c != t) c.gameObject.SetActive(false);
            return true;
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
