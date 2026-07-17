export class RadioDial {
  constructor(element, options = {}) {
    this.element = element;
    this.face = element.querySelector('.radio-dial__face');
    this.zone = element.closest('.dial-zone');
    this.min = options.min ?? 87.5;
    this.max = options.max ?? 108;
    this.damping = options.damping ?? .16;
    this.value = options.initial ?? this.min;
    this.targetValue = this.value;
    this.onChange = () => {};
    this.onInteraction = () => {};
    this.dragging = false;
    this.lastPointerAngle = 0;
    this.bind();
    this.render();
  }

  bind() {
    this.element.addEventListener('pointerdown', (event) => {
      this.dragging = true;
      this.lastPointerAngle = this.pointerAngle(event);
      this.element.setPointerCapture(event.pointerId);
      this.onInteraction();
    });
    this.element.addEventListener('pointermove', (event) => {
      if (!this.dragging) return;
      const angle = this.pointerAngle(event);
      let delta = angle - this.lastPointerAngle;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      this.lastPointerAngle = angle;
      this.setTarget(this.targetValue + delta * ((this.max - this.min) / 270));
    });
    const end = () => { this.dragging = false; };
    this.element.addEventListener('pointerup', end);
    this.element.addEventListener('pointercancel', end);
    this.element.addEventListener('wheel', (event) => {
      event.preventDefault();
      this.onInteraction();
      this.setTarget(this.targetValue + (event.deltaY < 0 ? .12 : -.12));
    }, { passive: false });
    this.element.addEventListener('keydown', (event) => {
      const direction = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 0;
      if (!direction) return;
      event.preventDefault();
      this.onInteraction();
      this.setTarget(this.targetValue + direction * (event.shiftKey ? .5 : .1));
    });
  }

  pointerAngle(event) {
    const bounds = this.element.getBoundingClientRect();
    return Math.atan2(event.clientY - (bounds.top + bounds.height / 2), event.clientX - (bounds.left + bounds.width / 2)) * 180 / Math.PI;
  }

  setTarget(value) {
    this.targetValue = Math.max(this.min, Math.min(this.max, value));
  }

  update(delta = 16) {
    const difference = this.targetValue - this.value;
    if (Math.abs(difference) < .0005) return;
    const factor = 1 - Math.pow(1 - this.damping, delta / 16.667);
    this.value += difference * factor;
    if (Math.abs(difference) < .006) this.value = this.targetValue;
    this.render();
    this.onChange(this.value);
  }

  render() {
    const progress = (this.value - this.min) / (this.max - this.min);
    const angle = -135 + progress * 270;
    this.face.style.transform = `rotate(${angle}deg)`;
    this.zone?.style.setProperty('--dial-angle', `${angle}deg`);
    this.zone?.style.setProperty('--dial-progress', progress.toFixed(4));
    this.zone?.style.setProperty('--dial-sweep', `${(progress * 75).toFixed(2)}%`);
    this.element.setAttribute('aria-valuenow', this.value.toFixed(1));
    this.element.setAttribute('aria-valuetext', `${this.value.toFixed(1)} MHz`);
  }
}
