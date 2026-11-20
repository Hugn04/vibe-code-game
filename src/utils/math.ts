export const clamp = (v: number, min: number, max: number): number =>
  v < min ? min : v > max ? max : v;

/** Hệ số nội suy không phụ thuộc framerate: dùng với lerp(a, b, damp(k, dt)). */
export const damp = (sharpness: number, dt: number): number => 1 - Math.exp(-sharpness * dt);

/** Hiệu hai góc, chuẩn hóa về [-PI, PI]. */
export const angleDelta = (from: number, to: number): number => {
  const d = to - from;
  return Math.atan2(Math.sin(d), Math.cos(d));
};

/** Khoảng cách từ điểm (px, pz) tới đoạn thẳng AB trên mặt phẳng XZ. */
export function distanceToSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? clamp(((px - ax) * dx + (pz - az) * dz) / len2, 0, 1) : 0;
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

/** PRNG có seed (mulberry32) — cho kết quả tái lập được. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
