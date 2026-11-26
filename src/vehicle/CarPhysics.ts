/**
 * Động lực học ô tô "bicycle model" có trượt lốp (không phụ thuộc three.js — test được).
 *
 * Trục: xe nhìn về hướng `heading` (rad, quay quanh Y; heading = 0 → xe nhìn về +Z).
 * Vận tốc trong hệ xe: u = dọc (tới trước +), v = ngang (+ = bên trái xe), r = tốc độ quay đầu.
 *
 * Mô phỏng:
 * - Động cơ: đường cong mô-men xoắn theo vòng tua, hộp số tự động 6 cấp + số lùi.
 * - Lốp: lực ngang tỉ lệ góc trượt, giới hạn bởi hệ số bám × tải trên trục (chuyển tải khi
 *   tăng tốc/phanh) → thiếu lái / thừa lái / trượt đuôi khi kéo phanh tay.
 * - Phanh, lực cản lăn, lực cản gió; vô-lăng nhạy theo tốc độ (chạy nhanh bẻ được ít hơn).
 */
export interface CarSpec {
  mass: number; // kg
  inertia: number; // kg·m², mô-men quán tính quanh trục đứng
  cgToFront: number; // m, trọng tâm → trục trước
  cgToRear: number; // m
  cgHeight: number; // m — dùng cho chuyển tải
  wheelRadius: number; // m
  maxSteer: number; // rad, góc lái bánh trước tối đa khi đứng yên
  steerSpeed: number; // rad/s, tốc độ đánh lái
  /** Tốc độ (m/s) tại đó góc lái tối đa giảm còn một nửa. */
  steerFalloff: number;
  corneringFront: number; // N/rad
  corneringRear: number; // N/rad
  grip: number; // hệ số bám lốp
  handbrakeGrip: number; // hệ số bám bánh sau khi kéo phanh tay (0..1)
  brakeForce: number; // N
  handbrakeForce: number; // N
  rollingResistance: number; // N/(m/s)
  drag: number; // N/(m/s)²
  gearRatios: number[]; // tiến
  reverseRatio: number;
  finalDrive: number;
  efficiency: number;
  idleRpm: number;
  redlineRpm: number;
  shiftUpRpm: number;
  shiftDownRpm: number;
  /** Mô-men xoắn cực đại (N·m) — đường cong nhọn ở giữa dải vòng tua. */
  maxTorque: number;
  /** Tốc độ lùi tối đa (m/s) — xe thật có giới hạn khi lùi. */
  maxReverse: number;
}

export const DEFAULT_CAR: CarSpec = {
  mass: 1350,
  inertia: 2100,
  cgToFront: 1.35,
  cgToRear: 1.45,
  cgHeight: 0.5,
  wheelRadius: 0.5, // khớp bánh xe của model (Ø ~1 m)
  maxSteer: 0.6,
  steerSpeed: 2.4,
  steerFalloff: 14,
  corneringFront: 72000,
  corneringRear: 82000,
  grip: 1.05,
  handbrakeGrip: 0.35,
  brakeForce: 13000,
  handbrakeForce: 4500,
  rollingResistance: 14,
  drag: 0.42,
  gearRatios: [3.3, 2.15, 1.55, 1.18, 0.95, 0.78],
  reverseRatio: 3.2,
  finalDrive: 5.4, // tỉ số truyền cuối (đã tính theo bán kính bánh 0.5 m)
  efficiency: 0.85,
  idleRpm: 900,
  redlineRpm: 7000,
  shiftUpRpm: 6200,
  shiftDownRpm: 2600,
  maxTorque: 380,
  maxReverse: 8, // ~29 km/h
};

export interface CarInput {
  throttle: number; // 0..1
  brake: number; // 0..1 (khi đang lùi, S là ga lùi — xử lý ở Car)
  steer: number; // -1 (phải) .. 1 (trái)
  handbrake: boolean;
}

const G = 9.81;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

export class CarPhysics {
  // Trạng thái thế giới
  x = 0;
  z = 0;
  heading = 0;
  // Trạng thái hệ xe
  u = 0;
  v = 0;
  r = 0;
  steerAngle = 0;
  /** Số hiện tại: 1..6 = số tiến, -1 = số lùi, 0 = N. */
  gear = 1;
  rpm: number;
  /** Gia tốc dọc / ngang gần nhất (m/s²) — cho hiệu ứng chúi/nghiêng thân xe. */
  accelLong = 0;
  accelLat = 0;
  /** Góc quay tích lũy của bánh (rad) — để xoay mesh bánh xe. */
  wheelSpin = 0;
  /** Mức trượt bánh sau (0..1) — cho tiếng rít lốp/hiệu ứng. */
  slip = 0;
  private shiftCooldown = 0;

  constructor(readonly spec: CarSpec = DEFAULT_CAR) {
    this.rpm = spec.idleRpm;
  }

  /** Tốc độ (m/s), dương = tới, âm = lùi. */
  get speed(): number {
    return this.u;
  }

  /** Vận tốc thế giới. */
  get velocity(): { x: number; z: number } {
    const s = Math.sin(this.heading);
    const c = Math.cos(this.heading);
    // tới = (sin h, cos h); trái = (cos h, -sin h)
    return { x: this.u * s + this.v * c, z: this.u * c - this.v * s };
  }

  setVelocity(vx: number, vz: number): void {
    const s = Math.sin(this.heading);
    const c = Math.cos(this.heading);
    this.u = vx * s + vz * c;
    this.v = vx * c - vz * s;
  }

  /** Mô-men xoắn động cơ (N·m) theo vòng tua: tăng tới ~4500 rpm rồi giảm dần. */
  torqueAt(rpm: number): number {
    const s = this.spec;
    const t = clamp((rpm - s.idleRpm) / (4500 - s.idleRpm), 0, 1);
    const fall = rpm > 4500 ? clamp(1 - ((rpm - 4500) / (s.redlineRpm - 4500)) * 0.35, 0.6, 1) : 1;
    const rev = rpm >= s.redlineRpm ? 0 : 1; // chạm vòng tua giới hạn → cắt nhiên liệu
    return s.maxTorque * (0.55 + 0.45 * t) * fall * rev;
  }

  step(dt: number, input: CarInput): void {
    const s = this.spec;
    const L = s.cgToFront + s.cgToRear;

    // ---- Vô-lăng: đánh lái mượt, góc tối đa giảm khi chạy nhanh ----
    const maxSteer = s.maxSteer / (1 + Math.abs(this.u) / s.steerFalloff);
    const target = clamp(input.steer, -1, 1) * maxSteer;
    const ds = target - this.steerAngle;
    this.steerAngle += clamp(ds, -s.steerSpeed * dt, s.steerSpeed * dt);
    const delta = this.steerAngle;

    // ---- Hộp số tự động ----
    this.shiftCooldown = Math.max(0, this.shiftCooldown - dt);
    if (this.gear > 0 && this.shiftCooldown === 0) {
      if (this.rpm > s.shiftUpRpm && this.gear < s.gearRatios.length) {
        this.gear++;
        this.shiftCooldown = 0.35;
      } else if (this.rpm < s.shiftDownRpm && this.gear > 1) {
        this.gear--;
        this.shiftCooldown = 0.35;
      }
    }
    const ratio = this.gear > 0 ? s.gearRatios[this.gear - 1] : this.gear < 0 ? s.reverseRatio : 0;
    const wheelRps = this.u / s.wheelRadius; // rad/s
    const engineRad = Math.abs(wheelRps * ratio * s.finalDrive);
    const rpmFromWheels = (engineRad * 60) / (2 * Math.PI);
    // Vòng tua: theo bánh xe, không thấp hơn ga-răng-ti; khi đứng yên đạp ga thì rú lên.
    const freeRev = s.idleRpm + input.throttle * 2500;
    const targetRpm = Math.max(rpmFromWheels, Math.abs(this.u) < 2 ? freeRev : s.idleRpm);
    this.rpm += (Math.min(targetRpm, s.redlineRpm + 50) - this.rpm) * Math.min(1, dt * 12);

    // ---- Lực dọc ----
    const dir = this.gear < 0 ? -1 : 1;
    let drive = 0;
    const reverseLimited = this.gear < 0 && this.u < -s.maxReverse;
    if (ratio !== 0 && input.throttle > 0 && !reverseLimited) {
      drive =
        (dir * this.torqueAt(this.rpm) * ratio * s.finalDrive * s.efficiency * input.throttle) /
        s.wheelRadius;
    }
    const moving = Math.abs(this.u) > 0.05;
    let brake = 0;
    if (input.brake > 0) brake += s.brakeForce * input.brake;
    if (input.handbrake) brake += s.handbrakeForce;
    let fx = drive - s.rollingResistance * this.u - s.drag * this.u * Math.abs(this.u);
    if (moving) {
      fx -= Math.sign(this.u) * brake;
    } else if (brake > 0 && Math.abs(drive) < brake) {
      // Đang đứng yên + phanh lớn hơn lực kéo → đứng yên hẳn.
      this.u = 0;
      fx = 0;
    }

    // ---- Chuyển tải trọng khi tăng tốc/phanh → tải trên từng trục ----
    const weight = s.mass * G;
    const transfer = (s.cgHeight / L) * s.mass * this.accelLong;
    const loadFront = clamp((s.cgToRear / L) * weight - transfer, weight * 0.15, weight);
    const loadRear = clamp((s.cgToFront / L) * weight + transfer, weight * 0.15, weight);

    // ---- Lực ngang lốp (theo góc trượt, có giới hạn bám) ----
    const speedAbs = Math.abs(this.u);
    let fyF = 0;
    let fyR = 0;
    if (speedAbs > 0.5) {
      const uu = Math.max(speedAbs, 1);
      const slipF = Math.atan2(this.v + s.cgToFront * this.r, uu) - delta * Math.sign(this.u);
      const slipR = Math.atan2(this.v - s.cgToRear * this.r, uu);
      const rearGrip = input.handbrake ? s.grip * s.handbrakeGrip : s.grip;
      fyF = clamp(-s.corneringFront * slipF, -s.grip * loadFront, s.grip * loadFront);
      fyR = clamp(-s.corneringRear * slipR, -rearGrip * loadRear, rearGrip * loadRear);
      // Mức trượt (0..1) để làm tiếng rít lốp.
      this.slip = clamp((Math.abs(slipR) - 0.08) * 4, 0, 1) * clamp(speedAbs / 6, 0, 1);
    } else {
      this.slip = 0;
    }

    // ---- Phương trình chuyển động (hệ xe) ----
    const cosD = Math.cos(delta);
    const sinD = Math.sin(delta);
    const du = (fx - fyF * sinD) / s.mass + this.v * this.r;
    const dv = (fyR + fyF * cosD) / s.mass - this.u * this.r;
    const dr = (s.cgToFront * fyF * cosD - s.cgToRear * fyR) / s.inertia;

    const prevU = this.u;
    this.u += du * dt;
    this.v += dv * dt;
    this.r += dr * dt;

    // Tốc độ thấp: chuyển dần sang mô hình động học (xe đi đúng theo bánh, không trượt) để ổn định.
    const kin = clamp(1 - (speedAbs - 1) / 3, 0, 1);
    if (kin > 0) {
      const rKin = (this.u * Math.tan(delta)) / L;
      this.r += (rKin - this.r) * kin;
      this.v *= 1 - kin * 0.9;
    }
    // Phanh / lực cản không được làm xe đổi chiều (chỉ động cơ mới đẩy được xe chạy ngược).
    if (
      moving &&
      Math.sign(this.u) !== Math.sign(prevU) &&
      Math.sign(drive) !== Math.sign(this.u)
    ) {
      this.u = 0;
    }

    const longAccel = (this.u - prevU) / dt;
    this.accelLong += (longAccel - this.accelLong) * Math.min(1, dt * 8);
    this.accelLat += (this.u * this.r - this.accelLat) * Math.min(1, dt * 8);

    // ---- Tích phân vị trí ----
    this.heading += this.r * dt;
    const vel = this.velocity;
    this.x += vel.x * dt;
    this.z += vel.z * dt;
    this.wheelSpin += (this.u / s.wheelRadius) * dt;
  }

  /** Chuyển số thủ công: N/lùi khi gần như đứng yên. */
  selectDirection(forward: boolean): void {
    if (Math.abs(this.u) > 0.8) return;
    if (forward && this.gear <= 0) this.gear = 1;
    if (!forward && this.gear >= 0) this.gear = -1;
  }
}
