import * as THREE from 'three';
import { CONFIG } from '@/config';
import { clamp, damp } from '@/utils/math';

/** Camera góc nhìn thứ 3 quay quanh mục tiêu (yaw/pitch/khoảng cách). */
export class ThirdPersonCamera {
  readonly camera: THREE.PerspectiveCamera;
  yaw = 0;
  pitch: number = CONFIG.camera.pitch;
  distance: number = CONFIG.camera.distance;

  private readonly focus = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  private focusHeight: number = CONFIG.camera.focusHeight;
  private readonly rayDir = new THREE.Vector3();
  private readonly raycaster = new THREE.Raycaster();

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, aspect, 0.1, 300);
    this.camera.position.set(0, 5, this.distance);
  }

  applyInput(dx: number, dy: number, zoom: number): void {
    const c = CONFIG.camera;
    this.yaw -= dx * c.yawSpeed;
    this.pitch = clamp(this.pitch + dy * c.pitchSpeed, c.minPitch, c.maxPitch);
    this.distance = clamp(this.distance + zoom * c.zoomSpeed, c.minDistance, c.maxDistance);
  }

  /**
   * Quy đổi trục input (x: phải, y: tiến) sang hướng thế giới trên mặt XZ,
   * tương đối với hướng camera đang nhìn. Kết quả đã chuẩn hóa.
   */
  inputToWorld(x: number, y: number): { x: number; z: number } {
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    // forward = (-sin, -cos), right = (cos, -sin)
    const wx = -sin * y + cos * x;
    const wz = -cos * y - sin * x;
    const len = Math.hypot(wx, wz);
    return len > 0 ? { x: wx / len, z: wz / len } : { x: 0, z: 0 };
  }

  /** Góc quay Y để một vật nhìn cùng hướng camera đang nhìn (trên mặt XZ). */
  get facingYaw(): number {
    return this.yaw + Math.PI;
  }

  /**
   * @param blockers vật cản giữa nhân vật và camera (nhà, cây…) — camera sẽ kéo lại gần
   *   thay vì chui vào trong chúng.
   */
  update(
    target: THREE.Vector3,
    dt: number,
    blockers: readonly THREE.Object3D[] = [],
    focusHeight: number = CONFIG.camera.focusHeight,
  ): void {
    const c = CONFIG.camera;
    // Hạ/nâng điểm nhìn mượt (khi nhân vật ngồi/nằm/đứng dậy).
    this.focusHeight += (focusHeight - this.focusHeight) * damp(3, dt);
    // Điểm nhìn: trên đầu nhân vật, lệch sang phải (qua vai).
    const rightX = Math.cos(this.yaw);
    const rightZ = -Math.sin(this.yaw);
    this.focus.set(
      target.x + rightX * c.shoulderOffset,
      target.y + this.focusHeight,
      target.z + rightZ * c.shoulderOffset,
    );
    const horiz = Math.cos(this.pitch) * this.distance;
    this.desired.set(
      this.focus.x + Math.sin(this.yaw) * horiz,
      Math.max(this.focus.y + Math.sin(this.pitch) * this.distance, c.minHeight),
      this.focus.z + Math.cos(this.yaw) * horiz,
    );
    // Chống xuyên vật thể: bắn tia từ điểm nhìn ra camera, có vật cản thì kéo camera vào trước nó.
    let blocked = false;
    if (blockers.length > 0) {
      this.rayDir.subVectors(this.desired, this.focus);
      const length = this.rayDir.length();
      this.raycaster.set(this.focus, this.rayDir.divideScalar(length));
      this.raycaster.far = length;
      const hit = this.raycaster.intersectObjects(blockers as THREE.Object3D[], false)[0];
      if (hit) {
        const safe = Math.max(hit.distance - c.collisionPadding, 0.5);
        this.desired.copy(this.focus).addScaledVector(this.rayDir, safe);
        blocked = true;
      }
    }

    // Bị chặn → nhảy ngay tới vị trí an toàn; không chặn → bám theo mượt.
    if (
      blocked &&
      this.camera.position.distanceTo(this.focus) > this.desired.distanceTo(this.focus)
    ) {
      this.camera.position.copy(this.desired);
    } else {
      this.camera.position.lerp(this.desired, damp(c.followSharpness, dt));
    }
    this.camera.lookAt(this.focus);
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    // Màn hình dọc (điện thoại) → mở rộng góc nhìn dọc để chiều ngang không quá hẹp.
    this.camera.fov = aspect < 1 ? CONFIG.camera.portraitFov : CONFIG.camera.fov;
    this.camera.updateProjectionMatrix();
  }
}
