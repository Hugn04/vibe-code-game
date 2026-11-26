import { clamp } from '@/utils/math';

/**
 * Khối hộp va chạm thẳng trục: hình chiếu XZ + khoảng cao [bottom, top].
 * - `bottom` bỏ trống = chạm đất (0). Có `bottom` → vật lơ lửng (sàn tầng trên, tường tầng 2…).
 * - `top` đổi được lúc chạy (vd. cửa mở → vô hiệu hóa collider).
 */
export interface Box {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  top: number;
  bottom?: number;
}

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/** Thông số thân người chơi khi va chạm. */
export interface BodyShape {
  radius: number;
  /** Chiều cao thân (m) — để đi lọt dưới sàn tầng trên. */
  height: number;
  /** Bậc cao tối đa bước lên được mà không cần nhảy (cầu thang, lề). */
  step: number;
}

const EPSILON = 0.01;
const DEFAULT_BODY: BodyShape = { radius: 0.5, height: 1.8, step: 0 };

/** Hộp có nằm trong khoảng cao của thân người (từ chân y tới đầu y + height) không. */
const overlapsVertically = (b: Box, y: number, body: BodyShape) =>
  y + body.step < b.top - EPSILON && y + body.height > (b.bottom ?? 0) + EPSILON;

/**
 * Đẩy hình trụ (tâm p) ra khỏi các hộp mà nó đang chồng lấn theo phương ngang.
 * Bỏ qua hộp thấp hơn chân + bậc (bước lên được) và hộp cao hơn đầu (đi lọt bên dưới).
 */
export function resolveHorizontal(
  p: Vec3Like,
  radius: number,
  boxes: readonly Box[],
  body: Partial<BodyShape> = {},
): void {
  const shape = { ...DEFAULT_BODY, ...body, radius };
  const r2 = radius * radius;
  for (const b of boxes) {
    if (!overlapsVertically(b, p.y, shape)) continue;

    const cx = clamp(p.x, b.minX, b.maxX);
    const cz = clamp(p.z, b.minZ, b.maxZ);
    const dx = p.x - cx;
    const dz = p.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r2) continue;

    if (d2 > 1e-8) {
      const d = Math.sqrt(d2);
      p.x = cx + (dx / d) * radius;
      p.z = cz + (dz / d) * radius;
    } else {
      // Tâm nằm hẳn trong hộp: đẩy ra cạnh gần nhất.
      const left = p.x - b.minX;
      const right = b.maxX - p.x;
      const back = p.z - b.minZ;
      const front = b.maxZ - p.z;
      const m = Math.min(left, right, back, front);
      if (m === left) p.x = b.minX - radius;
      else if (m === right) p.x = b.maxX + radius;
      else if (m === back) p.z = b.minZ - radius;
      else p.z = b.maxZ + radius;
    }
  }
}

/**
 * Độ cao mặt đứng dưới chân tại vị trí p.
 * Chỉ tính đỉnh hộp nếu ở bước trước chân người chơi đã ở trên (hoặc thấp hơn không quá
 * `step`) — bước lên bậc thang được, còn va vào thành hộp cao thì không bị "dịch chuyển" lên nóc.
 */
export function groundHeightAt(
  p: Vec3Like,
  prevY: number,
  boxes: readonly Box[],
  step = 0,
): number {
  let h = 0;
  for (const b of boxes) {
    if (
      p.x > b.minX &&
      p.x < b.maxX &&
      p.z > b.minZ &&
      p.z < b.maxZ &&
      prevY + step >= b.top - EPSILON &&
      b.top > h
    ) {
      h = b.top;
    }
  }
  return h;
}

/**
 * Trần thấp nhất phía trên đầu (đáy của hộp lơ lửng ngay trên vị trí p), hoặc Infinity.
 * Dùng để chặn nhảy xuyên sàn tầng trên.
 */
export function ceilingHeightAt(p: Vec3Like, feetY: number, boxes: readonly Box[]): number {
  let c = Infinity;
  for (const b of boxes) {
    if (b.bottom === undefined || b.bottom <= feetY + EPSILON) continue;
    if (p.x > b.minX && p.x < b.maxX && p.z > b.minZ && p.z < b.maxZ && b.bottom < c) {
      c = b.bottom;
    }
  }
  return c;
}
