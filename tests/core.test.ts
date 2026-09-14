import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaults, segmentText, sanitizeSettings, durationFor, travelDuration } from '../src/core.ts';

test('segments whitespace, punctuation, unicode and non-breaking spaces', () => {
  const tokens = segmentText('Hello, world! Café\u00a0reader.');
  assert.deepEqual(tokens.map(t => t.text), ['Hello', 'world', 'Café', 'reader']);
  assert.equal(tokens[0].punctuation, ',');
  assert.equal(tokens[1].punctuation, '!');
  assert.equal(tokens[2].start, 14);
});
test('word offsets preserve source text and contractions', () => {
  const text = "Don't reformat version 1.5 or v2.0.";
  for (const token of segmentText(text)) assert.equal(text.slice(token.start, token.end), token.text);
  assert.equal(segmentText(text)[0].text, "Don't");
});
test('clamps settings and rejects nonfinite values', () => {
  assert.equal(sanitizeSettings({ wpm: 0 }).wpm, 60);
  assert.equal(sanitizeSettings({ wpm: 2000 }).wpm, 1000);
  assert.equal(sanitizeSettings({ wpm: NaN }).wpm, 250);
  assert.equal(sanitizeSettings({ mode: 'bogus' as any }).mode, 'cursor');
});
test('punctuation pauses use the strongest weight without stacking', () => {
  const [hello] = segmentText('Hello,');
  assert.equal(durationFor(hello, false, defaults), 300);
  assert.equal(durationFor(hello, true, defaults), 432);
  assert.equal(durationFor(hello, true, { ...defaults, natural: false }), 240);
  assert.equal(durationFor(segmentText('Dr.')[0], false, defaults), 240);
  assert.equal(durationFor(segmentText('End!')[0], false, defaults), 360);
});
test('travel always fits word budget at supported speed boundaries', () => {
  for (const wpm of [60, 250, 750, 1000]) {
    const duration = 60000 / wpm;
    for (const line of [true, false]) assert.ok(travelDuration(duration, line) < duration);
  }
});
test('older preferences acquire cursor defaults without losing pace', () => {
  const result = sanitizeSettings({ wpm: 340, mode: 'outline', natural: false });
  assert.equal(result.wpm, 340); assert.equal(result.mode, 'outline');
  assert.equal(result.cursorShape, 'hand'); assert.equal(result.cursorSize, 24); assert.equal(result.thickness, 2);
  assert.equal(sanitizeSettings({ cursorSize: 999, thickness: -5 }).cursorSize, 40);
  assert.equal(sanitizeSettings({ thickness: -5 }).thickness, 1);
  assert.equal(sanitizeSettings({ cursorSize: NaN, thickness: Infinity }).cursorSize, 24);
});
test('same-line easing has room to settle, while line returns are immediate', () => {
  assert.equal(travelDuration(500, false), 130);
  assert.equal(travelDuration(240, false), 72);
  assert.equal(travelDuration(240, true), 0);
});
test('group size and palette are bounded and migrate safely', () => {
  assert.equal(sanitizeSettings().groupSize, 1);
  assert.equal(sanitizeSettings({ groupSize: 99 }).groupSize, 4);
  assert.equal(sanitizeSettings({ groupSize: NaN }).groupSize, 1);
  assert.equal(sanitizeSettings({ groupSize: -3 }).groupSize, 1);
  assert.equal(sanitizeSettings({ color: 'blue' }).color, 'blue');
  assert.equal(sanitizeSettings({ color: 'invalid' as any }).color, 'green');
});
