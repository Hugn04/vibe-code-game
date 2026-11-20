import { clamp } from '@/utils/math';

/** Khối hộp đứng trên mặt đất, mô tả bằng hình chiếu XZ và chiều cao đỉnh. */
export interface Box {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly top: number;
}

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

const EPSILON = 0.01;

/**
 * Đẩy hình trụ (tâm p, bán kính r) ra khỏi các hộp mà nó đang chồng lấn theo phương ngang.
 * Hộp có đỉnh thấp hơn chân người chơi bị bỏ qua (người chơi đang đứng/bay phía trên).
 */
export function resolveHorizontal(p: Vec3Like, radius: number, boxes: readonly Box[]): void {
  const r2 = radius * radius;
  for (const b of boxes) {
    if (p.y >= b.top - EPSILON) continue;

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
 * Chỉ tính đỉnh hộp nếu ở bước trước người chơi đã ở trên đỉnh đó (prevY),
 * tránh bị "dịch chuyển" lên nóc khi va vào thành hộp.
 */
export function groundHeightAt(p: Vec3Like, prevY: number, boxes: readonly Box[]): number {
  let h = 0;
  for (const b of boxes) {
    if (
      p.x > b.minX &&
      p.x < b.maxX &&
      p.z > b.minZ &&
      p.z < b.maxZ &&
      prevY >= b.top - EPSILON &&
      b.top > h
    ) {
      h = b.top;
    }
  }
  return h;
}
