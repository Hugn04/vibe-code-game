import { describe, expect, it } from 'vitest';
import { groundHeightAt, resolveHorizontal, type Box } from '@/physics/collision';

const box: Box = { minX: -1, maxX: 1, minZ: -1, maxZ: 1, top: 2 };

describe('resolveHorizontal', () => {
  it('đẩy người chơi ra khỏi thành hộp', () => {
    const p = { x: 1.2, y: 0, z: 0 };
    resolveHorizontal(p, 0.5, [box]);
    expect(p.x).toBeCloseTo(1.5);
    expect(p.z).toBe(0);
  });

  it('đẩy ra cạnh gần nhất khi tâm nằm trong hộp', () => {
    const p = { x: 0, y: 0, z: -0.9 };
    resolveHorizontal(p, 0.5, [box]);
    expect(p.z).toBeCloseTo(-1.5);
  });

  it('không chặn khi người chơi ở trên đỉnh hộp', () => {
    const p = { x: 1.2, y: 2, z: 0 };
    resolveHorizontal(p, 0.5, [box]);
    expect(p.x).toBe(1.2);
  });

  it('không đổi vị trí khi không chạm', () => {
    const p = { x: 3, y: 0, z: 3 };
    resolveHorizontal(p, 0.5, [box]);
    expect(p).toEqual({ x: 3, y: 0, z: 3 });
  });
});

describe('groundHeightAt', () => {
  it('trả về đỉnh hộp khi rơi xuống từ trên', () => {
    expect(groundHeightAt({ x: 0, y: 1.9, z: 0 }, 2.1, [box])).toBe(2);
  });

  it('trả về 0 khi ở dưới đỉnh hộp ở bước trước', () => {
    expect(groundHeightAt({ x: 0, y: 1, z: 0 }, 1, [box])).toBe(0);
  });

  it('trả về 0 khi ngoài hộp', () => {
    expect(groundHeightAt({ x: 5, y: 0, z: 0 }, 3, [box])).toBe(0);
  });

  it('chọn hộp cao nhất khi chồng lên nhau', () => {
    const high: Box = { ...box, top: 3 };
    expect(groundHeightAt({ x: 0, y: 2.9, z: 0 }, 3.1, [box, high])).toBe(3);
  });
});
