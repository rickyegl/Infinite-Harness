// Streams a looping music track from StreamingAssets once the "music" flag is on.
// Browsers only start audio after the player has clicked or pressed a key, which the page asks for.

using System.Collections;
using UnityEngine;
using UnityEngine.Networking;

namespace HarnessGame
{
    public class MusicPlayer : MonoBehaviour
    {
        AudioSource src;
        string loaded = "";
        public static MusicPlayer Main { get; private set; }
        void OnEnable() { Main = this; }

        void Awake()
        {
            src = gameObject.AddComponent<AudioSource>();
            src.loop = true; src.volume = 0.55f; src.playOnAwake = false; src.spatialBlend = 0;
        }

        public void Set(bool on, string file)
        {
            if (!on || string.IsNullOrEmpty(file)) { if (src.isPlaying) src.Stop(); return; }
            if (file == loaded) { if (!src.isPlaying && src.clip) src.Play(); return; }
            loaded = file;
            StartCoroutine(Load(file));
        }

        IEnumerator Load(string file)
        {
            string url = Application.streamingAssetsPath + "/" + file;
            if (!url.Contains("://")) url = "file:///" + url.Replace('\\', '/');
            var type = file.EndsWith(".ogg") ? AudioType.OGGVORBIS : file.EndsWith(".mp3") ? AudioType.MPEG : AudioType.WAV;
            using (var req = UnityWebRequestMultimedia.GetAudioClip(url, type))
            {
                yield return req.SendWebRequest();
                if (req.result != UnityWebRequest.Result.Success) { Debug.LogWarning("music: " + req.error); yield break; }
                src.clip = DownloadHandlerAudioClip.GetContent(req);
                src.Play();
                Debug.Log("[harness] music playing " + file);
            }
        }
    }
}
