import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { CONFIG } from '@/config';

/**
 * Chuỗi hậu kỳ cho máy tính:
 * 1. Render cảnh (HDR, chưa tone map)
 * 2. GTAO — bóng tối ở góc/khe/tiếp xúc (ambient occlusion) cho vật thể có chiều sâu
 * 3. Bloom — vùng rất sáng (nắng, cửa sổ) lan sáng nhẹ
 * 4. Output — tone mapping ACES + chuyển sRGB
 * 5. SMAA — khử răng cưa cạnh
 */
export class PostFX {
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly smaa: SMAAPass;
  private readonly gtao: GTAOPass;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    const size = renderer.getSize(new THREE.Vector2());
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));

    this.gtao = new GTAOPass(scene, camera, size.x, size.y);
    this.gtao.blendIntensity = 0.9;
    this.gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1.5, scale: 1 });
    this.gtao.updatePdMaterial({
      lumaPhi: 10,
      depthPhi: 2,
      normalPhi: 3,
      radius: 4,
      rings: 2,
      samples: 16,
    });
    this.composer.addPass(this.gtao);

    this.bloom = new UnrealBloomPass(size.clone(), CONFIG.render.bloomStrength, 0.5, 0.92);
    this.composer.addPass(this.bloom);

    this.composer.addPass(new OutputPass());

    this.smaa = new SMAAPass(size.x * renderer.getPixelRatio(), size.y * renderer.getPixelRatio());
    this.composer.addPass(this.smaa);
  }

  setSize(width: number, height: number, pixelRatio: number): void {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
  }

  render(dt: number): void {
    this.composer.render(dt);
  }

  dispose(): void {
    this.gtao.dispose();
    this.bloom.dispose();
    this.smaa.dispose();
    this.composer.dispose();
  }
}
