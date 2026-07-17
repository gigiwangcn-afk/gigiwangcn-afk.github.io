export class SignalNoise {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d', { alpha: true });
    this.clarity = 0;
    this.lastDraw = 0;
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.mobileMode = window.matchMedia('(pointer: coarse)').matches || window.innerWidth <= 760;
    const scale = this.mobileMode ? 1 : Math.min(1.5, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(1, Math.floor(rect.width * scale));
    this.canvas.height = Math.max(1, Math.floor(rect.height * scale));
  }

  setClarity(value) { this.clarity = value; }

  draw(now) {
    if (now - this.lastDraw < 62) return;
    this.lastDraw = now;
    const { width, height } = this.canvas;
    const ctx = this.context;
    ctx.clearRect(0, 0, width, height);

    const grainAmount = Math.floor((260 + (1 - this.clarity) * 850) * (this.mobileMode ? .42 : 1));
    ctx.fillStyle = `rgba(25, 31, 25, ${.035 + (1 - this.clarity) * .11})`;
    for (let index = 0; index < grainAmount; index += 1) {
      const size = Math.random() < .94 ? 1 : 2 + Math.random() * 5;
      ctx.fillRect(Math.random() * width, Math.random() * height, size, size * .6);
    }

    const bands = Math.round(2 + (1 - this.clarity) * 12);
    for (let index = 0; index < bands; index += 1) {
      const y = Math.random() * height;
      const thickness = .5 + Math.random() * 2.5;
      ctx.fillStyle = `rgba(30, 38, 31, ${.025 + Math.random() * .075})`;
      ctx.fillRect(0, y, width, thickness);
    }

    if (Math.random() > this.clarity + .2) {
      const y = Math.random() * height;
      const h = 3 + Math.random() * 18;
      ctx.fillStyle = `rgba(226, 230, 207, ${.03 + Math.random() * .08})`;
      ctx.fillRect(0, y, width, h);
    }
  }
}
