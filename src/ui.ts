import { palette, type Command, type Snapshot } from './core.ts';
import { cursorIcon } from './guide.ts';
import { mountWalkthrough, walkthroughHTML } from './walkthrough.ts';

export const controlsHTML = `
  <div class="brand"><span class="logo" aria-hidden="true">↗</span><strong>WordGlide</strong><button class="help" aria-label="How to use WordGlide" title="How to use WordGlide">?</button></div>
  <section class="welcome" aria-label="Welcome to WordGlide">
    ${walkthroughHTML}
  </section>
  <div class="reader-controls" hidden>
  <div class="reading"><span class="status">READY</span><p class="message" role="status" hidden></p></div>
  <div class="progress-track"><div class="progress-fill"></div></div>
  <div class="progress-meta"><span class="position">No passage selected</span><span class="word"></span></div>
  <div class="transport"><button class="primary" data-command="play">▶ <span>Start reading</span></button><button class="secondary stop" data-command="stop" title="Stop and return to start" aria-label="Stop and return to start">■</button></div>
  <div class="speed"><button data-speed="-10" aria-label="Slower">−</button><label><input aria-label="Words per minute" type="number" min="60" max="1000" step="10" value="250"><span>WPM</span></label><button data-speed="10" aria-label="Faster">+</button></div>
  <input class="range" aria-label="Reading speed slider" type="range" min="60" max="1000" step="10" value="250">
  <div class="modes" role="group" aria-label="Reading guide style"><button data-mode="cursor"><span>↗</span>Cursor</button><button data-mode="highlight"><span>▰</span>Highlight</button><button data-mode="outline"><span>▱</span>Outline</button></div>
  <div class="appearance">
    <div class="colors" role="group" aria-label="Guide color">${Object.entries(palette).map(([name, color]) => `<button data-color="${name}" aria-label="${name}" title="${name}" style="--swatch:${color}"></button>`).join('')}</div>
    <div class="cursor-options"><div class="shapes" role="group" aria-label="Cursor shape"><button data-shape="hand">${cursorIcon('hand')}<span>Hand</span></button><button data-shape="dot">${cursorIcon('dot')}<span>Dot</span></button><button data-shape="arrow">${cursorIcon('arrow')}<span>Arrow</span></button></div>
    <label class="appearance-row">Size <output class="size-value">24 px</output><input type="range" aria-label="Cursor size" data-appearance="cursorSize" min="12" max="40" step="1" value="24"></label></div>
    <label class="appearance-row thickness-row">Stroke <output class="thickness-value">2</output><input type="range" aria-label="Stroke thickness" data-appearance="thickness" min="1" max="4" step="0.5" value="2"></label>
  </div>
  <label class="group-option appearance-row" hidden>Words per highlight <select aria-label="Words per highlight"><option value="1">1 word</option><option value="2">2 words</option><option value="3">3 words</option><option value="4">4 words</option></select></label>
  <div class="toggles"><label title="Pause longer at punctuation"><span>Natural pauses</span><input type="checkbox" data-setting="natural" checked></label><label><span>Auto-scroll</span><input type="checkbox" data-setting="autoScroll" checked></label></div>
  <div class="selection"><button data-command="pick-start" aria-label="Set start word">Set start</button><button data-command="pick-end" aria-label="Set end word">Set end</button><button data-command="pick-area" aria-label="Choose a different reading area">Area</button></div>
  </div>
`;

export function mountControls(container: HTMLElement, send: (command: Command) => void, onHelp: () => void = () => {}) {
  container.innerHTML = controlsHTML;
  let snapshot: Snapshot | undefined;
  let introOpen = true, disposed = false;
  const welcome = container.querySelector<HTMLElement>('.welcome')!;
  const controls = container.querySelector<HTMLElement>('.reader-controls')!;
  const tour = mountWalkthrough(welcome);
  function showIntro(show: boolean) {
    if (show && !introOpen) tour.reset();
    if (!show) tour.stop();
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
    if (welcome.contains(button)) return;
    if (button.dataset.color) send({ type: 'settings', settings: { color: button.dataset.color as keyof typeof palette } });
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
    if (welcome.contains(input)) return;
    if (input.matches('.group-option select')) send({ type: 'settings', settings: { groupSize: Number(input.value) } });
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
    set('.message', next.message || next.title || 'Choose a word. Follow the flow.');
    // Keep recovery/selection instructions visible; omit routine status prose.
    (container.querySelector('.message') as HTMLElement).hidden = !(['idle', 'paused', 'picking-start', 'picking-end', 'picking-area'].includes(next.status));
    set('.position', next.count ? `${Math.max(0, next.index - next.start + 1)} / ${next.end - next.start + 1} words` : 'No passage selected');
    set('.word', next.word.slice(0, 24));
    set('.primary[data-command="play"]', next.status === 'playing' ? 'Ⅱ Pause' : next.status === 'finished' ? '↻ Restart' : next.status === 'paused' ? '▶ Resume' : '▶ Play');
    (container.querySelector('.progress-fill') as HTMLElement).style.width = `${next.count ? Math.min(100, 100 * (next.index - next.start + 1) / (next.end - next.start + 1)) : 0}%`;
    controls.querySelectorAll<HTMLInputElement>('input[type="number"],input[type="range"]:not([data-appearance])').forEach(el => { if (el !== (container.getRootNode() as Document | ShadowRoot).activeElement) el.value = String(next.settings.wpm); });
    container.querySelectorAll<HTMLInputElement>('[data-appearance]').forEach(el => { if (el !== (container.getRootNode() as Document | ShadowRoot).activeElement) el.value = String(next.settings[el.dataset.appearance as 'cursorSize' | 'thickness']); });
    set('.size-value', `${next.settings.cursorSize} px`); set('.thickness-value', String(next.settings.thickness));
    container.querySelectorAll<HTMLButtonElement>('[data-shape]').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.shape === next.settings.cursorShape)));
    container.querySelectorAll<HTMLButtonElement>('[data-color]').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.color === next.settings.color)));
    (container.querySelector('.group-option') as HTMLElement).hidden = next.settings.mode !== 'highlight';
    (container.querySelector('.group-option select') as HTMLSelectElement).value = String(next.settings.groupSize);
    (container.querySelector('.appearance') as HTMLElement).hidden = next.settings.mode === 'highlight';
    (container.querySelector('.cursor-options') as HTMLElement).hidden = next.settings.mode !== 'cursor';
    (container.querySelector('.thickness-row') as HTMLElement).hidden = next.settings.mode === 'cursor' && next.settings.cursorShape === 'dot';
    container.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(el => { el.setAttribute('aria-pressed', String(el.dataset.mode === next.settings.mode)); });
    container.querySelectorAll<HTMLInputElement>('[data-setting]').forEach(el => { el.checked = next.settings[el.dataset.setting as 'natural' | 'autoScroll']; });
  };
  return Object.assign(update, { isIntroOpen: () => introOpen, dispose: () => { disposed = true; tour.dispose(); chrome.storage.onChanged.removeListener(storageListener); } });
}
