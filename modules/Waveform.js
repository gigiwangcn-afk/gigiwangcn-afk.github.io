export class Waveform {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.clarity = 0;
    this.seed = 0;
    this.resize();
  }

  resize() {
    const bounds = this.canvas.getBoundingClientRect();
    const scale = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(1, Math.floor(bounds.width * scale));
    this.canvas.height = Math.max(1, Math.floor(bounds.height * scale));
  }

  setSignal(clarity, seed = 0) {
    this.clarity = clarity;
    this.seed = seed;
  }

  draw(now, analyser) {
    const { width, height } = this.canvas;
    const ctx = this.context;
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = 'rgba(67, 79, 67, .18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    let samples = null;
    if (analyser) {
      samples = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(samples);
    }

    ctx.strokeStyle = `rgba(62, 79, 64, ${.48 + this.clarity * .42})`;
    ctx.lineWidth = Math.max(1, window.devicePixelRatio || 1);
    ctx.beginPath();
    const points = Math.min(width, 220);
    for (let index = 0; index < points; index += 1) {
      const x = (index / (points - 1)) * width;
      const noise = (Math.random() - .5) * height * .54 * (1 - this.clarity);
      const wave = Math.sin(index * (.18 + this.seed * .001) + now * .0024) * height * .16 * this.clarity;
      const audio = samples ? ((samples[Math.floor(index / points * samples.length)] - 128) / 128) * height * .24 : 0;
      const y = height / 2 + noise + wave + audio;
      if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}
