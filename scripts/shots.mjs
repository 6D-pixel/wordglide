/* =========================================================================
   Store screenshots.

   These used to be the browser tests' screenshots, and they should not have
   been. That fixture is built to prove the extension EXCLUDES things, so it
   contains a paragraph reading "Never read this navigation", a code block
   reading "excluded code", a table reading "excluded table", and the same
   sentence repeated twenty-eight times so there is enough text to scroll.
   It is the right page to test against and the worst possible page to sell
   against: a listing shot of it looks like a broken draft.

   So the shots get their own article. Same harness as the tests — the real
   extension, loaded unpacked into a real Chromium, driven through its own
   service worker — but the page underneath is one somebody might actually
   read, and every paragraph is different.

   The article below is written for this purpose. It is not lorem, it is not
   scraped from anywhere, and its subject is the thing the product is for, so
   the screenshots argue for the extension twice: once by showing it work, and
   once by what the reader's eye lands on.

     npm run shots
   ========================================================================= */

import { chromium } from '@playwright/test';
import { mkdtemp, cp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';

const OUT = 'store/screenshots';

const ARTICLE = `
  <h1>The cost of a wandering eye</h1>
  <p class="byline">Marta Whitfield · 8 min read</p>
  <p id="lede">Reading feels continuous, but your eyes do not move continuously. They
    jump, land, jump again — four or five times a second, in movements called saccades,
    and they take in nothing at all while they are moving.</p>
  <p>Most of the effort in reading a long article is not comprehension. It is
    bookkeeping: finding the start of the next line, recovering the place you lost when
    you glanced away, re-reading the sentence you had already understood because your
    eye landed a word too far to the left.</p>
  <p>The fix is older than screens. Run a finger under the line and the eye has
    something to follow instead of something to search for. Typing pools in the
    nineteen-twenties taught it, speed-reading courses in the seventies sold it, and
    every child who has ever been handed a ruler has discovered it by accident.</p>
  <h2>Why a guide works</h2>
  <p>A guide does not make you read faster by force. It removes the pauses you were
    not aware of — the small hunts between one line and the next — and it gives your
    attention a single object to track. The words stay exactly where the author put
    them; only your eye changes what it does.</p>
  <p>The pace matters more than the speed. A guide that moves evenly through a comma
    and a full stop reads like a metronome, and you will fight it. One that gives
    punctuation a longer beat reads like a person, and you will follow it without
    noticing you are being led.</p>
  <p>What you should not have to do is leave the page. The diagram, the code block,
    the photograph and the link you were about to follow are all part of what you came
    for. A reading tool that strips them out has solved the wrong half of the problem.</p>
`;

const page = (dark) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>The cost of a wandering eye — Field Notes</title>
<style>
  :root { color-scheme: ${dark ? 'dark' : 'light'} }
  body { margin: 0; font-family: Georgia, 'Iowan Old Style', serif; line-height: 1.75;
         background: ${dark ? '#14161a' : '#fdfcf8'}; color: ${dark ? '#e6e3dc' : '#22282c'} }
  header { padding: 14px 32px; font: 600 13px/1 ui-sans-serif, system-ui, sans-serif;
           letter-spacing: .14em; text-transform: uppercase;
           color: ${dark ? '#9aa39c' : '#5d6b62'};
           border-bottom: 1px solid ${dark ? '#262a30' : '#e7e4da'} }
  main { max-width: 620px; margin: 44px auto; padding: 0 28px }
  h1 { font-size: 40px; line-height: 1.15; margin: 0 0 14px }
  h2 { font-size: 24px; margin: 34px 0 12px }
  p { font-size: 20px; margin: 0 0 22px }
  .byline { font: 14px/1 ui-sans-serif, system-ui, sans-serif; letter-spacing: .04em;
            color: ${dark ? '#8b948c' : '#6d7a71'}; margin-bottom: 30px }
  a { color: ${dark ? '#8fd3a6' : '#2f6b4f'} }
</style></head><body>
<header>Field Notes · A journal of everyday attention</header>
<main><article>${ARTICLE}</article></main></body></html>`;

/* ── the same harness the browser tests use ──────────────────────────────── */

const folder = await mkdtemp(join(tmpdir(), 'wordglide-shots-'));
const extension = join(folder, 'extension');
await cp(resolve('dist'), extension, { recursive: true });
// As in the tests: the local host grant lets automation inject without a real
// toolbar gesture. The shipped manifest keeps activeTab only.
const manifest = JSON.parse(await readFile(join(extension, 'manifest.json'), 'utf8'));
manifest.host_permissions = ['http://127.0.0.1/*'];
await writeFile(join(extension, 'manifest.json'), JSON.stringify(manifest));

let dark = false;
const server = createServer((_req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.end(page(dark));
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}`;

const context = await chromium.launchPersistentContext(join(folder, 'profile'), {
  channel: 'chromium',
  headless: true,
  viewport: { width: 1280, height: 800 },   // a Chrome Web Store screenshot size
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
});
const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');

async function open({ intro = false } = {}) {
  await worker.evaluate(async (seen) => {
    await chrome.storage.local.clear();
    if (seen) await chrome.storage.local.set({ onboardingSeen: true });
  }, !intro);
  const tab = await context.newPage();
  await tab.goto(base);
  await tab.bringToFront();
  const tabId = await worker.evaluate(async (url) => {
    const tabs = await chrome.tabs.query({});
    return tabs.filter((t) => t.url === url + '/').at(-1).id;
  }, base);
  await worker.evaluate(async (id) => {
    await chrome.scripting.executeScript({ target: { tabId: id }, files: ['content.js'] });
  }, tabId);
  await tab.waitForSelector('[data-wordglide]');
  return { tab, tabId };
}

const send = (tabId, command) => worker.evaluate(
  async ({ tabId, command }) =>
    (await chrome.tabs.sendMessage(tabId, { channel: 'wordglide', command })).snapshot,
  { tabId, command });

/* Click a word the way a reader does, so the guide starts where the shot wants
   it rather than at the top of the article. */
async function startAt(tab, tabId, selector, word) {
  await send(tabId, { type: 'pick-start' });
  const at = await tab.locator(selector).evaluate((el, w) => {
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (walk.nextNode()) {
      const i = walk.currentNode.data.indexOf(w);
      if (i < 0) continue;
      const r = document.createRange();
      r.setStart(walk.currentNode, i);
      r.setEnd(walk.currentNode, i + w.length);
      const box = r.getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    }
    throw new Error(`no "${w}" in ${el.tagName}`);
  }, word);
  await tab.mouse.click(at.x, at.y);
}

await mkdir(OUT, { recursive: true });
const shot = async (tab, name) => {
  await tab.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`${OUT}/${name}.png`);
};

/* 1 — the guide on a word with the panel open. The listing thumbnail, so it
   has to show both what the guide looks like and what you can change.

   Deliberately NOT played first: play() calls setCollapsed(true), because
   getting out of the way while you read is the point of the panel. Picking a
   word leaves it open with the guide already drawn (content.ts line 414), so
   the ready state is the one shot where both are on screen at once. */
{
  const { tab, tabId } = await open();
  await send(tabId, { type: 'settings', settings: { mode: 'cursor', cursorShape: 'hand', wpm: 300 } });
  await startAt(tab, tabId, '#lede', 'saccades');
  await tab.waitForTimeout(150);
  await shot(tab, '1-reading');
  await tab.close();
}

/* 2 — the dot mid-sweep, with its trail.

   FAST, not slow, which is the opposite of the obvious choice. guide.ts keeps
   at most 16 marks and fades each over 180ms, so the trail's length is the
   distance covered in 180ms — at 90 wpm that is a fifth of a word and looks
   like a smudge; at 550 it spans two, which is the comet. That is also the
   honest picture: the trail exists so that fast reading stays followable.

   Shot while playing, because pausing calls freeze() and clears the trail —
   which means the panel is collapsed (play() collapses it), so this is the
   one shot with the article to itself. */
{
  const { tab, tabId } = await open();
  await startAt(tab, tabId, '#lede', 'Reading');
  await send(tabId, { type: 'settings', settings: { cursorShape: 'dot', color: 'red', wpm: 550, natural: false, showControls: false } });
  await send(tabId, { type: 'play' });
  await tab.waitForTimeout(760);
  await shot(tab, '2-dot-trail');
  await tab.close();
}

/* 3 — highlight mode over a group of words, which is the feature people ask
   for by name. Controls hidden so the mode itself is the subject. */
{
  const { tab, tabId } = await open();
  await startAt(tab, tabId, '#lede', 'saccades');
  await send(tabId, { type: 'settings', settings: { mode: 'highlight', groupSize: 3, wpm: 200, showControls: false } });
  await send(tabId, { type: 'play' });
  await tab.waitForTimeout(500);
  await send(tabId, { type: 'pause' });
  await shot(tab, '3-highlight-group');
  await tab.close();
}

/* 4 — the same guide on a dark article, picking its own colour. The panel
   stays, because the Auto swatch being lit is half the point. */
{
  dark = true;
  const { tab, tabId } = await open();
  await send(tabId, { type: 'settings', settings: { mode: 'cursor', cursorShape: 'hand', wpm: 300 } });
  await startAt(tab, tabId, '#lede', 'saccades');
  await tab.waitForTimeout(150);
  await shot(tab, '4-dark-article');
  await tab.close();
  dark = false;
}

/* 5 — the walkthrough, on the article itself rather than a mock-up, which is
   the thing about it worth showing. */
{
  const { tab, tabId } = await open({ intro: true });
  await tab.locator('.tour-current').click();
  await tab.waitForSelector('.page-tour-title');
  await shot(tab, '5-walkthrough');
  await tab.close();
}

await context.close();
server.close();
await rm(folder, { recursive: true, force: true });
console.log('\nStore screenshots in store/screenshots/ — 1280x800.');
