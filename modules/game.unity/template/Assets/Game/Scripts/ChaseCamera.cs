// Follows the player's kart from behind and above, with a little lag and a shake on hits.

using UnityEngine;

namespace HarnessGame
{
    public class ChaseCamera : MonoBehaviour
    {
        public Transform target;
        public float back = 7.5f, up = 3.2f, lookAhead = 6f;
        float shake;
        Vector3 vel, camUp = Vector3.up;

        public static ChaseCamera Main { get; private set; }
        void OnEnable() { Main = this; }

        public void Shake(float s) { shake = Mathf.Max(shake, s); }

        public void Snap()
        {
            if (!target) return;
            camUp = target.up;
            transform.position = Desired();
            transform.LookAt(target.position + target.forward * lookAhead + camUp * 1.2f, camUp);
        }

        // the camera rides with the kart's own up, so it rolls through loops and twists with it
        Vector3 Desired() => target.position - target.forward * back + camUp * up;

        void LateUpdate()
        {
            if (!target) return;
            camUp = Vector3.Slerp(camUp, target.up, 1f - Mathf.Exp(-Time.deltaTime * 8f)).normalized;
            transform.position = Vector3.SmoothDamp(transform.position, Desired(), ref vel, 0.08f);
            transform.LookAt(target.position + target.forward * lookAhead + camUp * 1.2f, camUp);
            if (shake > 0)
            {
                shake -= Time.deltaTime;
                transform.position += Random.insideUnitSphere * shake * 0.6f;
            }
        }
    }
}
