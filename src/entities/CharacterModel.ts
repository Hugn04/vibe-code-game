import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { POSES, PoseBuilder } from './PoseBuilder';

export type MoveState =
  'idle' | 'walk' | 'run' | 'jump' | 'crouch' | 'crouchWalk' | 'prone' | 'crawl';
/**
 * Tên clip trong file glb theo trạng thái. Thiếu `idle`, `sit`, `lie` thì
 * tư thế được dựng tự động bằng PoseBuilder (với rig người thông dụng).
 */
export type ClipMap = Readonly<Partial<Record<MoveState, string>>>;

export interface CharacterOptions {
  clips: ClipMap;
  /** Chiều cao hiển thị (m). */
  height: number;
  /** Xoay model quanh trục Y để mặt nhìn về +Z. */
  rotationY?: number;
}

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
/** Các trạng thái chuyển 1 lần rồi giữ nguyên tư thế cuối. */
const ONE_SHOT: readonly MoveState[] = ['jump'];

/**
 * Model nhân vật có khung xương: nạp file glTF, chuẩn hóa kích thước
 * và chuyển mượt (cross-fade) giữa các animation theo trạng thái di chuyển.
 */
export class CharacterModel {
  readonly root: THREE.Group;
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<MoveState, THREE.AnimationAction>();
  private current: MoveState | null = null;

  static async load(url: string, options: CharacterOptions): Promise<CharacterModel> {
    const gltf = await loader.loadAsync(url);
    return new CharacterModel(gltf, options);
  }

  private constructor(gltf: GLTF, { clips, height, rotationY = 0 }: CharacterOptions) {
    // Bọc model trong 1 group để co giãn/căn chân chạm đất mà không đụng vào node gốc.
    this.root = new THREE.Group();
    const model = gltf.scene;
    this.root.add(model);

    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const scale = size.y > 0 ? height / size.y : 1;
    model.scale.multiplyScalar(scale);
    model.position.y -= box.min.y * scale;
    model.rotation.y += rotationY;

    model.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
        obj.frustumCulled = false; // bounding box của skinned mesh không đổi theo animation
      }
    });

    this.mixer = new THREE.AnimationMixer(model);
    for (const [state, name] of Object.entries(clips) as [MoveState, string | undefined][]) {
      if (!name) continue;
      const clip = THREE.AnimationClip.findByName(gltf.animations, name);
      if (!clip) {
        console.warn(`[CharacterModel] Không tìm thấy animation "${name}" cho trạng thái ${state}`);
        continue;
      }
      const action = this.mixer.clipAction(clip);
      if (ONE_SHOT.includes(state)) {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      this.actions.set(state, action);
    }

    // Tư thế tự dựng cho những trạng thái model không có sẵn clip.
    const poses = new PoseBuilder(this.root);
    const generated: [MoveState, () => THREE.AnimationClip | null][] = [
      ['idle', () => poses.clip('idle', POSES.stand[0], POSES.stand[1])],
      ['crouch', () => poses.clip('crouch', POSES.crouch[0], POSES.crouch[1], 3)],
      ['crouchWalk', () => poses.cycle('crouchWalk', POSES.crouchWalk, 1.1)],
      ['prone', () => poses.clip('prone', POSES.prone[0], POSES.prone[1], 4)],
      ['crawl', () => poses.cycle('crawl', POSES.crawl, 1.6)],
    ];
    for (const [state, make] of generated) {
      if (this.actions.has(state)) continue;
      const clip = poses.supported ? make() : null;
      if (clip) this.actions.set(state, this.mixer.clipAction(clip));
      else console.warn(`[CharacterModel] Không dựng được tư thế "${state}" cho rig này`);
    }
    this.setState('idle', 0);
  }

  /** Model có animation cho trạng thái này không. */
  has(state: MoveState): boolean {
    return this.actions.has(state);
  }

  get state(): MoveState | null {
    return this.current;
  }

  setState(state: MoveState, fade: number): void {
    if (state === this.current) return;
    const next = this.actions.get(state) ?? this.actions.get('idle');
    if (!next) return;
    const prev = this.current ? this.actions.get(this.current) : undefined;

    next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(fade).play();
    if (prev && prev !== next) prev.fadeOut(fade);
    this.current = state;
  }

  /** Tốc độ phát của animation hiện tại (âm = phát ngược, dùng khi đi lùi). */
  setTimeScale(scale: number): void {
    if (this.current) this.actions.get(this.current)?.setEffectiveTimeScale(scale);
  }

  update(dt: number): void {
    this.mixer.update(dt);
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        for (const value of Object.values(m)) {
          if (value instanceof THREE.Texture) value.dispose();
        }
        m.dispose();
      }
    });
  }
}
