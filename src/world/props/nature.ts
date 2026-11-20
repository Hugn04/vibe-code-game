import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Một vị trí đặt vật thể (cây, đá, bụi) trên mặt đất. */
export interface PropInstance {
  x: number;
  z: number;
  scale: number;
  rotY: number;
  /** 0..1 — biến thiên màu nhẹ giữa các bản sao. */
  tint: number;
}

interface Part {
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
  /** Màu gốc khi tô màu riêng từng bản sao (material phải để màu trắng). */
  tintBase?: THREE.Color;
}

export interface PropKind {
  parts: Part[];
}

const flat = (color: number): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9 });

const tinted = (color: number): Pick<Part, 'material' | 'tintBase'> => ({
  material: flat(0xffffff),
  tintBase: new THREE.Color(color),
});

/** Cây thông: thân + 3 tầng nón. */
export function pineTree(): PropKind {
  const foliage = mergeGeometries([
    new THREE.ConeGeometry(1.5, 2.0, 7).translate(0, 2.0, 0),
    new THREE.ConeGeometry(1.2, 1.8, 7).translate(0, 3.0, 0),
    new THREE.ConeGeometry(0.85, 1.6, 7).translate(0, 3.9, 0),
  ])!;
  return {
    parts: [
      { geometry: new THREE.CylinderGeometry(0.18, 0.25, 1.4, 6).translate(0, 0.7, 0), material: flat(0x6b4a2f) },
      { geometry: foliage, ...tinted(0x2f6b3a) },
    ],
  };
}

/** Cây tán tròn: thân + 3 khối đa diện. */
export function roundTree(): PropKind {
  const foliage = mergeGeometries([
    new THREE.IcosahedronGeometry(1.4, 0).translate(0, 2.8, 0),
    new THREE.IcosahedronGeometry(1.0, 0).translate(0.7, 3.4, 0.2),
    new THREE.IcosahedronGeometry(0.9, 0).translate(-0.6, 3.3, -0.3),
  ])!;
  return {
    parts: [
      { geometry: new THREE.CylinderGeometry(0.2, 0.28, 2.0, 6).translate(0, 1.0, 0), material: flat(0x7a5536) },
      { geometry: foliage, ...tinted(0x5c9a3c) },
    ],
  };
}

export function bush(): PropKind {
  const geometry = mergeGeometries([
    new THREE.IcosahedronGeometry(0.7, 0).scale(1, 0.75, 1).translate(0, 0.45, 0),
    new THREE.IcosahedronGeometry(0.5, 0).scale(1, 0.75, 1).translate(0.55, 0.35, 0.1),
  ])!;
  return { parts: [{ geometry, ...tinted(0x4b8a35) }] };
}

/** Đá: khối 12 mặt bị dẹt. Đỉnh cao ~0.78 × scale. */
export const ROCK_TOP = 0.78;
export const ROCK_HALF_WIDTH = 0.65;
export function rock(): PropKind {
  const geometry = new THREE.DodecahedronGeometry(0.8, 0).scale(1, 0.6, 1).translate(0, 0.3, 0);
  return { parts: [{ geometry, ...tinted(0x8a8a86) }] };
}

/**
 * Dựng mỗi phần của vật thể thành 1 InstancedMesh — vài trăm cây chỉ tốn vài draw call.
 */
export function instantiate(kind: PropKind, items: readonly PropInstance[]): THREE.InstancedMesh[] {
  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const position = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const color = new THREE.Color();

  return kind.parts.map((part) => {
    const mesh = new THREE.InstancedMesh(part.geometry, part.material, items.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    items.forEach((it, i) => {
      rotation.setFromAxisAngle(up, it.rotY);
      scale.setScalar(it.scale);
      position.set(it.x, 0, it.z);
      mesh.setMatrixAt(i, matrix.compose(position, rotation, scale));
      if (part.tintBase) {
        const d = it.tint - 0.5;
        mesh.setColorAt(i, color.copy(part.tintBase).offsetHSL(d * 0.06, 0, d * 0.12));
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.computeBoundingBox();
    return mesh;
  });
}
