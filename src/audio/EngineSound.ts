/**
 * Tiếng động cơ + rít lốp tổng hợp bằng Web Audio (không cần file âm thanh):
 * - Động cơ: 2 dao động sóng răng cưa/vuông theo tần số nổ (vòng tua) qua bộ lọc thông thấp;
 *   đạp ga → to + sáng tiếng hơn.
 * - Rít lốp: tiếng ồn trắng qua bộ lọc dải, to theo mức trượt bánh.
 * AudioContext chỉ tạo sau một thao tác của người dùng (quy định của trình duyệt).
 */
export class EngineSound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private oscA!: OscillatorNode;
  private oscB!: OscillatorNode;
  private filter!: BiquadFilterNode;
  private engineGain!: GainNode;
  private screechGain!: GainNode;

  /** Gọi trong sự kiện click/chạm/phím (để trình duyệt cho phép phát âm thanh). */
  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);

    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.Q.value = 2;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0.06;
    this.filter.connect(this.engineGain).connect(this.master);

    this.oscA = ctx.createOscillator();
    this.oscA.type = 'sawtooth';
    this.oscB = ctx.createOscillator();
    this.oscB.type = 'square';
    const bGain = ctx.createGain();
    bGain.gain.value = 0.4;
    this.oscA.connect(this.filter);
    this.oscB.connect(bGain).connect(this.filter);
    this.oscA.start();
    this.oscB.start();

    // Rít lốp: ồn trắng lặp vô hạn qua bộ lọc dải ~1.8 kHz.
    const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1800;
    band.Q.value = 6;
    this.screechGain = ctx.createGain();
    this.screechGain.gain.value = 0;
    src.connect(band).connect(this.screechGain).connect(this.master);
    src.start();
  }

  /** Cập nhật mỗi frame. `active` = đang ngồi trong xe và không tạm dừng. */
  update(active: boolean, rpm: number, throttle: number, slip: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const fire = (rpm / 60) * 2; // động cơ 4 xi-lanh: 2 lần nổ mỗi vòng
    this.oscA.frequency.setTargetAtTime(fire, t, 0.03);
    this.oscB.frequency.setTargetAtTime(fire * 0.5, t, 0.03);
    this.filter.frequency.setTargetAtTime(300 + throttle * 1500 + rpm * 0.12, t, 0.05);
    this.engineGain.gain.setTargetAtTime(0.045 + throttle * 0.06, t, 0.05);
    this.screechGain.gain.setTargetAtTime(slip * 0.12, t, 0.05);
    this.master.gain.setTargetAtTime(active ? 1 : 0, t, 0.15);
  }

  dispose(): void {
    void this.ctx?.close();
    this.ctx = null;
  }
}
