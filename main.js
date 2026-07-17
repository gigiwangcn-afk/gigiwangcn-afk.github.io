import { RadioDial } from './modules/RadioDial.js';
import { SignalNoise } from './modules/SignalNoise.js';
import { Waveform } from './modules/Waveform.js';
import { MemoryReveal } from './modules/MemoryReveal.js';
import { AudioController } from './modules/AudioController.js';

// 增加频道只需在这里加入一个对象。影像会自动经历载波聚合与信号恢复。
const memories = [
  {
    id: 'park-mp3',
    frequency: 87.6,
    title: '公园长椅上的 MP3',
    date: 'ARCHIVE · 2026.03.19',
    caption: '耳机线缠在一起，树叶把远处的人声吹得很轻。',
    image: './assets/images/memory-park.jpg',
    audio: { type: 'park', url: null },
  },
  {
    id: 'sunset-bus',
    frequency: 94.3,
    title: '夕阳公交车',
    date: 'ARCHIVE · 2026.04.01',
    caption: '回家路上，发动机的低鸣里有一整片快要熄灭的夕阳。',
    image: './assets/images/memory-bus.jpg',
    audio: { type: 'silent' },
  },
  {
    id: 'window-cat',
    frequency: 101.8,
    title: '窗边的猫',
    date: 'ARCHIVE · 2025.4.5',
    caption: '电流逐渐安静下来，窗边那双眼睛从载波里望了回来。',
    image: './assets/images/memory-cat.png',
    signalOnly: true,
    audio: {
      type: 'desk',
      tracks: [
        { url: './assets/audio/cat-meow.ogg', gain: 1, offset: .12 },
      ],
    },
  },
  {
    id: 'sky-chimes',
    frequency: 106.4,
    title: '晴空下的风铃',
    date: 'ARCHIVE · 2026.1.2',
    caption: '风穿过白色灯笼，几声金属轻响悬在很高的蓝天里。',
    image: './assets/images/memory-chimes.jpg',
    audio: { type: 'chimes', url: null },
  },
];

const els = {
  receiver: document.querySelector('#receiver'),
  power: document.querySelector('#powerSwitch'),
  frequency: document.querySelector('#frequencyValue'),
  trackNeedle: document.querySelector('#trackNeedle'),
  state: document.querySelector('#signalState'),
  percent: document.querySelector('#signalPercent'),
  bars: [...document.querySelectorAll('#strengthBars i')],
  title: document.querySelector('#memoryTitle'),
  date: document.querySelector('#memoryDate'),
  caption: document.querySelector('#memoryCaption'),
  acquisition: document.querySelector('#acquisitionText'),
  archiveNodes: [...document.querySelectorAll('[data-memory]')],
};

const dial = new RadioDial(document.querySelector('#radioDial'), {
  min: 87.5,
  max: 108,
  initial: 90.2,
  damping: 0.14,
});
const reveal = new MemoryReveal(document.querySelector('#memoryCanvas'), memories);
const noise = new SignalNoise(document.querySelector('#noiseCanvas'));
const waveform = new Waveform(document.querySelector('#waveformCanvas'));
const audio = new AudioController(memories);
audio.onCue = ({ id, count }) => {
  els.receiver.dataset.audioCue = id;
  els.receiver.dataset.audioCueCount = String(count);
};

let powered = false;
let lastChannelId = null;
let currentSignal = { memory: null, clarity: 0, distance: Infinity };

function smoothstep(value) {
  const x = Math.max(0, Math.min(1, value));
  return x * x * (3 - 2 * x);
}

function receiveSignal(frequency) {
  let memory = null;
  let distance = Infinity;
  for (const candidate of memories) {
    const nextDistance = Math.abs(candidate.frequency - frequency);
    if (nextDistance < distance) {
      memory = candidate;
      distance = nextDistance;
    }
  }
  const captureWidth = 1.42;
  const clarity = smoothstep(1 - distance / captureWidth);
  return { memory, distance, clarity };
}

function describeSignal(clarity) {
  if (clarity >= .94) return ['LOCKED', 'LOCKED / 记忆已锁定'];
  if (clarity >= .58) return ['STABLE', 'CONVERGING / 波形聚合中'];
  if (clarity >= .22) return ['CAPTURE', 'CAPTURING / 捕获载波'];
  return ['STATIC', 'SEARCHING / 搜寻中'];
}

function updateReadout(frequency, signal) {
  const displayed = (frequency + (signal.clarity < .12 ? (Math.random() - .5) * .025 : 0)).toFixed(1);
  els.frequency.textContent = displayed;
  els.frequency.dataset.ghost = displayed;
  els.trackNeedle.style.left = `${((frequency - 87.5) / 20.5) * 100}%`;

  const [shortState, longState] = describeSignal(signal.clarity);
  els.state.textContent = shortState;
  els.acquisition.textContent = longState;
  els.percent.textContent = `${String(Math.round(signal.clarity * 100)).padStart(2, '0')}%`;
  els.receiver.style.setProperty('--orbit-opacity', (.66 + signal.clarity * .22).toFixed(3));
  els.receiver.style.setProperty('--orbit-scale', (.86 + signal.clarity * .1).toFixed(3));
  els.receiver.dataset.signalState = shortState.toLowerCase();

  const lit = Math.round(signal.clarity * els.bars.length);
  els.bars.forEach((bar, index) => {
    bar.classList.toggle('active', index < lit);
    bar.classList.toggle('hot', index < lit && lit >= 8 && index >= 7);
  });

  const visible = signal.clarity > .13;
  els.title.textContent = visible ? signal.memory.title : '— — —';
  els.date.textContent = visible ? signal.memory.date : 'NO SIGNAL';
  els.caption.textContent = signal.clarity > .48 ? signal.memory.caption : '';
}

function selectChannel(signal) {
  const id = signal.clarity > .04 ? signal.memory.id : null;
  if (id === lastChannelId) return;
  lastChannelId = id;
  reveal.setMemory(id);
  audio.setMemory(id);
  els.archiveNodes.forEach((node) => node.classList.toggle('is-current', node.dataset.memory === id));
}

function tune(frequency) {
  currentSignal = receiveSignal(frequency);
  selectChannel(currentSignal);
  updateReadout(frequency, currentSignal);
  reveal.setClarity(currentSignal.clarity);
  noise.setClarity(currentSignal.clarity);
  waveform.setSignal(currentSignal.clarity, currentSignal.memory?.frequency ?? 0);
  audio.setClarity(powered ? currentSignal.clarity : 0);
}

dial.onChange = tune;
dial.onInteraction = () => {
  if (!powered) setPower(true);
};

function setPower(next) {
  powered = next;
  els.power.setAttribute('aria-pressed', String(powered));
  els.power.querySelector('span').textContent = powered ? 'RECEIVING' : 'RECEIVE';
  els.power.querySelector('.power-switch__cn').textContent = powered ? '接收中' : '启动接收';
  els.receiver.classList.toggle('is-powered', powered);
  if (powered) {
    audio.start().then(() => {
      audio.setMemory(currentSignal.memory?.id ?? null);
      audio.setClarity(currentSignal.clarity);
    }).catch((error) => {
      console.warn('Audio is unavailable; visual tuning remains active.', error);
    });
  } else {
    audio.setClarity(0);
    audio.suspend();
  }
}

els.power.addEventListener('click', () => setPower(!powered));

let previous = performance.now();
let previousDraw = 0;
const mobileMode = window.matchMedia('(pointer: coarse)').matches || window.innerWidth <= 760;
const drawInterval = 1000 / (mobileMode ? 22 : 40);
function frame(now) {
  const delta = Math.min(32, now - previous);
  previous = now;
  dial.update(delta);
  if (now - previousDraw >= drawInterval) {
    previousDraw = now;
    reveal.draw(now);
    noise.draw(now);
    waveform.draw(now, audio.analyser);
  }
  requestAnimationFrame(frame);
}

window.addEventListener('resize', () => {
  reveal.resize();
  noise.resize();
  waveform.resize();
});

tune(dial.value);
requestAnimationFrame(frame);
reveal.load().catch((error) => console.warn('Memory images are still loading.', error));
audio.prepare().catch((error) => console.warn('Audio archive is still loading.', error));
