import { segmentText, type Segment } from './core.ts';
export type Span = { node: Text; start: number; end: number };
export type Block = { element: HTMLElement; text: string; spans: Span[]; tokens: Token[] };
export type Token = Segment & { id: number; block: Block; range: Range; paragraphEnd: boolean };
const excluded = 'script,style,noscript,nav,[role="banner"],footer,aside,button,input,textarea,select,pre,table,svg,canvas,iframe,[contenteditable]:not([contenteditable="false"]),[hidden],[aria-hidden="true"],[data-wordglide]';
const prose = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,dd,dt,figcaption';

export function readable(node: Element, root: Element): boolean {
  for (let current: Element | null = node; current; current = current.parentElement) {
    if (current.matches(excluded)) return false;
    const css = getComputedStyle(current);
    if (css.display === 'none' || css.visibility === 'hidden') return false;
    if (current === root) break;
  }
  return true;
}

export function detectRoot(): HTMLElement | null {
  if (location.hostname === 'github.com') {
    const readme = document.querySelector<HTMLElement>('#readme .markdown-body, [aria-label="README"] .markdown-body, article.markdown-body');
    if (readme) return readme;
  }
  const candidates = [...document.querySelectorAll<HTMLElement>('article,main,[role="main"]')].filter(el => readable(el, document.documentElement));
  const score = (el: HTMLElement) => {
    const text = [...el.querySelectorAll<HTMLElement>(prose)].filter(p => readable(p, el)).reduce((n, p) => n + (p.textContent?.length ?? 0), 0);
    const links = [...el.querySelectorAll('a')].reduce((n, a) => n + (a.textContent?.length ?? 0), 0);
    return text - links * .6;
  };
  candidates.sort((a, b) => score(b) - score(a));
  return candidates[0] && score(candidates[0]) > 40 ? candidates[0] : null;
}

export function indexRoot(root: HTMLElement): Token[] {
  const blocks: Block[] = [];
  let block: Block | undefined;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  while (walker.nextNode()) {
    if (walker.currentNode instanceof Element) {
      if (walker.currentNode.matches('br,hr')) block = undefined;
      continue;
    }
    const node = walker.currentNode as Text;
    const parent = node.parentElement;
    if (!parent || !node.data || !readable(parent, root)) { block = undefined; continue; }
    const element = (parent.closest(prose) ?? parent.closest('div,section,article,main') ?? root) as HTMLElement;
    if (!block || block.element !== element) {
      block = { element, text: '', spans: [], tokens: [] };
      blocks.push(block);
    }
    block.spans.push({ node, start: block.text.length, end: block.text.length + node.length });
    block.text += node.data;
  }
  const tokens: Token[] = [];
  for (const b of blocks) {
    const words = segmentText(b.text);
    for (const word of words) {
      const first = b.spans.find(s => s.end > word.start);
      const last = b.spans.find(s => s.end >= word.end && s.start < word.end);
      if (!first || !last) continue;
      const range = document.createRange();
      range.setStart(first.node, word.start - first.start);
      range.setEnd(last.node, word.end - last.start);
      const token = { ...word, id: tokens.length, block: b, range, paragraphEnd: word === words.at(-1) };
      tokens.push(token); b.tokens.push(token);
    }
  }
  return tokens;
}

export function rectangles(token: Token): DOMRect[] {
  return [...token.range.getClientRects()].filter(r => r.width > .2 && r.height > .2);
}

export function tokenAtPoint(tokens: Token[], x: number, y: number): Token | undefined {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const caret = doc.caretPositionFromPoint?.(x, y);
  const range = !caret ? doc.caretRangeFromPoint?.(x, y) : null;
  const node = caret?.offsetNode ?? range?.startContainer;
  const offset = caret?.offset ?? range?.startOffset ?? 0;
  const near = tokens.filter(t => {
    try { return !!node && t.range.comparePoint(node, offset) === 0; } catch { return false; }
  });
  return near.find(t => rectangles(t).some(r => x >= r.left - 4 && x <= r.right + 4 && y >= r.top - 4 && y <= r.bottom + 4));
}
