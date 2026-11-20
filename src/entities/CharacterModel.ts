import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';

export type MoveState = 'idle' | 'walk' | 'run' | 'jump';
export type ClipMap = Readonly<Record<MoveState, string>>;

const loader = new GLTFLoader();

/**
 * Model nhân vật có khung xương: nạp file glTF, chuẩn hóa kích thước
 * và chuyển mượt (cross-fade) giữa các animation theo trạng thái di chuyển.
 */
export class CharacterModel {
  readonly root: THREE.Group;
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<MoveState, THREE.AnimationAction>();
  private current: MoveState | null = null;

  static async load(url: string, clips: ClipMap, height: number): Promise<CharacterModel> {
    const gltf = await loader.loadAsync(url);
    return new CharacterModel(gltf, clips, height);
  }

  private constructor(gltf: GLTF, clips: ClipMap, height: number) {
    // Bọc model trong 1 group để co giãn/căn chân chạm đất mà không đụng vào node gốc.
    this.root = new THREE.Group();
    const model = gltf.scene;
    this.root.add(model);

    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const scale = size.y > 0 ? height / size.y : 1;
    model.scale.multiplyScalar(scale);
    model.position.y -= box.min.y * scale;

    model.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        obj.castShadow = true;
        obj.frustumCulled = false; // bounding box của skinned mesh không đổi theo animation
      }
    });

    this.mixer = new THREE.AnimationMixer(model);
    for (const [state, name] of Object.entries(clips) as [MoveState, string][]) {
      const clip = THREE.AnimationClip.findByName(gltf.animations, name);
      if (!clip) {
        console.warn(`[CharacterModel] Không tìm thấy animation "${name}" cho trạng thái ${state}`);
        continue;
      }
      const action = this.mixer.clipAction(clip);
      if (state === 'jump') {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      this.actions.set(state, action);
    }
    this.setState('idle', 0);
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
