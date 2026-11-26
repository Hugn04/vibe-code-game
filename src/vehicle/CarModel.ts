import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

/** Một bánh xe: khớp bẻ lái (bánh trước) + khớp quay quanh trục bánh. */
interface WheelRig {
  steer: THREE.Object3D;
  spin: THREE.Object3D;
  front: boolean;
}

/**
 * Model xe "Car Concept" (Khronos glTF Sample Assets, CC-BY 4.0 — Eric Chadwick /
 * Darmstadt Graphics Group) được "lắp khớp" để lái: bánh quay + bẻ lái, vô-lăng xoay,
 * thân xe chúi/nghiêng theo gia tốc, đèn pha bật được.
 *
 * Hệ tọa độ: đầu xe nhìn về +Z, bên trái là +X, gốc ở mặt đất giữa xe.
 */
export class CarModel {
  readonly root = new THREE.Group();
  /** Thân xe (mọi thứ trừ bánh) — xoay nhẹ để giả lập nhún. */
  private readonly chassis = new THREE.Group();
  private readonly wheels: WheelRig[] = [];
  private steeringWheel: THREE.Object3D | null = null;
  private readonly lights: THREE.SpotLight[] = [];
  private headlightMats: THREE.MeshStandardMaterial[] = [];
  /** Vị trí mắt người lái trong hệ tọa độ của xe. */
  readonly seat = new THREE.Vector3(0, 1.17, 0.24);
  /** Chỗ người chơi bước ra khi xuống xe (bên trái xe). */
  readonly exitPoint = new THREE.Vector3(1.9, 0, 0.3);
  /** Mesh để bắn tia tương tác (lên xe). */
  readonly meshes: THREE.Mesh[] = [];

  static async load(url: string): Promise<CarModel> {
    const gltf = await loader.loadAsync(url);
    return new CarModel(gltf.scene);
  }

  private constructor(scene: THREE.Group) {
    // Nâng xe cho lốp chạm đất.
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene);
    scene.position.y -= box.min.y;
    this.root.add(this.chassis);
    this.chassis.add(scene);
    this.root.updateMatrixWorld(true);

    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.meshes.push(mesh);
    });

    // ---- Bánh xe: tách khỏi thân, dựng khớp tại tâm bánh ----
    for (const name of ['WheelFrontL', 'WheelFrontR', 'WheelRearL', 'WheelRearR']) {
      const group = scene.getObjectByName(name);
      if (!group) continue;
      const center = new THREE.Box3().setFromObject(group).getCenter(new THREE.Vector3());
      const steer = new THREE.Group();
      steer.position.copy(center);
      const spin = new THREE.Group();
      steer.add(spin);
      this.root.add(steer);
      this.root.updateMatrixWorld(true);
      // Vành + lốp + đĩa phanh quay; má phanh (caliper) đứng yên theo khớp lái.
      for (const child of [...group.children]) {
        if (/BrakePad/i.test(child.name)) steer.attach(child);
        else spin.attach(child);
      }
      this.wheels.push({ steer, spin, front: name.includes('Front') });
    }

    // ---- Vô-lăng: khớp quay quanh trục trụ lái (nghiêng về phía người lái) ----
    const column = scene.getObjectByName('InteriorSteeringCylinder');
    if (column) {
      const center = new THREE.Box3().setFromObject(column).getCenter(new THREE.Vector3());
      const pivot = new THREE.Group();
      pivot.position.copy(center);
      pivot.lookAt(center.clone().add(new THREE.Vector3(0, 0.35, -1))); // +Z cục bộ = trục trụ lái
      this.chassis.add(pivot);
      this.chassis.updateMatrixWorld(true);
      pivot.attach(column);
      this.steeringWheel = pivot;
    }

    // ---- Đèn pha: 2 đèn chiếu + làm đèn trước sáng lên ----
    const head = scene.getObjectByName('BodyHeadlights');
    head?.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (m?.isMeshStandardMaterial) {
        const own = m.clone();
        (o as THREE.Mesh).material = own;
        this.headlightMats.push(own);
      }
    });
    for (const x of [-0.6, 0.6]) {
      const spot = new THREE.SpotLight(0xfff4e0, 0, 45, 0.5, 0.45, 1.5);
      spot.position.set(x, 0.7, 2.2);
      spot.target.position.set(x * 1.5, 0, 14);
      spot.visible = false;
      this.chassis.add(spot, spot.target);
      this.lights.push(spot);
    }
  }

  setHeadlights(on: boolean): void {
    for (const l of this.lights) {
      l.visible = on;
      l.intensity = on ? 60 : 0;
    }
    for (const m of this.headlightMats) {
      m.emissive.set(on ? 0xfff2d0 : 0x000000);
      m.emissiveIntensity = on ? 3 : 0;
    }
  }

  /**
   * @param steerAngle góc lái bánh trước (rad, + = trái)
   * @param spin góc quay tích lũy của bánh (rad)
   * @param pitch chúi/ngửa thân xe (rad, + = chúi đầu)
   * @param roll nghiêng thân xe (rad)
   */
  update(steerAngle: number, spin: number, pitch: number, roll: number): void {
    for (const w of this.wheels) {
      w.steer.rotation.y = w.front ? steerAngle : 0;
      w.spin.rotation.x = spin;
    }
    // Tỉ số lái ~14:1 → vô-lăng quay nhiều hơn bánh xe.
    if (this.steeringWheel) this.steeringWheel.rotation.z = -steerAngle * 14 * 0.6;
    // Thân xe xoay quanh điểm giữa, cao ngang tâm bánh (giả lập nhún).
    this.chassis.position.set(0, 0, 0);
    this.chassis.rotation.set(pitch, 0, roll);
  }

  dispose(): void {
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((m) => m.dispose());
    });
  }
}
