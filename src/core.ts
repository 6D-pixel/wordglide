export type Mode = 'cursor' | 'highlight' | 'outline';
export type CursorShape = 'hand' | 'dot' | 'arrow';
export const palette = { green: '#386c46', blue: '#2563eb', purple: '#9333ea', red: '#dc2626', orange: '#ea580c', black: '#202020' } as const;
export type Settings = { wpm: number; mode: Mode; natural: boolean; autoScroll: boolean; cursorShape: CursorShape; cursorSize: number; thickness: number; color: keyof typeof palette | 'auto'; groupSize: number; showControls: boolean };
export const defaults: Settings = { wpm: 250, mode: 'cursor', natural: true, autoScroll: true, cursorShape: 'hand', cursorSize: 24, thickness: 2, color: 'auto', groupSize: 1, showControls: true };
export type Segment = { text: string; start: number; end: number; punctuation: string };

export function sanitizeSettings(value: Partial<Settings> = {}): Settings {
  return {
    wpm: typeof value.wpm === 'number' && Number.isFinite(value.wpm) ? Math.max(60, Math.min(1000, Math.round(value.wpm))) : defaults.wpm,
    mode: ['cursor', 'highlight', 'outline'].includes(value.mode ?? '') ? value.mode! : defaults.mode,
    natural: typeof value.natural === 'boolean' ? value.natural : defaults.natural,
    autoScroll: typeof value.autoScroll === 'boolean' ? value.autoScroll : defaults.autoScroll,
    showControls: typeof value.showControls === 'boolean' ? value.showControls : true,
    cursorShape: ['hand', 'dot', 'arrow'].includes(value.cursorShape ?? '') ? value.cursorShape! : defaults.cursorShape,
    cursorSize: typeof value.cursorSize === 'number' && Number.isFinite(value.cursorSize) ? Math.max(value.cursorShape === 'dot' ? 1 : 12, Math.min(value.cursorShape === 'dot' ? 30 : 40, Math.round(value.cursorSize))) : defaults.cursorSize,
    thickness: typeof value.thickness === 'number' && Number.isFinite(value.thickness) ? Math.max(1, Math.min(4, Math.round(value.thickness * 2) / 2)) : defaults.thickness,
    color: value.color === 'auto' || Object.hasOwn(palette, value.color ?? '') ? value.color! : defaults.color,
    groupSize: typeof value.groupSize === 'number' && Number.isFinite(value.groupSize) ? Math.max(1, Math.min(4, Math.round(value.groupSize))) : 1,
  };
}

export function segmentText(text: string): Segment[] {
  const segments = [...new Intl.Segmenter('en', { granularity: 'word' }).segment(text)];
  const result: Segment[] = [];
  const words = segments.filter(s => s.isWordLike);
  for (let i = 0; i < words.length; i++) {
    const part = words[i];
    const next = words[i + 1];
    const trailing = text.slice(part.index + part.segment.length, next?.index ?? text.length);
    result.push({ text: part.segment, start: part.index, end: part.index + part.segment.length, punctuation: trailing.trim() });
  }
  return result;
}

const abbreviations = /^(?:mr|mrs|ms|dr|prof|sr|jr|st|vs|etc|eg|ie|e|g|i)$/i;
export function durationFor(token: Segment, paragraphEnd: boolean, settings: Settings): number {
  const base = 60000 / settings.wpm;
  if (!settings.natural) return base;
  let weight = 1;
  if (/[,;:]/.test(token.punctuation)) weight = 1.25;
  if (/[!?]/.test(token.punctuation) || (/\./.test(token.punctuation) && !abbreviations.test(token.text) && !/^\d+(?:\.\d+)*$/.test(token.text))) weight = 1.5;
  if (paragraphEnd) weight = 1.8;
  return base * weight;
}

export function travelDuration(duration: number, newLine: boolean): number {
  // Match the reference's follow-along rhythm: ease into the word, then dwell.
  // A line return must not draw a diagonal trail through other words.
  return newLine ? 0 : Math.min(130, duration * .3);
}

export type Status = 'idle' | 'ready' | 'playing' | 'paused' | 'picking-start' | 'picking-end' | 'picking-area' | 'finished';
export type Snapshot = { status: Status; settings: Settings; index: number; start: number; end: number; count: number; word: string; message: string; title: string };
export type Command = { type: 'snapshot' | 'play' | 'pause' | 'stop' | 'dispose' | 'pick-start' | 'pick-end' | 'pick-area' | 'step' | 'settings' | 'tour-start'; delta?: number; settings?: Partial<Settings> };

export function scrollDuration(distance: number): number { return Math.max(450, Math.min(1800, Math.abs(distance) * 1.8)); }
export function scrollEase(progress: number): number { return progress * progress * (3 - 2 * progress); }
export type Reply = { ok: true; snapshot: Snapshot } | { ok: false; error: string };
