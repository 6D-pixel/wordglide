import type { Command, Snapshot } from './core.ts';

export const controlsHTML = `
  <div class="brand"><span class="logo" aria-hidden="true">↗</span><div><strong>WordGlide</strong><span class="eyebrow">A LITTLE GUIDANCE. YOUR OWN PACE.</span></div></div>
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
  <div class="toggles"><label><span>Natural pauses<small>A breath at punctuation</small></span><input type="checkbox" data-setting="natural" checked></label><label><span>Follow down the page<small>Scroll along with your guide</small></span><input type="checkbox" data-setting="autoScroll" checked></label></div>
  <div class="section-label">CHOOSE YOUR PASSAGE</div>
  <div class="selection"><button data-command="pick-start">Set start word</button><button data-command="pick-end">Set end word</button></div>
  <button class="area" data-command="pick-area">⌖ Choose a different reading area</button>
  <div class="footnote"><kbd>Space</kbd> pause / play <span>·</span> <kbd>Esc</kbd> pause</div>
`;

export function mountControls(container: HTMLElement, send: (command: Command) => void) {
  container.innerHTML = controlsHTML;
  let snapshot: Snapshot | undefined;
  container.addEventListener('click', event => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button');
    if (!button) return;
    if (button.dataset.command) {
      let type = button.dataset.command as Command['type'];
      if (type === 'play' && snapshot?.status === 'playing') type = 'pause';
      send({ type });
    }
    if (button.dataset.mode) send({ type: 'settings', settings: { mode: button.dataset.mode as 'cursor' } });
    if (button.dataset.speed) send({ type: 'settings', settings: { wpm: (snapshot?.settings.wpm ?? 250) + Number(button.dataset.speed) } });
  });
  container.addEventListener('change', event => {
    const input = event.target as HTMLInputElement;
    if (input.type === 'number' || input.type === 'range') send({ type: 'settings', settings: { wpm: Number(input.value) } });
    if (input.dataset.setting) send({ type: 'settings', settings: { [input.dataset.setting]: input.checked } });
  });
  return (next: Snapshot) => {
    snapshot = next;
    const set = (selector: string, value: string) => { container.querySelector(selector)!.textContent = value; };
    set('.status', next.status.replaceAll('-', ' ').toUpperCase());
    set('h1', next.status === 'playing' ? 'One word at a time.' : next.status === 'finished' ? 'A little further along.' : 'Find your rhythm.');
    set('.message', next.message || next.title || 'Choose a word. Follow the flow.');
    set('.position', next.count ? `${Math.max(0, next.index - next.start + 1)} / ${next.end - next.start + 1} words` : 'No passage selected');
    set('.word', next.word.slice(0, 24));
    set('.primary', next.status === 'playing' ? 'Ⅱ Pause reading' : next.status === 'finished' ? '↻ Read again' : next.status === 'paused' ? '▶ Resume reading' : '▶ Start reading');
    set('.pace-label', next.settings.natural ? 'BASE PACE' : 'EVEN PACE');
    (container.querySelector('.progress-fill') as HTMLElement).style.width = `${next.count ? Math.min(100, 100 * (next.index - next.start + 1) / (next.end - next.start + 1)) : 0}%`;
    container.querySelectorAll<HTMLInputElement>('input[type="number"],input[type="range"]').forEach(el => { if (el !== (container.getRootNode() as Document | ShadowRoot).activeElement) el.value = String(next.settings.wpm); });
    container.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(el => { el.setAttribute('aria-pressed', String(el.dataset.mode === next.settings.mode)); });
    container.querySelectorAll<HTMLInputElement>('[data-setting]').forEach(el => { el.checked = next.settings[el.dataset.setting as 'natural' | 'autoScroll']; });
  };
}
