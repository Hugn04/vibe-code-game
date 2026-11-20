import * as THREE from 'three';
import { CONFIG } from '@/config';
import { groundHeightAt, resolveHorizontal, type Box } from '@/physics/collision';
import { angleDelta, clamp, damp } from '@/utils/math';
import { CharacterModel, type MoveState } from './CharacterModel';

/** Lệnh điều khiển cho 1 bước vật lý (đã quy đổi sang hướng thế giới). */
export interface PlayerCommand {
  /** Hướng muốn đi trên mặt phẳng XZ, độ dài 0 hoặc 1. */
  moveX: number;
  moveZ: number;
  run: boolean;
  jump: boolean;
  /** Vừa bấm nhảy (giữ tới khi vật lý xử lý) — để lần bấm rất nhanh không bị lỡ. */
  jumpPressed?: boolean;
  /** Bấm 1 lần để ngồi xổm / đứng dậy. */
  toggleCrouch?: boolean;
  /** Bấm 1 lần để nằm sấp / đứng dậy. */
  toggleProne?: boolean;
}

/** Tư thế: đứng, ngồi xổm (đi khom được), nằm sấp (bò được). */
export type Posture = 'stand' | 'crouch' | 'prone';

/**
 * Nhân vật người chơi.
 * - `position` / `velocity`: trạng thái vật lý, cập nhật trong fixedUpdate().
 * - `object`: phần hiển thị, nội suy giữa 2 bước vật lý trong render().
 */
export class Player {
  readonly object = new THREE.Group();
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  onGround = true;
  posture: Posture = 'stand';

  private readonly prevPosition = new THREE.Vector3();
  private readonly body: THREE.Mesh;
  private walkCycle = 0;
  /** Model 3D có animation; null khi chưa tải xong (hiển thị viên thuốc thay thế). */
  private character: CharacterModel | null = null;
  private disposed = false;

  constructor() {
    this.body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.5, 0.8, 8, 16),
      new THREE.MeshStandardMaterial({ color: 0xff7043 }),
    );
    this.body.position.y = 0.9;
    this.body.castShadow = true;
    this.object.add(this.body);

    const eyeGeo = new THREE.SphereGeometry(0.09, 12, 12);
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    for (const x of [-0.18, 0.18]) {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(x, 0.45, 0.44);
      this.body.add(eye);
    }
  }

  /** Dịch chuyển tức thời (không nội suy), xóa vận tốc. */
  teleport(x: number, y: number, z: number): void {
    this.position.set(x, y, z);
    this.prevPosition.copy(this.position);
    this.object.position.copy(this.position);
    this.velocity.set(0, 0, 0);
  }

  /** Tải model nhân vật; lỗi thì giữ nguyên viên thuốc. */
  async loadCharacter(url: string): Promise<void> {
    const c = CONFIG.character;
    const character = await CharacterModel.load(url, {
      clips: c.clips,
      height: c.height,
      rotationY: c.rotationY,
    });
    if (this.disposed) {
      character.dispose();
      return;
    }
    this.character = character;
    this.body.visible = false;
    this.object.add(character.root);
  }

  get animationState(): MoveState | null {
    return this.character?.state ?? null;
  }

  get horizontalSpeed(): number {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  /**
   * Độ cao điểm camera nhìn vào (m) — thấp xuống khi ngồi/nằm.
   */
  get eyeHeight(): number {
    return CONFIG.player.eyeHeight[this.posture];
  }

  /**
   * Đổi tư thế (chỉ khi đang trên mặt đất):
   * - Bấm phím của tư thế đang có → đứng dậy; phím tư thế kia → chuyển thẳng sang.
   * - Nhảy khi đang ngồi/nằm → đứng dậy trước, đứng xong mới tự bật nhảy.
   */
  private updatePosture(cmd: PlayerCommand): boolean {
    if (!this.onGround) return false;
    const before = this.posture;
    if (cmd.toggleCrouch) this.posture = this.posture === 'crouch' ? 'stand' : 'crouch';
    else if (cmd.toggleProne) this.posture = this.posture === 'prone' ? 'stand' : 'prone';
    else if ((cmd.jump || cmd.jumpPressed) && this.posture !== 'stand') {
      this.posture = 'stand';
      // Chờ animation đứng dậy xong (nằm sấp lâu hơn ngồi xổm) rồi mới nhảy.
      this.pendingJump = CONFIG.player.standUpTime[before];
    }
    if (this.posture !== 'stand') this.pendingJump = 0; // lại ngồi/nằm xuống → hủy nhảy chờ
    return this.posture !== before;
  }

  /** Thời gian còn lại (giây) trước khi bật nhảy đã hẹn; 0 = không có. */
  private pendingJump = 0;

  fixedUpdate(dt: number, cmd: PlayerCommand, obstacles: readonly Box[]): void {
    const c = CONFIG.player;
    const p = this.position;
    const v = this.velocity;
    this.prevPosition.copy(p);

    const wasStanding = this.posture === 'stand';
    if (this.updatePosture(cmd) || !wasStanding) {
      // Đang ngồi/nằm (hoặc vừa đổi tư thế): không nhảy, không chạy nhanh.
      cmd = { ...cmd, jump: false, jumpPressed: false, run: false };
    }

    // Tăng tốc mượt về vận tốc mục tiêu (chậm hơn khi đi khom / bò).
    const speed =
      this.posture === 'crouch'
        ? c.crouchSpeed
        : this.posture === 'prone'
          ? c.proneSpeed
          : cmd.run
            ? c.runSpeed
            : c.walkSpeed;
    const k = damp(this.onGround ? c.groundAccel : c.airAccel, dt);
    v.x += (cmd.moveX * speed - v.x) * k;
    v.z += (cmd.moveZ * speed - v.z) * k;

    // Nhảy đã hẹn (sau khi đứng dậy) — trong lúc đang đứng dậy thì chưa cho nhảy.
    let jump = cmd.jump || !!cmd.jumpPressed;
    if (this.pendingJump > 0) {
      this.pendingJump -= dt;
      jump = this.pendingJump <= 0;
      if (jump) this.pendingJump = 0;
    }
    if (jump && this.onGround) {
      v.y = c.jumpVelocity;
      this.onGround = false;
    }

    // Di chuyển ngang + va chạm.
    const bound = CONFIG.world.size;
    const prevY = p.y;
    p.x = clamp(p.x + v.x * dt, -bound, bound);
    p.z = clamp(p.z + v.z * dt, -bound, bound);
    resolveHorizontal(p, c.radius, obstacles);

    // Trọng lực + tiếp đất.
    v.y -= c.gravity * dt;
    p.y += v.y * dt;
    const floor = groundHeightAt(p, prevY, obstacles);
    if (p.y <= floor) {
      p.y = floor;
      v.y = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }
  }

  /**
   * @param alpha phần dư của bước vật lý (0..1) để nội suy vị trí hiển thị.
   * @param aimYaw nếu có, nhân vật quay mặt theo hướng ngắm; nếu null thì quay theo hướng chạy.
   */
  render(alpha: number, dt: number, aimYaw: number | null = null): void {
    this.object.position.lerpVectors(this.prevPosition, this.position, alpha);

    const speed = this.horizontalSpeed;
    const facing = aimYaw ?? (speed > 0.2 ? Math.atan2(this.velocity.x, this.velocity.z) : null);
    if (facing !== null) {
      // Nằm sấp xoay người chậm hơn (thân dài, phải trườn).
      const sharp = CONFIG.player.turnSharpness * (this.posture === 'prone' ? 0.35 : 1);
      this.object.rotation.y += angleDelta(this.object.rotation.y, facing) * damp(sharp, dt);
    }

    if (this.character) this.animateCharacter(this.character, speed, dt);
    else this.animateCapsule(speed, dt);
  }

  dispose(): void {
    this.disposed = true;
    this.character?.dispose();
    this.body.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        (obj.material as THREE.Material).dispose();
      }
    });
  }

  /** Chọn animation theo trạng thái vật lý và chỉnh tốc độ phát cho khớp bước chân. */
  private animateCharacter(character: CharacterModel, speed: number, dt: number): void {
    const c = CONFIG.character;
    const moving = speed > 0.25;
    let state: MoveState;
    if (this.posture === 'crouch' && character.has('crouch')) {
      state = moving && character.has('crouchWalk') ? 'crouchWalk' : 'crouch';
    } else if (this.posture === 'prone' && character.has('prone')) {
      state = moving && character.has('crawl') ? 'crawl' : 'prone';
    } else if (!this.onGround && character.has('jump')) state = 'jump';
    else if (!this.onGround)
      state = character.state ?? 'idle'; // không có clip nhảy: giữ nguyên
    else if (speed < 0.5) state = 'idle';
    else if (speed < c.runThreshold) state = 'walk';
    else state = 'run';
    // Đổi tư thế (ngồi xuống / nằm xuống / đứng dậy) chuyển chậm hơn đổi bước chân.
    const group = (s: MoveState | null) =>
      s === 'crouch' || s === 'crouchWalk' ? 1 : s === 'prone' || s === 'crawl' ? 2 : 0;
    const postureChange = group(state) !== group(character.state);
    character.setState(state, postureChange ? c.postureFade : c.fade);

    if (!this.onGround && !character.has('jump')) {
      character.setTimeScale(0.35); // lơ lửng trên không → bước chân chậm lại
    } else if (state === 'crouchWalk' || state === 'crawl') {
      const clipSpeed = state === 'crouchWalk' ? c.crouchClipSpeed : c.crawlClipSpeed;
      character.setTimeScale(clamp(speed / clipSpeed, 0.4, 1.8));
    } else if (state === 'walk' || state === 'run') {
      // Đi lùi so với hướng mặt (khi đang ngắm) → phát animation ngược.
      const yaw = this.object.rotation.y;
      const forward = (this.velocity.x * Math.sin(yaw) + this.velocity.z * Math.cos(yaw)) / speed;
      const direction = forward < -0.3 ? -1 : 1;
      const clipSpeed = state === 'walk' ? c.walkClipSpeed : c.runClipSpeed;
      character.setTimeScale(direction * clamp(speed / clipSpeed, 0.5, 1.6));
    }
    character.update(dt);
  }

  /** Hoạt ảnh đơn giản cho viên thuốc: nhún khi đi, co giãn khi nhảy, nghiêng theo tốc độ. */
  private animateCapsule(speed: number, dt: number): void {
    this.walkCycle = this.onGround && speed > 0.3 ? this.walkCycle + dt * speed * 2.2 : 0;
    this.body.position.y = 0.9 + Math.abs(Math.sin(this.walkCycle)) * 0.12;

    const stretch = this.onGround ? 1 : clamp(1 + this.velocity.y * 0.02, 0.85, 1.2);
    const squash = 1 / Math.sqrt(stretch);
    this.body.scale.set(squash, stretch, squash);
    this.body.rotation.x += (speed * 0.025 - this.body.rotation.x) * damp(12, dt);
  }
}
