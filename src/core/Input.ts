/** Bảng phím — đổi phím tại đây. */
export const BINDINGS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  run: ['ShiftLeft', 'ShiftRight'],
  jump: ['Space'],
  crouch: ['KeyC', 'ControlLeft'],
  prone: ['KeyZ'],
  interact: ['KeyE', 'KeyF'],
  lights: ['KeyL'],
  pause: ['Escape', 'KeyP'],
} as const;

export type Action = keyof typeof BINDINGS;

const PREVENT_DEFAULT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
/** Trình duyệt di động phát thêm sự kiện chuột giả sau khi chạm — bỏ qua trong khoảng này. */
const TOUCH_MOUSE_GUARD_MS = 800;

/**
 * Gom mọi nguồn input về một chỗ:
 * - Bàn phím + chuột (Pointer Lock, hoặc di chuột thường nếu không khóa được).
 * - Điều khiển ảo trên màn hình cảm ứng (joystick, nút) qua các hàm setVirtual*().
 * Trạng thái "pressed", độ xoay và zoom tích lũy trong frame, xóa ở endFrame().
 */
export class Input {
  /** Bật khi đang chơi: chuột di chuyển sẽ xoay camera. */
  captureMouse = false;

  private readonly held = new Set<string>();
  private readonly pressed = new Set<string>();
  private readonly virtualHeld = new Set<Action>();
  private readonly virtualPressed = new Set<Action>();
  private virtualMoveX = 0;
  private virtualMoveY = 0;
  private lookX = 0;
  private lookY = 0;
  private zoom = 0;
  private lastTouchTime = -Infinity;
  private readonly lockListeners = new Set<(locked: boolean) => void>();
  private readonly abort = new AbortController();

  constructor(private readonly surface: HTMLElement) {
    const opts = { signal: this.abort.signal };

    window.addEventListener('keydown', this.onKeyDown, opts);
    window.addEventListener('keyup', (e) => this.held.delete(e.code), opts);
    window.addEventListener('blur', () => this.reset(), opts);

    document.addEventListener('mousemove', this.onMouseMove, opts);
    document.addEventListener('pointerlockchange', this.handleLockChange, opts);
    surface.addEventListener('contextmenu', (e) => e.preventDefault(), opts);
    surface.addEventListener('wheel', (e) => (this.zoom += e.deltaY), {
      ...opts,
      passive: true,
    });
  }

  // ---------- Pointer Lock ----------

  get locked(): boolean {
    return document.pointerLockElement === this.surface;
  }

  /** Phải gọi trong một thao tác của người dùng (click, phím). */
  requestLock(): Promise<boolean> {
    if (this.locked) return Promise.resolve(true);
    try {
      return Promise.resolve(this.surface.requestPointerLock()).then(
        () => true,
        () => false,
      );
    } catch {
      return Promise.resolve(false);
    }
  }

  exitLock(): void {
    if (this.locked) document.exitPointerLock();
  }

  onLockChange(listener: (locked: boolean) => void): void {
    this.lockListeners.add(listener);
  }

  // ---------- Điều khiển ảo (cảm ứng) ----------

  /** Joystick: x = phải(+)/trái(-), y = tiến(+)/lùi(-), độ dài 0..1. */
  setVirtualMove(x: number, y: number): void {
    this.virtualMoveX = x;
    this.virtualMoveY = y;
  }

  setVirtualAction(action: Action, down: boolean): void {
    if (down && !this.virtualHeld.has(action)) this.virtualPressed.add(action);
    if (down) this.virtualHeld.add(action);
    else this.virtualHeld.delete(action);
  }

  /** Cộng thêm độ xoay camera (đơn vị như pixel chuột). */
  addLook(dx: number, dy: number): void {
    this.lookX += dx;
    this.lookY += dy;
  }

  addZoom(amount: number): void {
    this.zoom += amount;
  }

  /** Gọi khi có thao tác chạm, để bỏ qua sự kiện chuột giả đi kèm. */
  markTouch(): void {
    this.lastTouchTime = performance.now();
  }

  // ---------- Đọc trạng thái ----------

  isDown(action: Action): boolean {
    return this.virtualHeld.has(action) || BINDINGS[action].some((c) => this.held.has(c));
  }

  wasPressed(action: Action): boolean {
    return this.virtualPressed.has(action) || BINDINGS[action].some((c) => this.pressed.has(c));
  }

  /**
   * Trục di chuyển: x = phải(+)/trái(-), y = tiến(+)/lùi(-).
   * Joystick cho giá trị analog; bàn phím cho -1/0/1.
   */
  moveAxis(): { x: number; y: number } {
    if (this.virtualMoveX !== 0 || this.virtualMoveY !== 0) {
      return { x: this.virtualMoveX, y: this.virtualMoveY };
    }
    return {
      x: Number(this.isDown('right')) - Number(this.isDown('left')),
      y: Number(this.isDown('forward')) - Number(this.isDown('back')),
    };
  }

  /** Độ dịch chuột/ngón tay và zoom tích lũy từ frame trước. */
  look(): { dx: number; dy: number; zoom: number } {
    return { dx: this.lookX, dy: this.lookY, zoom: this.zoom };
  }

  endFrame(): void {
    this.pressed.clear();
    this.virtualPressed.clear();
    this.lookX = this.lookY = this.zoom = 0;
  }

  /** Xóa phím đang giữ (khi mất focus/tạm dừng). Không đụng tới joystick đang chạm. */
  reset(): void {
    this.held.clear();
    this.pressed.clear();
    this.endFrame();
  }

  dispose(): void {
    this.exitLock();
    this.abort.abort();
    this.lockListeners.clear();
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (PREVENT_DEFAULT.has(e.code)) e.preventDefault();
    if (!e.repeat) this.pressed.add(e.code);
    this.held.add(e.code);
  };

  private readonly onMouseMove = (e: MouseEvent): void => {
    if (!this.captureMouse && !this.locked) return;
    if (performance.now() - this.lastTouchTime < TOUCH_MOUSE_GUARD_MS) return;
    this.lookX += e.movementX;
    this.lookY += e.movementY;
  };

  private readonly handleLockChange = (): void => {
    const locked = this.locked;
    this.lockListeners.forEach((l) => l(locked));
  };
}
