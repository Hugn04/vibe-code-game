import * as THREE from 'three';

const loader = new THREE.TextureLoader();
const cache = new Map<string, THREE.Texture>();

function load(url: string, srgb: boolean): THREE.Texture {
  const key = `${url}|${srgb}`;
  let tex = cache.get(key);
  if (!tex) {
    tex = loader.load(url);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.anisotropy = 8;
    cache.set(key, tex);
  }
  return tex;
}

/**
 * Vật liệu PBR từ bộ texture Poly Haven trong public/textures:
 *   <name>_diff.jpg (màu), <name>_nor_gl.jpg (normal OpenGL), <name>_rough.jpg (độ nhám).
 * Texture lặp theo UV — dùng cùng setWorldUVs() để mật độ đều trên mọi kích thước mesh.
 */
export function pbrMaterial(
  name: string,
  extra: THREE.MeshStandardMaterialParameters = {},
): THREE.MeshStandardMaterial {
  const base = `${import.meta.env.BASE_URL}textures/${name}`;
  return new THREE.MeshStandardMaterial({
    map: load(`${base}_diff.jpg`, true),
    normalMap: load(`${base}_nor_gl.jpg`, false),
    roughnessMap: load(`${base}_rough.jpg`, false),
    normalScale: new THREE.Vector2(1, 1),
    ...extra,
  });
}

/**
 * Gán UV theo tọa độ thật trên mặt phẳng XZ (1 ô texture = `tileSize` mét),
 * để texture không bị kéo giãn trên mesh to/nhỏ khác nhau.
 */
export function setWorldUVs(geometry: THREE.BufferGeometry, tileSize: number): void {
  const pos = geometry.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getX(i) / tileSize;
    uv[i * 2 + 1] = pos.getZ(i) / tileSize;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}
