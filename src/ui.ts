import type { Command, Snapshot } from './core.ts';
import { cursorIcon } from './guide.ts';

export const controlsHTML = `
  <div class="brand"><span class="logo" aria-hidden="true">↗</span><div><strong>WordGlide</strong><span class="eyebrow">A LITTLE GUIDANCE. YOUR OWN PACE.</span></div><button class="help" aria-label="How to use WordGlide" title="How to use WordGlide">?</button></div>
  <section class="welcome" aria-label="Welcome to WordGlide">
    <div class="welcome-demo" aria-hidden="true"><span>Find</span> <span class="demo-word">your<span class="demo-hand">${cursorIcon('hand')}</span></span> <span>rhythm.</span></div>
    <span class="eyebrow">MEET YOUR READING COMPANION</span>
    <h2>Your page. Your pace.</h2>
    <p>WordGlide moves a small guide under the words on your page. Let your eyes follow it while your mouse stays free.</p>
    <ol class="welcome-steps">
      <li><strong>Choose where to begin</strong><span>Open an article or GitHub README. Click <b>Set start word</b>, then click a word on the page. An end word is optional.</span></li>
      <li><strong>Make the guide yours</strong><span>Pick a hand, dot, or arrow. Adjust its size and your words per minute. Try 200–250 WPM to begin.</span></li>
      <li><strong>Press Play and follow along</strong><span>The guide moves and the page scrolls for you. Press <b>Space</b> to pause. Click the floating handle to change settings.</span></li>
    </ol>
    <p class="welcome-note">Scrolling or clicking the page pauses reading. If an article is not detected, choose a reading area. Everything runs locally.</p>
    <button class="primary intro-start">Choose my start word</button>
    <button class="area intro-dismiss">Got it — show controls</button>
  </section>
  <div class="reader-controls" hidden>
  <div class="reading"><span class="status">READY WHEN YOU ARE</span><h1>Find your rhythm.</h1><p class="message" role="status">Choose a word. Follow the flow.</p></div>
  <div class="progress-track"><div class="progress-fill"></div></div>
  <div class="progress-meta"><span class="position">No passage selected</span><span class="word"></span></div>
  <div class="transport"><button class="primary" data-command="play">▶ <span>Start reading</span></button><button class="secondary stop" data-command="stop" title="Stop and return to start" aria-label="Stop and return to start">■</button></div>
  <div class="section-label">READING SPEED <span class="pace-label">BASE PACE</span></div>
  <div class="speed"><button data-speed="-10" aria-label="Slower">−</button><label><input aria-label="Words per minute" type="number" min="60" max="1000" step="10" value="250"><span>words / min</span></label><button data-speed="10" aria-label="Faster">+</button></div>
  <input class="range" aria-label="Reading speed slider" type="range" min="60" max="1000" step="10" value="250">
  <div class="range-labels"><span>Take it easy</span><span>Pick up the pace</span></div>
  <div class="section-label">YOUR READING GUIDE</div>
  <div class="modes" role="group" aria-label="Reading guide style"><button data-mode="cursor"><span>↗</span>Cursor</button><button data-mode="highlight"><span>▰</span>Highlight</button><button data-mode="outline"><span>▱</span>Outline</button></div>
  <div class="appearance">
    <div class="cursor-options"><div class="section-label">CURSOR SHAPE</div><div class="shapes" role="group" aria-label="Cursor shape"><button data-shape="hand">${cursorIcon('hand')}<span>Hand</span></button><button data-shape="dot">${cursorIcon('dot')}<span>Dot</span></button><button data-shape="arrow">${cursorIcon('arrow')}<span>Arrow</span></button></div>
    <label class="appearance-row">Size <output class="size-value">24 px</output><input type="range" aria-label="Cursor size" data-appearance="cursorSize" min="12" max="40" step="1" value="24"></label></div>
    <label class="appearance-row thickness-row">Stroke thickness <output class="thickness-value">2</output><input type="range" aria-label="Stroke thickness" data-appearance="thickness" min="1" max="4" step="0.5" value="2"></label>
  </div>
  <div class="toggles"><label><span>Natural pauses<small>A breath at punctuation</small></span><input type="checkbox" data-setting="natural" checked></label><label><span>Follow down the page<small>Scroll along with your guide</small></span><input type="checkbox" data-setting="autoScroll" checked></label></div>
  <div class="section-label">CHOOSE YOUR PASSAGE</div>
  <div class="selection"><button data-command="pick-start">Set start word</button><button data-command="pick-end">Set end word</button></div>
  <button class="area" data-command="pick-area">⌖ Choose a different reading area</button>
  <div class="footnote"><kbd>Space</kbd> pause / play <span>·</span> <kbd>Esc</kbd> pause</div>
  </div>
`;

export function mountControls(container: HTMLElement, send: (command: Command) => void, onHelp: () => void = () => {}) {
  container.innerHTML = controlsHTML;
  let snapshot: Snapshot | undefined;
  let introOpen = true, disposed = false;
  const welcome = container.querySelector<HTMLElement>('.welcome')!;
  const controls = container.querySelector<HTMLElement>('.reader-controls')!;
  function showIntro(show: boolean) {
    introOpen = show; welcome.hidden = !show; controls.hidden = show;
  }
  async function dismissIntro() {
    showIntro(false);
    try { await chrome.storage.local.set({ onboardingSeen: true }); } catch { /* Reading remains available. */ }
  }
  const storageListener = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
    if (area === 'local' && changes.onboardingSeen?.newValue === true) showIntro(false);
  };
  chrome.storage.onChanged.addListener(storageListener);
  void chrome.storage.local.get('onboardingSeen').then(saved => { if (!disposed) showIntro(saved.onboardingSeen !== true); }).catch(() => {});
  container.addEventListener('click', async event => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button');
    if (!button) return;
    if (button.classList.contains('help')) { onHelp(); showIntro(true); welcome.scrollIntoView({ block: 'nearest' }); return; }
    if (button.classList.contains('intro-dismiss') || button.classList.contains('intro-start')) {
      await dismissIntro();
      if (button.classList.contains('intro-start')) send({ type: 'pick-start' });
      else container.querySelector<HTMLButtonElement>('.primary[data-command]')?.focus({ preventScroll: true });
      return;
    }
    if (button.dataset.command) {
      let type = button.dataset.command as Command['type'];
      if (type === 'play' && snapshot?.status === 'playing') type = 'pause';
      send({ type });
    }
    if (button.dataset.mode) send({ type: 'settings', settings: { mode: button.dataset.mode as 'cursor' } });
    if (button.dataset.shape) send({ type: 'settings', settings: { cursorShape: button.dataset.shape as 'hand' } });
    if (button.dataset.speed) send({ type: 'settings', settings: { wpm: (snapshot?.settings.wpm ?? 250) + Number(button.dataset.speed) } });
  });
  container.addEventListener('change', event => {
    const input = event.target as HTMLInputElement;
    if (!input.dataset.appearance && (input.type === 'number' || input.type === 'range')) send({ type: 'settings', settings: { wpm: Number(input.value) } });
    if (input.dataset.setting) send({ type: 'settings', settings: { [input.dataset.setting]: input.checked } });
  });
  container.addEventListener('input', event => {
    const input = event.target as HTMLInputElement;
    if (input.dataset.appearance) send({ type: 'settings', settings: { [input.dataset.appearance]: Number(input.value) } });
  });
  const update = (next: Snapshot) => {
    snapshot = next;
    const set = (selector: string, value: string) => { container.querySelector(selector)!.textContent = value; };
    set('.status', next.status.replaceAll('-', ' ').toUpperCase());
    set('h1', next.status === 'playing' ? 'One word at a time.' : next.status === 'finished' ? 'A little further along.' : 'Find your rhythm.');
    set('.message', next.message || next.title || 'Choose a word. Follow the flow.');
    set('.position', next.count ? `${Math.max(0, next.index - next.start + 1)} / ${next.end - next.start + 1} words` : 'No passage selected');
    set('.word', next.word.slice(0, 24));
    set('.primary[data-command="play"]', next.status === 'playing' ? 'Ⅱ Pause reading' : next.status === 'finished' ? '↻ Read again' : next.status === 'paused' ? '▶ Resume reading' : '▶ Start reading');
    set('.pace-label', next.settings.natural ? 'BASE PACE' : 'EVEN PACE');
    (container.querySelector('.progress-fill') as HTMLElement).style.width = `${next.count ? Math.min(100, 100 * (next.index - next.start + 1) / (next.end - next.start + 1)) : 0}%`;
    container.querySelectorAll<HTMLInputElement>('input[type="number"],input[type="range"]:not([data-appearance])').forEach(el => { if (el !== (container.getRootNode() as Document | ShadowRoot).activeElement) el.value = String(next.settings.wpm); });
    container.querySelectorAll<HTMLInputElement>('[data-appearance]').forEach(el => { if (el !== (container.getRootNode() as Document | ShadowRoot).activeElement) el.value = String(next.settings[el.dataset.appearance as 'cursorSize' | 'thickness']); });
    set('.size-value', `${next.settings.cursorSize} px`); set('.thickness-value', String(next.settings.thickness));
    container.querySelectorAll<HTMLButtonElement>('[data-shape]').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.shape === next.settings.cursorShape)));
    (container.querySelector('.appearance') as HTMLElement).hidden = next.settings.mode === 'highlight';
    (container.querySelector('.cursor-options') as HTMLElement).hidden = next.settings.mode !== 'cursor';
    (container.querySelector('.thickness-row') as HTMLElement).hidden = next.settings.mode === 'cursor' && next.settings.cursorShape === 'dot';
    container.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(el => { el.setAttribute('aria-pressed', String(el.dataset.mode === next.settings.mode)); });
    container.querySelectorAll<HTMLInputElement>('[data-setting]').forEach(el => { el.checked = next.settings[el.dataset.setting as 'natural' | 'autoScroll']; });
  };
  return Object.assign(update, { isIntroOpen: () => introOpen, dispose: () => { disposed = true; chrome.storage.onChanged.removeListener(storageListener); } });
}
