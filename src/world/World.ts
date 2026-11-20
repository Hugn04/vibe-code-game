import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { CONFIG } from '@/config';
import type { Box } from '@/physics/collision';
import { IS_TOUCH_DEVICE } from '@/utils/device';
import { createRng } from '@/utils/math';
import { buildForestMap, loadMapAssets } from './ForestMap';
import { pbrMaterial, setWorldUVs } from './textures';

/** Scene tĩnh: bầu trời, ánh sáng, mặt đất và bản đồ làng trong rừng. */
export class World {
  readonly scene = new THREE.Scene();
  readonly obstacles: Box[] = [];
  /** Các mesh tâm ngắm có thể chỉ trúng. */
  readonly aimTargets: THREE.Object3D[] = [];
  /** Vật cản camera (mọi thứ trừ mặt đất). */
  readonly cameraBlockers: THREE.Object3D[] = [];
  private readonly sun = new THREE.DirectionalLight(0xfff0dc, 2.6);
  private sky: THREE.Texture | null = null;
  /** Xong khi mọi model của bản đồ đã tải và được đặt vào scene. */
  readonly ready: Promise<void>;

  constructor(seed: number = CONFIG.world.seed) {
    const { render } = CONFIG;
    this.scene.background = new THREE.Color(render.background);
    this.scene.fog = new THREE.Fog(render.background, render.fogNear, render.fogFar);

    this.createLights();
    this.loadSky();
    this.createGround(createRng(seed ^ 0x9e3779b9));

    this.ready = loadMapAssets().then((assets) => {
      const map = buildForestMap(createRng(seed), assets);
      this.scene.add(map.root);
      this.obstacles.push(...map.colliders);
      this.aimTargets.push(...map.aimTargets);
      // Camera được lách qua cây/lá (lá tự mờ khi che nhân vật); chỉ bị chặn bởi nhà, đá, thùng…
      this.cameraBlockers.push(
        ...map.aimTargets.filter((obj) => {
          const data = ((obj as THREE.Mesh).material as THREE.Material).userData;
          return !data.foliage && !data.cameraPassThrough;
        }),
      );
    });
  }

  /** Cho vùng đổ bóng của mặt trời đi theo người chơi. */
  followShadow(target: THREE.Vector3): void {
    this.sun.position.set(target.x + 18, target.y + 32, target.z + 12);
    this.sun.target.position.copy(target);
  }

  dispose(): void {
    const materials = new Set<THREE.Material>();
    this.scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.geometry.dispose();
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((m) => materials.add(m));
        if (mesh instanceof THREE.InstancedMesh) mesh.dispose();
      }
    });
    materials.forEach((m) => m.dispose());
    this.sky?.dispose();
    this.sun.shadow.map?.dispose();
  }

  private createLights(): void {
    const { shadowArea } = CONFIG.render;
    const shadowMapSize = IS_TOUCH_DEVICE
      ? CONFIG.render.mobileShadowMapSize
      : CONFIG.render.shadowMapSize;
    // Ánh sáng môi trường chính đến từ HDRI; hemisphere chỉ bù nhẹ (và thay thế khi HDRI chưa tải).
    this.scene.add(new THREE.HemisphereLight(0xd4ecff, 0x4a5a33, 0.35));

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.03;
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -shadowArea;
    cam.right = cam.top = shadowArea;
    cam.near = 1;
    cam.far = 120;
    this.scene.add(this.sun, this.sun.target);
  }

  /**
   * Bầu trời ảnh thật (HDRI): vừa làm nền, vừa chiếu sáng + phản chiếu lên mọi vật liệu PBR.
   */
  private loadSky(): void {
    const { render } = CONFIG;
    new RGBELoader()
      .loadAsync(import.meta.env.BASE_URL + render.skyUrl)
      .then((tex) => {
        tex.mapping = THREE.EquirectangularReflectionMapping;
        this.sky = tex;
        this.scene.background = tex;
        this.scene.environment = tex;
        this.scene.environmentIntensity = render.environmentIntensity;
      })
      .catch((err) => console.warn('[World] Không tải được bầu trời HDRI:', err));
  }

  /** Mặt cỏ texture thật, loang màu nhẹ (vertex color) để đỡ lộ ô lặp. */
  private createGround(rand: () => number): void {
    const extent = CONFIG.world.size * 2 + 40;
    const geo = new THREE.PlaneGeometry(extent, extent, 90, 90).rotateX(-Math.PI / 2);
    setWorldUVs(geo, 6);
    const color = new THREE.Color();
    const colors: number[] = [];
    for (let i = 0; i < geo.attributes.position.count; i++) {
      const l = 0.82 + rand() * 0.18;
      color.setRGB(l * (0.95 + rand() * 0.05), l, l * (0.9 + rand() * 0.1));
      colors.push(color.r, color.g, color.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const ground = new THREE.Mesh(
      geo,
      pbrMaterial('grass', { vertexColors: true, color: 0x9fbf86 }),
    );
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.aimTargets.push(ground);
  }
}
