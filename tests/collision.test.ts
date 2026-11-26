import { describe, expect, it } from 'vitest';
import { ceilingHeightAt, groundHeightAt, resolveHorizontal, type Box } from '@/physics/collision';

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

describe('nhiều tầng + cầu thang', () => {
  const step: Box = { minX: -1, maxX: 1, minZ: -1, maxZ: 1, top: 0.18 };
  const slab: Box = { minX: -5, maxX: 5, minZ: -5, maxZ: 5, top: 3.6, bottom: 3.35 };

  it('bước lên bậc thấp hơn `step` mà không bị chặn', () => {
    const p = { x: 1.2, y: 0, z: 0 };
    resolveHorizontal(p, 0.5, [step], { step: 0.4 });
    expect(p.x).toBe(1.2);
    expect(groundHeightAt({ x: 0.5, y: 0, z: 0 }, 0, [step], 0.4)).toBeCloseTo(0.18);
  });

  it('vẫn bị chặn bởi bậc cao hơn `step`', () => {
    const tall: Box = { ...step, top: 1 };
    const p = { x: 1.2, y: 0, z: 0 };
    resolveHorizontal(p, 0.5, [tall], { step: 0.4 });
    expect(p.x).toBeCloseTo(1.5);
  });

  it('đi lọt bên dưới sàn tầng trên', () => {
    const p = { x: 0, y: 0, z: 0 };
    resolveHorizontal(p, 0.5, [slab], { height: 1.8 });
    expect(p).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('đứng được trên sàn tầng trên', () => {
    expect(groundHeightAt({ x: 0, y: 3.5, z: 0 }, 3.62, [slab])).toBeCloseTo(3.6);
  });

  it('trần = đáy sàn tầng trên khi đứng ở tầng dưới', () => {
    expect(ceilingHeightAt({ x: 0, y: 0, z: 0 }, 0, [slab])).toBeCloseTo(3.35);
    expect(ceilingHeightAt({ x: 0, y: 3.6, z: 0 }, 3.6, [slab])).toBe(Infinity);
  });
});
