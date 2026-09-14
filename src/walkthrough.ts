export const walkthroughHTML = `
  <p class="tour-progress" aria-live="polite">Step 1 of 3 · Choose a word</p>
  <h2 tabindex="-1">Try it here first.</h2>
  <p class="tour-instruction">Click any word below to choose where reading begins.</p>
  <div class="tour-sample" aria-label="Practice passage">${['Find', 'your', 'reading', 'rhythm', 'with', 'WordGlide.'].map((word, i) => `<button data-tour-word="${i}" aria-pressed="false">${word}</button>`).join(' ')}</div>
  <label class="tour-speed" hidden>Practice speed <output>250 WPM</output><input aria-label="Practice words per minute" type="range" min="120" max="500" step="10" value="250"></label>
  <button class="primary tour-play" hidden>Play practice</button>
  <button class="primary tour-next" disabled>Next</button>
  <p class="welcome-note">This is a practice passage, not your page. On an article, use Set start word, optionally Set end word, then Play. Space pauses; the floating handle reopens settings.</p>
  <button class="primary intro-start" hidden>Choose my start word</button>
  <button class="area tour-back" hidden>Back</button>
  <button class="area intro-dismiss">Skip tutorial — show controls</button>
`;

export function mountWalkthrough(root: HTMLElement) {
  const get = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const words = [...root.querySelectorAll<HTMLButtonElement>('[data-tour-word]')];
  const next = get<HTMLButtonElement>('.tour-next'), play = get<HTMLButtonElement>('.tour-play');
  const speed = get<HTMLInputElement>('.tour-speed input');
  let step = 0, selected = -1, current = 0, playing = false, moved = false, changed = false, raf = 0, began = 0;
  const abort = new AbortController();
  function stop() { playing = false; cancelAnimationFrame(raf); play.textContent = 'Play practice'; }
  function paint(progress = 0) {
    words.forEach((el, i) => {
      el.setAttribute('aria-pressed', String(i === current && selected >= 0));
      el.style.setProperty('--tour-progress', `${progress * 100}%`);
    });
  }
  function render() {
    get('.tour-progress').textContent = step === 3 ? 'Practice complete' : `Step ${step + 1} of 3 · ${['Choose a word', 'Change the speed', 'Play and pause'][step]}`;
    get('.tour-instruction').textContent = ['Click any word below to choose where reading begins.', 'Move the speed slider. Higher WPM gives each word less time.', 'Press Play practice, follow a few words, then press Pause practice (or Space).', 'You’re ready! Choose a start word on your page, or open the controls. Use ? anytime to practise again.'][step];
    words.forEach(el => { el.disabled = step !== 0; });
    get('.tour-speed').hidden = step !== 1;
    play.hidden = step !== 2;
    next.hidden = step >= 2;
    next.disabled = step === 0 ? selected < 0 : !changed;
    get('.intro-start').hidden = step !== 3;
    get('.tour-back').hidden = step === 0;
    paint();
  }
  function tick(now: number) {
    if (!playing) return;
    if (document.hidden) { stop(); return; }
    const duration = 60000 / Number(speed.value);
    if (now - began >= duration) { current = (current + 1) % words.length; began = now; moved = true; }
    paint(matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : (now - began) / duration);
    raf = requestAnimationFrame(tick);
  }
  function toggle() {
    if (playing) { stop(); if (moved) { step = 3; render(); get('h2').focus({ preventScroll: true }); } }
    else { playing = true; began = performance.now(); play.textContent = 'Pause practice'; raf = requestAnimationFrame(tick); }
  }
  root.addEventListener('click', event => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button');
    if (!button) return;
    if (button.dataset.tourWord !== undefined && step === 0) { selected = current = Number(button.dataset.tourWord); render(); }
    if (button === next && !next.disabled) { step++; render(); if (step === 1) speed.focus(); else play.focus(); }
    if (button === play) toggle();
    if (button.classList.contains('tour-back')) { stop(); step = Math.max(0, step - 1); render(); }
  }, { signal: abort.signal });
  speed.addEventListener('input', () => { changed = true; get('.tour-speed output').textContent = `${speed.value} WPM`; next.disabled = false; }, { signal: abort.signal });
  root.addEventListener('keydown', event => {
    if (step === 2 && event.code === 'Space' && event.target !== play) { event.preventDefault(); toggle(); }
    if (event.key === 'Escape') stop();
  }, { signal: abort.signal });
  render();
  return { stop, reset: () => { stop(); step = 0; selected = -1; current = 0; moved = false; changed = false; render(); }, dispose: () => { stop(); abort.abort(); } };
}
