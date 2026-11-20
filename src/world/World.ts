import * as THREE from 'three';
import { CONFIG } from '@/config';
import type { Box } from '@/physics/collision';
import { IS_TOUCH_DEVICE } from '@/utils/device';
import { createRng } from '@/utils/math';
import { buildForestMap } from './ForestMap';

/** Scene tĩnh: bầu trời, ánh sáng, mặt đất và bản đồ làng trong rừng. */
export class World {
  readonly scene = new THREE.Scene();
  readonly obstacles: Box[] = [];
  /** Các mesh tâm ngắm có thể chỉ trúng. */
  readonly aimTargets: THREE.Object3D[] = [];
  /** Vật cản camera (mọi thứ trừ mặt đất). */
  readonly cameraBlockers: THREE.Object3D[] = [];
  private readonly sun = new THREE.DirectionalLight(0xfff1d6, 2.0);

  constructor(seed: number = CONFIG.world.seed) {
    const { render } = CONFIG;
    this.scene.background = new THREE.Color(render.background);
    this.scene.fog = new THREE.Fog(render.background, render.fogNear, render.fogFar);

    this.createLights();
    this.createGround(createRng(seed ^ 0x9e3779b9));

    const map = buildForestMap(createRng(seed));
    this.scene.add(map.root);
    this.obstacles.push(...map.colliders);
    this.aimTargets.push(...map.aimTargets);
    this.cameraBlockers.push(...map.aimTargets);
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
    this.sun.shadow.map?.dispose();
  }

  private createLights(): void {
    const { shadowArea } = CONFIG.render;
    const shadowMapSize = IS_TOUCH_DEVICE
      ? CONFIG.render.mobileShadowMapSize
      : CONFIG.render.shadowMapSize;
    this.scene.add(new THREE.HemisphereLight(0xd4ecff, 0x3d5a2a, 1.0));

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

  /** Mặt cỏ có màu loang nhẹ (vertex color) cho đỡ đơn điệu. */
  private createGround(rand: () => number): void {
    const extent = CONFIG.world.size * 2 + 40;
    const geo = new THREE.PlaneGeometry(extent, extent, 90, 90).rotateX(-Math.PI / 2);
    const base = new THREE.Color(0x5f9e47);
    const color = new THREE.Color();
    const colors: number[] = [];
    for (let i = 0; i < geo.attributes.position.count; i++) {
      color.copy(base).offsetHSL((rand() - 0.5) * 0.04, 0, (rand() - 0.5) * 0.08);
      colors.push(color.r, color.g, color.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const ground = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }),
    );
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.aimTargets.push(ground);
  }
}
