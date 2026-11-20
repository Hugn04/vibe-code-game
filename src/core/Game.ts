import * as THREE from 'three';
import { CONFIG } from '@/config';
import { ThirdPersonCamera } from '@/camera/ThirdPersonCamera';
import { Player, type PlayerCommand } from '@/entities/Player';
import { AimTarget } from '@/gameplay/AimTarget';
import { Hud } from '@/ui/Hud';
import { TouchControls } from '@/ui/TouchControls';
import { IS_TOUCH_DEVICE } from '@/utils/device';
import { World } from '@/world/World';
import { Input } from './Input';

/**
 * Điều phối vòng lặp game:
 * input → vật lý bước cố định (fixed timestep) → nội suy hiển thị → ngắm → render.
 */
export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly world = new World();
  private readonly player = new Player();
  private readonly aim = new AimTarget();
  private readonly cam: ThirdPersonCamera;
  private readonly input: Input;
  private readonly hud: Hud;
  private readonly touch: TouchControls | null = null;
  private readonly portraitQuery = window.matchMedia('(orientation: portrait)');
  private readonly timer = new THREE.Clock(false);
  private readonly command: PlayerCommand = { moveX: 0, moveZ: 0, run: false, jump: false };

  private accumulator = 0;
  private fps = 60;
  private paused = true;
  private hasStarted = false;

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    const maxRatio = IS_TOUCH_DEVICE
      ? CONFIG.render.mobileMaxPixelRatio
      : CONFIG.render.maxPixelRatio;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxRatio));
    this.renderer.shadowMap.enabled = true;
    // Bóng mềm tốn GPU — điện thoại dùng loại thường.
    this.renderer.shadowMap.type = IS_TOUCH_DEVICE ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);
    document.body.classList.toggle('is-touch', IS_TOUCH_DEVICE);

    this.cam = new ThirdPersonCamera(1);
    this.input = new Input(this.renderer.domElement);
    this.hud = new Hud(container, IS_TOUCH_DEVICE);
    this.hud.onExitClick(this.exitToStart);
    if (IS_TOUCH_DEVICE) {
      this.touch = new TouchControls(container, this.input, () => this.setPaused(true));
      this.touch.setVisible(false);
    }

    // Click vào màn tạm dừng / màn chơi → khóa chuột và chơi tiếp.
    this.hud.onResumeClick(this.resume);
    this.renderer.domElement.addEventListener('click', this.resume);
    // Thoát khóa chuột (Esc của trình duyệt) → tạm dừng.
    this.input.onLockChange((locked) => {
      if (!locked) this.setPaused(true);
    });

    this.world.scene.add(this.player.object, this.aim.object);
    this.player.teleport(CONFIG.world.spawn.x, 0, CONFIG.world.spawn.z);
    this.player
      .loadCharacter(import.meta.env.BASE_URL + CONFIG.character.url)
      .catch((err) => console.error('[Game] Không tải được model nhân vật:', err));

    window.addEventListener('resize', this.onResize);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.portraitQuery.addEventListener('change', this.onOrientationChange);
    this.onResize();
  }

  start(): void {
    this.timer.start();
    this.renderer.setAnimationLoop(this.frame);
  }

  stop(): void {
    this.renderer.setAnimationLoop(null);
    this.timer.stop();
  }

  dispose(): void {
    this.stop();
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.portraitQuery.removeEventListener('change', this.onOrientationChange);
    this.renderer.domElement.removeEventListener('click', this.resume);
    this.input.dispose();
    this.touch?.dispose();
    this.hud.dispose();
    this.aim.dispose();
    this.player.dispose();
    this.world.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  /** Đang trong ván chơi (kể cả lúc tạm dừng). Ngoài ván = màn bắt đầu, cầm dọc thoải mái. */
  private set inSession(value: boolean) {
    this.sessionActive = value;
    document.body.classList.toggle('in-session', value);
  }

  private sessionActive = false;

  private readonly resume = (): void => {
    if (!this.paused) return;
    this.inSession = true;
    if (IS_TOUCH_DEVICE) {
      // Điện thoại: toàn màn hình + khóa ngang (Android). iPhone không hỗ trợ khóa →
      // người chơi tự xoay máy, màn "Xoay ngang điện thoại" sẽ nhắc.
      void this.enterLandscapeFullscreen().then(() => {
        if (!this.isPortrait()) this.setPaused(false);
      });
      if (this.isPortrait()) return; // chờ xoay xong mới chơi
    } else {
      // Khóa chuột nếu trình duyệt cho phép; nếu không vẫn chơi được bằng di chuột thường.
      void this.input.requestLock();
    }
    this.setPaused(false);
  };

  private isPortrait(): boolean {
    return IS_TOUCH_DEVICE && this.portraitQuery.matches;
  }

  private async enterLandscapeFullscreen(): Promise<void> {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
      }
      // screen.orientation.lock chỉ chạy khi đang toàn màn hình (Chrome Android).
      const orientation = screen.orientation as ScreenOrientation & {
        lock?: (o: 'landscape') => Promise<void>;
      };
      await orientation.lock?.('landscape');
    } catch {
      // Trình duyệt không hỗ trợ (iOS Safari, máy tính) — bỏ qua.
    }
  }

  /** Điện thoại bị xoay dọc khi đang chơi → tạm dừng, hiện màn nhắc xoay ngang. */
  private readonly onOrientationChange = (): void => {
    if (this.isPortrait()) {
      this.setPaused(true);
    } else if (IS_TOUCH_DEVICE && this.sessionActive && this.paused && !this.hasStarted) {
      // Vừa chạm "Chơi" khi đang cầm dọc rồi xoay ngang → vào chơi luôn, không cần chạm lại.
      this.setPaused(false);
    }
  };

  /**
   * Thoát ván: thoát toàn màn hình, mở khóa xoay (máy về cầm dọc được),
   * đưa nhân vật về chỗ xuất phát và hiện lại màn bắt đầu.
   */
  private readonly exitToStart = (): void => {
    this.setPaused(true);
    this.inSession = false;
    this.hasStarted = false;
    this.hud.setPaused(true, false);

    this.player.teleport(CONFIG.world.spawn.x, 0, CONFIG.world.spawn.z);
    this.cam.yaw = 0;
    this.cam.pitch = CONFIG.camera.pitch;
    this.cam.distance = CONFIG.camera.distance;

    try {
      (screen.orientation as ScreenOrientation & { unlock?: () => void }).unlock?.();
    } catch {
      // Không hỗ trợ — bỏ qua.
    }
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  };

  private setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    if (!paused) this.hasStarted = true;
    this.accumulator = 0;
    this.input.reset();
    this.input.captureMouse = !paused && !IS_TOUCH_DEVICE;
    if (paused) this.input.exitLock();
    this.touch?.setVisible(!paused);
    this.hud.setPaused(paused, this.hasStarted);
  }

  private readonly frame = (): void => {
    const { fixedStep, maxFrameTime } = CONFIG.physics;
    const dt = Math.min(this.timer.getDelta(), maxFrameTime);
    if (dt > 0) this.fps += (1 / dt - this.fps) * 0.05;

    if (this.input.wasPressed('pause')) {
      if (this.paused) this.resume();
      else this.setPaused(true);
    }

    if (!this.paused) {
      const look = this.input.look();
      this.cam.applyInput(look.dx, look.dy, look.zoom);
      this.updateCommand();

      this.accumulator += dt;
      while (this.accumulator >= fixedStep) {
        this.player.fixedUpdate(fixedStep, this.command, this.world.obstacles);
        this.accumulator -= fixedStep;
      }
    }

    const alpha = this.accumulator / fixedStep;
    const renderDt = this.paused ? 0 : dt;
    const aiming = this.hasStarted;
    this.player.render(alpha, renderDt, aiming ? this.cam.facingYaw : null);
    // Camera vẫn bám theo khi tạm dừng (để màn "Bấm để chơi" có góc nhìn đúng).
    this.cam.update(this.player.object.position, dt, this.world.cameraBlockers);
    this.cam.camera.updateMatrixWorld();
    this.aim.update(this.cam.camera, this.world.aimTargets, renderDt, aiming && !this.paused);
    this.hud.setTargeting(this.aim.hasHit);
    this.world.followShadow(this.player.object.position);

    const p = this.player.object.position;
    this.hud.setStats(
      {
        fps: this.fps,
        x: p.x,
        y: p.y,
        z: p.z,
        speed: this.player.horizontalSpeed,
        targetDistance: this.aim.hasHit ? this.aim.distance : null,
      },
      performance.now(),
    );

    this.renderer.render(this.world.scene, this.cam.camera);
    this.input.endFrame();
  };

  private updateCommand(): void {
    const axis = this.input.moveAxis();
    const dir = this.cam.inputToWorld(axis.x, axis.y);
    // Joystick đẩy nhẹ → đi chậm (analog); bàn phím luôn là 1.
    const amount = Math.min(Math.hypot(axis.x, axis.y), 1);
    this.command.moveX = dir.x * amount;
    this.command.moveZ = dir.z * amount;
    this.command.run = this.input.isDown('run');
    this.command.jump = this.input.isDown('jump');
  }

  private readonly onResize = (): void => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.cam.resize(w / h);
  };

  private readonly onBlur = (): void => this.setPaused(true);

  private readonly onVisibilityChange = (): void => {
    if (document.hidden) this.setPaused(true);
  };
}
