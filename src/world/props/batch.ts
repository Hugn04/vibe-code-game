import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Gom các mesh tĩnh (tường, sàn, đồ đạc dựng bằng code) theo vật liệu rồi gộp thành
 * vài mesh lớn: hàng trăm khối hộp → vài draw call.
 */
export class StaticBatch {
  private readonly groups = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private readonly flags = new Map<THREE.Material, { castShadow: boolean }>();

  /** Thêm mọi mesh trong `object` (transform được "nướng" vào geometry). */
  add(object: THREE.Object3D, castShadow = true): void {
    object.updateMatrixWorld(true);
    object.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const material = mesh.material as THREE.Material;
      let geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      geo.applyMatrix4(mesh.matrixWorld);
      for (const name of Object.keys(geo.attributes)) {
        if (name !== 'position' && name !== 'normal' && name !== 'uv') geo.deleteAttribute(name);
      }
      if (!geo.attributes.normal) geo.computeVertexNormals();
      if (!geo.attributes.uv) {
        geo.setAttribute(
          'uv',
          new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2),
        );
      }
      geo = geo.index ? geo.toNonIndexed() : geo;
      let list = this.groups.get(material);
      if (!list) this.groups.set(material, (list = []));
      list.push(geo);
      const f = this.flags.get(material);
      this.flags.set(material, {
        castShadow: (f?.castShadow ?? false) || (castShadow && mesh.castShadow !== false),
      });
    });
  }

  build(): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const [material, geos] of this.groups) {
      const merged = mergeGeometries(geos);
      geos.forEach((g) => g.dispose());
      if (!merged) continue;
      merged.computeBoundingSphere();
      merged.computeBoundingBox();
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = this.flags.get(material)?.castShadow ?? true;
      mesh.receiveShadow = true;
      out.push(mesh);
    }
    this.groups.clear();
    return out;
  }
}
