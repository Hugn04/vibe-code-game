import * as THREE from 'three';
import { CONFIG } from '@/config';
import { clamp, damp } from '@/utils/math';

export type CameraMode = 'first' | 'third';

/**
 * Camera nhân vật, 2 chế độ:
 * - `first`: góc nhìn thứ nhất — camera đặt ở mắt, chuột xoay đầu, nhún nhẹ theo bước chân.
 * - `third`: góc nhìn thứ 3 qua vai, quay quanh nhân vật, tự kéo gần khi bị vật cản che.
 */
export class ThirdPersonCamera {
  readonly camera: THREE.PerspectiveCamera;
  mode: CameraMode = CONFIG.camera.mode;
  yaw = 0;
  pitch: number = CONFIG.camera.pitch;
  distance: number = CONFIG.camera.distance;

  private readonly focus = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  private focusHeight: number = CONFIG.camera.focusHeight;
  private readonly rayDir = new THREE.Vector3();
  private readonly raycaster = new THREE.Raycaster();
  private readonly lookTarget = new THREE.Vector3();
  private bobPhase = 0;
  private readonly eyeSmooth = new THREE.Vector3();
  /** Bám vị trí mắt tức thì (ngồi trong xe đang chạy nhanh) — không làm mượt. */
  eyeSnap = false;
  private bobAmount = 0;
  private aspect = 1;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, aspect, 0.1, 300);
    this.camera.position.set(0, 5, this.distance);
  }

  /** Đổi chế độ nhìn (giữ hướng đang nhìn). */
  setMode(mode: CameraMode): void {
    this.mode = mode;
    this.pitch = this.clampPitch(mode === 'first' ? 0 : CONFIG.camera.pitch);
    this.resize(this.aspect);
  }

  private clampPitch(p: number): number {
    const c = CONFIG.camera;
    return this.mode === 'first'
      ? clamp(p, -c.firstPersonMaxPitch, c.firstPersonMaxPitch)
      : clamp(p, c.minPitch, c.maxPitch);
  }

  applyInput(dx: number, dy: number, zoom: number): void {
    const c = CONFIG.camera;
    this.yaw -= dx * c.yawSpeed;
    // Di chuột xuống → nhìn xuống (cả 2 chế độ).
    this.pitch = this.clampPitch(this.pitch + dy * c.pitchSpeed);
    if (this.mode === 'third') {
      this.distance = clamp(this.distance + zoom * c.zoomSpeed, c.minDistance, c.maxDistance);
    }
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
    /** Tốc độ ngang của nhân vật + có đang chạm đất — để nhún camera theo bước chân. */
    motion: { speed: number; grounded: boolean } = { speed: 0, grounded: true },
    /** Vị trí mắt thật của model (góc nhìn thứ nhất); null = tự tính từ `target`. */
    eye: THREE.Vector3 | null = null,
  ): void {
    const c = CONFIG.camera;
    // Hạ/nâng điểm nhìn mượt (khi nhân vật ngồi/nằm/đứng dậy).
    this.focusHeight += (focusHeight - this.focusHeight) * damp(3, dt);
    if (this.mode === 'first') {
      this.updateFirstPerson(target, dt, motion, eye);
      return;
    }
    // Lệch qua vai: rút ngắn nếu bên phải là tường (tránh camera lọt sang phòng bên).
    let shoulder: number = c.shoulderOffset;
    if (blockers.length > 0) {
      this.focus.set(target.x, target.y + this.focusHeight, target.z);
      this.rayDir.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      this.raycaster.set(this.focus, this.rayDir);
      this.raycaster.far = shoulder + 0.3;
      const side = this.raycaster.intersectObjects(blockers as THREE.Object3D[], false)[0];
      if (side) shoulder = Math.max(0, side.distance - 0.3);
    }
    // Điểm nhìn: trên đầu nhân vật, lệch sang phải (qua vai).
    const rightX = Math.cos(this.yaw);
    const rightZ = -Math.sin(this.yaw);
    this.focus.set(
      target.x + rightX * shoulder,
      target.y + this.focusHeight,
      target.z + rightZ * shoulder,
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

  /** Góc nhìn thứ nhất: mắt ở đầu nhân vật, nhún nhẹ theo nhịp bước. */
  private updateFirstPerson(
    target: THREE.Vector3,
    dt: number,
    motion: { speed: number; grounded: boolean },
    eye: THREE.Vector3 | null,
  ): void {
    const c = CONFIG.camera;
    if (eye) {
      // Mắt thật theo animation (bước đi, ngồi, nằm…) → chỉ làm mượt rung nhỏ, không nhún giả.
      if (this.eyeSnap || this.eyeSmooth.distanceToSquared(eye) > 1) this.eyeSmooth.copy(eye);
      else this.eyeSmooth.lerp(eye, damp(c.eyeSmoothing, dt));
      this.camera.position.copy(this.eyeSmooth);
      const sinY = Math.sin(this.yaw);
      const cosY = Math.cos(this.yaw);
      const cp = Math.cos(this.pitch);
      this.lookTarget.set(-sinY * cp, -Math.sin(this.pitch), -cosY * cp).add(this.camera.position);
      this.camera.lookAt(this.lookTarget);
      return;
    }
    const moving = motion.grounded && motion.speed > 0.3;
    this.bobAmount +=
      ((moving ? Math.min(motion.speed / 4, 1.2) : 0) - this.bobAmount) * damp(8, dt);
    if (moving) this.bobPhase += dt * (4 + motion.speed * 1.4);
    const bobY = Math.abs(Math.sin(this.bobPhase)) * c.headBob * this.bobAmount;
    const bobX = Math.cos(this.bobPhase) * c.headBob * 0.5 * this.bobAmount;

    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    // Mắt hơi nhô về trước so với tâm thân để không nhìn thấy bên trong đầu.
    this.camera.position.set(
      target.x - sin * 0.12 + cos * bobX,
      target.y + this.focusHeight + bobY,
      target.z - cos * 0.12 - sin * bobX,
    );
    const cp = Math.cos(this.pitch);
    this.lookTarget.set(-sin * cp, -Math.sin(this.pitch), -cos * cp).add(this.camera.position);
    this.camera.lookAt(this.lookTarget);
  }

  resize(aspect: number): void {
    this.aspect = aspect;
    this.camera.aspect = aspect;
    // Màn hình dọc (điện thoại) → mở rộng góc nhìn dọc để chiều ngang không quá hẹp.
    const base = this.mode === 'first' ? CONFIG.camera.firstPersonFov : CONFIG.camera.fov;
    this.camera.fov = aspect < 1 ? CONFIG.camera.portraitFov : base;
    this.camera.updateProjectionMatrix();
  }
}
