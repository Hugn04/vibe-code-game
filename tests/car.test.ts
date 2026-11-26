import { describe, expect, it } from 'vitest';
import { CarPhysics } from '@/vehicle/CarPhysics';

const run = (
  car: CarPhysics,
  seconds: number,
  input: Partial<Parameters<CarPhysics['step']>[1]>,
) => {
  const full = { throttle: 0, brake: 0, steer: 0, handbrake: false, ...input };
  for (let t = 0; t < seconds; t += 1 / 60) car.step(1 / 60, full);
};

describe('CarPhysics', () => {
  it('đạp ga thì tăng tốc tới trước và tự lên số', () => {
    const car = new CarPhysics();
    run(car, 6, { throttle: 1 });
    expect(car.speed).toBeGreaterThan(20); // > 72 km/h sau 6 s
    expect(car.gear).toBeGreaterThan(2);
    expect(car.z).toBeGreaterThan(30); // heading 0 → chạy về +Z
  });

  it('có tốc độ tối đa hợp lý (lực cản gió)', () => {
    const car = new CarPhysics();
    run(car, 60, { throttle: 1 });
    expect(car.speed).toBeGreaterThan(45);
    expect(car.speed).toBeLessThan(90);
  });

  it('phanh thì dừng hẳn, không chạy lùi', () => {
    const car = new CarPhysics();
    run(car, 4, { throttle: 1 });
    run(car, 6, { brake: 1 });
    expect(car.speed).toBe(0);
  });

  it('đánh lái trái thì xe rẽ trái (heading tăng)', () => {
    const car = new CarPhysics();
    run(car, 2, { throttle: 0.5 });
    run(car, 2, { throttle: 0.3, steer: 1 });
    expect(car.heading).toBeGreaterThan(0.3);
  });

  it('số lùi: xe chạy về sau', () => {
    const car = new CarPhysics();
    car.selectDirection(false);
    run(car, 3, { throttle: 0.6 });
    expect(car.speed).toBeLessThan(-2);
  });

  it('kéo phanh tay khi vào cua nhanh thì đuôi xe trượt', () => {
    const car = new CarPhysics();
    run(car, 5, { throttle: 1 });
    let maxSlip = 0;
    for (let i = 0; i < 60; i++) {
      car.step(1 / 60, { throttle: 0.4, brake: 0, steer: 1, handbrake: true });
      maxSlip = Math.max(maxSlip, car.slip);
    }
    expect(maxSlip).toBeGreaterThan(0.3);
  });
});

describe('CarPhysics – giới hạn lùi', () => {
  it('số lùi không vượt quá ~30 km/h', () => {
    const car = new CarPhysics();
    car.selectDirection(false);
    for (let t = 0; t < 10; t += 1 / 60)
      car.step(1 / 60, { throttle: 1, brake: 0, steer: 0, handbrake: false });
    expect(car.speed * 3.6).toBeGreaterThan(-32);
    expect(car.speed).toBeLessThan(-5);
  });
});
