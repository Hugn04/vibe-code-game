import { CONFIG } from '@/config';
import type { Input } from '@/core/Input';

/**
 * Điều khiển cảm ứng:
 * - Nửa trái màn hình: joystick động (xuất hiện tại chỗ chạm). Đẩy hết cỡ = chạy.
 * - Nửa phải: vuốt để xoay camera/ngắm.
 * - Nút nhảy (góc phải dưới) và nút tạm dừng (góc phải trên).
 * Hỗ trợ đa điểm: vừa đi vừa xoay camera vừa nhảy cùng lúc.
 */
export class TouchControls {
  private readonly root: HTMLDivElement;
  private readonly joyBase: HTMLDivElement;
  private readonly joyKnob: HTMLDivElement;
  private readonly abort = new AbortController();

  private joyId: number | null = null;
  private joyOriginX = 0;
  private joyOriginY = 0;
  private lookId: number | null = null;
  private lookLastX = 0;
  private lookLastY = 0;

  constructor(
    container: HTMLElement,
    private readonly input: Input,
    onPause: () => void,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'touch-layer';
    this.root.innerHTML = `
      <div class="joy-base idle"><div class="joy-knob"></div></div>
      <button class="touch-btn touch-jump" aria-label="Nhảy">
        <svg viewBox="0 0 24 24" width="30" height="30"><path d="M12 4l-7 8h4.5v7h5v-7H19z" fill="currentColor"/></svg>
      </button>
      <button class="touch-btn touch-pause" aria-label="Tạm dừng"><span></span><span></span></button>`;
    container.appendChild(this.root);

    this.joyBase = this.root.querySelector('.joy-base')!;
    this.joyKnob = this.root.querySelector('.joy-knob')!;
    const jump = this.root.querySelector<HTMLButtonElement>('.touch-jump')!;
    const pause = this.root.querySelector<HTMLButtonElement>('.touch-pause')!;
    const opts = { signal: this.abort.signal };

    this.root.addEventListener('pointerdown', this.onDown, opts);
    this.root.addEventListener('pointermove', this.onMove, opts);
    this.root.addEventListener('pointerup', this.onUp, opts);
    this.root.addEventListener('pointercancel', this.onUp, opts);
    this.root.addEventListener('contextmenu', (e) => e.preventDefault(), opts);

    const setJump = (down: boolean) => (e: PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      this.input.markTouch();
      jump.classList.toggle('pressed', down);
      this.input.setVirtualAction('jump', down);
    };
    jump.addEventListener('pointerdown', setJump(true), opts);
    jump.addEventListener('pointerup', setJump(false), opts);
    jump.addEventListener('pointercancel', setJump(false), opts);
    jump.addEventListener('pointerleave', setJump(false), opts);

    pause.addEventListener(
      'pointerdown',
      (e) => {
        e.stopPropagation();
        e.preventDefault();
        onPause();
      },
      opts,
    );
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
    if (!visible) this.releaseAll();
  }

  dispose(): void {
    this.releaseAll();
    this.abort.abort();
    this.root.remove();
  }

  private readonly onDown = (e: PointerEvent): void => {
    if (e.target !== this.root && e.target !== this.joyBase && e.target !== this.joyKnob) return;
    e.preventDefault();
    this.input.markTouch();

    if (e.clientX < window.innerWidth * 0.45 && this.joyId === null) {
      this.joyId = e.pointerId;
      this.joyOriginX = e.clientX;
      this.joyOriginY = e.clientY;
      this.joyBase.classList.remove('idle');
      this.joyBase.style.left = `${e.clientX}px`;
      this.joyBase.style.top = `${e.clientY}px`;
      this.setKnob(0, 0);
    } else if (this.lookId === null) {
      this.lookId = e.pointerId;
      this.lookLastX = e.clientX;
      this.lookLastY = e.clientY;
    } else {
      return;
    }
    try {
      this.root.setPointerCapture(e.pointerId);
    } catch {
      // Ngón tay đã nhấc trước khi kịp bắt — bỏ qua.
    }
  };

  private readonly onMove = (e: PointerEvent): void => {
    if (e.pointerId === this.joyId) {
      const radius = CONFIG.touch.joystickRadius;
      let dx = e.clientX - this.joyOriginX;
      let dy = e.clientY - this.joyOriginY;
      const dist = Math.hypot(dx, dy);
      if (dist > radius) {
        dx = (dx / dist) * radius;
        dy = (dy / dist) * radius;
      }
      this.setKnob(dx, dy);

      // Vùng chết nhỏ ở giữa để không bị trôi khi chỉ đặt ngón tay.
      const deadZone = 0.12;
      const mag = Math.min(dist / radius, 1);
      const scaled = mag < deadZone ? 0 : (mag - deadZone) / (1 - deadZone);
      const nx = dist > 0 ? (dx / Math.min(dist, radius)) * scaled : 0;
      const ny = dist > 0 ? (-dy / Math.min(dist, radius)) * scaled : 0;
      this.input.setVirtualMove(nx, ny);
      this.input.setVirtualAction('run', mag >= CONFIG.touch.runThreshold);
    } else if (e.pointerId === this.lookId) {
      const s = CONFIG.touch.lookSensitivity;
      this.input.addLook((e.clientX - this.lookLastX) * s, (e.clientY - this.lookLastY) * s);
      this.lookLastX = e.clientX;
      this.lookLastY = e.clientY;
    }
  };

  private readonly onUp = (e: PointerEvent): void => {
    if (e.pointerId === this.joyId) this.releaseJoystick();
    if (e.pointerId === this.lookId) this.lookId = null;
  };

  private releaseJoystick(): void {
    this.joyId = null;
    this.joyBase.classList.add('idle');
    this.joyBase.style.left = '';
    this.joyBase.style.top = '';
    this.setKnob(0, 0);
    this.input.setVirtualMove(0, 0);
    this.input.setVirtualAction('run', false);
  }

  private releaseAll(): void {
    this.releaseJoystick();
    this.lookId = null;
    this.input.setVirtualAction('jump', false);
    this.root.querySelector('.touch-jump')?.classList.remove('pressed');
  }

  private setKnob(dx: number, dy: number): void {
    this.joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }
}
