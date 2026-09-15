import css from '../styles.css';
import { defaults, sanitizeSettings, durationFor, travelDuration, type Settings, type Status, type Command, type Snapshot, type Reply } from './core.ts';
import { detectRoot, indexRoot, rectangles, tokenAtPoint, readable, type Token } from './text.ts';
import { mountControls } from './ui.ts';
import { Guide, guideCSS } from './guide.ts';

type Runtime = { build: string; dispose: () => void; reveal: () => void };
const context = globalThis as typeof globalThis & { __wordglide?: Runtime };
const existing = context.__wordglide;
if (existing?.build === __BUILD_ID__) existing.reveal();
else { existing?.dispose(); void initialize(); }

async function initialize() {
  const selection = window.getSelection();
  const selected = selection && !selection.isCollapsed && selection.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
  const abort = new AbortController();
  const on = (target: EventTarget, type: string, fn: EventListener, capture = false) => target.addEventListener(type, fn, { signal: abort.signal, capture });
  let settings: Settings = { ...defaults };
  let root: HTMLElement | null = null;
  let tokens: Token[] = [];
  let status: Status = 'idle';
  let index = 0, start = 0, end = 0;
  let activeEnd = 0;
  let message = '';
  let disposed = false;
  let ready!: () => void;
  const initialized = new Promise<void>(resolve => { ready = resolve; });
  let raf = 0;
  let epoch = 0;
  let elapsed = 0, began = 0, wordDuration = 0, lastFrame = 0;
  let rectCache = new Map<number, DOMRect[]>();
  let geometryDirty = true;
  let pickingPreview: Token | HTMLElement | undefined;
  let lastBroadcast = 0;
  let rebuildTimer = 0;
  let scrollTask: { scroller: HTMLElement; target: number; expected: number; from: number; began: number; duration: number; done: () => void; epoch: number } | undefined;
  const geometryRecovery = new Set<number>();
  let lastOwnedScroll: { scroller: HTMLElement; position: number; at: number } | undefined;
  let scrollAttempts = 0;
  let collapsed = false;
  let savedPosition: { x: number; y: number } | undefined;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const originalURL = location.href;

  // A DOM event also reaches an orphan from an older extension context.
  document.dispatchEvent(new Event('cursor-follow:dispose')); // Pre-WordGlide builds.
  document.dispatchEvent(new Event('wordglide:dispose'));
  const host = document.createElement('div');
  host.dataset.wordglide = '';
  host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;display:block;';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `${css}
    :host{all:initial} .shell{font:14px/1.45 Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;text-align:left;letter-spacing:normal;color:#233b36;position:fixed;right:20px;bottom:20px;width:326px;max-width:calc(100vw - 24px);max-height:calc(100vh - 24px);overflow:auto;pointer-events:auto;border:1px solid #d4ddcb;border-radius:18px;box-shadow:0 12px 50px #102a2429;background:#f8f7f2;scrollbar-width:thin}
    .shell .panel{padding:18px}.shell .reading{margin-top:14px}.shell h1{font-size:25px}.shell .toggles{margin-top:8px}.shell .section-label{margin-top:13px}.chrome{display:flex;align-items:center;gap:5px;padding:7px 10px;border-bottom:1px solid #e3e7da;background:#edf0e6;position:sticky;top:0;z-index:2}.drag{flex:1;color:#7e8c73;letter-spacing:2px;font-size:12px;cursor:grab;touch-action:none;background:transparent;text-align:left}.chrome button:not(.drag){width:26px;height:26px;border-radius:6px;background:transparent;color:#5c7054}.chrome button:hover{background:#dce5d2}
    .handle{display:none;pointer-events:auto;background:#294e3e;color:#fffdf4;border-radius:28px;padding:11px 16px;box-shadow:0 5px 25px #19352b30;font-size:12px;white-space:nowrap}.shell.collapsed{width:auto;overflow:visible;background:none;border:0;box-shadow:none}.collapsed .chrome,.collapsed .panel{display:none}.collapsed .handle{display:block}
    .shell:not(.collapsed){width:280px;border-radius:12px}.shell .panel{padding:12px}.shell .reading{margin-top:8px}.chrome{padding:3px 8px}.drag{font-size:10px}.handle{padding:8px 12px}
    ${guideCSS}
    .preview{position:fixed;pointer-events:none;border:2px dashed #68875b;border-radius:5px;background:#78945315;display:none}.hint{position:fixed;left:50%;top:16px;transform:translateX(-50%);max-width:calc(100vw - 30px);padding:11px 18px;background:#294e3e;color:#fff;border-radius:10px;font:13px/1.5 system-ui;box-shadow:0 4px 20px #0002;display:none;text-align:center;pointer-events:none}
  `;
  shadow.append(style);
  const guide = new Guide(shadow);
  const preview = document.createElement('div'); preview.className = 'preview';
  const hint = document.createElement('div'); hint.className = 'hint'; hint.setAttribute('role', 'status');
  const shell = document.createElement('section'); shell.className = 'shell'; shell.setAttribute('aria-label', 'WordGlide controls');
  shell.innerHTML = '<div class="chrome"><button class="drag" aria-label="Move reading controls">⠿</button><button class="collapse" aria-label="Collapse controls">−</button><button class="close" aria-label="Close reading guide">×</button></div><div class="panel"></div><button class="handle" aria-label="Expand reading controls">↗ WordGlide</button>';
  shadow.append(preview, hint, shell);
  document.documentElement.append(host);
  const renderUI = mountControls(shell.querySelector('.panel')!, command => { try { dispatch(command); } catch (error) { message = String(error); publish(); } }, () => pause('Paused while you read the quick guide.'));

  function snapshot(): Snapshot {
    return { status, settings, index, start, end, count: tokens.length, word: tokens[index]?.text ?? '', message, title: root?.querySelector('h1,h2')?.textContent?.trim().slice(0, 100) ?? document.title };
  }
  function publish(force = true) {
    if (disposed) return;
    const state = snapshot(); renderUI(state);
    const handle = shell.querySelector('.handle')!;
    handle.textContent = status === 'playing' ? `Ⅱ ${settings.wpm} WPM · Controls` : `↗ ${settings.wpm} WPM · Controls`;
    if (force || performance.now() - lastBroadcast > 180) {
      lastBroadcast = performance.now();
      try { void chrome.runtime.sendMessage({ channel: 'wordglide-state', snapshot: state }).catch(() => { if (!chrome.runtime?.id) dispose(); }); } catch { dispose(); }
    }
  }
  function invalidate() {
    geometryDirty = true; rectCache.clear();
    if (status !== 'playing') drawStatic();
  }
  function rects(token: Token): DOMRect[] {
    if (!rectCache.has(token.id)) rectCache.set(token.id, rectangles(token));
    return rectCache.get(token.id)!;
  }
  function hideGuide() { guide.hide(); }
  function groupEnd() {
    let last = index;
    if (settings.mode !== 'highlight') return last;
    const first = rects(tokens[index])[0];
    while (last < end && last - index + 1 < settings.groupSize) {
      const next = tokens[last + 1], box = rects(next)[0];
      if (next.block !== tokens[index].block || !first || !box || Math.abs(first.top - box.top) >= 4) break;
      last++;
    }
    return last;
  }
  function guideRects(last = groupEnd()) { return tokens.slice(index, last + 1).flatMap(rects); }
  function isCursor() { return settings.mode === 'cursor'; }
  function sweepCursor(progress: number, animate = !reduced.matches) {
    guide.sweep(rects(tokens[index]), index < end ? rects(tokens[index + 1])[0] : undefined, reduced.matches ? 0 : progress, animate);
  }
  function drawStatic() {
    if (disposed || status.startsWith('picking') || !tokens[index]) return;
    if (isCursor()) sweepCursor(wordDuration ? elapsed / wordDuration : 0, false);
    else guide.move(guideRects());
  }
  function chooseRoot(next: HTMLElement, useSelection = false) {
    pause(); root = next; tokens = indexRoot(next); geometryRecovery.clear(); index = start = 0; end = Math.max(0, tokens.length - 1);
    if (useSelection && selected) {
      const inside = tokens.filter(t => t.range.compareBoundaryPoints(Range.END_TO_START, selected) < 0 && t.range.compareBoundaryPoints(Range.START_TO_END, selected) > 0);
      if (inside.length) { start = index = inside[0].id; end = inside.at(-1)!.id; }
    }
    status = tokens.length ? 'ready' : 'idle';
    message = tokens.length ? 'Passage ready. Set your boundaries or press Play.' : 'No readable prose here. Choose a different reading area.';
    elapsed = 0; invalidate(); observeRoot(); publish();
  }
  function pause(reason = '') {
    epoch++;
    if (status === 'playing') guide.freeze();
    if (status === 'playing' && !scrollTask) elapsed += Math.max(0, performance.now() - began);
    cancelAnimationFrame(raf); scrollTask = undefined;
    if (!status.startsWith('picking') && tokens.length && status !== 'finished') status = 'paused';
    if (reason) message = reason;
    publish();
  }
  function scrollerFor(element: Element): HTMLElement {
    for (let p = element.parentElement; p && p !== document.body; p = p.parentElement) {
      if (/(auto|scroll)/.test(getComputedStyle(p).overflowY) && p.scrollHeight > p.clientHeight + 2) return p;
    }
    return document.scrollingElement as HTMLElement;
  }
  function viewport(token: Token) {
    const scroller = scrollerFor(token.block.element);
    const box = scroller === document.scrollingElement ? { top: 0, bottom: innerHeight, left: 0, right: innerWidth } : scroller.getBoundingClientRect();
    let top = Math.max(0, box.top), bottom = Math.min(innerHeight, box.bottom);
    const r = rects(token)[0];
    const x = Math.max(1, Math.min(innerWidth - 1, r ? r.left + r.width / 2 : innerWidth / 2));
    for (const edge of ['top', 'bottom'] as const) {
      const y = edge === 'top' ? top + 1 : bottom - 1;
      for (const el of document.elementsFromPoint(x, y)) {
        if (el === host) continue;
        const pos = getComputedStyle(el).position;
        if (pos !== 'fixed' && pos !== 'sticky') continue;
        const bounds = el.getBoundingClientRect();
        if (bounds.height > (bottom - top) * .4) continue;
        if (edge === 'top') top = Math.max(top, bounds.bottom);
        else bottom = Math.min(bottom, bounds.top);
      }
    }
    return { scroller, top: top + 12, bottom: bottom - 14 };
  }
  function avoidToolbar(list: DOMRect[]) {
    if (!list.length) return;
    const bounds = shell.getBoundingClientRect();
    if (list.some(r => r.right >= bounds.left && r.left <= bounds.right && r.bottom >= bounds.top && r.top <= bounds.bottom)) {
      setCollapsed(true);
      const r = list[0];
      const width = shell.getBoundingClientRect().width;
      shell.style.left = r.left > innerWidth / 2 ? '12px' : `${Math.max(12, innerWidth - width - 12)}px`;
      shell.style.right = 'auto'; shell.style.top = ''; shell.style.bottom = '12px';
    }
  }
  function scrollToToken(token: Token, done: () => void): boolean {
    let list = rects(token);
    if (!list.length && settings.autoScroll && !geometryRecovery.has(token.id)) {
      geometryRecovery.add(token.id);
      // Bringing the block near the viewport lets content-visibility render lazily.
      const blockRect = token.block.element.getBoundingClientRect();
      if (blockRect.height > 0) list = [blockRect];
    }
    if (!list.length) { pause('This word is not rendered yet. Scroll it into view, then resume.'); return true; }
    const bounds = viewport(token); const r = list[0];
    const height = bounds.bottom - bounds.top;
    if (r.top >= bounds.top && r.bottom <= bounds.top + height * .75) { scrollAttempts = 0; return false; }
    if (!settings.autoScroll) { pause('The next word is outside the reading area. Scroll to it, then resume.'); return true; }
    const delta = r.top - (bounds.top + height * .4);
    const from = bounds.scroller.scrollTop;
    const target = Math.max(0, Math.min(bounds.scroller.scrollHeight - bounds.scroller.clientHeight, from + delta));
    if (Math.abs(target - from) < 1) {
      if (r.top < bounds.top || r.bottom > bounds.bottom) { pause('This word is obscured. Adjust the page, then resume.'); return true; }
      return false;
    }
    if (scrollAttempts >= 2) { pause('The page is preventing scrolling. Move to the word manually, then resume.'); return true; }
    scrollAttempts++;
    scrollTask = { scroller: bounds.scroller, target, from, expected: from, began: performance.now(), duration: reduced.matches ? 0 : 220, done, epoch };
    raf = requestAnimationFrame(animateScroll); return true;
  }
  function animateScroll(now: number) {
    const task = scrollTask;
    if (!task || task.epoch !== epoch || status !== 'playing') return;
    const progress = task.duration ? Math.min(1, (now - task.began) / task.duration) : 1;
    const eased = 1 - (1 - progress) ** 3;
    task.expected = task.from + (task.target - task.from) * eased;
    // Instant writes give us an exact owned trajectory that manual deltas can interrupt.
    task.scroller.scrollTo({ top: task.expected, behavior: 'instant' });
    task.expected = task.scroller.scrollTop;
    lastOwnedScroll = { scroller: task.scroller, position: task.expected, at: now };
    rectCache.clear(); geometryDirty = true; drawStatic();
    if (progress < 1) raf = requestAnimationFrame(animateScroll);
    else { scrollTask = undefined; elapsed = 0; task.done(); }
  }
  function beginWord() {
    if (disposed || status !== 'playing') return;
    if (!tokens[index]?.range.startContainer.isConnected) { pause('The passage changed. Choose your start word again.'); return; }
    const token = tokens[index];
    if (scrollToToken(token, beginWord)) return;
    rectCache.clear(); geometryDirty = false;
    activeEnd = groupEnd();
    const list = guideRects(activeEnd);
    if (!list.length) { pause('This word has no visible position. Scroll it into view and resume.'); return; }
    avoidToolbar(list);
    wordDuration = tokens.slice(index, activeEnd + 1).reduce((total, t) => total + durationFor(t, t.paragraphEnd, settings), 0);
    began = performance.now(); lastFrame = began;
    if (isCursor()) sweepCursor(elapsed / wordDuration);
    else guide.move(list, reduced.matches ? 0 : Math.min(travelDuration(wordDuration, false), Math.max(0, wordDuration - elapsed)));
    publish(false); raf = requestAnimationFrame(frame);
  }
  function frame(now: number) {
    if (status !== 'playing' || disposed) return;
    if (!chrome.runtime?.id) { dispose(); return; }
    if (document.hidden) { pause('Paused while this tab is hidden.'); return; }
    if (location.href !== originalURL || !root?.isConnected) { dispose(); return; }
    if (document.fullscreenElement || document.querySelector(':modal')) { pause('Paused while fullscreen or a dialog is open.'); return; }
    // After a blocked main thread, preserve the unseen portion instead of catching up.
    if (now - lastFrame > 100) began += now - lastFrame;
    lastFrame = now;
    const needsLayout = geometryDirty;
    if (geometryDirty) { rectCache.clear(); geometryDirty = false; }
    const list = guideRects(activeEnd);
    if (!list.length) { pause('The current word is not visible. Scroll to it and resume.'); return; }
    if (isCursor()) sweepCursor((elapsed + now - began) / wordDuration);
    else if (needsLayout) guide.move(list);
    if (elapsed + now - began >= wordDuration) {
      if (activeEnd >= end) { index = end; status = 'finished'; elapsed = 0; message = 'Passage complete. Take a breath, or read it again.'; publish(); return; }
      index = activeEnd + 1; elapsed = 0; scrollAttempts = 0; beginWord();
    } else raf = requestAnimationFrame(frame);
  }
  function play() {
    leavePicking();
    if (!tokens.length) {
      const candidate = detectRoot();
      if (candidate) chooseRoot(candidate, true);
      if (!tokens.length) { pick('picking-area'); return; }
    }
    if (status === 'playing') return;
    if (status === 'finished') { index = start; elapsed = 0; }
    if (document.hidden) { pause('Return to this tab to resume.'); return; }
    status = 'playing'; message = settings.natural ? 'Following your pace, with a breath at punctuation.' : 'Even word timing. Scrolling can add a short pause.';
    setCollapsed(true); epoch++; scrollAttempts = 0; beginWord();
  }
  function leavePicking() { preview.style.display = 'none'; hint.style.display = 'none'; pickingPreview = undefined; if (status.startsWith('picking')) status = tokens.length ? 'ready' : 'idle'; }
  function pick(next: Status) {
    pause(); status = next; hideGuide(); setCollapsed(true);
    message = next === 'picking-area' ? 'Hover over an article area and click to choose it. Esc cancels.' : next === 'picking-start' ? 'Click the word to start from. Esc cancels.' : 'Click the last word to read. Esc cancels.';
    hint.textContent = message; hint.style.display = 'block'; publish();
  }
  function dispatch(command: Command): Snapshot {
    switch (command.type) {
      case 'snapshot': break;
      case 'play': play(); break;
      case 'pause': pause('Paused. Resume whenever you are ready.'); break;
      case 'stop': pause(); leavePicking(); index = start; elapsed = 0; status = tokens.length ? 'ready' : 'idle'; message = 'Back at the beginning of your passage.'; drawStatic(); break;
      case 'pick-start': if (!root) { const found = detectRoot(); if (found) chooseRoot(found); } pick(root ? 'picking-start' : 'picking-area'); break;
      case 'pick-end': if (!tokens.length) { message = 'Choose a start word first.'; } else pick('picking-end'); break;
      case 'pick-area': pick('picking-area'); break;
      case 'step': pause(); leavePicking(); index = Math.max(start, Math.min(end, index + Math.sign(command.delta ?? 1))); elapsed = 0; drawStatic(); break;
      case 'settings': {
        const previous = settings;
        const playing = status === 'playing';
        if (playing) pause();
        settings = sanitizeSettings({ ...settings, ...command.settings });
        void chrome.storage.local.set({ settings }).catch(() => {});
        guide.configure(settings);
        if (settings.mode !== previous.mode || settings.groupSize !== previous.groupSize) elapsed = 0;
        if (playing) play(); else drawStatic();
        break;
      }
      case 'dispose': dispose(); break;
    }
    publish(); return snapshot();
  }
  function setCollapsed(value: boolean) { collapsed = value; shell.classList.toggle('collapsed', value); clampShell(); }
  function clampShell() {
    if (!savedPosition) return;
    const r = shell.getBoundingClientRect();
    shell.style.left = `${Math.max(12, Math.min(innerWidth - r.width - 12, savedPosition.x))}px`;
    shell.style.top = `${Math.max(12, Math.min(innerHeight - r.height - 12, savedPosition.y))}px`;
    shell.style.right = 'auto'; shell.style.bottom = 'auto';
  }
  const listener = (msg: { channel?: string; command?: Command }, _sender: chrome.runtime.MessageSender, respond: (reply: Reply) => void) => {
    if (msg?.channel !== 'wordglide' || !msg.command) return;
    void initialized.then(() => {
      try { respond({ ok: true, snapshot: dispatch(msg.command!) }); } catch (error) { respond({ ok: false, error: error instanceof Error ? error.message : String(error) }); }
    });
    return true;
  };
  function dispose() {
    if (disposed) return;
    disposed = true; epoch++; cancelAnimationFrame(raf); clearTimeout(rebuildTimer); abort.abort();
    observer.disconnect(); navigationObserver.disconnect(); resizeObserver.disconnect();
    renderUI.dispose();
    guide.hide();
    try { chrome.runtime.onMessage.removeListener(listener); } catch { /* An extension update may have invalidated this context. */ }
    host.remove();
    if (context.__wordglide?.build === __BUILD_ID__) delete context.__wordglide;
  }
  const observer = new MutationObserver(records => {
    if (!root) return;
    invalidate();
    if (!records.some(r => r.type === 'characterData' || r.type === 'childList')) return;
    clearTimeout(rebuildTimer);
    if (status === 'playing') pause('The passage changed. Checking your position…');
    rebuildTimer = window.setTimeout(() => {
      if (!root?.isConnected) { dispose(); return; }
      const old = [tokens[start], tokens[index], tokens[end]];
      const fresh = indexRoot(root);
      const mapped = old.map(t => t && fresh.find(n => n.text === t.text && n.range.startContainer === t.range.startContainer && n.range.startOffset === t.range.startOffset && n.range.endContainer === t.range.endContainer && n.range.endOffset === t.range.endOffset));
      tokens = fresh; rectCache.clear();
      if (mapped.every(Boolean)) { [start, index, end] = mapped.map(t => t!.id); status = 'paused'; message = 'Page updated. Your place is saved; press Resume.'; }
      else { start = index = 0; end = Math.max(0, tokens.length - 1); status = 'ready'; message = 'The passage changed. Choose your start and end words again.'; }
      elapsed = 0; drawStatic(); publish();
    }, 180);
  });
  const resizeObserver = new ResizeObserver(invalidate);
  const navigationObserver = new MutationObserver(() => {
    if (location.href !== originalURL || (root && !root.isConnected)) dispose();
  });
  navigationObserver.observe(document.documentElement, { childList: true, subtree: true });
  function observeRoot() {
    observer.disconnect(); resizeObserver.disconnect();
    if (root) { observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'open'] }); resizeObserver.observe(root); }
  }
  on(document, 'wordglide:dispose', dispose);
  on(shell.querySelector('.collapse')!, 'click', () => setCollapsed(true));
  on(shell.querySelector('.handle')!, 'click', () => { if (status === 'playing') pause('Paused while you adjust your controls.'); setCollapsed(false); });
  on(shell.querySelector('.close')!, 'click', dispose);
  const drag = shell.querySelector('.drag') as HTMLButtonElement;
  let dragging: { x: number; y: number; left: number; top: number } | undefined;
  on(drag, 'pointerdown', event => {
    const e = event as PointerEvent; const r = shell.getBoundingClientRect();
    dragging = { x: e.clientX, y: e.clientY, left: r.left, top: r.top }; drag.setPointerCapture(e.pointerId); e.preventDefault();
  });
  on(drag, 'pointermove', event => { if (!dragging) return; const e = event as PointerEvent; savedPosition = { x: dragging.left + e.clientX - dragging.x, y: dragging.top + e.clientY - dragging.y }; clampShell(); });
  on(drag, 'pointerup', () => { dragging = undefined; void chrome.storage.local.set({ toolbarPosition: savedPosition }).catch(() => {}); });
  on(document, 'pointermove', event => {
    if (!status.startsWith('picking')) return;
    const e = event as PointerEvent; if (e.composedPath().includes(host)) return;
    if (status === 'picking-area') {
      const target = (e.target as Element).closest<HTMLElement>('article,main,section,div,p,li');
      pickingPreview = target && readable(target, document.documentElement) ? target : undefined;
    } else pickingPreview = tokenAtPoint(tokens, e.clientX, e.clientY);
    const r = pickingPreview instanceof HTMLElement ? pickingPreview.getBoundingClientRect() : pickingPreview ? rectangles(pickingPreview)[0] : undefined;
    preview.style.display = r ? 'block' : 'none';
    if (r) preview.style.cssText = `display:block;left:${r.left - 2}px;top:${r.top - 2}px;width:${r.width + 4}px;height:${r.height + 4}px`;
  }, true);
  on(document, 'click', event => {
    if ((event as MouseEvent).composedPath().includes(host)) return;
    if (status.startsWith('picking')) {
      event.preventDefault(); event.stopImmediatePropagation();
      const e = event as MouseEvent;
      if (status === 'picking-area') {
        const target = (e.target as Element).closest<HTMLElement>('article,main,section,div,p,li');
        if (target && readable(target, document.documentElement)) { leavePicking(); chooseRoot(target); pick('picking-start'); }
      } else {
        const token = tokenAtPoint(tokens, e.clientX, e.clientY);
        if (!token) return;
        if (status === 'picking-end' && token.id < start) { hint.textContent = 'Choose an end word after your start word.'; return; }
        if (status === 'picking-start') { start = index = token.id; if (end < start) end = tokens.length - 1; }
        else { end = token.id; index = start; }
        elapsed = 0; leavePicking(); status = 'ready'; message = 'Passage selected. Press Play when you are ready.'; setCollapsed(false); drawStatic(); publish();
      }
    } else if (status === 'playing') pause('Paused while you interact with the page.');
  }, true);
  const manual = (event: Event) => { if (status === 'playing' && !event.composedPath().includes(host)) pause('Paused because you moved the page.'); };
  on(document, 'wheel', manual, true); on(document, 'touchstart', manual, true);
  on(document, 'pointerdown', event => {
    if (status === 'playing' && !event.composedPath().includes(host)) manual(event);
  }, true);
  on(document, 'scroll', event => {
    rectCache.clear(); geometryDirty = true;
    const scroller = event.target === document ? document.scrollingElement : event.target;
    if (!(scroller instanceof HTMLElement) || scroller === host || host.contains(scroller)) return;
    const own = scrollTask?.scroller === scroller && Math.abs(scroller.scrollTop - scrollTask.expected) < 3;
    const recent = lastOwnedScroll?.scroller === scroller && performance.now() - lastOwnedScroll.at < 100 && Math.abs(scroller.scrollTop - lastOwnedScroll.position) < 3;
    if (status === 'playing' && !own && !recent) pause('Paused because the page moved.');
    if (status !== 'playing') drawStatic();
  }, true);
  on(document, 'keydown', event => {
    const e = event as KeyboardEvent;
    const target = e.composedPath()[0] as Element;
    if (renderUI.isIntroOpen()) return;
    if (target instanceof Element && target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])')) return;
    if (e.key === 'Escape') { e.preventDefault(); pause(); leavePicking(); message = 'Paused. Press Space to resume.'; publish(); }
    else if (e.code === 'Space' && !e.altKey && !e.ctrlKey && !e.metaKey) { e.preventDefault(); if (status === 'playing') pause('Paused. Press Space to resume.'); else play(); }
    else if (e.altKey && ['ArrowLeft', 'ArrowRight'].includes(e.key)) { e.preventDefault(); dispatch({ type: 'step', delta: e.key === 'ArrowLeft' ? -1 : 1 }); }
    else if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End'].includes(e.key)) manual(e);
  }, true);
  on(document, 'visibilitychange', () => { if (document.hidden && status === 'playing') pause('Paused while this tab is hidden.'); });
  on(window, 'resize', () => { invalidate(); clampShell(); });
  on(window, 'popstate', dispose); on(window, 'hashchange', dispose); on(window, 'pagehide', dispose);
  on(document, 'load', invalidate, true);
  on(document.fonts, 'loadingdone', invalidate);
  if (window.visualViewport) { on(window.visualViewport, 'resize', invalidate); on(window.visualViewport, 'scroll', invalidate); }
  context.__wordglide = { build: __BUILD_ID__, dispose, reveal: () => { setCollapsed(false); publish(); } };
  chrome.runtime.onMessage.addListener(listener);
  try {
    const stored = await chrome.storage.local.get(['settings', 'toolbarPosition']) as { settings?: Partial<Settings>; toolbarPosition?: { x: number; y: number } };
    if (disposed) return;
    settings = sanitizeSettings(stored.settings);
    guide.configure(settings);
    if (Number.isFinite(stored.toolbarPosition?.x) && Number.isFinite(stored.toolbarPosition?.y)) savedPosition = stored.toolbarPosition;
  } catch { /* Defaults remain available if storage is unavailable. */ }
  const detected = detectRoot();
  if (detected) chooseRoot(detected, true);
  else { message = 'Choose a reading area to get started.'; publish(); }
  clampShell();
  ready();
}
