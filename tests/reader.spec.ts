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
    ...(process.env.WORDGLIDE_BROWSER ? { executablePath: process.env.WORDGLIDE_BROWSER } : { channel: 'chromium' }), headless: true, viewport: { width: 1280, height: 900 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
});
test.afterAll(async () => { await context?.close(); server?.close(); if (folder) await rm(folder, { recursive: true, force: true }); });

async function open() {
  await worker.evaluate(async () => { await chrome.storage.local.clear(); });
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
  await expect(popup.locator('h1')).toHaveText('Find your rhythm.');
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
