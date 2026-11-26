import * as THREE from 'three';
import { CONFIG } from '@/config';
import { ThirdPersonCamera } from '@/camera/ThirdPersonCamera';
import { Player, type PlayerCommand } from '@/entities/Player';
import { AimTarget } from '@/gameplay/AimTarget';
import { PostFX } from '@/render/PostFX';
import { Hud } from '@/ui/Hud';
import { TouchControls } from '@/ui/TouchControls';
import { IS_TOUCH_DEVICE } from '@/utils/device';
import { World } from '@/world/World';
import type { Interactable } from '@/world/Door';
import { EngineSound } from '@/audio/EngineSound';
import { Car } from '@/vehicle/Car';
import { CarModel } from '@/vehicle/CarModel';
import type { CarInput } from '@/vehicle/CarPhysics';
import { windUniforms } from '@/world/props/nature';
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
  /** Hậu kỳ (chỉ máy tính); null = render thẳng. */
  private readonly postFx: PostFX | null = null;
  private readonly portraitQuery = window.matchMedia('(orientation: portrait)');
  private readonly timer = new THREE.Clock(false);
  private readonly command: PlayerCommand = { moveX: 0, moveZ: 0, run: false, jump: false };

  private accumulator = 0;
  private fps = 60;
  private paused = true;
  private hasStarted = false;

  constructor(private readonly container: HTMLElement) {
    const usePostFx = CONFIG.render.postprocessing && !IS_TOUCH_DEVICE;
    // Có hậu kỳ thì khử răng cưa bằng SMAA, không cần MSAA của canvas.
    this.renderer = new THREE.WebGLRenderer({
      antialias: !usePostFx,
      powerPreference: 'high-performance',
    });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = CONFIG.render.exposure;
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
    if (usePostFx) this.postFx = new PostFX(this.renderer, this.world.scene, this.cam.camera);
    this.input = new Input(this.renderer.domElement);
    this.hud = new Hud(container, IS_TOUCH_DEVICE);
    this.hud.onExitClick(this.exitToStart);
    this.renderer.localClippingEnabled = true; // cắt phần đầu nhân vật trong camera chính
    this.player.setViewCamera(this.cam.mode === 'first' ? this.cam.camera : null);
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
    this.hud.setLoading(true);
    this.world.ready
      .catch((err) => console.error('[Game] Lỗi tải bản đồ:', err))
      .finally(() => {
        this.placeAtSpawn();
        this.loading = false;
        this.hud.setLoading(false);
        void this.spawnCar();
      });
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
    this.engine.dispose();
    this.touch?.dispose();
    this.hud.dispose();
    this.aim.dispose();
    this.player.dispose();
    this.postFx?.dispose();
    this.world.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  /** Đưa người chơi về chỗ xuất phát của bản đồ, camera nhìn theo hướng mặt nhân vật. */
  private placeAtSpawn(): void {
    const s = this.world.spawn;
    this.player.teleport(s.x, 0, s.z);
    this.player.object.rotation.y = s.rotY;
    this.cam.yaw = s.rotY + Math.PI;
  }

  /** Đang trong ván chơi (kể cả lúc tạm dừng). Ngoài ván = màn bắt đầu, cầm dọc thoải mái. */
  private set inSession(value: boolean) {
    this.sessionActive = value;
    document.body.classList.toggle('in-session', value);
  }

  private sessionActive = false;

  private loading = true;

  private readonly resume = (): void => {
    if (!this.paused || this.loading) return;
    this.inSession = true;
    this.engine.unlock(); // trình duyệt chỉ cho phát âm thanh sau thao tác của người dùng
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

    this.placeAtSpawn();
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
      if (this.driving) this.applyDriveLook(look.dx, look.dy);
      else this.cam.applyInput(look.dx, look.dy, look.zoom);
      this.updateCommand();
      if (this.driving && this.input.wasPressed('interact')) this.exitCar();
      if (this.driving && this.input.wasPressed('lights')) this.car?.toggleHeadlights();

      this.accumulator += dt;
      while (this.accumulator >= fixedStep) {
        if (this.driving) {
          this.car!.fixedUpdate(fixedStep, this.carInput);
        } else {
          this.player.fixedUpdate(fixedStep, this.command, this.world.obstacles);
          // Xe không người lái: kéo phanh tay, trôi rồi đứng yên.
          this.car?.fixedUpdate(fixedStep, Game.PARKED);
        }
        this.accumulator -= fixedStep;
        // Lệnh bấm-1-lần chỉ được xử lý ở đúng 1 bước vật lý.
        this.command.toggleCrouch = this.command.toggleProne = this.command.jumpPressed = false;
      }
    }

    const alpha = this.accumulator / fixedStep;
    const renderDt = this.paused ? 0 : dt;
    const aiming = this.hasStarted;
    const firstPerson = this.cam.mode === 'first';
    // Góc nhìn thứ nhất: thân luôn quay theo hướng nhìn.
    const faceAim = aiming && (firstPerson || CONFIG.player.faceAimDirection);
    this.car?.render(alpha, renderDt);
    let eye: THREE.Vector3 | null = null;
    if (this.driving && this.car) {
      // Ngồi ghế lái: hướng nhìn = hướng xe + góc quay đầu của người lái.
      this.cam.yaw = this.car.physics.heading + Math.PI + this.driveYaw;
      this.cam.pitch = this.drivePitch;
      eye = this.car.seatWorld(this.eyePos);
      this.player.teleport(this.car.physics.x, 0, this.car.physics.z);
    } else {
      this.player.render(
        alpha,
        renderDt,
        faceAim ? this.cam.facingYaw : null,
        firstPerson ? this.cam.pitch : 0,
      );
      if (firstPerson && this.player.eyePosition(this.eyePos)) eye = this.eyePos;
    }
    this.cam.eyeSnap = this.driving;
    // Camera vẫn bám theo khi tạm dừng (để màn "Bấm để chơi" có góc nhìn đúng).
    this.cam.update(
      this.player.object.position,
      dt,
      this.world.cameraBlockers,
      this.player.eyeHeight,
      { speed: this.player.horizontalSpeed, grounded: this.player.onGround },
      eye,
    );
    this.cam.camera.updateMatrixWorld();
    // Vòng mục tiêu trên bề mặt chỉ dùng ở góc nhìn thứ 3; góc thứ nhất chỉ có tâm ngắm.
    this.aim.update(
      this.cam.camera,
      this.world.aimTargets,
      renderDt,
      aiming && !this.paused && !firstPerson,
      this.cam.camera.position.distanceTo(this.player.object.position),
    );
    this.world.update(renderDt);
    const target = !this.paused && aiming && !this.driving ? this.findInteractable() : null;
    if (target && this.input.wasPressed('interact')) target.interact();
    this.hud.setPrompt(target ? target.prompt : null);
    this.touch?.setInteract(this.driving ? 'Xuống xe' : target ? target.prompt : null);
    this.updateVehicleHud();
    this.hud.setTargeting(firstPerson ? target !== null : this.aim.hasHit);
    this.world.followShadow(
      this.driving && this.car ? this.car.model.root.position : this.player.object.position,
    );

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

    windUniforms.uTime.value += renderDt;
    // Vị trí ngực nhân vật trong không gian camera → shader làm mờ lá chắn tầm nhìn.
    if (firstPerson) windUniforms.uFocusView.value.set(0, 0, -1e6);
    else {
      windUniforms.uFocusView.value
        .copy(this.player.object.position)
        .setY(this.player.object.position.y + 1.1)
        .applyMatrix4(this.cam.camera.matrixWorldInverse);
    }
    this.renderMirrors();
    this.player.setHeadHidden(firstPerson);
    if (this.postFx) this.postFx.render(dt);
    else this.renderer.render(this.world.scene, this.cam.camera);
    this.player.setHeadHidden(false);
    this.input.endFrame();
  };

  private static readonly UNUSED_GROUP = new THREE.Group(); // tham số group không dùng tới
  private readonly frustum = new THREE.Frustum();
  private readonly frustumMatrix = new THREE.Matrix4();
  private readonly mirrorUpdaters = new Map<THREE.Object3D, THREE.Object3D['onBeforeRender']>();

  /**
   * Vẽ phản chiếu của các gương đang nằm trong khung nhìn — TRƯỚC lượt vẽ chính, lúc đầu
   * nhân vật còn hiện đầy đủ. Trong lượt vẽ chính (và các lượt hậu kỳ) gương chỉ dùng lại
   * texture đã vẽ, không tự vẽ lại → vừa đúng vừa nhẹ hơn.
   */
  private renderMirrors(): void {
    const mirrors = this.world.mirrors;
    if (mirrors.length === 0) return;
    const camera = this.cam.camera;
    this.frustumMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.frustumMatrix);
    for (const m of mirrors) {
      let update = this.mirrorUpdaters.get(m);
      if (!update) {
        update = m.onBeforeRender;
        this.mirrorUpdaters.set(m, update);
        m.onBeforeRender = () => {};
      }
      if (!this.frustum.intersectsObject(m)) continue;
      const geo = (m as THREE.Mesh).geometry;
      update.call(
        m,
        this.renderer,
        this.world.scene,
        camera,
        geo,
        (m as THREE.Mesh).material as THREE.Material,
        Game.UNUSED_GROUP,
      );
    }
  }

  private readonly interactRay = new THREE.Raycaster();
  private readonly eyePos = new THREE.Vector3();
  private static readonly SCREEN_CENTER = new THREE.Vector2(0, 0);

  /** Vật tương tác ở tâm màn hình, trong tầm với của nhân vật (vd. cánh cửa). */
  private findInteractable(): Interactable | null {
    const list = this.world.interactables;
    if (list.length === 0) return null;
    const reach = CONFIG.interact.reach;
    const p = this.player.object.position;
    const near = list.filter((i) => i.center.distanceTo(p) < reach + 1.5);
    if (near.length === 0) return null;
    this.interactRay.setFromCamera(Game.SCREEN_CENTER, this.cam.camera);
    this.interactRay.far =
      this.cam.mode === 'first' ? reach : this.cam.camera.position.distanceTo(p) + reach;
    const hit = this.interactRay.intersectObjects(
      near.flatMap((i) => i.targets),
      false,
    )[0];
    if (!hit) return null;
    const found = hit.object.userData.interactable as Interactable | undefined;
    if (!found) return null;
    // Góc nhìn thứ 3: điểm trúng phải gần nhân vật.
    return hit.point.distanceTo(p) < reach + 0.8 ? found : null;
  }

  // ---------------- Lái xe ----------------
  private car: Car | null = null;
  private driving = false;
  private driveYaw = 0;
  private drivePitch = 0.12;
  private readonly engine = new EngineSound();
  private readonly carInput: CarInput = { throttle: 0, brake: 0, steer: 0, handbrake: false };
  private static readonly PARKED: CarInput = { throttle: 0, brake: 0.4, steer: 0, handbrake: true };

  /** Nạp xe và đặt ở bãi đỗ. */
  private async spawnCar(): Promise<void> {
    const v = CONFIG.vehicle;
    try {
      const model = await CarModel.load(import.meta.env.BASE_URL + v.url);
      const car = new Car(model, v.spawn.x, v.spawn.z, v.spawn.heading);
      this.world.scene.add(model.root);
      this.world.obstacles.push(car.collider);
      this.world.interactables.push(car);
      car.setObstacles(this.world.obstacles);
      car.onEnter = () => this.enterCar();
      this.car = car;
    } catch (err) {
      console.error('[Game] Không tải được xe:', err);
    }
  }

  private enterCar(): void {
    if (!this.car || this.driving) return;
    this.driving = true;
    this.player.object.visible = false;
    this.driveYaw = 0;
    this.drivePitch = 0.12;
    document.body.classList.add('driving');
    this.engine.unlock();
  }

  private exitCar(): void {
    if (!this.car || !this.driving) return;
    // Phải gần như dừng hẳn mới mở cửa bước xuống được.
    if (Math.abs(this.car.physics.speed) > 2) {
      this.hud.flash('Dừng xe để xuống');
      return;
    }
    this.driving = false;
    const out = this.car.exitWorld(new THREE.Vector3());
    this.player.teleport(out.x, 0, out.z);
    this.player.object.visible = true;
    this.cam.yaw = this.car.physics.heading + Math.PI - Math.PI / 2; // nhìn ra ngoài cửa
    this.cam.pitch = 0;
    document.body.classList.remove('driving');
  }

  private applyDriveLook(dx: number, dy: number): void {
    const c = CONFIG.camera;
    this.driveYaw = THREE.MathUtils.clamp(this.driveYaw - dx * c.yawSpeed, -2.1, 2.1);
    this.drivePitch = THREE.MathUtils.clamp(this.drivePitch + dy * c.pitchSpeed, -0.6, 1.0);
  }

  /** Phím/joystick → ga, phanh, lái. S khi đang chạy tới = phanh; khi gần đứng yên = lùi. */
  private updateCarInput(): void {
    const car = this.car;
    if (!car) return;
    const axis = this.input.moveAxis();
    const fwd = Math.max(0, axis.y);
    const back = Math.max(0, -axis.y);
    const u = car.physics.speed;
    const ci = this.carInput;
    ci.steer = -axis.x;
    ci.handbrake = this.input.isDown('jump');
    ci.throttle = 0;
    ci.brake = 0;
    if (fwd > 0) {
      if (u < -0.8)
        ci.brake = fwd; // đang lùi → W là phanh
      else {
        car.physics.selectDirection(true);
        ci.throttle = fwd;
      }
    } else if (back > 0) {
      if (u > 0.8)
        ci.brake = back; // đang chạy tới → S là phanh
      else {
        car.physics.selectDirection(false);
        ci.throttle = back;
      }
    }
  }

  private updateVehicleHud(): void {
    const car = this.car;
    if (!this.driving || !car) {
      this.hud.setVehicle(null);
      this.engine.update(false, 0, 0, 0);
      return;
    }
    const p = car.physics;
    this.hud.setVehicle({
      kmh: Math.abs(p.speed) * 3.6,
      gear: p.gear,
      rpm: p.rpm,
      redline: p.spec.redlineRpm,
      lights: car.headlights,
    });
    this.engine.update(!this.paused, p.rpm, this.carInput.throttle, p.slip);
  }

  private updateCommand(): void {
    if (this.driving) {
      this.updateCarInput();
      return;
    }
    const axis = this.input.moveAxis();
    const dir = this.cam.inputToWorld(axis.x, axis.y);
    // Joystick đẩy nhẹ → đi chậm (analog); bàn phím luôn là 1.
    const amount = Math.min(Math.hypot(axis.x, axis.y), 1);
    this.command.moveX = dir.x * amount;
    this.command.moveZ = dir.z * amount;
    this.command.run = this.input.isDown('run');
    this.command.jump = this.input.isDown('jump');
    // Giữ lại tới khi có bước vật lý xử lý (frame có thể không chạy bước nào).
    this.command.toggleCrouch ||= this.input.wasPressed('crouch');
    this.command.toggleProne ||= this.input.wasPressed('prone');
    this.command.jumpPressed ||= this.input.wasPressed('jump');
  }

  private readonly onResize = (): void => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.postFx?.setSize(w, h, this.renderer.getPixelRatio());
    this.cam.resize(w / h);
  };

  private readonly onBlur = (): void => this.setPaused(true);

  private readonly onVisibilityChange = (): void => {
    if (document.hidden) this.setPaused(true);
  };
}
