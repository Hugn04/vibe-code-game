import * as THREE from 'three';
import { CONFIG } from '@/config';
import { resolveHorizontal, type Box } from '@/physics/collision';
import type { Interactable } from '@/world/Door';
import { CarModel } from './CarModel';
import { CarPhysics, type CarInput } from './CarPhysics';

/** Va chạm thân xe = 3 vòng tròn dọc theo xe (đuôi, giữa, đầu). */
const BODY_CIRCLES = [-1.3, 0, 1.4];
const BODY_RADIUS = 0.98;
const BODY_HEIGHT = 1.3;
const BOUNCE = 0.25;

/**
 * Chiếc xe lái được: vật lý (CarPhysics) + hình ảnh (CarModel) + va chạm + tương tác lên xe.
 * Bản thân xe cũng là 1 collider để người đi bộ không xuyên qua.
 */
export class Car implements Interactable {
  readonly physics = new CarPhysics();
  readonly targets: THREE.Object3D[];
  readonly center = new THREE.Vector3();
  /** Collider của xe trong thế giới (cập nhật theo vị trí xe). */
  readonly collider: { minX: number; maxX: number; minZ: number; maxZ: number; top: number };
  headlights = false;
  /** Lần va chạm gần nhất (m/s theo phương pháp tuyến) — cho rung camera/âm thanh. */
  impact = 0;

  private readonly prev = { x: 0, z: 0, heading: 0 };
  private pitch = 0;
  private roll = 0;
  private others: readonly Box[] = [];

  constructor(
    readonly model: CarModel,
    x: number,
    z: number,
    heading: number,
  ) {
    this.physics.x = this.prev.x = x;
    this.physics.z = this.prev.z = z;
    this.physics.heading = this.prev.heading = heading;
    this.targets = model.meshes;
    for (const m of model.meshes) m.userData.interactable = this;
    this.collider = { minX: 0, maxX: 0, minZ: 0, maxZ: 0, top: BODY_HEIGHT };
    this.updateCollider();
    this.render(1, 0);
  }

  get prompt(): string {
    return 'Lên xe';
  }

  /** Lên xe do Game xử lý (đổi camera, ẩn người chơi) — ở đây chỉ để thỏa interface. */
  onEnter: () => void = () => {};
  interact(): void {
    this.onEnter();
  }

  /** Danh sách vật cản để xe va chạm (trừ chính nó). */
  setObstacles(all: readonly Box[]): void {
    this.others = all.filter((b) => b !== (this.collider as Box));
  }

  fixedUpdate(dt: number, input: CarInput): void {
    const p = this.physics;
    this.prev.x = p.x;
    this.prev.z = p.z;
    this.prev.heading = p.heading;
    p.step(dt, input);
    this.collide();
    this.keepInBounds();
    this.updateCollider();
  }

  /** Đẩy xe ra khỏi vật cản, triệt tiêu vận tốc lao vào vật cản (có nảy nhẹ). */
  private collide(): void {
    const p = this.physics;
    const fx = Math.sin(p.heading);
    const fz = Math.cos(p.heading);
    let pushX = 0;
    let pushZ = 0;
    for (const off of BODY_CIRCLES) {
      const c = { x: p.x + fx * off, y: 0, z: p.z + fz * off };
      const ox = c.x;
      const oz = c.z;
      resolveHorizontal(c, BODY_RADIUS, this.others, { height: BODY_HEIGHT, step: 0 });
      const dx = c.x - ox;
      const dz = c.z - oz;
      if (Math.abs(dx) > Math.abs(pushX)) pushX = dx;
      if (Math.abs(dz) > Math.abs(pushZ)) pushZ = dz;
    }
    this.impact = 0;
    if (pushX === 0 && pushZ === 0) return;
    p.x += pushX;
    p.z += pushZ;
    const len = Math.hypot(pushX, pushZ);
    const nx = pushX / len;
    const nz = pushZ / len;
    const v = p.velocity;
    const vn = v.x * nx + v.z * nz;
    if (vn < 0) {
      this.impact = -vn;
      p.setVelocity(v.x - (1 + BOUNCE) * vn * nx, v.z - (1 + BOUNCE) * vn * nz);
      p.r *= 0.5;
    }
  }

  /** Mép bản đồ: như bức tường vô hình, xe dừng lại. */
  private keepInBounds(): void {
    const p = this.physics;
    const lim = CONFIG.world.size - 2.5;
    const cx = Math.max(-lim, Math.min(lim, p.x));
    const cz = Math.max(-lim, Math.min(lim, p.z));
    if (cx !== p.x || cz !== p.z) {
      p.x = cx;
      p.z = cz;
      p.u *= 0.2;
      p.v *= 0.2;
    }
  }

  private updateCollider(): void {
    const p = this.physics;
    const s = Math.abs(Math.sin(p.heading));
    const c = Math.abs(Math.cos(p.heading));
    const hx = c * 1.0 + s * 2.2; // nửa rộng 1.0, nửa dài 2.2
    const hz = s * 1.0 + c * 2.2;
    this.collider.minX = p.x - hx;
    this.collider.maxX = p.x + hx;
    this.collider.minZ = p.z - hz;
    this.collider.maxZ = p.z + hz;
  }

  /** Nội suy vị trí hiển thị giữa 2 bước vật lý + nhún thân xe theo gia tốc. */
  render(alpha: number, dt: number): void {
    const p = this.physics;
    const x = this.prev.x + (p.x - this.prev.x) * alpha;
    const z = this.prev.z + (p.z - this.prev.z) * alpha;
    const h = this.prev.heading + (p.heading - this.prev.heading) * alpha;
    this.model.root.position.set(x, 0, z);
    this.model.root.rotation.y = h;
    // Phanh → chúi đầu, tăng tốc → ngửa; vào cua → nghiêng ra ngoài.
    const k = Math.min(1, dt * 6);
    this.pitch += (THREE.MathUtils.clamp(-p.accelLong * 0.0045, -0.05, 0.05) - this.pitch) * k;
    this.roll += (THREE.MathUtils.clamp(-p.accelLat * 0.006, -0.06, 0.06) - this.roll) * k;
    this.model.update(p.steerAngle, p.wheelSpin, this.pitch, this.roll);
    this.center.set(x, 1, z);
  }

  /** Vị trí mắt người lái trong thế giới. */
  seatWorld(out: THREE.Vector3): THREE.Vector3 {
    this.model.root.updateMatrixWorld(true);
    return out.copy(this.model.seat).applyMatrix4(this.model.root.matrixWorld);
  }

  /** Chỗ bước xuống (bên trái xe) trong thế giới. */
  exitWorld(out: THREE.Vector3): THREE.Vector3 {
    this.model.root.updateMatrixWorld(true);
    return out.copy(this.model.exitPoint).applyMatrix4(this.model.root.matrixWorld);
  }

  toggleHeadlights(): void {
    this.headlights = !this.headlights;
    this.model.setHeadlights(this.headlights);
  }
}
