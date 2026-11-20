import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { applyFoliageFx, type Part, type PropKind, type WindOptions } from './nature';

const gltfLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

/** Gộp các phần thành PropKind: tính hộp bao và đặt chân vật thể chạm y = 0. */
function finalizeKind(parts: Part[]): PropKind {
  const bounds = new THREE.Box3();
  for (const p of parts) {
    p.geometry.computeBoundingBox();
    bounds.union(p.geometry.boundingBox!);
  }
  const lift = -bounds.min.y;
  for (const p of parts) {
    p.geometry.translate(0, lift, 0);
    p.geometry.computeBoundingSphere();
  }
  bounds.translate(new THREE.Vector3(0, lift, 0));
  return { parts, bounds };
}

/**
 * Nạp model .glb (đã tối ưu bằng `npm run assets`) thành PropKind:
 * mọi mesh con được "nướng" transform vào geometry để nhân bản bằng InstancedMesh.
 */
export async function loadGlbKind(
  url: string,
  options: { foliage?: WindOptions | true; castShadow?: boolean } = {},
): Promise<PropKind> {
  const gltf = await gltfLoader.loadAsync(url);
  gltf.scene.updateMatrixWorld(true);
  const parts: Part[] = [];
  gltf.scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    const material = mesh.material as THREE.Material;
    if (options.foliage) {
      applyFoliageFx(material, options.foliage === true ? undefined : options.foliage);
    }
    parts.push({ geometry, material, castShadow: options.castShadow });
  });
  return finalizeKind(parts);
}

/** Đổi vật liệu Phong của ez-tree sang PBR để nhận ánh sáng môi trường từ bầu trời HDRI. */
function toStandard(m: THREE.MeshPhongMaterial, roughness: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map: m.map,
    normalMap: m.normalMap,
    aoMap: m.aoMap,
    alphaMap: m.alphaMap,
    color: m.color,
    side: m.side,
    alphaTest: m.alphaTest,
    roughness,
    metalness: 0,
  });
}

export interface TreeSpec {
  preset: string;
  /** Chiều cao mong muốn (m). */
  height: number;
  seed: number;
}

/**
 * Sinh cây thật bằng ez-tree (MIT, https://github.com/dgreenheck/ez-tree):
 * thân có vỏ cây, lá là texture thật. Giảm bớt chi tiết cho hợp game, co về đơn vị mét.
 * Thư viện nặng ~4 MB (nhúng texture) nên được nạp động, tách khỏi bundle chính.
 */
export async function createTreeKinds(specs: readonly TreeSpec[]): Promise<PropKind[]> {
  const { Tree } = await import('@dgreenheck/ez-tree');
  return specs.map((spec) => {
    const tree = new Tree();
    tree.loadPreset(spec.preset);
    const o = tree.options;
    o.seed = spec.seed;
    // Bớt số cạnh/khúc của thân & cành — khác biệt khó thấy, nhẹ hơn ~40%.
    for (const k of Object.keys(
      o.branch.segments,
    ) as unknown as (keyof typeof o.branch.segments)[]) {
      o.branch.segments[k] = Math.max(3, Math.round(o.branch.segments[k] / 2));
    }
    for (const k of Object.keys(
      o.branch.sections,
    ) as unknown as (keyof typeof o.branch.sections)[]) {
      o.branch.sections[k] = Math.max(3, Math.round(o.branch.sections[k] * 0.6));
    }
    o.leaves.count = Math.round(o.leaves.count * 0.75);
    tree.generate();

    const branchGeo = tree.branchesMesh.geometry.clone();
    const leafGeo = tree.leavesMesh.geometry.clone();
    branchGeo.computeBoundingBox();
    leafGeo.computeBoundingBox();
    const box = branchGeo.boundingBox!.clone().union(leafGeo.boundingBox!);
    const s = spec.height / (box.max.y - box.min.y);
    branchGeo.scale(s, s, s);
    leafGeo.scale(s, s, s);

    const bark = toStandard(tree.branchesMesh.material as THREE.MeshPhongMaterial, 0.95);
    const leaves = toStandard(tree.leavesMesh.material as THREE.MeshPhongMaterial, 0.75);
    applyFoliageFx(leaves, { from: spec.height * 0.25, to: spec.height, amplitude: 0.18 });
    // Camera được lách qua cả thân/cành (chỉ thân chính có collider với nhân vật).
    bark.userData.cameraPassThrough = true;

    return finalizeKind([
      { geometry: branchGeo, material: bark },
      { geometry: leafGeo, material: leaves },
    ]);
  });
}
