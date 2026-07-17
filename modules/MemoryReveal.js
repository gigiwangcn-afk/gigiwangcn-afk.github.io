export class MemoryReveal {
  constructor(canvas, memories) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.memories = memories;
    this.assets = new Map();
    this.memoryId = null;
    this.clarity = 0;
    this.renderClarity = 0;
    this.channelChange = performance.now();
    this.mobileMode = window.matchMedia('(pointer: coarse)').matches || window.innerWidth <= 760;
    this.resize();
  }

  async loadImage(source) {
    const image = new Image();
    image.decoding = 'async';
    image.src = source;
    await image.decode();
    return image;
  }

  createSignalMap(image) {
    const canvas = document.createElement('canvas');
    canvas.width = 260;
    canvas.height = 170;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const scale = Math.max(canvas.width / image.width, canvas.height / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const faxCanvas = document.createElement('canvas');
    faxCanvas.width = canvas.width;
    faxCanvas.height = canvas.height;
    const faxContext = faxCanvas.getContext('2d');
    const faxData = faxContext.createImageData(canvas.width, canvas.height);
    const bayer = [
      0, 8, 2, 10,
      12, 4, 14, 6,
      3, 11, 1, 9,
      15, 7, 13, 5,
    ];
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const index = (y * canvas.width + x) * 4;
        const luminance = (imageData.data[index] * .299 + imageData.data[index + 1] * .587 + imageData.data[index + 2] * .114) / 255;
        const threshold = .66 + (bayer[(y % 4) * 4 + (x % 4)] / 15) * .25;
        if (luminance < threshold) {
          faxData.data[index] = 35;
          faxData.data[index + 1] = 50;
          faxData.data[index + 2] = 41;
          faxData.data[index + 3] = Math.round(105 + (1 - luminance) * 150);
        }
      }
    }
    faxContext.putImageData(faxData, 0, 0);

    return {
      width: canvas.width,
      height: canvas.height,
      pixels: imageData.data,
      faxCanvas,
    };
  }

  async load() {
    await Promise.all(this.memories.map(async (memory) => {
      const image = await this.loadImage(memory.image);
      this.assets.set(memory.id, {
        image,
        map: this.createSignalMap(image),
        signalOnly: Boolean(memory.signalOnly),
      });
    }));
  }

  resize() {
    const bounds = this.canvas.getBoundingClientRect();
    this.mobileMode = window.matchMedia('(pointer: coarse)').matches || window.innerWidth <= 760;
    const scale = this.mobileMode ? 1 : Math.min(1.6, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(1, Math.floor(bounds.width * scale));
    this.canvas.height = Math.max(1, Math.floor(bounds.height * scale));
  }

  setMemory(id) {
    if (id !== this.memoryId) {
      this.memoryId = id;
      this.channelChange = performance.now();
    }
  }

  setClarity(value) { this.clarity = value; }

  clamp(value) { return Math.max(0, Math.min(1, value)); }

  smooth(value) {
    const x = this.clamp(value);
    return x * x * (3 - 2 * x);
  }

  fit(image, overscan = 1.015) {
    const { width, height } = this.canvas;
    const scale = Math.max(width / image.width, height / image.height) * overscan;
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    return { x: (width - drawWidth) / 2, y: (height - drawHeight) / 2, width: drawWidth, height: drawHeight };
  }

  sample(asset, x, y) {
    const sx = Math.max(0, Math.min(asset.map.width - 1, Math.floor(x * asset.map.width)));
    const sy = Math.max(0, Math.min(asset.map.height - 1, Math.floor(y * asset.map.height)));
    const index = (sy * asset.map.width + sx) * 4;
    const pixels = asset.map.pixels;
    return {
      r: pixels[index],
      g: pixels[index + 1],
      b: pixels[index + 2],
      luminance: (pixels[index] * .299 + pixels[index + 1] * .587 + pixels[index + 2] * .114) / 255,
    };
  }

  drawSignalBands(asset, clarity, now) {
    const ctx = this.context;
    const { width, height } = this.canvas;
    const fit = this.fit(asset.image);
    const phase = now * .004;
    const spacing = Math.max(3, Math.round(15 - clarity * 11));
    const stripHeight = Math.max(1, spacing * (.18 + clarity * .42));
    const settle = this.smooth((clarity - .1) / .72);

    ctx.save();
    ctx.filter = `grayscale(${1 - clarity * .66}) saturate(${.38 + clarity * .7}) contrast(${1.42 - clarity * .25})`;
    ctx.globalAlpha = asset.signalOnly
      ? .018 + clarity * .055
      : .08 + clarity * .34;
    for (let y = 0; y < height; y += spacing) {
      const normalized = y / height;
      const gate = Math.sin(normalized * 39 + phase) * .5 + .5;
      if (gate > .25 + clarity * .72) continue;
      const instability = (1 - settle) * (12 + Math.sin(y * .17 + phase) * 18);
      const jump = Math.sin(y * .063 + phase * 1.7) * instability;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, y, width, stripHeight);
      ctx.clip();
      ctx.drawImage(asset.image, fit.x + jump, fit.y, fit.width, fit.height);
      ctx.restore();
    }
    ctx.restore();
  }

  drawWaveImage(asset, clarity, now) {
    const ctx = this.context;
    const { width, height } = this.canvas;
    const lineCount = this.mobileMode ? Math.round(12 + clarity * 34) : Math.round(18 + clarity * 62);
    const xStep = Math.max(this.mobileMode ? 6 : 3, Math.round(width / (this.mobileMode ? 125 : 230)));
    const phase = now * .0032;
    const imageMix = this.smooth((clarity - .04) / .72);
    const signalOnlyBoost = asset.signalOnly ? 1.38 : 1;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = 'screen';

    for (let line = 0; line < lineCount; line += 1) {
      const ny = lineCount === 1 ? .5 : line / (lineCount - 1);
      const baseY = ny * height;
      const randomCarrier = Math.sin(line * 12.9898 + 78.233) * 43758.5453;
      const carrierSeed = randomCarrier - Math.floor(randomCarrier);
      const lineOpacity = (.025 + clarity * .095) * signalOnlyBoost;

      ctx.beginPath();
      for (let x = 0; x <= width + xStep; x += xStep) {
        const nx = this.clamp(x / width);
        const pixel = this.sample(asset, nx, ny);
        const brightnessShape = (pixel.luminance - .5) * (5 + clarity * 10);
        const looseCarrier = Math.sin(nx * (48 + carrierSeed * 90) + phase + line * .73)
          * (13 + carrierSeed * 17) * (1 - imageMix);
        const fineCarrier = Math.sin(nx * 94 + phase * 2.1 + line * .31) * (1.2 + (1 - clarity) * 3.8);
        const y = baseY + looseCarrier + fineCarrier + brightnessShape * imageMix;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }

      const tone = this.sample(asset, .5, ny);
      const paleR = Math.round(128 + tone.r * .32);
      const paleG = Math.round(151 + tone.g * .28);
      const paleB = Math.round(128 + tone.b * .18);
      ctx.strokeStyle = `rgba(${paleR}, ${paleG}, ${paleB}, ${lineOpacity})`;
      ctx.lineWidth = Math.max(.65, window.devicePixelRatio || 1) * (asset.signalOnly ? 1.08 : .82);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawPulseMatrix(asset, clarity, now) {
    if (clarity < .12) return;
    const ctx = this.context;
    const { width, height } = this.canvas;
    const reveal = this.smooth((clarity - .1) / .78);
    const stepX = (asset.signalOnly ? 6 : 9) * (this.mobileMode ? 1.8 : 1);
    const stepY = (asset.signalOnly ? 5 : 8) * (this.mobileMode ? 1.8 : 1);
    const jitter = (1 - reveal) * 14;
    const phase = now * .004;
    const threshold = .08 + (1 - reveal) * .48;

    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.strokeStyle = asset.signalOnly
      ? `rgba(39, 55, 45, ${.16 + reveal * .56})`
      : `rgba(43, 58, 46, ${.025 + reveal * .09})`;
    ctx.lineWidth = Math.max(.65, (window.devicePixelRatio || 1) * .72);
    ctx.beginPath();
    for (let y = 0; y < height; y += stepY) {
      for (let x = 0; x < width; x += stepX) {
        const pixel = this.sample(asset, x / width, y / height);
        const darkness = 1 - pixel.luminance;
        if (darkness < threshold) continue;
        const displacement = Math.sin(x * .071 + y * .043 + phase) * jitter;
        const length = .8 + darkness * stepX * (asset.signalOnly ? .92 : .62);
        ctx.moveTo(x - length * .5, y + displacement);
        ctx.lineTo(x + length * .5, y + displacement);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  drawFaxImage(asset, clarity) {
    if (!asset.signalOnly || clarity < .2) return;
    const ctx = this.context;
    const recovered = this.smooth((clarity - .18) / .72);
    const fit = this.fit(asset.map.faxCanvas);
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = .12 + recovered * .68;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(asset.map.faxCanvas, fit.x, fit.y, fit.width, fit.height);
    ctx.restore();
  }

  drawRecoveredImage(asset, clarity) {
    const recovered = this.smooth((clarity - .57) / .43);
    if (recovered <= 0) return;
    const ctx = this.context;
    const fit = this.fit(asset.image);
    const maxOpacity = asset.signalOnly ? .018 : .93;
    const shift = (1 - recovered) * 5;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = recovered * .065;
    ctx.filter = 'saturate(.8) contrast(1.08)';
    ctx.drawImage(asset.image, fit.x - shift, fit.y, fit.width, fit.height);
    ctx.globalAlpha = recovered * .055;
    ctx.drawImage(asset.image, fit.x + shift, fit.y, fit.width, fit.height);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = recovered * maxOpacity;
    ctx.filter = asset.signalOnly
      ? 'grayscale(1) sepia(.28) hue-rotate(38deg) contrast(1.7) brightness(.78)'
      : `sepia(${.16 - recovered * .11}) saturate(${.78 + recovered * .26}) contrast(${1.1 - recovered * .04})`;
    ctx.drawImage(asset.image, fit.x, fit.y, fit.width, fit.height);
    ctx.restore();
  }

  drawConvergenceSweep(clarity, now) {
    if (clarity < .12) return;
    const ctx = this.context;
    const { width, height } = this.canvas;
    const sweep = ((now - this.channelChange) * (.000055 + clarity * .000035)) % 1;
    const x = sweep * (width + 180) - 90;
    ctx.save();
    const gradient = ctx.createLinearGradient(x - 70, 0, x + 70, 0);
    gradient.addColorStop(0, 'rgba(208, 220, 193, 0)');
    gradient.addColorStop(.5, `rgba(218, 229, 200, ${.035 + clarity * .06})`);
    gradient.addColorStop(1, 'rgba(208, 220, 193, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(x - 70, 0, 140, height);
    ctx.restore();
  }

  draw(now) {
    this.renderClarity += (this.clarity - this.renderClarity) * .052;
    const ctx = this.context;
    const { width, height } = this.canvas;
    ctx.fillStyle = '#737e70';
    ctx.fillRect(0, 0, width, height);

    const asset = this.assets.get(this.memoryId);
    if (!asset || this.renderClarity < .012) {
      this.drawIdle(now);
      return;
    }

    const clarity = this.renderClarity;
    this.drawSignalBands(asset, clarity, now);
    this.drawRecoveredImage(asset, clarity);
    this.drawFaxImage(asset, clarity);
    this.drawPulseMatrix(asset, clarity, now);
    this.drawWaveImage(asset, clarity, now);
    this.drawConvergenceSweep(clarity, now);

    const wash = Math.max(.015, .2 - clarity * .17);
    ctx.fillStyle = `rgba(210, 217, 195, ${wash})`;
    ctx.fillRect(0, 0, width, height);
  }

  drawIdle(now) {
    const ctx = this.context;
    const { width, height } = this.canvas;
    ctx.save();
    ctx.strokeStyle = 'rgba(179, 193, 172, .11)';
    ctx.lineWidth = Math.max(.7, window.devicePixelRatio || 1);
    const lineCount = this.mobileMode ? 12 : 21;
    const xStep = this.mobileMode ? 18 : 12;
    for (let line = 0; line < lineCount; line += 1) {
      const baseY = (line / (lineCount - 1)) * height;
      ctx.beginPath();
      for (let x = 0; x <= width; x += xStep) {
        const interference = Math.sin(x * .031 + now * .0021 + line * 1.7) * (5 + line % 4 * 2);
        const staticJump = Math.sin(x * .19 + now * .006 + line) * 2.2;
        const y = baseY + interference + staticJump;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
}
