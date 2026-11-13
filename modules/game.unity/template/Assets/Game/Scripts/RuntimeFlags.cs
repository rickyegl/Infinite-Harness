// Polls StreamingAssets/harness.json every two seconds. Live follow-ups ("make it night", "add music",
// "add crossplay") edit that file next to a finished build, and the running game picks the change up
// without a rebuild or a reload.

using System.Collections;
using UnityEngine;
using UnityEngine.Networking;

namespace HarnessGame
{
    public class RuntimeFlags : MonoBehaviour
    {
        public LiveFlags flags = new LiveFlags { version = -1 };
        public GameConfig cfg;
        string last = "";

        IEnumerator Start()
        {
            while (true)
            {
                string url = Application.streamingAssetsPath + "/harness.json";
                if (!url.Contains("://")) url = "file:///" + url.Replace('\\', '/');
                using (var req = UnityWebRequest.Get(url + "?t=" + Time.realtimeSinceStartup.ToString("0.0")))
                {
                    yield return req.SendWebRequest();
                    if (req.result == UnityWebRequest.Result.Success && req.downloadHandler.text != last)
                    {
                        last = req.downloadHandler.text;
                        try { Apply(JsonUtility.FromJson<LiveFlags>(last)); }
                        catch (System.Exception e) { Debug.LogWarning("harness.json: " + e.Message); }
                    }
                }
                yield return new WaitForSecondsRealtime(2f);
            }
        }

        public void Apply(LiveFlags f)
        {
            if (f == null) return;
            bool lookChanged = f.night != flags.night || f.realistic != flags.realistic || flags.version < 0;
            flags = f;
            if (lookChanged && Look.Main) Look.Main.Apply(f.night || cfg.look.night, f.realistic || cfg.look.realistic, cfg);
            if (MusicPlayer.Main) MusicPlayer.Main.Set(f.music, f.musicFile);
            if (RelayClient.Main) RelayClient.Main.Set(f.relay, f.relayUrl);
        }
    }
}
