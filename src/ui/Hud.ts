export interface HudStats {
  fps: number;
  x: number;
  y: number;
  z: number;
  speed: number;
  /** Khoảng cách tới điểm đang ngắm, null nếu không trúng gì. */
  targetDistance: number | null;
}

/** Lớp giao diện phủ trên canvas: hướng dẫn, tâm ngắm, thông số và màn tạm dừng. */
export class Hud {
  private readonly root: HTMLDivElement;
  private readonly stats: HTMLDivElement;
  private readonly crosshair: HTMLDivElement;
  private readonly pauseOverlay: HTMLDivElement;
  private readonly pauseTitle: HTMLHeadingElement;
  private readonly pauseActions: HTMLDivElement;
  private lastStatsUpdate = 0;

  constructor(
    container: HTMLElement,
    private readonly isTouch = false,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    const hint = isTouch
      ? 'Bên trái: kéo để đi, đẩy hết cỡ để chạy<br>Bên phải: vuốt để xoay camera<br>Nút tròn góc phải: nhảy · Ngồi / Nằm'
      : 'Di chuột để ngắm · <kbd>Esc</kbd> để tạm dừng';
    this.root.innerHTML = `
      <div class="hud-panel">
        <div class="hud-help"><kbd>WASD</kbd>/<kbd>←↑↓→</kbd> di chuyển · <kbd>Shift</kbd> chạy · <kbd>Space</kbd> nhảy · <kbd>C</kbd> ngồi xổm · <kbd>Z</kbd> nằm sấp</div>
        <div class="hud-help"><kbd>Chuột</kbd> ngắm · <kbd>Lăn chuột</kbd> zoom · <kbd>Esc</kbd> tạm dừng</div>
        <div class="hud-stats"></div>
      </div>
      <div class="hud-crosshair" hidden></div>
      <div class="rotate-hint">
        <div class="rotate-phone"></div>
        <p>Xoay ngang điện thoại để chơi</p>
      </div>
      <div class="hud-pause">
        <div class="hud-pause-card">
          <h1></h1>
          <p>${hint}</p>
          <div class="hud-pause-actions" hidden>
            <button class="hud-btn hud-btn-primary" type="button">Tiếp tục</button>
            <button class="hud-btn hud-exit" type="button">Thoát</button>
          </div>
        </div>
      </div>`;
    container.appendChild(this.root);

    this.stats = this.root.querySelector('.hud-stats')!;
    this.crosshair = this.root.querySelector('.hud-crosshair')!;
    this.pauseOverlay = this.root.querySelector('.hud-pause')!;
    this.pauseTitle = this.root.querySelector('.hud-pause h1')!;
    this.pauseActions = this.root.querySelector('.hud-pause-actions')!;
    this.setPaused(true, false);
  }

  /** Nút "Thoát" ở màn tạm dừng. */
  onExitClick(handler: () => void): void {
    this.root.querySelector('.hud-exit')!.addEventListener('click', (e) => {
      e.stopPropagation(); // không để lan ra lớp phủ (sẽ thành "chơi tiếp")
      handler();
    });
  }

  onResumeClick(handler: () => void): void {
    this.pauseOverlay.addEventListener('click', handler);
    // Chạm vào màn "xoay ngang" cũng thử vào toàn màn hình + khóa ngang (Android).
    this.root.querySelector('.rotate-hint')!.addEventListener('click', handler);
  }

  private loading = false;

  /** Màn chờ tải: chưa cho bấm chơi. */
  setLoading(loading: boolean): void {
    this.loading = loading;
    this.pauseOverlay.classList.toggle('loading', loading);
    if (loading) this.pauseTitle.textContent = 'Đang tải khu rừng…';
    else this.setPaused(!this.pauseOverlay.hidden, false);
  }

  setPaused(paused: boolean, hasStarted: boolean): void {
    this.pauseOverlay.hidden = !paused;
    this.crosshair.hidden = paused;
    const start = this.isTouch ? 'Chạm để chơi' : 'Bấm để chơi';
    this.pauseTitle.textContent = this.loading
      ? 'Đang tải khu rừng…'
      : hasStarted
        ? 'Tạm dừng'
        : start;
    // Đang giữa ván → có nút Tiếp tục / Thoát; màn bắt đầu thì chỉ cần chạm.
    this.pauseActions.hidden = !hasStarted;
  }

  /** Tâm ngắm đổi màu khi đang chỉ vào bề mặt. */
  setTargeting(onTarget: boolean): void {
    this.crosshair.classList.toggle('on-target', onTarget);
  }

  /** Cập nhật thông số tối đa ~10 lần/giây để không tốn DOM work. */
  setStats(s: HudStats, now: number): void {
    if (now - this.lastStatsUpdate < 100) return;
    this.lastStatsUpdate = now;
    const target = s.targetDistance === null ? '—' : `${s.targetDistance.toFixed(1)} m`;
    this.stats.textContent =
      `${Math.round(s.fps)} FPS · x ${s.x.toFixed(1)}  y ${s.y.toFixed(1)}  z ${s.z.toFixed(1)}` +
      ` · tốc độ ${s.speed.toFixed(1)} · mục tiêu ${target}`;
  }

  dispose(): void {
    this.root.remove();
  }
}
