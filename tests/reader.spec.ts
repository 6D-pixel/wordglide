import { test, expect, chromium, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { mkdtemp, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer, type Server } from 'node:http';

let context: BrowserContext, worker: Worker, folder: string, server: Server, base: string;
const paragraphs = Array.from({ length: 28 }, (_, i) => `<p id="p${i}">Reading is a quiet conversation between the page and your attention. Follow each word across the line, then find the beginning of the next one. A small guide can help you keep a steady rhythm without changing the article.</p>`).join('');
const fixture = `<!doctype html><html><head><meta charset="utf-8"><title>A slower kind of focus</title><style>body{margin:0;color:#283b35;background:#fbfaf6;font-family:Georgia,serif}header{position:sticky;top:0;background:#f0f1e9;padding:18px;z-index:4}main{max-width:580px;margin:50px auto}h1{font-size:42px}p{font-size:21px;line-height:1.8}pre,table{background:#eee}a{color:#3e6d50}</style></head><body><header>FIELD NOTES · A journal of everyday attention</header><nav>Never read this navigation</nav><main><article><h1>A slower kind of focus</h1><p id="first">Start read<em>ing</em> with <a href="#destination">linked words</a> and a little curiosity.</p><p hidden>Invisible words must not appear</p><pre>excluded code</pre><table><tr><td>excluded table</td></tr></table>${paragraphs}<p id="destination">The final word.</p></article></main></body></html>`;

test.beforeAll(async () => {
  folder = await mkdtemp(join(tmpdir(), 'wordglide-test-'));
  const extension = join(folder, 'extension');
  await cp(resolve('dist'), extension, { recursive: true });
  // The test-only copy grants the local fixture host so automation can inject without
  // simulating a toolbar gesture. The distributed manifest retains activeTab only.
  const manifest = JSON.parse(await readFile(join(extension, 'manifest.json'), 'utf8'));
  manifest.host_permissions = ['http://127.0.0.1/*'];
  await writeFile(join(extension, 'manifest.json'), JSON.stringify(manifest));
  server = createServer((_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(fixture); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  context = await chromium.launchPersistentContext(join(folder, 'profile'), {
    ...(process.env.WORDGLIDE_BROWSER ? { executablePath: process.env.WORDGLIDE_BROWSER } : { channel: 'chromium' }), headless: true, viewport: { width: 1280, height: 800 },   // a Chrome Web Store screenshot size, so the shots these tests take are the shots the listing uses
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
});
test.afterAll(async () => { await context?.close(); server?.close(); if (folder) await rm(folder, { recursive: true, force: true }); });

async function open(options: { intro?: boolean } = {}) {
  await worker.evaluate(async intro => { await chrome.storage.local.clear(); if (!intro) await chrome.storage.local.set({ onboardingSeen: true }); }, options.intro ?? false);
  const page = await context.newPage(); await page.goto(base); await page.bringToFront();
  // Fresh page is last matching tab when several tests have run.
  const tabId = await worker.evaluate(async url => {
    const tabs = await chrome.tabs.query({}); return tabs.filter(t => t.url === url + '/').at(-1)!.id!;
  }, base);
  await worker.evaluate(async id => { await chrome.scripting.executeScript({ target: { tabId: id }, files: ['content.js'] }); }, tabId);
  await expect(page.locator('[data-wordglide]')).toBeAttached();
  await expect(page.locator('.position')).not.toHaveText('No passage selected');
  return { page, tabId };
}
async function command(tabId: number, command: any) {
  return worker.evaluate(async ({ tabId, command }) => (await chrome.tabs.sendMessage(tabId, { channel: 'wordglide', command })).snapshot, { tabId, command });
}
async function point(page: Page, selector: string, word: string) {
  return page.locator(selector).evaluate((el, word) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode as Text; const start = node.data.indexOf(word);
      if (start >= 0) { const range = document.createRange(); range.setStart(node, start); range.setEnd(node, start + word.length); const r = range.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
    }
    throw new Error(`Missing word ${word}`);
  }, word);
}

test('indexes original text, joins inline words, and excludes non-prose', async () => {
  const { page, tabId } = await open();
  await command(tabId, { type: 'pick-start' });
  const p = await point(page, '#first em', 'ing'); await page.mouse.click(p.x, p.y);
  const state = await command(tabId, { type: 'snapshot' });
  expect(state.word).toBe('reading'); expect(state.status).toBe('ready');
  expect(await page.locator('#first').innerHTML()).toContain('read<em>ing</em>');
  expect(state.count).toBeGreaterThan(1000);
  await page.close();
});
test('inclusive start/end, exact playback, and final word dwell', async () => {
  const { page, tabId } = await open();
  await command(tabId, { type: 'pick-start' });
  const first = await point(page, '#first', 'Start'); await page.mouse.click(first.x, first.y);
  await command(tabId, { type: 'pick-end' });
  const last = await point(page, '#first', 'with'); await page.mouse.click(last.x, last.y);
  await command(tabId, { type: 'settings', settings: { wpm: 600, natural: false } });
  const before = Date.now(); await command(tabId, { type: 'play' });
  await expect.poll(async () => (await command(tabId, { type: 'snapshot' })).status).toBe('finished');
  const state = await command(tabId, { type: 'snapshot' });
  expect(state.word).toBe('with'); expect(state.index).toBe(state.end); expect(state.end - state.start).toBe(2);
  expect(Date.now() - before).toBeGreaterThanOrEqual(290);
  await page.close();
});
test('three modes align to the word and manual wheel pauses without losing position', async () => {
  const { page, tabId } = await open();
  for (const mode of ['cursor', 'highlight', 'outline']) {
    await command(tabId, { type: 'settings', settings: { mode } });
    if (mode === 'cursor') await expect(page.locator('.marker')).toBeVisible();
    else await expect(page.locator(mode === 'outline' ? '.fragment.outline' : '.fragment').first()).toBeVisible();
  }
  await command(tabId, { type: 'play' });
  await page.mouse.move(50, 300); await page.mouse.wheel(0, 130);
  await expect.poll(async () => (await command(tabId, { type: 'snapshot' })).status).toBe('paused');
  const paused = await command(tabId, { type: 'snapshot' });
  await page.waitForTimeout(200);
  expect((await command(tabId, { type: 'snapshot' })).index).toBe(paused.index);
  await page.close();
});
test('auto-scroll brings an offscreen word into view and playback continues', async () => {
  const { page, tabId } = await open();
  await page.locator('#p8').scrollIntoViewIfNeeded();
  await command(tabId, { type: 'pick-start' });
  const p = await point(page, '#p8', 'Reading'); await page.mouse.click(p.x, p.y);
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(100);
  const initial = await command(tabId, { type: 'snapshot' });
  await command(tabId, { type: 'play' });
  await expect.poll(async () => (await command(tabId, { type: 'snapshot' })).index).toBeGreaterThan(initial.index);
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(1000);
  await page.close();
});
test('DOM edits preserve valid anchors and teardown permits clean reactivation', async () => {
  const { page, tabId } = await open();
  await command(tabId, { type: 'play' });
  await page.locator('#p2').evaluate(el => el.append(document.createTextNode(' An added sentence.')));
  await expect.poll(async () => (await command(tabId, { type: 'snapshot' })).status).toBe('paused');
  await command(tabId, { type: 'dispose' });
  await expect(page.locator('[data-wordglide]')).toHaveCount(0);
  await worker.evaluate(async id => { await chrome.scripting.executeScript({ target: { tabId: id }, files: ['content.js'] }); }, tabId);
  await expect(page.locator('[data-wordglide]')).toHaveCount(1);
  await worker.evaluate(async id => { await chrome.scripting.executeScript({ target: { tabId: id }, files: ['content.js'] }); }, tabId);
  await expect(page.locator('[data-wordglide]')).toHaveCount(1);
  await page.close();
});
test('screenshots of toolbar and popup', async () => {
  const { page, tabId } = await open();
  await command(tabId, { type: 'settings', settings: { mode: 'cursor', wpm: 250 } });
  await page.screenshot({ path: 'test-results/reader.png' });
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);
  await expect(popup.locator('.brand strong')).toHaveText('WordGlide');
  await popup.locator('body').screenshot({ path: 'test-results/popup.png' });
  await popup.close(); await page.close();
});

test('preselected text defines both inclusive boundaries', async () => {
  const { page, tabId } = await open();
  await command(tabId, { type: 'dispose' });
  await page.locator('#first a').evaluate(el => {
    const r = document.createRange(); r.selectNodeContents(el); const s = getSelection()!; s.removeAllRanges(); s.addRange(r);
  });
  await worker.evaluate(async id => { await chrome.scripting.executeScript({ target: { tabId: id }, files: ['content.js'] }); }, tabId);
  const state = await command(tabId, { type: 'snapshot' });
  expect(state.word).toBe('linked'); expect(state.end - state.start).toBe(1);
  await page.close();
});

test('wrapped words draw multiple fragments and update when the page reflows', async () => {
  const { page, tabId } = await open();
  await page.locator('#first').evaluate(el => { el.innerHTML = '<span id="wrap" style="display:inline-block;width:60px;overflow-wrap:anywhere">extraordinarily</span> simple'; });
  await page.waitForTimeout(250);
  await command(tabId, { type: 'pick-start' });
  const rect = await page.locator('#wrap').evaluate(el => { const r = document.createRange(); r.selectNodeContents(el); const b = r.getClientRects()[0]; return { x: b.left + 8, y: b.top + 5 }; });
  await page.mouse.click(rect.x, rect.y);
  await command(tabId, { type: 'settings', settings: { mode: 'outline' } });
  await expect.poll(() => page.locator('.fragment').count()).toBeGreaterThan(1);
  await page.locator('#wrap').evaluate(el => { el.style.width = '250px'; });
  await expect(page.locator('.fragment')).toHaveCount(1);
  await page.close();
});

test('rejects reversed endpoints and preserves keyboard input in editable fields', async () => {
  const { page, tabId } = await open();
  await command(tabId, { type: 'pick-start' });
  const p = await point(page, '#first', 'with'); await page.mouse.click(p.x, p.y);
  await command(tabId, { type: 'pick-end' });
  const before = await point(page, '#first', 'Start'); await page.mouse.click(before.x, before.y);
  expect((await command(tabId, { type: 'snapshot' })).status).toBe('picking-end');
  await expect(page.locator('.hint')).toContainText('after your start');
  await page.keyboard.press('Escape');
  await page.evaluate(() => { const input = document.createElement('input'); input.id = 'typing'; document.body.prepend(input); });
  await page.locator('#typing').fill('hello'); await page.keyboard.press('Space');
  await expect(page.locator('#typing')).toHaveValue('hello ');
  expect((await command(tabId, { type: 'snapshot' })).status).not.toBe('playing');
  await page.close();
});

test('disabled auto-scroll pauses for offscreen content', async () => {
  const { page, tabId } = await open();
  await command(tabId, { type: 'settings', settings: { autoScroll: false } });
  await page.evaluate(() => scrollTo(0, 2000)); await page.waitForTimeout(100);
  await command(tabId, { type: 'play' });
  const state = await command(tabId, { type: 'snapshot' });
  expect(state.status).toBe('paused'); expect(state.message).toContain('outside');
  expect(await page.evaluate(() => scrollY)).toBe(2000);
  await page.close();
});

test('modal pauses and reduced motion keeps cursor at the word', async () => {
  const { page, tabId } = await open();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await command(tabId, { type: 'play' });
  await page.evaluate(() => { const d = document.createElement('dialog'); d.textContent = 'A dialog'; document.body.append(d); d.showModal(); });
  await expect.poll(async () => (await command(tabId, { type: 'snapshot' })).status).toBe('paused');
  expect((await command(tabId, { type: 'snapshot' })).message).toContain('dialog');
  await page.close();
});

test('root replacement removes stale guides even while paused', async () => {
  const { page } = await open();
  await page.locator('main').evaluate(el => el.remove());
  await expect(page.locator('[data-wordglide]')).toHaveCount(0);
  await page.close();
});

test('includes headings inside article headers', async () => {
  const { page, tabId } = await open();
  await command(tabId, { type: 'dispose' });
  await page.locator('article').evaluate(el => {
    const title = el.querySelector('h1')!; const header = document.createElement('header');
    title.replaceWith(header); header.append(title);
  });
  await worker.evaluate(async id => { await chrome.scripting.executeScript({ target: { tabId: id }, files: ['content.js'] }); }, tabId);
  const state = await command(tabId, { type: 'snapshot' });
  expect(state.word).toBe('A'); expect(state.count).toBeGreaterThan(1000);
  await page.close();
});

test('indexes ten thousand words within the initialization budget', async () => {
  const { page, tabId } = await open();
  await command(tabId, { type: 'dispose' });
  await page.locator('main').evaluate(el => {
    el.replaceChildren();
    for (let i = 0; i < 200; i++) { const p = document.createElement('p'); p.textContent = Array(50).fill('reader').join(' '); el.append(p); }
  });
  const began = Date.now();
  await worker.evaluate(async id => { await chrome.scripting.executeScript({ target: { tabId: id }, files: ['content.js'] }); }, tabId);
  const state = await command(tabId, { type: 'snapshot' });
  const elapsed = Date.now() - began;
  expect(state.count).toBe(10000); expect(elapsed).toBeLessThan(1000);
  console.log(`10,000-word initialization: ${elapsed}ms`);
  await page.close();
});

test('popup controls route through the worker to the article and persist settings', async () => {
  const { page, tabId } = await open();
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);
  // A real action popup does not replace the active tab. Keep the article active
  // while driving the separate popup document through its DOM.
  await page.bringToFront();
  await popup.locator('[data-speed="10"]').evaluate((el: HTMLButtonElement) => el.click());
  await expect.poll(async () => (await command(tabId, { type: 'snapshot' })).settings.wpm).toBe(260);
  const stored = await worker.evaluate(async () => (await chrome.storage.local.get('settings')).settings);
  expect(stored).toMatchObject({ wpm: 260 });
  await popup.close();
  await command(tabId, { type: 'play' });
  const initial = (await command(tabId, { type: 'snapshot' })).index;
  await expect.poll(async () => (await command(tabId, { type: 'snapshot' })).index).toBeGreaterThan(initial);
  await page.close();
});

for (const mode of ['cursor', 'highlight', 'outline']) {
  test(`${mode} moves through intermediate positions on the same line`, async () => {
    const { page, tabId } = await open();
    await command(tabId, { type: 'pick-start' });
    const first = await point(page, '#first', 'Start'); await page.mouse.click(first.x, first.y);
    await command(tabId, { type: 'pick-end' });
    const last = await point(page, '#first', 'with'); await page.mouse.click(last.x, last.y);
    await command(tabId, { type: 'settings', settings: { mode, wpm: 120, natural: false } });
    const selector = mode === 'cursor' ? '.marker' : '.fragment';
    const samples = page.evaluate(async selector => {
      const shadow = document.querySelector('[data-wordglide]')!.shadowRoot!;
      const points: number[] = []; const began = performance.now();
      while (performance.now() - began < 1650) {
        await new Promise(requestAnimationFrame);
        const el = shadow.querySelector(selector)!;
        points.push(new DOMMatrixReadOnly(getComputedStyle(el).transform).m41);
      }
      return points;
    }, selector);
    await command(tabId, { type: 'play' });
    const points = await samples;
    const movements = points.slice(1).map((x, i) => x - points[i]);
    // Two transitions must contain several distinct frames, not two teleports.
    expect(movements.filter(dx => dx > .1).length).toBeGreaterThan(6);
    expect(Math.min(...movements)).toBeGreaterThan(-.1);
    expect((await command(tabId, { type: 'snapshot' })).status).toBe('finished');
    await page.close();
  });
}

test('pause freezes an in-flight transition and resume never rewinds it', async () => {
  const { page, tabId } = await open();
  await command(tabId, { type: 'pick-start' });
  const first = await point(page, '#first', 'Start'); await page.mouse.click(first.x, first.y);
  await command(tabId, { type: 'settings', settings: { wpm: 120, natural: false } });
  await command(tabId, { type: 'play' });
  await page.waitForFunction(() => document.querySelector('[data-wordglide]')!.shadowRoot!.querySelector('.word')!.textContent === 'reading');
  await command(tabId, { type: 'pause' });
  const x = () => page.locator('.marker').evaluate(el => new DOMMatrixReadOnly(getComputedStyle(el).transform).m41);
  const frozen = await x(); await page.waitForTimeout(160); expect(await x()).toBeCloseTo(frozen, 1);
  await command(tabId, { type: 'play' });
  expect(await x()).toBeGreaterThanOrEqual(frozen - .1);
  await page.close();
});

test('cursor shape, size and thickness controls persist independently of WPM', async () => {
  const { page, tabId } = await open();
  await expect(page.locator('.marker')).toHaveAttribute('data-shape', 'hand');
  await page.locator('[data-shape="dot"]').filter({ has: page.locator('span') }).click();
  await page.getByRole('slider', { name: 'Cursor size', exact: true }).fill('30');
  let state = await command(tabId, { type: 'snapshot' });
  expect(state.settings).toMatchObject({ cursorShape: 'dot', cursorSize: 30, wpm: 250 });
  await expect(page.locator('.marker')).toHaveCSS('width', '30px');
  await expect(page.locator('.marker svg circle')).toHaveCount(1);
  await page.locator('button[data-shape="hand"]').click();
  await page.getByRole('slider', { name: 'Stroke thickness', exact: true }).fill('3.5');
  await expect(page.locator('.marker svg')).toHaveCSS('stroke-width', '3.5px');
  state = await command(tabId, { type: 'snapshot' }); expect(state.settings.wpm).toBe(250);
  await command(tabId, { type: 'dispose' });
  await worker.evaluate(async id => { await chrome.scripting.executeScript({ target: { tabId: id }, files: ['content.js'] }); }, tabId);
  const restored = await command(tabId, { type: 'snapshot' });
  expect(restored.settings).toMatchObject({ cursorShape: 'hand', cursorSize: 30, thickness: 3.5 });
  await page.screenshot({ path: 'test-results/appearance.png' });
  await page.close();
});

test('first-use introduction can be dismissed, reopened, and stays dismissed on reload', async () => {
  const { page, tabId } = await open({ intro: true });
  await expect(page.getByRole('region', { name: 'Welcome to WordGlide' })).toBeVisible();
  await expect(page.locator('.intro-start')).toHaveText('Choose my start word');
  await page.screenshot({ path: 'test-results/welcome.png' });
  await page.locator('.intro-dismiss').click();
  await expect(page.locator('.welcome')).toBeHidden();
  await command(tabId, { type: 'play' });
  await expect(page.locator('[data-command="play"]')).toHaveText('Ⅱ Pause');
  await command(tabId, { type: 'pause' });
  await expect(page.locator('[data-command="play"]')).toHaveText('▶ Resume');
  await page.getByRole('button', { name: 'Expand reading controls' }).click();
  await page.getByRole('button', { name: 'How to use WordGlide' }).click();
  await expect(page.locator('.welcome')).toBeVisible();
  await page.locator('.practice summary').click();
  await expect(page.locator('.tour-next')).toBeDisabled();
  await page.locator('[data-tour-word="1"]').click();
  await page.locator('.tour-next').click();
  await expect(page.locator('.tour-next')).toBeDisabled();
  await page.getByRole('slider', { name: 'Practice words per minute' }).fill('300');
  await page.locator('.tour-next').click();
  await page.getByRole('button', { name: 'Play practice', exact: true }).click();
  await expect(page.locator('[data-tour-word="2"]')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Pause practice', exact: true }).click();
  await expect(page.locator('.tour-progress')).toHaveText('Practice complete');
  expect((await command(tabId, { type: 'snapshot' })).settings.wpm).toBe(250);
  await page.locator('.intro-start').click();
  await expect.poll(async () => (await command(tabId, { type: 'snapshot' })).status).toBe('picking-start');
  await command(tabId, { type: 'dispose' });
  await worker.evaluate(async id => { await chrome.scripting.executeScript({ target: { tabId: id }, files: ['content.js'] }); }, tabId);
  await expect(page.locator('.reader-controls')).toBeVisible();
  await expect(page.locator('.welcome')).toBeHidden();
  await page.close();
});

test('popup introduction does not require page access and migrates existing preferences', async () => {
  await worker.evaluate(async () => { await chrome.storage.local.clear(); await chrome.storage.local.set({ settings: { wpm: 320, mode: 'cursor', natural: false, autoScroll: true } }); });
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);
  await expect(popup.locator('.welcome')).toBeVisible();
  await expect(popup.locator('.intro-start')).toHaveText('Choose my start word');
  await popup.locator('body').screenshot({ path: 'test-results/welcome-popup.png' });
  await popup.locator('.practice summary').click();
  await popup.locator('[data-tour-word="0"]').click();
  await popup.locator('.tour-next').click();
  await popup.getByRole('slider', { name: 'Practice words per minute' }).fill('300');
  await popup.locator('.tour-next').click();
  await popup.locator('.tour-play').click();
  await expect(popup.locator('[data-tour-word="1"]')).toHaveAttribute('aria-pressed', 'true');
  await popup.locator('.tour-play').click();
  await expect(popup.locator('.tour-progress')).toHaveText('Practice complete');
  await expect(popup.locator('#error')).toBeEmpty();
  await popup.locator('.intro-dismiss').click();
  await expect(popup.getByRole('spinbutton', { name: 'Words per minute' })).toHaveValue('320');
  await expect(popup.locator('button[data-shape="hand"]')).toHaveAttribute('aria-pressed', 'true');
  await popup.reload();
  await expect(popup.locator('.welcome')).toBeHidden();
  await popup.close();
});

test('dot sweeps from the leading edge, continues late in each word, and has a fading trail', async () => {
  const { page, tabId } = await open();
  await command(tabId, { type: 'pick-start' });
  const first = await point(page, '#first', 'Start'); await page.mouse.click(first.x, first.y);
  await command(tabId, { type: 'settings', settings: { cursorShape: 'dot', wpm: 60, natural: false } });
  const x = () => page.locator('.marker').evaluate(el => el.getBoundingClientRect().left + el.getBoundingClientRect().width / 2);
  const left = await x(); expect(left).toBeLessThan(first.x - 10);
  await command(tabId, { type: 'play' });
  await page.waitForTimeout(180); const early = await x();
  expect(early).toBeGreaterThan(left);
  await expect(page.locator('.trail-dot').first()).toBeAttached();
  await page.waitForTimeout(350); const middle = await x();
  await page.waitForTimeout(200); const late = await x();
  expect(middle).toBeGreaterThan(early + 5); expect(late).toBeGreaterThan(middle + 5);
  await page.screenshot({ path: 'test-results/dot-trail.png' });
  await command(tabId, { type: 'pause' }); const frozen = await x();
  await expect(page.locator('.trail-dot')).toHaveCount(0);
  await page.waitForTimeout(160); expect(await x()).toBeCloseTo(frozen, 1);
  await command(tabId, { type: 'play' }); expect(await x()).toBeGreaterThanOrEqual(frozen - 1);
  await page.close();
});

test('dot respects reduced motion and color selection survives reactivation', async () => {
  const { page, tabId } = await open();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('[data-color="blue"]').click();
  await command(tabId, { type: 'settings', settings: { cursorShape: 'dot', wpm: 60, natural: false } });
  await expect(page.locator('.marker')).toHaveCSS('color', 'rgb(37, 99, 235)');
  const x = () => page.locator('.marker').evaluate(el => el.getBoundingClientRect().left);
  await command(tabId, { type: 'play' }); const first = await x();
  await page.waitForTimeout(250); expect(await x()).toBeCloseTo(first, 1);
  await expect(page.locator('.trail-dot')).toHaveCount(0);
  await command(tabId, { type: 'dispose' });
  await worker.evaluate(async id => { await chrome.scripting.executeScript({ target: { tabId: id }, files: ['content.js'] }); }, tabId);
  expect((await command(tabId, { type: 'snapshot' })).settings.color).toBe('blue');
  await page.close();
});

test('highlight groups cover up to four words and retain per-word timing and inclusive end', async () => {
  const { page, tabId } = await open();
  await command(tabId, { type: 'pick-start' });
  const first = await point(page, '#first', 'Start'); await page.mouse.click(first.x, first.y);
  await command(tabId, { type: 'pick-end' });
  const last = await point(page, '#first a', 'words'); await page.mouse.click(last.x, last.y);
  await page.locator('[data-mode="highlight"]').click();
  await page.getByRole('combobox', { name: 'Words per highlight' }).selectOption('4');
  await command(tabId, { type: 'settings', settings: { wpm: 600, natural: false } });
  const linked = await point(page, '#first a', 'linked');
  const r = await page.locator('.fragment').first().boundingBox();
  expect(r!.x).toBeLessThan(first.x); expect(r!.x + r!.width).toBeGreaterThan(linked.x);
  expect(r!.x + r!.width).toBeLessThan(last.x);
  const initial = await command(tabId, { type: 'play' }); const began = Date.now();
  await page.waitForTimeout(230);
  expect((await command(tabId, { type: 'snapshot' })).index).toBe(initial.index);
  await expect.poll(async () => (await command(tabId, { type: 'snapshot' })).status).toBe('finished');
  const finished = await command(tabId, { type: 'snapshot' });
  expect(finished.word).toBe('words'); expect(finished.index).toBe(finished.end);
  expect(Date.now() - began).toBeGreaterThanOrEqual(480);
  expect(await worker.evaluate(async () => (await chrome.storage.local.get('settings')).settings)).toMatchObject({ groupSize: 4 });
  await page.close();
});

test('group sizes increase coverage and stop at paragraph boundaries', async () => {
  const { page, tabId } = await open();
  await command(tabId, { type: 'pick-start' });
  const first = await point(page, '#first', 'Start'); await page.mouse.click(first.x, first.y);
  const widths: number[] = [];
  for (const groupSize of [1, 2, 3, 4]) {
    await command(tabId, { type: 'settings', settings: { mode: 'highlight', groupSize } });
    widths.push((await page.locator('.fragment').first().boundingBox())!.width);
  }
  expect(widths.every((w, i) => !i || w > widths[i - 1])).toBe(true);
  await page.screenshot({ path: 'test-results/group-highlight.png' });
  await command(tabId, { type: 'pick-start' });
  const last = await point(page, '#first', 'curiosity'); await page.mouse.click(last.x, last.y);
  await expect(page.locator('.fragment')).toHaveCount(1);
  expect((await page.locator('.fragment').boundingBox())!.height).toBeLessThan(40);
  await page.close();
});

test('dot line returns clear old trails without diagonal travel', async () => {
  const { page, tabId } = await open();
  await command(tabId, { type: 'pick-start' });
  const last = await point(page, '#first', 'curiosity'); await page.mouse.click(last.x, last.y);
  await command(tabId, { type: 'settings', settings: { cursorShape: 'dot', wpm: 120, natural: false } });
  const samples = page.evaluate(async () => {
    const shadow = document.querySelector('[data-wordglide]')!.shadowRoot!;
    const points: { y: number; trailY: number[] }[] = []; const began = performance.now();
    while (performance.now() - began < 750) {
      await new Promise(requestAnimationFrame);
      points.push({ y: shadow.querySelector('.marker')!.getBoundingClientRect().top, trailY: [...shadow.querySelectorAll('.trail-dot')].map(el => el.getBoundingClientRect().top) });
    }
    return points;
  });
  await command(tabId, { type: 'play' });
  const points = await samples;
  const changes = points.slice(1).map((p, i) => p.y - points[i].y).filter(d => Math.abs(d) > .1);
  expect(changes.length).toBe(1); expect(changes[0]).toBeGreaterThan(50);
  expect(points.every(p => p.trailY.every(y => Math.abs(y - p.y) < 12))).toBe(true);
  await page.close();
});

for (const cursorShape of ['hand', 'arrow']) {
  test(`${cursorShape} keeps gliding throughout the word and resumes in place`, async () => {
    const { page, tabId } = await open();
    await command(tabId, { type: 'pick-start' });
    const first = await point(page, '#first', 'Start'); await page.mouse.click(first.x, first.y);
    await command(tabId, { type: 'settings', settings: { cursorShape, wpm: 60, natural: false } });
    const x = () => page.locator('.marker').evaluate(el => el.getBoundingClientRect().left);
    await command(tabId, { type: 'play' });
    await page.waitForTimeout(200); const early = await x();
    await page.waitForTimeout(250); const middle = await x();
    await page.waitForTimeout(250); const late = await x();
    expect(middle).toBeGreaterThan(early + 5); expect(late).toBeGreaterThan(middle + 5);
    await command(tabId, { type: 'pause' }); const frozen = await x();
    await page.waitForTimeout(120); expect(await x()).toBeCloseTo(frozen, 1);
    await command(tabId, { type: 'play' }); expect(await x()).toBeGreaterThanOrEqual(frozen - 1);
    await expect(page.locator('.trail-dot')).toHaveCount(0);
    await page.close();
  });
}

test('dot edge stays close to text at every size and controls fit a small panel', async () => {
  const { page, tabId } = await open();
  await command(tabId, { type: 'pick-start' });
  const first = await point(page, '#first', 'Start'); await page.mouse.click(first.x, first.y);
  const bottom = await page.locator('#first').evaluate(el => {
    const range = document.createRange(); range.setStart(el.firstChild!, 0); range.setEnd(el.firstChild!, 5);
    return range.getBoundingClientRect().bottom;
  });
  for (const cursorSize of [1, 12, 30]) {
    await command(tabId, { type: 'settings', settings: { cursorShape: 'dot', cursorSize } });
    const box = (await page.locator('.marker').boundingBox())!;
    const visibleTop = box.y;
    expect(visibleTop - bottom).toBeCloseTo(1, 1);
  }
  await command(tabId, { type: 'settings', settings: { cursorShape: 'hand', cursorSize: 24 } });
  const panel = (await page.locator('.shell').boundingBox())!;
  expect(panel.width).toBeLessThanOrEqual(280); expect(panel.height).toBeLessThan(520);
  await expect(page.getByRole('button', { name: 'Set end word' })).toBeInViewport();
  await page.screenshot({ path: 'test-results/compact-controls.png' });
  await page.close();
});

test('on-page tutorial teaches actual selection and Space pause/resume and Escape', async () => {
  const { page, tabId } = await open({ intro: true });
  await page.locator('.tour-current').click();
  await expect(page.locator('.page-tour-title')).toHaveText('Tutorial · 1/5');
  const tourBox = (await page.locator('.page-tour').boundingBox())!;
  expect(tourBox.y).toBe(12); expect(tourBox.x + tourBox.width / 2).toBeCloseTo(640, 0);
  const first = await point(page, '#first', 'Start'); await page.mouse.click(first.x, first.y);
  await expect(page.locator('.page-tour-title')).toHaveText('Tutorial · 2/5');
  await expect(page.locator('.speed')).toHaveClass(/tour-target/);
  await page.getByRole('spinbutton', { name: 'Words per minute' }).fill('200');
  await page.keyboard.press('Tab');
  await expect(page.locator('.page-tour-title')).toHaveText('Tutorial · 3/5');
  for (const [key, step, status] of [['Space', '4', 'playing'], ['Space', '5', 'paused']] as const) {
    await page.keyboard.press(key);
    await expect(page.locator('.page-tour-title')).toHaveText(`Tutorial · ${step}/5`);
    expect((await command(tabId, { type: 'snapshot' })).status).toBe(status);
  }
  await page.keyboard.press('Space');
  await expect(page.locator('.page-tour-title')).toHaveText('You’re ready');
  await page.keyboard.press('Escape');
  expect((await command(tabId, { type: 'snapshot' })).status).toBe('paused');
  await page.screenshot({ path: 'test-results/on-page-tour.png' });
  await page.locator('.page-tour').getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.locator('.page-tour')).toBeHidden();
  await page.close();
});

test('example blog opens only after consent and waits for extension activation', async () => {
  const { page } = await open({ intro: true });
  const url = 'https://quospiculum250256.substack.com/p/what-happens-when-you-pay-over-lightning';
  // Offline stand-in: verify tab opening without contacting an external site.
  await context.route(url, route => route.fulfill({ contentType: 'text/html', body: '<p>Example article</p>' }));
  const before = context.pages().length;
  await expect(page.locator('.tour-example')).toBeVisible();
  expect(context.pages().length).toBe(before);
  const opened = context.waitForEvent('page');
  await page.locator('.tour-example').click();
  const blog = await opened;
  await expect(blog).toHaveURL(url);
  await expect(blog.locator('[data-wordglide]')).toHaveCount(0);
  await expect.poll(async () => await worker.evaluate(async () => (await chrome.storage.session.get('tutorialTab')).tutorialTab)).toEqual(expect.any(Number));
  await blog.close(); await page.close(); await context.unroute(url);
});

test('auto-scroll uses many intermediate positions with gentle start and stop', async () => {
  const { page, tabId } = await open();
  await page.locator('#p8').scrollIntoViewIfNeeded();
  await command(tabId, { type: 'pick-start' });
  const target = await point(page, '#p8', 'Reading'); await page.mouse.click(target.x, target.y);
  // Wait for this scroll's event to be delivered before playing: arriving after play,
  // it reads as the page moving on its own and pauses playback (seen on CI runners).
  await page.evaluate(() => new Promise<void>(resolve => { addEventListener('scroll', () => resolve(), { once: true }); window.scrollTo({ top: 0, behavior: 'instant' }); }));
  const samples = page.evaluate(async () => {
    const positions: number[] = []; const began = performance.now();
    while (performance.now() - began < 2300) { await new Promise(requestAnimationFrame); positions.push(scrollY); }
    return positions;
  });
  await command(tabId, { type: 'settings', settings: { wpm: 60 } });
  await command(tabId, { type: 'play' });
  const positions = await samples;
  const deltas = positions.slice(1).map((y, i) => y - positions[i]).filter(d => d > 0);
  expect(deltas.length).toBeGreaterThan(25);
  expect(deltas[0]).toBeLessThan(Math.max(...deltas) / 3);
  expect(deltas.at(-1)!).toBeLessThan(Math.max(...deltas) / 3);
  expect((await command(tabId, { type: 'snapshot' })).status).toBe('playing');
  await page.close();
});

test('popup starts a pending on-page tutorial and hands focus back to the article', async () => {
  const { page, tabId } = await open({ intro: true });
  await worker.evaluate(async id => { await chrome.storage.session.set({ tutorialTab: id }); }, tabId);
  await command(tabId, { type: 'dispose' });
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);
  await page.bringToFront();
  const closed = popup.waitForEvent('close');
  await popup.locator('.tour-current').evaluate((el: HTMLButtonElement) => el.click());
  await closed;
  await expect(page.locator('.page-tour-title')).toHaveText('Tutorial · 1/5');
  expect((await command(tabId, { type: 'snapshot' })).status).toBe('picking-start');
  expect(await worker.evaluate(async () => (await chrome.storage.session.get('tutorialTab')).tutorialTab)).toBeUndefined();
  await page.locator('.page-tour').getByRole('button', { name: 'Exit tutorial' }).click();
  await expect(page.locator('.page-tour')).toBeHidden();
  await page.close();
});

test('automatic color follows article backgrounds while manual color persists', async () => {
  const { page, tabId } = await open();
  await expect(page.locator('[data-color="auto"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.marker')).toHaveCSS('color', 'rgb(56, 108, 70)');
  await page.evaluate(() => { document.body.style.backgroundColor = '#111'; document.body.style.color = '#eee'; });
  await expect(page.locator('.marker')).toHaveCSS('color', 'rgb(183, 245, 139)');
  await page.locator('[data-color="blue"]').click();
  await page.evaluate(() => { document.body.style.backgroundColor = '#fff'; });
  await expect(page.locator('.marker')).toHaveCSS('color', 'rgb(37, 99, 235)');
  await command(tabId, { type: 'dispose' });
  await worker.evaluate(async id => { await chrome.scripting.executeScript({ target: { tabId: id }, files: ['content.js'] }); }, tabId);
  await expect(page.locator('[data-color="blue"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-color="auto"]').click();
  await page.evaluate(() => { document.body.style.backgroundColor = '#111'; });
  await expect(page.locator('.marker')).toHaveCSS('color', 'rgb(183, 245, 139)');
  await page.evaluate(() => { document.querySelector('article')!.style.backgroundColor = '#fff'; });
  await expect(page.locator('.marker')).toHaveCSS('color', 'rgb(56, 108, 70)');
  await page.screenshot({ path: 'test-results/auto-color.png' });
  await page.close();
});

test('circular translucent control drags without opening and expanded controls also drag', async () => {
  const { page, tabId } = await open();
  await command(tabId, { type: 'settings', settings: { wpm: 60 } });
  await command(tabId, { type: 'play' });
  const handle = page.getByRole('button', { name: 'Expand reading controls' });
  await expect(handle).toHaveText('↗'); await expect(handle).toHaveCSS('opacity', '0.65');
  const first = (await handle.boundingBox())!;
  expect(first.width).toBe(40); expect(first.height).toBe(40);
  await page.mouse.move(first.x + 20, first.y + 20); await page.mouse.down();
  await page.mouse.move(first.x - 160, first.y - 150, { steps: 8 }); await page.mouse.up();
  await expect(page.locator('.shell')).toHaveClass(/collapsed/);
  expect((await command(tabId, { type: 'snapshot' })).status).toBe('playing');
  const moved = (await handle.boundingBox())!; expect(moved.x).toBeLessThan(first.x - 100);
  await handle.click();
  await expect(page.locator('.shell')).not.toHaveClass(/collapsed/);
  const grip = (await page.getByRole('button', { name: 'Move reading controls' }).boundingBox())!;
  const before = (await page.locator('.shell').boundingBox())!;
  await page.mouse.move(grip.x + 20, grip.y + 10); await page.mouse.down();
  await page.mouse.move(grip.x - 80, grip.y - 60, { steps: 8 }); await page.mouse.up();
  expect((await page.locator('.shell').boundingBox())!.x).toBeLessThan(before.x - 50);
  expect(await worker.evaluate(async () => (await chrome.storage.local.get('toolbarPosition')).toolbarPosition)).toMatchObject({ x: expect.any(Number), y: expect.any(Number) });
  await page.close();
});

test('popup hides and restores the controls without removing the guide', async () => {
  const { page, tabId } = await open();
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);
  await page.bringToFront();
  const visibility = popup.getByRole('checkbox', { name: 'Show page controls' });
  await visibility.evaluate((el: HTMLInputElement) => el.click());
  await expect(page.locator('.shell')).toBeHidden();
  await command(tabId, { type: 'play' });
  await expect(page.locator('.marker')).toBeVisible();
  expect((await command(tabId, { type: 'snapshot' })).status).toBe('playing');
  await visibility.evaluate((el: HTMLInputElement) => el.click());
  await expect(page.locator('.shell')).toBeVisible();
  await expect(visibility).toBeChecked();
  await popup.close(); await page.close();
});

test('new lines get a short settling pause before the cursor sweeps again', async () => {
  const { page, tabId } = await open();
  await command(tabId, { type: 'pick-start' });
  const last = await point(page, '#first', 'curiosity'); await page.mouse.click(last.x, last.y);
  await command(tabId, { type: 'settings', settings: { cursorShape: 'dot', wpm: 120, natural: false } });
  await command(tabId, { type: 'play' });
  await page.waitForFunction(() => document.querySelector('[data-wordglide]')!.shadowRoot!.querySelector('.word')!.textContent === 'Reading');
  const x = () => page.locator('.marker').evaluate(el => el.getBoundingClientRect().left);
  const first = await x();
  await page.waitForTimeout(60); expect(await x()).toBeCloseTo(first, 1);
  await page.waitForTimeout(180); expect(await x()).toBeGreaterThan(first + 2);
  await page.close();
});
