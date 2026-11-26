import * as THREE from 'three';
import type { Box } from '@/physics/collision';
import { angleDelta } from '@/utils/math';

/** Vật tương tác được (nhìn vào + bấm nút). */
export interface Interactable {
  /** Chữ gợi ý hiển thị, vd. "Mở cửa". */
  readonly prompt: string;
  /** Mesh để bắn tia kiểm tra người chơi đang nhìn vào. */
  readonly targets: THREE.Object3D[];
  /** Điểm giữa vật — để giới hạn khoảng cách tương tác. */
  readonly center: THREE.Vector3;
  interact(): void;
}

export interface DoorOptions {
  /** Vị trí bản lề (chân cửa). */
  hinge: THREE.Vector3;
  width: number;
  height: number;
  /** Góc quay Y khi đóng (cánh cửa nằm dọc trục +X cục bộ). */
  closedRot: number;
  /** Hướng mặt cánh cửa khi mở hẳn, góc quay Y. */
  openRot: number;
  /** Collider chặn ô cửa khi đóng. */
  collider: Box;
  material: THREE.Material;
  handleMaterial: THREE.Material;
  glassMaterial: THREE.Material;
}

const SPEED = 2.4; // lượt mở/đóng mỗi giây (0 → 1)
const ease = (t: number) => t * t * (3 - 2 * t);

/** Cánh cửa bản lề: bấm để mở/đóng, xoay mượt, chặn người khi đóng. */
export class Door implements Interactable {
  readonly pivot = new THREE.Group();
  /** Vùng cảm ứng vô hình phủ ô cửa — nhìn vào ô cửa (kể cả khi đã mở) là tương tác được. */
  readonly trigger: THREE.Mesh;
  readonly targets: THREE.Object3D[] = [];
  readonly center = new THREE.Vector3();
  readonly collider: Box;
  open = false;
  /** Cánh còn lại của cửa đôi — mở/đóng cùng nhau. */
  partner: Door | null = null;

  private t = 0;
  private readonly closedRot: number;
  private readonly openDelta: number;
  private readonly colliderTop: number;

  constructor(o: DoorOptions) {
    this.closedRot = o.closedRot;
    this.openDelta = angleDelta(o.closedRot, o.openRot);
    this.collider = o.collider;
    this.colliderTop = o.collider.top;
    this.pivot.position.copy(o.hinge);
    this.pivot.rotation.y = o.closedRot;

    const w = o.width - 0.04;
    const leafGeo = new THREE.BoxGeometry(w, o.height, 0.05).translate(
      w / 2 + 0.02,
      o.height / 2,
      0,
    );
    const leaf = new THREE.Mesh(leafGeo, o.material);
    leaf.castShadow = leaf.receiveShadow = true;
    // Ô kính quan sát + tay nắm hai mặt
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(0.28, 0.5).translate(w / 2 + 0.02, o.height * 0.68, 0.027),
      o.glassMaterial,
    );
    const glassBack = new THREE.Mesh(
      new THREE.PlaneGeometry(0.28, 0.5)
        .rotateY(Math.PI)
        .translate(w / 2 + 0.02, o.height * 0.68, -0.027),
      o.glassMaterial,
    );
    for (const side of [-1, 1]) {
      const handle = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.03, 0.03).translate(w - 0.1, 1.0, side * 0.06),
        o.handleMaterial,
      );
      handle.castShadow = true;
      this.pivot.add(handle);
    }
    this.pivot.add(leaf, glass, glassBack);
    this.targets.push(leaf);
    leaf.userData.interactable = this;

    this.center
      .copy(o.hinge)
      .add(
        new THREE.Vector3(Math.cos(o.closedRot), 0, -Math.sin(o.closedRot)).multiplyScalar(
          o.width / 2,
        ),
      );
    this.center.y += 1;

    this.trigger = new THREE.Mesh(
      new THREE.BoxGeometry(o.width, o.height, 0.3),
      Door.triggerMaterial,
    );
    this.trigger.position.set(this.center.x, o.hinge.y + o.height / 2, this.center.z);
    this.trigger.rotation.y = o.closedRot;
    this.trigger.userData.interactable = this;
    this.trigger.userData.trigger = true;
    this.targets.push(this.trigger);
  }

  /** Vật liệu ẩn (không vẽ, nhưng tia bắn vẫn trúng). */
  private static readonly triggerMaterial = new THREE.MeshBasicMaterial({ visible: false });

  get prompt(): string {
    return this.open ? 'Đóng cửa' : 'Mở cửa';
  }

  interact(): void {
    this.open = !this.open;
    if (this.partner) this.partner.open = this.open;
  }

  update(dt: number): void {
    const target = this.open ? 1 : 0;
    if (this.t === target) return;
    this.t = target > this.t ? Math.min(1, this.t + dt * SPEED) : Math.max(0, this.t - dt * SPEED);
    this.pivot.rotation.y = this.closedRot + this.openDelta * ease(this.t);
    // Còn khép quá nửa → vẫn chặn đường.
    this.collider.top = this.t < 0.6 ? this.colliderTop : -1e9;
  }
}
