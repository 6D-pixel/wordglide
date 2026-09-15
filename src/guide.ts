import { defaults, palette, type CursorShape, type Settings } from './core.ts';

// Fixed viewBoxes preserve the proportions at every user-selected size.
export function cursorIcon(shape: CursorShape): string {
  const common = 'viewBox="0 0 32 32" fill="#fffdf5" stroke="currentColor" stroke-width="var(--guide-stroke,2)" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
  if (shape === 'dot') return `<svg ${common}><circle cx="16" cy="16" r="9" fill="currentColor" stroke="#fffdf5" stroke-width="1.5"/></svg>`;
  if (shape === 'arrow') return `<svg ${common}><path d="M7 3v24l6-6 5 9 5-3-5-9h9Z"/></svg>`;
  return `<svg ${common}><path d="M11 17V5a3 3 0 0 1 6 0v8a2.5 2.5 0 0 1 5 0v2a2.5 2.5 0 0 1 5 0v2a2 2 0 0 1 4 0v5c0 4-3 8-7 8h-8c-2.5 0-4-1-5.5-3L4 20a2.7 2.7 0 0 1 4-3.5l3 3.5Z" transform="translate(-1 0) scale(.97)"/></svg>`;
}

export const guideCSS = `
  .guide,.fragment{position:fixed;left:0;top:0;pointer-events:none;box-sizing:border-box;will-change:transform;}
  .marker{display:none;color:#386c46;filter:drop-shadow(0 1px 1px #193b3826)}
  .marker svg{width:100%;height:100%;display:block;overflow:visible}
  .fragment{border-radius:4px;background:#edc96155;will-change:transform,width;height:auto}
  .fragment.outline{background:transparent;border:var(--guide-stroke,2px) solid #5d8150}
  .trail-dot{position:fixed;left:0;top:0;border-radius:50%;pointer-events:none;animation:trail-fade 180ms linear forwards}
  @keyframes trail-fade{from{opacity:.3}to{opacity:0}}
`;

export class Guide {
  readonly marker = document.createElement('div');
  readonly fragments = document.createElement('div');
  readonly trail = document.createElement('div');
  private lastDot?: { x: number; y: number };
  private settings: Settings = { ...defaults };
  private lastRects: DOMRect[] = [];
  private visible = false;

  constructor(shadow: ShadowRoot) {
    this.marker.className = 'guide marker';
    this.marker.setAttribute('aria-hidden', 'true');
    this.fragments.setAttribute('aria-hidden', 'true');
    this.trail.setAttribute('aria-hidden', 'true');
    shadow.append(this.trail, this.marker, this.fragments);
    this.configure(this.settings);
  }

  configure(settings: Settings) {
    const previous = this.settings;
    this.settings = settings;
    if (settings.mode !== previous.mode) this.hide();
    if (!this.marker.firstChild || settings.cursorShape !== previous.cursorShape) this.marker.innerHTML = cursorIcon(settings.cursorShape);
    this.marker.dataset.shape = settings.cursorShape;
    this.marker.style.width = `${settings.cursorSize}px`;
    this.marker.style.height = `${settings.cursorSize}px`;
    this.marker.style.setProperty('--guide-stroke', String(settings.thickness));
    this.marker.style.color = palette[settings.color];
    this.trail.replaceChildren(); this.lastDot = undefined;
    this.fragments.style.setProperty('--guide-stroke', `${settings.thickness}px`);
  }

  move(rects: DOMRect[], duration = 0) {
    if (!rects.length) { this.hide(); return; }
    // A single word can cross text nodes (read<em>ing</em>). Those rects are
    // fragments of ONE line, not a line return. Merge only same-line fragments;
    // retain separate rectangles for genuinely wrapped words.
    const lines: DOMRect[] = [];
    for (const rect of rects) {
      const previous = lines.at(-1);
      if (previous && Math.abs(previous.top - rect.top) < 4) {
        const left = Math.min(previous.left, rect.left), top = Math.min(previous.top, rect.top);
        lines[lines.length - 1] = new DOMRect(left, top, Math.max(previous.right, rect.right) - left, Math.max(previous.bottom, rect.bottom) - top);
      } else lines.push(rect);
    }
    rects = lines;
    const sameLine = this.visible && this.lastRects.length === 1 && rects.length === 1 && Math.abs(this.lastRects[0].top - rects[0].top) < 4;
    const ms = sameLine ? duration : 0;
    const transition = ms ? `transform ${ms}ms cubic-bezier(.22,.7,.24,1),width ${ms}ms cubic-bezier(.22,.7,.24,1),height ${ms}ms cubic-bezier(.22,.7,.24,1)` : 'none';
    if (this.settings.mode === 'cursor') {
      if (this.fragments.childElementCount) this.fragments.replaceChildren();
      const r = rects[0], size = this.settings.cursorSize;
      // Anchor the hand's fingertip, arrow tip, or dot's upper edge under the word.
      const anchor = this.settings.cursorShape === 'hand' ? .394 : this.settings.cursorShape === 'arrow' ? 7 / 32 : .5;
      const top = this.settings.cursorShape === 'dot' ? 7 / 32 : this.settings.cursorShape === 'arrow' ? 3 / 32 : 2 / 32;
      this.marker.style.display = 'block';
      this.marker.style.transition = transition;
      this.marker.style.transform = `translate3d(${r.left + (this.settings.cursorShape === 'dot' ? 0 : r.width / 2) - size * anchor}px,${r.bottom + 3 - size * top}px,0)`;
    } else {
      this.marker.style.display = 'none';
      while (this.fragments.childElementCount > rects.length) this.fragments.lastElementChild!.remove();
      rects.forEach((r, i) => {
        const el = (this.fragments.children[i] ?? this.fragments.appendChild(document.createElement('div'))) as HTMLElement;
        el.className = `fragment ${this.settings.mode === 'outline' ? 'outline' : ''}`;
        el.style.borderColor = palette[this.settings.color];
        el.style.transition = transition;
        el.style.transform = `translate3d(${r.left - 2}px,${r.top - 1}px,0)`;
        el.style.width = `${r.width + 4}px`;
        el.style.height = `${r.height + 2}px`;
      });
    }
    this.visible = true; this.lastRects = rects;
  }

  freeze() {
    this.trail.replaceChildren(); this.lastDot = undefined;
    // Read the rendered positions before any writes; resume starts here, not at
    // the previous word or at the CSS transition's unfinished destination.
    const elements = [this.marker, ...this.fragments.children] as HTMLElement[];
    const states = elements.map(el => { const css = getComputedStyle(el); return { transform: css.transform, width: css.width, height: css.height }; });
    elements.forEach((el, i) => { el.style.transition = 'none'; Object.assign(el.style, states[i]); });
  }

  hide() {
    this.trail.replaceChildren(); this.lastDot = undefined;
    this.marker.style.display = 'none'; this.marker.style.transition = 'none';
    this.fragments.replaceChildren(); this.visible = false; this.lastRects = [];
  }

  // Drive every cursor from the reader's clock: sweep the whole word and inter-word
  // gap, never jump to its centre. Wrapped fragments get separate line sweeps.
  sweep(rects: DOMRect[], next: DOMRect | undefined, progress: number, animate: boolean) {
    if (!rects.length) { this.hide(); return; }
    const lines: DOMRect[] = [];
    for (const r of rects) {
      const prior = lines.at(-1);
      if (prior && Math.abs(prior.top - r.top) < 4) {
        const left = Math.min(prior.left, r.left);
        lines[lines.length - 1] = new DOMRect(left, prior.top, Math.max(prior.right, r.right) - left, Math.max(prior.height, r.height));
      } else lines.push(r);
    }
    const total = lines.reduce((n, r) => n + r.width, 0);
    let distance = Math.min(1, Math.max(0, progress)) * total;
    let r = lines[0];
    for (let i = 0; i < lines.length; i++) { r = lines[i]; if (distance <= r.width || i === lines.length - 1) break; distance -= r.width; }
    const target = r === lines.at(-1) && next && Math.abs(next.top - r.top) < 4 && next.left >= r.right ? next.left : r.right;
    const x = r.left + (target - r.left) * Math.min(1, distance / Math.max(1, r.width));
    const size = this.settings.cursorSize;
    // The visible tip/edge stays one pixel below the text range, independent
    // of SVG padding and selected size. The dot's white rim is included.
    const edge = r.bottom + 1;
    const y = edge + size * 9.75 / 32;
    const dotShape = this.settings.cursorShape === 'dot';
    if (dotShape && animate && this.lastDot && Math.abs(y - this.lastDot.y) < 4 && x > this.lastDot.x && x - this.lastDot.x < 80) {
      const dot = document.createElement('i'); dot.className = 'trail-dot';
      const diameter = size * 12 / 32;
      dot.style.cssText = `width:${diameter}px;height:${diameter}px;background:${palette[this.settings.color]};transform:translate3d(${this.lastDot.x - diameter / 2}px,${y - diameter / 2}px,0)`;
      this.trail.append(dot);
      dot.addEventListener('animationend', () => dot.remove(), { once: true });
      while (this.trail.childElementCount > 16) this.trail.firstElementChild!.remove();
    } else if (!animate || (this.lastDot && Math.abs(y - this.lastDot.y) >= 4)) this.trail.replaceChildren();
    this.lastDot = { x, y };
    this.marker.style.display = 'block'; this.marker.style.transition = 'none';
    const anchorX = dotShape ? .5 : this.settings.cursorShape === 'hand' ? .394 : 7 / 32;
    const anchorY = dotShape ? 6.25 / 32 : this.settings.cursorShape === 'hand' ? (1.94 - this.settings.thickness * .485) / 32 : (3 - this.settings.thickness / 2) / 32;
    this.marker.style.transform = `translate3d(${x - size * anchorX}px,${edge - size * anchorY}px,0)`;
  }
}
