// Import settings for the generated 3D models (Assets/Game/Resources/Models): meshes stay readable, so the game can
// find a kart's seat from its vertices (Models.Seat), in the editor and in a build alike.

using UnityEditor;

namespace HarnessGame.EditorTools
{
    public class ModelImport : AssetPostprocessor
    {
        public override uint GetVersion() => 1;

        void OnPreprocessModel()
        {
            if (!assetPath.Contains("/Game/Resources/Models/")) return;
            var mi = (ModelImporter)assetImporter;
            mi.isReadable = true;
        }
    }
}
