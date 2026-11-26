import * as THREE from 'three';

/** Một vị trí đặt vật thể (cây, đá, bụi) trên mặt đất. */
export interface PropInstance {
  x: number;
  z: number;
  scale: number;
  rotY: number;
  /** 0..1 — biến thiên màu nhẹ giữa các bản sao. */
  tint: number;
  /** Độ cao đặt vật (m), mặc định 0 = trên mặt đất. */
  y?: number;
}

export interface Part {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** Màu gốc khi tô màu riêng từng bản sao (material phải để màu trắng). */
  tintBase?: THREE.Color;
  castShadow?: boolean;
}

/** Một loại vật thể = nhiều phần (mỗi phần 1 geometry + 1 material), gốc tọa độ ở chân. */
export interface PropKind {
  parts: Part[];
  /** Hộp bao (đơn vị mét, scale = 1) — dùng để tạo collider. */
  bounds: THREE.Box3;
}

/**
 * Uniform dùng chung cho shader lá cây — Game cập nhật mỗi frame:
 * - uTime: thời gian cho gió.
 * - uFocusView: vị trí nhân vật trong không gian camera, để lá chắn tầm nhìn tự mờ.
 */
export const windUniforms = {
  uTime: { value: 0 },
  uFocusView: { value: new THREE.Vector3(0, 0, -1e6) },
};

export interface WindOptions {
  /** Từ độ cao này (m, tọa độ cục bộ) bắt đầu đung đưa… */
  from: number;
  /** …và đung đưa mạnh nhất từ độ cao này trở lên. */
  to: number;
  /** Biên độ lắc (m). */
  amplitude: number;
}

const FADE_FRAGMENT = /* glsl */ `
  vec3 fragView = -vViewPosition;
  float camFade = smoothstep(0.6, 2.8, length(fragView));
  // Khoảng cách từ điểm đang vẽ tới đoạn thẳng camera → nhân vật (không gian camera).
  float segT = clamp(dot(fragView, uFocusView) / dot(uFocusView, uFocusView), 0.0, 1.0);
  float toLine = length(fragView - uFocusView * segT);
  float occludeFade = mix(1.0, smoothstep(0.9, 2.4, toLine), step(segT, 0.97));
  float dither = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  if (min(camFade, max(occludeFade, 0.12)) < dither) discard;
`;

/**
 * Hiệu ứng cho lá/bụi (chèn vào shader có sẵn của material, giữ nguyên shader cũ nếu có):
 * - Gió (tùy chọn): đỉnh càng cao càng lắc, mỗi cây lệch pha theo vị trí.
 * - Tan dần (dither) khi sát camera hoặc chắn giữa camera và nhân vật.
 */
export function applyFoliageFx(material: THREE.Material, wind?: WindOptions): void {
  const previous = material.onBeforeCompile.bind(material);
  const prevKey = material.customProgramCacheKey.bind(material);

  material.onBeforeCompile = (shader, renderer) => {
    previous(shader, renderer);
    shader.uniforms.uTime = windUniforms.uTime;
    shader.uniforms.uFocusView = windUniforms.uFocusView;

    if (wind) {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace(
          '#include <begin_vertex>',
          /* glsl */ `#include <begin_vertex>
          #ifdef USE_INSTANCING
            vec2 windSeed = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
          #else
            vec2 windSeed = vec2(0.0);
          #endif
          float windWeight = smoothstep(${wind.from.toFixed(2)}, ${wind.to.toFixed(2)}, position.y);
          float windPhase = uTime * 1.7 + windSeed.x * 0.31 + windSeed.y * 0.23;
          float gust = 0.6 + 0.4 * sin(uTime * 0.45 + windSeed.x * 0.05);
          transformed.x += sin(windPhase) * ${wind.amplitude.toFixed(3)} * windWeight * gust;
          transformed.z += cos(windPhase * 0.83) * ${(wind.amplitude * 0.6).toFixed(3)} * windWeight * gust;`,
        );
    }

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uFocusView;')
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>\n${FADE_FRAGMENT}`,
      );
  };
  material.customProgramCacheKey = () =>
    `${prevKey()}|foliage-${wind ? `${wind.from}-${wind.to}-${wind.amplitude}` : 'still'}`;
  material.userData.foliage = true;
}

/**
 * Dựng mỗi phần của vật thể thành InstancedMesh, chia theo ô lưới `cellSize` mét:
 * ô nằm ngoài khung nhìn (hoặc ngoài vùng đổ bóng) bị bỏ qua khi vẽ → rừng lớn vẫn nhẹ.
 */
export function instantiate(
  kind: PropKind,
  items: readonly PropInstance[],
  cellSize = Infinity,
): THREE.InstancedMesh[] {
  const cells = new Map<string, PropInstance[]>();
  for (const it of items) {
    const key = Number.isFinite(cellSize)
      ? `${Math.floor(it.x / cellSize)},${Math.floor(it.z / cellSize)}`
      : 'all';
    let list = cells.get(key);
    if (!list) cells.set(key, (list = []));
    list.push(it);
  }

  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const position = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const color = new THREE.Color();
  const meshes: THREE.InstancedMesh[] = [];

  for (const cellItems of cells.values()) {
    for (const part of kind.parts) {
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, cellItems.length);
      mesh.castShadow = part.castShadow ?? true;
      mesh.receiveShadow = true;
      cellItems.forEach((it, i) => {
        rotation.setFromAxisAngle(up, it.rotY);
        scale.setScalar(it.scale);
        position.set(it.x, it.y ?? 0, it.z);
        mesh.setMatrixAt(i, matrix.compose(position, rotation, scale));
        if (part.tintBase) {
          const d = it.tint - 0.5;
          mesh.setColorAt(i, color.copy(part.tintBase).offsetHSL(d * 0.04, d * 0.1, d * 0.1));
        }
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.computeBoundingBox();
      meshes.push(mesh);
    }
  }
  return meshes;
}

/**
 * Hộp va chạm thẳng trục bao trọn model đã xoay/co giãn.
 * @param shrink < 1 để thu nhỏ (vật tròn như thùng, đá).
 * @param top độ cao đỉnh collider; mặc định = đỉnh model.
 */
export function kindCollider(
  kind: PropKind,
  it: PropInstance,
  shrink = 1,
  top?: number,
): { minX: number; maxX: number; minZ: number; maxZ: number; top: number; bottom?: number } {
  const b = kind.bounds;
  const cx = ((b.min.x + b.max.x) / 2) * it.scale;
  const cz = ((b.min.z + b.max.z) / 2) * it.scale;
  const hx = ((b.max.x - b.min.x) / 2) * it.scale * shrink;
  const hz = ((b.max.z - b.min.z) / 2) * it.scale * shrink;
  const c = Math.cos(it.rotY);
  const s = Math.sin(it.rotY);
  const wx = it.x + cx * c + cz * s;
  const wz = it.z - cx * s + cz * c;
  const ex = Math.abs(c) * hx + Math.abs(s) * hz;
  const ez = Math.abs(s) * hx + Math.abs(c) * hz;
  return {
    minX: wx - ex,
    maxX: wx + ex,
    minZ: wz - ez,
    maxZ: wz + ez,
    top: top ?? (it.y ?? 0) + b.max.y * it.scale,
    // Vật đặt trên cao (tầng 2…) → collider lơ lửng, không chặn tầng dưới.
    bottom: (it.y ?? 0) > 0.05 ? it.y : undefined,
  };
}
