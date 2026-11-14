// The harness's handle on the Unity editor.
//
// Open editor: the harness drops a command into <project>/Harness/queue/<id>.json; this class picks it up on
// the editor's update loop, runs it (over several frames when it needs play mode) and writes
// <project>/Harness/done/<id>.json. It also writes Harness/alive.json every second so the harness knows the
// editor is up and not compiling.
//
// Closed editor: Unity.exe -batchmode -projectPath <p> -executeMethod HarnessEditor.HarnessBridge.Batch
//   -harnessOps <ops.json> -harnessOut <result.json>   (play-mode commands need the open editor)
//
// Commands: ping, setup, rebuild, shot, shots, import, play_capture, play_test, build, save.
// The menu items under Harness/ run the same commands by hand.

using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using HarnessGame;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using Debug = UnityEngine.Debug;

namespace HarnessEditor
{
    [Serializable]
    public class Op
    {
        public string id, op;
        // shot / shots
        public string view, file, dir, views;
        public int width = 1280, height = 720;
        // import
        public string src, dest;
        // capture / test / build
        public float seconds = 10f, timeout = 240f, warmup = 0.5f;
        public int fps = 30;
        public string outDir, target, frames;
        public string from = "";   // play_capture: start recording a little before this feature (loop, twist, drop)
        public bool autopilot = true;
        public bool hud = true;    // play_capture: false hides the HUD canvases (clean trailer footage)
        public string rider = "";  // play ops: pick this rider class on the pick screen first (volt, sniper, shrink, thrower)
        // track_export: a TrackSpec as JSON
        public string spec = "";
    }

    [Serializable]
    public class OpList { public Op[] ops; }

    [Serializable]
    public class Done
    {
        public string id, op;
        public bool ok;
        public string error = "", result = "";
        public long ms;
    }

    [InitializeOnLoad]
    public static class HarnessBridge
    {
        public const string Scene = "Assets/Game/Race.unity";
        public const string Kit = "Assets/Game/Kit";
        public const string Config = "Assets/Game/Resources/game.json";
        static string Root => Path.GetFullPath(Path.Combine(Application.dataPath, "..", "Harness"));
        static double nextAlive, nextPoll;
        static IEnumerator running;
        static Op runningOp;
        static Stopwatch runningClock;
        static string runningError;
        static string runningResult;

        static HarnessBridge()
        {
            if (Application.isBatchMode) return;
            EditorApplication.update -= Tick;
            EditorApplication.update += Tick;
            Directory.CreateDirectory(Path.Combine(Root, "queue"));
            Directory.CreateDirectory(Path.Combine(Root, "done"));
        }

        // ------------------------------------------------------------------ open-editor loop

        static void Tick()
        {
            double now = EditorApplication.timeSinceStartup;
            if (now >= nextAlive)
            {
                nextAlive = now + 1;
                try
                {
                    File.WriteAllText(Path.Combine(Root, "alive.json"),
                        $"{{\"pid\":{Process.GetCurrentProcess().Id},\"t\":{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()},\"playing\":{(EditorApplication.isPlaying ? "true" : "false")},\"compiling\":{(EditorApplication.isCompiling ? "true" : "false")},\"busy\":{(running != null ? "true" : "false")}}}");
                }
                catch { /* the harness may be reading it */ }
            }
            if (running != null)
            {
                bool more;
                try { more = running.MoveNext(); }
                catch (Exception e) { runningError = e.ToString(); more = false; }
                if (!more) Finish();
                return;
            }
            if (now < nextPoll || EditorApplication.isCompiling || EditorApplication.isUpdating) return;
            nextPoll = now + 0.2;
            var q = Path.Combine(Root, "queue");
            if (!Directory.Exists(q)) return;
            var next = Directory.GetFiles(q, "*.json").OrderBy(f => f).FirstOrDefault();
            if (next == null) return;
            Op op;
            try { op = JsonUtility.FromJson<Op>(File.ReadAllText(next)); }
            catch (IOException) { return; }   // still being written
            catch (Exception e) { op = new Op { id = Path.GetFileNameWithoutExtension(next), op = "bad" }; runningError = e.Message; }
            File.Delete(next);
            if (string.IsNullOrEmpty(op.id)) op.id = Path.GetFileNameWithoutExtension(next);
            runningOp = op;
            runningClock = Stopwatch.StartNew();
            runningError = runningError ?? null;
            runningResult = "";
            running = Run(op, false);
        }

        static bool doneWritten;

        /// write the done file now. Leaving play mode can trigger a domain reload that drops this op's state,
        /// so play ops call this before they stop playing; Finish then has nothing left to write.
        static void WriteDone()
        {
            if (runningOp == null || doneWritten) return;
            doneWritten = true;
            var d = new Done { id = runningOp.id, op = runningOp.op, ok = runningError == null, error = runningError ?? "", result = runningResult ?? "", ms = runningClock.ElapsedMilliseconds };
            var tmp = Path.Combine(Root, "done", d.id + ".tmp");
            File.WriteAllText(tmp, JsonUtility.ToJson(d));
            var dest = Path.Combine(Root, "done", d.id + ".json");
            if (File.Exists(dest)) File.Delete(dest);
            File.Move(tmp, dest);
            if (runningError != null) Debug.LogWarning($"[harness] {d.op} failed: {runningError}");
        }

        static void Finish()
        {
            WriteDone();
            running = null; runningOp = null; runningError = null; doneWritten = false;
        }

        // ------------------------------------------------------------------ batch mode

        public static void Batch()
        {
            var args = Environment.GetCommandLineArgs();
            string Arg(string k) { int i = Array.IndexOf(args, k); return i >= 0 && i + 1 < args.Length ? args[i + 1] : null; }
            var opsFile = Arg("-harnessOps");
            var outFile = Arg("-harnessOut");
            var results = new List<Done>();
            int code = 0;
            try
            {
                var list = JsonUtility.FromJson<OpList>(File.ReadAllText(opsFile));
                foreach (var op in list.ops)
                {
                    var sw = Stopwatch.StartNew();
                    runningResult = ""; runningError = null;
                    try
                    {
                        var it = Run(op, true);
                        while (it.MoveNext()) { }
                    }
                    catch (Exception e) { runningError = e.ToString(); }
                    results.Add(new Done { id = op.id, op = op.op, ok = runningError == null, error = runningError ?? "", result = runningResult ?? "", ms = sw.ElapsedMilliseconds });
                    if (runningError != null) { code = 1; break; }
                }
            }
            catch (Exception e) { results.Add(new Done { op = "batch", ok = false, error = e.ToString() }); code = 1; }
            if (outFile != null) File.WriteAllText(outFile, "{\"results\":[" + string.Join(",", results.Select(r => JsonUtility.ToJson(r))) + "]}");
            EditorApplication.Exit(code);
        }

        // ------------------------------------------------------------------ commands

        static IEnumerator Run(Op op, bool batch)
        {
            switch (op.op)
            {
                case "ping": runningResult = $"{{\"unity\":\"{Application.unityVersion}\",\"webgl\":{(BuildPipeline.IsBuildTargetSupported(BuildTargetGroup.WebGL, BuildTarget.WebGL) ? "true" : "false")}}}"; break;
                case "setup": Setup(); break;
                case "rebuild": Rebuild(); break;
                case "info": Rebuild(); runningResult = Info(); break;
                case "track_export": runningResult = TrackExport(op.spec, op.file); break;
                case "shot": Rebuild(); Shot(op.view, op.file, op.width, op.height); runningResult = Q(op.file); break;
                case "shots":
                {
                    Rebuild();
                    var files = new List<string>();
                    bool warm = false;
                    foreach (var v in (op.views ?? "overview").Split(',').Select(s => s.Trim()).Where(s => s.Length > 0))
                    {
                        // the first render after a rebuild can come out empty; render one to throw away
                        if (!warm) { Shot(v, Path.Combine(op.dir, v + ".jpg"), 64, 36); warm = true; }
                        var f = Path.Combine(op.dir, v + ".jpg");
                        Shot(v, f, op.width, op.height);
                        files.Add(Q(f));
                    }
                    runningResult = "[" + string.Join(",", files) + "]";
                    break;
                }
                case "import": runningResult = Q(Import(op.src, op.dest)); break;
                case "play_capture":
                    if (batch) throw new Exception("play_capture needs the open editor");
                    { var it = PlayCapture(op); while (it.MoveNext()) yield return null; }
                    break;
                case "play_test":
                    if (batch) throw new Exception("play_test needs the open editor");
                    { var it = PlayTest(op); while (it.MoveNext()) yield return null; }
                    break;
                case "build": runningResult = BuildPlayer(op.target, op.outDir); break;
                case "save": AssetDatabase.SaveAssets(); break;
                case "bad": break;
                default: throw new Exception("unknown command " + op.op);
            }
            yield break;
        }

        static string Q(string s) => "\"" + (s ?? "").Replace("\\", "/").Replace("\"", "'") + "\"";

        // ------------------------------------------------------------------ setup: kit assets, scene, settings

        [MenuItem("Harness/Setup project")]
        public static void Setup()
        {
            Directory.CreateDirectory(Kit);
            Directory.CreateDirectory("Assets/Game/Resources");
            Directory.CreateDirectory("Assets/StreamingAssets");
            AssetDatabase.Refresh();
            var kit = AssetDatabase.LoadAssetAtPath<GameKit>("Assets/Game/Resources/GameKit.asset");
            if (kit == null)
            {
                kit = ScriptableObject.CreateInstance<GameKit>();
                AssetDatabase.CreateAsset(kit, "Assets/Game/Resources/GameKit.asset");
            }
            var lit = Shader.Find("Universal Render Pipeline/Lit");
            var unlit = Shader.Find("Universal Render Pipeline/Unlit");
            kit.lit = Mat("Lit", lit, m => { m.SetColor("_BaseColor", Color.white); });
            kit.emissive = Mat("Emissive", lit, m =>
            {
                m.EnableKeyword("_EMISSION");
                m.SetColor("_EmissionColor", Color.white);
                m.globalIlluminationFlags = MaterialGlobalIlluminationFlags.None;
            });
            kit.unlit = Mat("Unlit", unlit, m => m.SetColor("_BaseColor", Color.white));
            kit.ghost = Mat("Ghost", lit, m =>
            {
                m.SetFloat("_Surface", 1); m.SetFloat("_Blend", 0);
                m.SetOverrideTag("RenderType", "Transparent");
                m.SetFloat("_SrcBlend", (float)BlendMode.SrcAlpha); m.SetFloat("_DstBlend", (float)BlendMode.OneMinusSrcAlpha);
                m.SetFloat("_SrcBlendAlpha", (float)BlendMode.One); m.SetFloat("_DstBlendAlpha", (float)BlendMode.OneMinusSrcAlpha);
                m.SetFloat("_ZWrite", 0);
                m.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");
                m.renderQueue = (int)RenderQueue.Transparent;
                m.SetColor("_BaseColor", new Color(0.7f, 0.9f, 1f, 0.45f));
            });
            var particlePath = Kit + "/Particle.mat";
            if (!File.Exists(particlePath))
            {
                var src = "Packages/com.unity.render-pipelines.universal/Runtime/Materials/ParticlesUnlit.mat";
                if (!AssetDatabase.CopyAsset(src, particlePath))
                    Mat("Particle", Shader.Find("Universal Render Pipeline/Particles/Unlit"), m => { });
            }
            kit.particle = AssetDatabase.LoadAssetAtPath<Material>(particlePath);
            var sky = Shader.Find("Skybox/Procedural");
            kit.skyDay = Mat("SkyDay", sky, m =>
            {
                m.SetFloat("_SunSize", 0.04f); m.SetFloat("_AtmosphereThickness", 0.9f); m.SetFloat("_Exposure", 1.25f);
                m.SetColor("_SkyTint", new Color(0.45f, 0.6f, 0.85f)); m.SetColor("_GroundColor", new Color(0.35f, 0.4f, 0.32f));
            });
            kit.skyNight = Mat("SkyNight", sky, m =>
            {
                m.SetFloat("_SunSize", 0.02f); m.SetFloat("_AtmosphereThickness", 0.35f); m.SetFloat("_Exposure", 0.12f);
                m.SetColor("_SkyTint", new Color(0.1f, 0.14f, 0.35f)); m.SetColor("_GroundColor", new Color(0.02f, 0.02f, 0.04f));
            });
            kit.baseProfile = Profile("Base", p =>
            {
                var t = p.Add<Tonemapping>(true); t.mode.Override(TonemappingMode.Neutral);
                var b = p.Add<Bloom>(true); b.intensity.Override(0.25f); b.threshold.Override(1.1f);
                var c = p.Add<ColorAdjustments>(true); c.saturation.Override(12f); c.contrast.Override(6f);
            });
            kit.realisticProfile = Profile("Realistic", p =>
            {
                var t = p.Add<Tonemapping>(true); t.mode.Override(TonemappingMode.ACES);
                var b = p.Add<Bloom>(true); b.intensity.Override(0.8f); b.threshold.Override(0.95f); b.scatter.Override(0.7f);
                var c = p.Add<ColorAdjustments>(true); c.postExposure.Override(0.35f); c.contrast.Override(18f); c.saturation.Override(4f);
                var v = p.Add<Vignette>(true); v.intensity.Override(0.28f); v.smoothness.Override(0.45f);
                var w = p.Add<WhiteBalance>(true); w.temperature.Override(6f);
                var ca = p.Add<ChromaticAberration>(true); ca.intensity.Override(0.06f);
                var lg = p.Add<LiftGammaGain>(true); lg.gain.Override(new Vector4(1f, 0.98f, 0.95f, 0.05f));
            });
            kit.nightProfile = Profile("Night", p =>
            {
                var b = p.Add<Bloom>(true); b.intensity.Override(1.6f); b.threshold.Override(0.8f); b.scatter.Override(0.75f);
                var c = p.Add<ColorAdjustments>(true); c.postExposure.Override(0.5f); c.colorFilter.Override(new Color(0.8f, 0.88f, 1f));
                var v = p.Add<Vignette>(true); v.intensity.Override(0.38f);
            });
            // night and realistic together: a wet night. ACES alone would only darken the night look
            kit.realNightProfile = Profile("RealisticNight", p =>
            {
                var b = p.Add<Bloom>(true); b.intensity.Override(2.2f); b.threshold.Override(0.75f); b.scatter.Override(0.8f);
                var c = p.Add<ColorAdjustments>(true); c.postExposure.Override(1.1f); c.contrast.Override(22f); c.saturation.Override(18f); c.colorFilter.Override(new Color(0.85f, 0.9f, 1f));
                var v = p.Add<Vignette>(true); v.intensity.Override(0.34f); v.smoothness.Override(0.5f);
            });
            EditorUtility.SetDirty(kit);

            if (!File.Exists(Config)) File.WriteAllText(Config, JsonUtility.ToJson(new GameConfig(), true));
            var flags = "Assets/StreamingAssets/harness.json";
            if (!File.Exists(flags)) File.WriteAllText(flags, JsonUtility.ToJson(new LiveFlags()));
            AssetDatabase.ImportAsset(Config);
            AssetDatabase.ImportAsset(flags);

            if (!File.Exists(Scene))
            {
                var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
                new GameObject("Game").AddComponent<GameBoot>();
                EditorSceneManager.SaveScene(scene, Scene);
            }
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(Scene, true) };

            PlayerSettings.companyName = "Infinite Harness";
            PlayerSettings.productName = "Brawl Karts";
            PlayerSettings.runInBackground = true;
            PlayerSettings.defaultScreenWidth = 1280; PlayerSettings.defaultScreenHeight = 720;
            PlayerSettings.fullScreenMode = FullScreenMode.Windowed;
            PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Disabled;
            PlayerSettings.WebGL.decompressionFallback = false;
            PlayerSettings.WebGL.dataCaching = false;
            PlayerSettings.WebGL.exceptionSupport = WebGLExceptionSupport.ExplicitlyThrownExceptionsOnly;
            PlayerSettings.SplashScreen.show = false;
            EditorSettings.enterPlayModeOptionsEnabled = true;
            EditorSettings.enterPlayModeOptions = EnterPlayModeOptions.DisableDomainReload | EnterPlayModeOptions.DisableSceneReload;
            UseHighQualityEverywhere();
            AssetDatabase.SaveAssets();
            Debug.Log("[harness] setup done");
        }

        static Material Mat(string name, Shader shader, Action<Material> init)
        {
            var path = $"{Kit}/{name}.mat";
            var m = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (m == null) { m = new Material(shader); AssetDatabase.CreateAsset(m, path); }
            else m.shader = shader;
            init(m);
            EditorUtility.SetDirty(m);
            return m;
        }

        static VolumeProfile Profile(string name, Action<VolumeProfile> init)
        {
            var path = $"{Kit}/{name}Profile.asset";
            if (File.Exists(path)) AssetDatabase.DeleteAsset(path);
            var p = ScriptableObject.CreateInstance<VolumeProfile>();
            AssetDatabase.CreateAsset(p, path);
            init(p);
            foreach (var c in p.components) { c.hideFlags = HideFlags.HideInInspector | HideFlags.HideInHierarchy; AssetDatabase.AddObjectToAsset(c, p); }
            EditorUtility.SetDirty(p);
            return p;
        }

        /// every platform (WebGL included) uses the highest quality level, so the build looks like the editor
        static void UseHighQualityEverywhere()
        {
            try
            {
                int best = QualitySettings.names.Length - 1;
                for (int i = 0; i < QualitySettings.names.Length; i++) if (QualitySettings.names[i].Contains("PC") || QualitySettings.names[i].Contains("High")) best = i;
                var asset = AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/QualitySettings.asset").FirstOrDefault();
                if (asset == null) return;
                var so = new SerializedObject(asset);
                var per = so.FindProperty("m_PerPlatformDefaultQuality");
                for (int i = 0; per != null && i < per.arraySize; i++) per.GetArrayElementAtIndex(i).FindPropertyRelative("second").intValue = best;
                so.ApplyModifiedPropertiesWithoutUndo();
                QualitySettings.SetQualityLevel(best, true);
            }
            catch (Exception e) { Debug.LogWarning("[harness] quality: " + e.Message); }
        }

        // ------------------------------------------------------------------ rebuild and screenshots

        [MenuItem("Harness/Rebuild from game.json")]
        public static void Rebuild()
        {
            AssetDatabase.ImportAsset(Config, ImportAssetOptions.ForceUpdate);
            if (EditorApplication.isPlaying) return;
            if (EditorSceneManager.GetActiveScene().path != Scene) EditorSceneManager.OpenScene(Scene, OpenSceneMode.Single);
            // effects left behind by an older shot (they are loose scene objects)
            foreach (var go in EditorSceneManager.GetActiveScene().GetRootGameObjects())
                if (go.name == "HitFx" || go.name == "Beam" || go.name == "Item") UnityEngine.Object.DestroyImmediate(go);
            var boot = UnityEngine.Object.FindFirstObjectByType<GameBoot>();
            if (!boot) boot = new GameObject("Game").AddComponent<GameBoot>();
            boot.Rebuild(GameConfig.Load(), false);
            var gen = boot.transform.Find("Generated");
            if (gen) foreach (var r in gen.GetComponentsInChildren<Transform>(true)) r.gameObject.hideFlags |= HideFlags.DontSaveInEditor;
        }

        /// the centre line for another engine (the Roblox place): the same TrackMath.Generate, sampled every ~3 m,
        /// in metres and Unity axes; the reader converts. Does not touch the scene or game.json.
        static string TrackExport(string specJson, string file)
        {
            var spec = JsonUtility.FromJson<TrackSpec>(string.IsNullOrEmpty(specJson) ? "{}" : specJson);
            var s = TrackMath.Generate(spec);
            var inv = System.Globalization.CultureInfo.InvariantCulture;
            int n = s.points.Length, step = 3;
            var keep = new List<int>();
            for (int i = 0; i < n; i += step) keep.Add(i);
            var map = new Dictionary<int, int>();
            for (int k = 0; k < keep.Count; k++) map[keep[k]] = k;
            int Near(int i) { int k = Mathf.Clamp(Mathf.RoundToInt(i / (float)step), 0, keep.Count - 1); return k; }
            string F(float v) => v.ToString("0.##", inv);
            var sb = new System.Text.StringBuilder();
            sb.Append("{\"width\":").Append(F(spec.width)).Append(",\"points\":[");
            for (int k = 0; k < keep.Count; k++) { var p = s.points[keep[k]]; if (k > 0) sb.Append(','); sb.Append(F(p.x)).Append(',').Append(F(p.y)).Append(',').Append(F(p.z)); }
            sb.Append("],\"ups\":[");
            for (int k = 0; k < keep.Count; k++) { var u = s.ups[keep[k]]; if (k > 0) sb.Append(','); sb.Append(F(u.x)).Append(',').Append(F(u.y)).Append(',').Append(F(u.z)); }
            sb.Append("],\"hover\":[");
            for (int k = 0; k < keep.Count; k++) { if (k > 0) sb.Append(','); sb.Append(F(s.hover != null && s.hover.Length == n ? s.hover[keep[k]] : 0f)); }
            sb.Append("],\"features\":[");
            for (int f = 0; f < s.features.Length; f++)
            {
                var ft = s.features[f];
                if (f > 0) sb.Append(',');
                sb.Append("{\"kind\":").Append(Q(ft.kind.ToString().ToLowerInvariant())).Append(",\"from\":").Append(Near(ft.from)).Append(",\"to\":").Append(Near(ft.to)).Append('}');
            }
            sb.Append("]}");
            Directory.CreateDirectory(Path.GetDirectoryName(file));
            File.WriteAllText(file, sb.ToString());
            float len = 0;
            for (int i = 0; i < n; i++) len += Vector3.Distance(s.points[i], s.points[(i + 1) % n]);
            return "{\"samples\":" + keep.Count + ",\"metres\":" + len.ToString("0", inv) + ",\"features\":[" + string.Join(",", s.features.Select(f => Q(f.kind.ToString().ToLowerInvariant()))) + "]}";
        }

        /// what the scene holds now: lap length, features, hover share, karts (for the cells' step lines)
        static string Info()
        {
            var boot = UnityEngine.Object.FindFirstObjectByType<GameBoot>();
            var race = boot ? boot.race : null;
            var path = race ? race.path : null;
            var inv = System.Globalization.CultureInfo.InvariantCulture;
            if (!path || path.points.Length < 2) return "{\"track\":false}";
            int hov = 0;
            foreach (var h in path.hover) if (h > 0.5f) hov++;
            var feats = string.Join(",", path.features.Select(f => Q(f.kind.ToString().ToLowerInvariant())));
            float minY = path.points.Min(p => p.y), maxY = path.points.Max(p => p.y);
            return "{\"track\":true,\"metres\":" + path.Length.ToString("0", inv)
                + ",\"features\":[" + feats + "]"
                + ",\"hoverShare\":" + (path.hover.Length > 0 ? (float)hov / path.hover.Length : 0f).ToString("0.00", inv)
                + ",\"climb\":" + (maxY - minY).ToString("0.0", inv)
                + ",\"karts\":" + race.karts.Count + "}";
        }

        /// named camera positions for screenshots, chosen from what exists in the scene
        public static void Shot(string view, string file, int w, int h)
        {
            var boot = UnityEngine.Object.FindFirstObjectByType<GameBoot>();
            if (!boot || !boot.cam) throw new Exception("no game in the scene (run rebuild)");
            var cam = boot.cam;
            var race = boot.race;
            var path = race ? race.path : null;
            var t = cam.transform;
            var keepPos = t.position; var keepRot = t.rotation;
            // effects a view adds (hit rings, beams, a thrown item) are loose scene objects: remove them after the render
            var before = new HashSet<GameObject>(EditorSceneManager.GetActiveScene().GetRootGameObjects());
            Kart Pick(int i) => race && race.karts.Count > 0 ? race.karts[Mathf.Clamp(i, 0, race.karts.Count - 1)] : null;
            switch (view)
            {
                case "overview":
                    if (path) GameBoot.Overview(cam, path);
                    break;
                case "grid":
                    if (path) { var p = path.PoseAt(-34f, path.HalfWidth * 0.2f); t.position = p.position + Vector3.up * 6f; t.LookAt(path.PoseAt(-6f, 0).position + Vector3.up); }
                    break;
                case "start":
                    if (path) { var p = path.PoseAt(22f, -path.HalfWidth * 0.6f); t.position = p.position + Vector3.up * 3.5f; t.LookAt(path.PoseAt(0, 0).position + Vector3.up * 3f); }
                    break;
                case "corner":
                    if (path)
                    {
                        float bestD = 0, bestC = 0;
                        float bestSigned = 0;
                        for (float d = 0; d < path.Length; d += 10f)
                        {
                            if (path.InFeature(d, 20f)) continue;   // a corner, not a loop
                            path.Sample(d, out _, out var a, out var ra); path.Sample(d + 20f, out _, out var b, out _);
                            float c = Vector3.Dot(b - a, ra);
                            if (Mathf.Abs(c) > bestC) { bestC = Mathf.Abs(c); bestD = d; bestSigned = c; }
                        }
                        float side = bestSigned > 0 ? -1 : 1;   // stand on the outside
                        var p = path.PoseAt(bestD + 10f, side * (path.HalfWidth + 10f));
                        t.position = p.position + Vector3.up * 4f;
                        t.LookAt(path.PoseAt(bestD + 6f, 0).position);
                    }
                    break;
                case "kart":
                case "rider":
                {
                    var k = Pick(0);
                    if (k)
                    {
                        float dist = view == "rider" ? 3.2f : 5f;
                        t.position = k.transform.position + k.transform.rotation * new Vector3(2.4f, 1.9f, dist);
                        t.LookAt(k.transform.position + Vector3.up * (view == "rider" ? 1.5f : 0.8f));
                    }
                    break;
                }
                case "board":
                {
                    // the first track-side board, from in front of its face (a Unity quad shows its front to -forward)
                    var face = GameObject.Find("Boards/Board0/Face") ?? GameObject.Find("Face");
                    if (face)
                    {
                        var f = face.transform;
                        t.position = f.position - f.forward * 11f + Vector3.up * 1.2f - f.right * 3f;
                        t.LookAt(f.position);
                    }
                    break;
                }
                case "pack":
                {
                    var k = Pick(1);
                    if (k) { t.position = k.transform.position + k.transform.rotation * new Vector3(-6f, 3.5f, 12f); t.LookAt(k.transform.position + k.transform.forward * -6f); }
                    break;
                }
                case "combat":
                {
                    var a = Pick(0); var b = Pick(1);
                    if (a && b)
                    {
                        // bring two karts close, freeze the first rider's class attack landing on the second
                        var kit = GameKit.Load();
                        var col = Abilities.ColorOf(a);
                        bool far = a.kind == "sniper" || a.kind == "thrower";
                        b.dist = a.dist + (far ? 9f : 1.2f); b.lateral = a.lateral + (far ? 1.2f : 2.4f); b.Place(path);
                        if (a.rider) a.rider.Freeze(0.2f);
                        if (a.kind == "volt") a.dash = 0.4f;
                        if (a.kind == "shrink") { a.small = 2f; a.size = Abilities.SmallScale; }
                        a.Place(path);
                        b.stun = 0.5f; b.Place(path);
                        var at = b.transform.position + b.transform.up * 1.1f;
                        var from = a.transform.position + a.transform.up * 1.3f;
                        if (a.kind == "volt") Effects.Bolt(kit, from, at, col);
                        else if (a.kind == "sniper") Effects.Beam(kit, from + a.transform.forward * 0.9f, at, col);
                        else if (a.kind == "thrower") Prim.Make(PrimitiveType.Sphere, null, Vector3.Lerp(from, at, 0.75f), Vector3.one * 0.55f, kit.Lit(col, 0.6f), "Item");
                        Effects.Hit(kit, at, col, true);
                        if (far) at = Vector3.Lerp(from, at, 0.5f);
                        t.position = a.transform.position + a.transform.rotation * new Vector3(1.3f, 2.4f, 5.5f);
                        t.LookAt(at - Vector3.up * 0.4f);
                    }
                    break;
                }
                case "loop":
                case "twist":
                case "drop":
                {
                    // from the side, outside the circuit, framing the whole feature
                    var kind = view == "loop" ? FeatureKind.Loop : view == "twist" ? FeatureKind.Twist : FeatureKind.Drop;
                    TrackFeature? f = null;
                    if (path) foreach (var x in path.features) if (x.kind == kind) { f = x; break; }
                    if (f == null) { if (path) GameBoot.Overview(cam, path); break; }
                    Vector3 centre = Vector3.zero, all = Vector3.zero; float size = 0;
                    for (int i = f.Value.from; i < f.Value.to; i++) centre += path.points[i];
                    centre /= Mathf.Max(1, f.Value.to - f.Value.from);
                    foreach (var p in path.points) all += p;
                    all /= path.points.Length;
                    for (int i = f.Value.from; i < f.Value.to; i++) size = Mathf.Max(size, Vector3.Distance(path.points[i], centre));
                    path.Sample(path.DistOfIndex(f.Value.from), out _, out var tan, out var r);
                    var flatR = new Vector3(r.x, 0, r.z).normalized;
                    float out_ = Vector3.Dot(flatR, centre - all) >= 0 ? 1 : -1;
                    var dir = (flatR * out_ - new Vector3(tan.x, 0, tan.z).normalized * 0.35f).normalized;
                    t.position = centre + dir * (size * 2.1f + 12f) + Vector3.up * (size * 0.45f + 4f);
                    t.LookAt(centre + Vector3.up * size * 0.1f);
                    break;
                }
                case "loopride":
                case "twistride":
                case "chase":
                case "hud":
                default:
                {
                    var k = race ? race.player : null;
                    if (k && path && (view == "loopride" || view == "twistride"))
                    {
                        // the player's kart in the middle of the feature (upside down at the top of the loop)
                        float m = path.FeatureMid(view == "loopride" ? FeatureKind.Loop : FeatureKind.Twist);
                        if (m >= 0) { k.dist = m - 4f; k.lateral = 0; k.speed = 20f; k.Place(path); }
                    }
                    if (k) { t.position = k.transform.position - k.transform.forward * 7.5f + k.transform.up * 3.2f; t.LookAt(k.transform.position + k.transform.forward * 6f + k.transform.up * 1.2f, k.transform.up); }
                    else if (path) GameBoot.Overview(cam, path);
                    break;
                }
            }
            if (race) foreach (var hud in UnityEngine.Object.FindObjectsByType<Hud>(FindObjectsSortMode.None)) hud.Refresh();
            Canvas.ForceUpdateCanvases();
            Shots.Save(cam, file, w, h);
            t.SetPositionAndRotation(keepPos, keepRot);
            if (!EditorApplication.isPlaying)
                foreach (var go in EditorSceneManager.GetActiveScene().GetRootGameObjects())
                    if (!before.Contains(go)) UnityEngine.Object.DestroyImmediate(go);
        }

        [MenuItem("Harness/Screenshot (overview)")]
        static void MenuShot() { Rebuild(); Shot("overview", Path.GetFullPath("Harness/shot.jpg"), 1280, 720); Debug.Log("[harness] Harness/shot.jpg"); }

        // ------------------------------------------------------------------ assets

        public static string Import(string src, string dest)
        {
            if (!File.Exists(src)) throw new Exception("no file " + src);
            dest = string.IsNullOrEmpty(dest) ? "Assets/Game/Resources/Imported/" + Path.GetFileName(src) : dest;
            Directory.CreateDirectory(Path.GetDirectoryName(dest));
            File.Copy(src, dest, true);
            AssetDatabase.ImportAsset(dest, ImportAssetOptions.ForceUpdate);
            if (AssetImporter.GetAtPath(dest) is TextureImporter ti)
            {
                ti.textureType = TextureImporterType.Default;
                ti.mipmapEnabled = true;
                ti.maxTextureSize = 1024;
                ti.SaveAndReimport();
            }
            return dest;
        }

        // ------------------------------------------------------------------ play mode

        static IEnumerator EnterPlay(Op op)
        {
            Rebuild();
            if (!EditorApplication.isPlaying) EditorApplication.isPlaying = true;
            var sw = Stopwatch.StartNew();
            while (!EditorApplication.isPlaying || !GameBoot.Main || !GameBoot.Main.race || GameBoot.Main.race.karts.Count == 0)
            {
                if (sw.Elapsed.TotalSeconds > 60) throw new Exception("play mode did not start");
                yield return null;
            }
            if (!string.IsNullOrEmpty(op.rider))
            {
                var pick = UnityEngine.Object.FindFirstObjectByType<ClassSelect>();
                if (!pick) throw new Exception("no rider pick on screen (riders or combat not built yet)");
                pick.Choose(op.rider);   // the same path as a key or click: rebuilds the race with that rider
            }
            GameBoot.Main.race.cfg.autopilot = op.autopilot;
        }

        static IEnumerator ExitPlay()
        {
            Time.timeScale = 1; Time.captureFramerate = 0;
            if (EditorApplication.isPlaying) EditorApplication.isPlaying = false;
            var sw = Stopwatch.StartNew();
            while (EditorApplication.isPlaying && sw.Elapsed.TotalSeconds < 30) yield return null;
        }

        /// PlayAndCapture: play the race on autopilot and record seconds of the chase camera to JPG frames
        static IEnumerator PlayCapture(Op op)
        {
            var dir = op.outDir;
            if (Directory.Exists(dir)) foreach (var f in Directory.GetFiles(dir, "frame_*.jpg")) File.Delete(f);
            var it = EnterPlay(op);
            while (it.MoveNext()) yield return null;
            var cap = new GameObject("HarnessCapture").AddComponent<Capture>();
            cap.outDir = dir; cap.fps = op.fps; cap.seconds = op.seconds; cap.width = op.width; cap.height = op.height; cap.warmup = op.warmup; cap.hud = op.hud;
            if (!string.IsNullOrEmpty(op.from) && Enum.TryParse(op.from, true, out FeatureKind kind) && GameBoot.Main.race.path)
            {
                float m = GameBoot.Main.race.path.FeatureMid(kind);
                if (m > 0) cap.startDist = Mathf.Max(0f, m - 75f);
            }
            var sw = Stopwatch.StartNew();
            while (!cap.done)
            {
                if (sw.Elapsed.TotalSeconds > op.timeout) { runningError = "capture timed out"; break; }
                if (!EditorApplication.isPlaying) { runningError = "play mode stopped"; break; }
                yield return null;
            }
            var race = GameBoot.Main ? GameBoot.Main.race : null;
            runningResult = $"{{\"frames\":{(cap ? cap.frame : 0)},\"fps\":{op.fps},\"hits\":{(race ? race.feed.Count : 0)}}}";
            WriteDone();
            var ex = ExitPlay();
            while (ex.MoveNext()) yield return null;
        }

        /// race to the finish on autopilot at a fixed 20 steps per game second, and report laps, hits and places
        static IEnumerator PlayTest(Op op)
        {
            var it = EnterPlay(op);
            while (it.MoveNext()) yield return null;
            var race = GameBoot.Main.race;
            race.cfg.autopilot = true;
            int hits = 0;
            race.onHit += (a, b) => hits++;
            Time.captureFramerate = 20;
            var sw = Stopwatch.StartNew();
            bool shotFinish = false;
            while (EditorApplication.isPlaying)
            {
                if (sw.Elapsed.TotalSeconds > op.timeout) { runningError = "race did not finish in time"; break; }
                if (race.phase == RaceManager.Phase.Finished)
                {
                    if (!shotFinish && !string.IsNullOrEmpty(op.file))
                    {
                        // let the finish banner show for a moment before the picture
                        for (int i = 0; i < 10; i++) yield return null;
                        Shots.Save(Camera.main, op.file, op.width, op.height);
                        shotFinish = true;
                    }
                    break;
                }
                yield return null;
            }
            var L = race.path.Length;
            var rows = race.karts.OrderBy(k => k.place).Select(k =>
                $"{{\"name\":{Q(k.kartName)},\"place\":{k.place},\"laps\":{Mathf.Min(race.cfg.laps, Mathf.FloorToInt(k.dist / L))},\"time\":{(k.finishTime >= 0 ? k.finishTime.ToString("0.00", System.Globalization.CultureInfo.InvariantCulture) : "null")},\"player\":{(k.isPlayer ? "true" : "false")},\"class\":{Q(k.kind)}}}");
            var ab = race.abilities;
            var attacks = string.Join(",", Abilities.Kinds.Select(kd =>
                $"{Q(kd)}:{{\"riders\":{race.karts.Count(k => k.kind == kd)},\"uses\":{(ab != null && ab.uses.TryGetValue(kd, out var u) ? u : 0)},\"hits\":{(ab != null && ab.hits.TryGetValue(kd, out var h) ? h : 0)}}}"));
            var player = race.player;
            runningResult = $"{{\"finished\":{(race.phase == RaceManager.Phase.Finished ? "true" : "false")},\"raceSeconds\":{race.clock.ToString("0.0", System.Globalization.CultureInfo.InvariantCulture)},\"hits\":{hits},\"attacks\":{{{attacks}}},\"playerClass\":{Q(player ? player.kind : "")},\"trackMetres\":{Mathf.RoundToInt(L)},\"karts\":[{string.Join(",", rows)}]}}";
            WriteDone();
            var ex = ExitPlay();
            while (ex.MoveNext()) yield return null;
        }

        // ------------------------------------------------------------------ builds

        [MenuItem("Harness/Build WebGL")]
        static void MenuBuildWebGL() => Debug.Log(BuildPlayer("webgl", Path.GetFullPath("Builds/webgl")));

        public static string BuildPlayer(string target, string outDir)
        {
            if (EditorApplication.isPlaying) throw new Exception("stop play mode before building");
            bool web = target != "windows" && BuildPipeline.IsBuildTargetSupported(BuildTargetGroup.WebGL, BuildTarget.WebGL);
            if (target == "webgl" && !web) throw new Exception("the WebGL module is not installed for this editor");
            var bt = web ? BuildTarget.WebGL : BuildTarget.StandaloneWindows64;
            if (web)
            {
                // served by the bridge as plain files: no Content-Encoding headers, so no compression
                PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Disabled;
                PlayerSettings.WebGL.decompressionFallback = false;
            }
            Directory.CreateDirectory(outDir);
            var opts = new BuildPlayerOptions
            {
                scenes = new[] { Scene },
                target = bt,
                targetGroup = web ? BuildTargetGroup.WebGL : BuildTargetGroup.Standalone,
                locationPathName = web ? outDir : Path.Combine(outDir, "BrawlKarts.exe"),
                options = BuildOptions.None,
            };
            var sw = Stopwatch.StartNew();
            var report = BuildPipeline.BuildPlayer(opts);
            var s = report.summary;
            if (s.result != BuildResult.Succeeded)
            {
                var errs = report.steps.SelectMany(st => st.messages).Where(m => m.type == LogType.Error || m.type == LogType.Exception).Select(m => m.content).Take(5);
                throw new Exception($"build {s.result}: {string.Join(" | ", errs)}");
            }
            return $"{{\"target\":{Q(web ? "webgl" : "windows")},\"seconds\":{sw.Elapsed.TotalSeconds.ToString("0.0", System.Globalization.CultureInfo.InvariantCulture)},\"bytes\":{s.totalSize},\"out\":{Q(outDir)}}}";
        }
    }
}
