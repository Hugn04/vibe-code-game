import * as THREE from 'three';
import { CONFIG } from '@/config';

const SCREEN_CENTER = new THREE.Vector2(0, 0);

/**
 * Bắn tia từ tâm màn hình (tâm ngắm) vào thế giới và đặt dấu mục tiêu
 * nằm áp lên bề mặt trúng tia.
 */
export class AimTarget {
  readonly object = new THREE.Group();
  /** Điểm tâm ngắm đang chỉ vào (chỉ hợp lệ khi hasHit = true). */
  readonly point = new THREE.Vector3();
  hasHit = false;
  distance = 0;

  private readonly raycaster = new THREE.Raycaster();
  private readonly normal = new THREE.Vector3();
  private readonly lookAtPoint = new THREE.Vector3();
  private readonly normalMatrix = new THREE.Matrix3();
  private time = 0;

  constructor() {
    const material = new THREE.MeshBasicMaterial({
      color: CONFIG.aim.color,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.32, 32), material);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.06, 16), material);
    ring.renderOrder = dot.renderOrder = 10;
    this.object.add(ring, dot);
    this.object.visible = false;
    this.raycaster.far = CONFIG.aim.maxDistance;
  }

  update(
    camera: THREE.Camera,
    targets: readonly THREE.Object3D[],
    dt: number,
    active: boolean,
    /** Bỏ qua vật ở gần hơn khoảng này (vd. lá cây giữa camera và nhân vật). */
    minDistance = 0,
  ): void {
    this.hasHit = false;
    this.object.visible = false;
    if (!active) return;

    this.raycaster.setFromCamera(SCREEN_CENTER, camera);
    this.raycaster.near = minDistance;
    const hit = this.raycaster.intersectObjects(targets as THREE.Object3D[], false)[0];
    if (!hit?.face) return;

    this.hasHit = true;
    this.distance = hit.distance;
    this.point.copy(hit.point);

    this.normalMatrix.getNormalMatrix(hit.object.matrixWorld);
    this.normal.copy(hit.face.normal).applyMatrix3(this.normalMatrix).normalize();

    // Đặt dấu nhô khỏi bề mặt một chút để không bị chìm (z-fighting).
    this.object.position.copy(hit.point).addScaledVector(this.normal, 0.02);
    this.lookAtPoint.copy(this.object.position).add(this.normal);
    this.object.lookAt(this.lookAtPoint);

    // Nhịp đập nhẹ, và phóng to theo khoảng cách để luôn nhìn thấy.
    this.time += dt;
    const pulse = 1 + Math.sin(this.time * 6) * 0.12;
    this.object.scale.setScalar(pulse * Math.max(1, hit.distance * 0.06));
    this.object.visible = true;
  }

  dispose(): void {
    this.object.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        (obj.material as THREE.Material).dispose();
      }
    });
  }
}
