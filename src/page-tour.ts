type Action = 'selected' | 'speed' | 'space-play' | 'space-pause' | 'escape';
const expected: Action[] = ['selected', 'speed', 'space-play', 'space-pause', 'space-play'];
const instructions = [
  'Click a word in the article to set your start. If no article is detected, choose its reading area first.',
  'Change WPM in the controls. Higher numbers read faster.',
  'Press Space to start. If a speed field is focused, press Tab to leave it first.',
  'Follow a few words, then press Space to pause.',
  'Press Space again to resume from your place.',
  'Done! Space pauses/resumes. Click the circular WordGlide logo for settings. Esc is an optional pause/cancel key. Manual scrolling also pauses reading.',
];

export class PageTour {
  private step = -1;
  private element = document.createElement('aside');
  constructor(private shadow: ShadowRoot, private exit: () => void, restart: () => void) {
    this.element.className = 'page-tour'; this.element.hidden = true;
    this.element.setAttribute('aria-label', 'On-page walkthrough');
    this.element.innerHTML = '<strong class="page-tour-title"></strong><p role="status"></p><button type="button">Exit tutorial</button> <button type="button" class="tour-restart">Start over</button>';
    this.element.querySelector('button')!.addEventListener('click', () => { this.stop(); this.exit(); });
    this.element.querySelector('.tour-restart')!.addEventListener('click', restart);
    shadow.append(this.element);
  }
  start() { this.step = 0; this.element.hidden = false; this.render(); }
  isActive() { return this.step >= 0; }
  advance(action: Action) { if (this.step >= 0 && expected[this.step] === action) { this.step++; this.render(); } }
  stop() { this.step = -1; this.element.hidden = true; this.shadow.querySelector('.speed')?.classList.remove('tour-target'); }
  private render() {
    this.element.querySelector('strong')!.textContent = this.step < expected.length ? `Tutorial · ${this.step + 1}/${expected.length}` : 'You’re ready';
    this.element.querySelector('p')!.textContent = instructions[this.step];
    this.element.querySelector('button')!.textContent = this.step < expected.length ? 'Exit tutorial' : 'Done';
    this.shadow.querySelector('.speed')?.classList.toggle('tour-target', this.step === 1);
  }
}
