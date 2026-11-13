// Day, night and "realistic" presets: sun, sky, ambient light, fog, lamps, headlights and post-processing.
// Applied by GameBoot at start, by the editor bridge for the Lighting/Shaders cells, and by RuntimeFlags
// when a follow-up flips a flag in a running build.

using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace HarnessGame
{
    public class Look : MonoBehaviour
    {
        public Light sun;
        public Volume baseVolume, realVolume, nightVolume, realNightVolume;
        public ReflectionProbe probe;
        public bool night, realistic;

        public static Look Main { get; private set; }
        void OnEnable() { Main = this; }

        public static Look Build(Transform parent, GameKit kit)
        {
            var go = new GameObject("Look");
            go.transform.SetParent(parent, false);
            var l = go.AddComponent<Look>();
            var sunGo = new GameObject("Sun");
            sunGo.transform.SetParent(go.transform, false);
            l.sun = sunGo.AddComponent<Light>();
            l.sun.type = LightType.Directional;
            l.sun.shadows = LightShadows.Soft;
            l.baseVolume = MakeVolume(go.transform, "BaseVolume", kit.baseProfile, 0);
            l.realVolume = MakeVolume(go.transform, "RealisticVolume", kit.realisticProfile, 1);
            l.nightVolume = MakeVolume(go.transform, "NightVolume", kit.nightProfile, 2);
            l.realNightVolume = MakeVolume(go.transform, "RealisticNightVolume", kit.realNightProfile, 3);
            var pg = new GameObject("Probe");
            pg.transform.SetParent(go.transform, false);
            pg.transform.localPosition = new Vector3(0, 6, 0);
            l.probe = pg.AddComponent<ReflectionProbe>();
            l.probe.mode = ReflectionProbeMode.Realtime;
            l.probe.refreshMode = ReflectionProbeRefreshMode.ViaScripting;
            l.probe.timeSlicingMode = ReflectionProbeTimeSlicingMode.NoTimeSlicing;
            l.probe.size = new Vector3(2000, 400, 2000);
            l.probe.resolution = 128;
            l.probe.enabled = false;
            return l;
        }

        static Volume MakeVolume(Transform parent, string name, VolumeProfile p, int prio)
        {
            var g = new GameObject(name);
            g.transform.SetParent(parent, false);
            var v = g.AddComponent<Volume>();
            v.isGlobal = true; v.priority = prio; v.sharedProfile = p; v.weight = prio == 0 ? 1 : 0;
            return v;
        }

        public void Apply(bool isNight, bool isRealistic, GameConfig cfg = null)
        {
            night = isNight; realistic = isRealistic;
            var kit = GameKit.Load();
            if (night)
            {
                sun.color = new Color(0.55f, 0.65f, 1f);
                sun.intensity = 0.12f;
                sun.transform.rotation = Quaternion.Euler(35, 140, 0);
                RenderSettings.skybox = kit.skyNight;
                RenderSettings.ambientMode = AmbientMode.Trilight;
                RenderSettings.ambientSkyColor = new Color(0.08f, 0.1f, 0.2f);
                RenderSettings.ambientEquatorColor = new Color(0.05f, 0.06f, 0.1f);
                RenderSettings.ambientGroundColor = new Color(0.02f, 0.02f, 0.03f);
                RenderSettings.fog = true; RenderSettings.fogMode = FogMode.ExponentialSquared;
                RenderSettings.fogColor = new Color(0.03f, 0.04f, 0.08f); RenderSettings.fogDensity = 0.004f;
            }
            else
            {
                sun.color = new Color(1f, 0.95f, 0.86f);
                sun.intensity = realistic ? 1.6f : 1.25f;
                sun.transform.rotation = Quaternion.Euler(realistic ? 32 : 48, -35, 0);
                RenderSettings.skybox = kit.skyDay;
                RenderSettings.ambientMode = AmbientMode.Trilight;
                RenderSettings.ambientSkyColor = new Color(0.62f, 0.72f, 0.88f);
                RenderSettings.ambientEquatorColor = new Color(0.5f, 0.55f, 0.55f);
                RenderSettings.ambientGroundColor = new Color(0.25f, 0.3f, 0.22f);
                RenderSettings.fog = realistic; RenderSettings.fogMode = FogMode.ExponentialSquared;
                RenderSettings.fogColor = new Color(0.7f, 0.78f, 0.88f); RenderSettings.fogDensity = 0.0025f;
            }
            sun.shadowStrength = realistic ? 1f : 0.8f;
            realVolume.weight = realistic ? 1 : 0;
            nightVolume.weight = night ? 1 : 0;
            if (realNightVolume) realNightVolume.weight = night && realistic ? 1 : 0;
            foreach (var n in FindObjectsByType<NightOnly>(FindObjectsInactive.Include, FindObjectsSortMode.None))
            {
                var l = n.GetComponent<Light>();
                if (l)
                {
                    // a realistic night: brighter, wider pools of light on a wet road
                    if (n.baseIntensity < 0) { n.baseIntensity = l.intensity; n.baseRange = l.range; }
                    l.enabled = night;
                    l.intensity = n.baseIntensity * (realistic ? 2.2f : 1f);
                    l.range = n.baseRange * (realistic ? 1.35f : 1f);
                }
                if (n.glow) n.SetGlow(night);
            }
            // a realistic road is a little wet: shinier, with real-time reflections of the sky
            foreach (var r in FindObjectsByType<MeshRenderer>(FindObjectsSortMode.None))
            {
                if (r.name != "Road") continue;
                r.sharedMaterial.SetFloat("_Smoothness", realistic ? (night ? 0.88f : 0.72f) : 0.35f);
            }
            probe.enabled = realistic;
            if (realistic) probe.RenderProbe();
            foreach (var cam in FindObjectsByType<Camera>(FindObjectsSortMode.None))
            {
                var data = cam.GetUniversalAdditionalCameraData();
                data.renderPostProcessing = true;
                data.antialiasing = realistic ? AntialiasingMode.SubpixelMorphologicalAntiAliasing : AntialiasingMode.FastApproximateAntialiasing;
                cam.backgroundColor = night ? new Color(0.02f, 0.03f, 0.06f) : new Color(0.5f, 0.7f, 0.9f);
            }
            DynamicGI.UpdateEnvironment();
        }
    }
}
