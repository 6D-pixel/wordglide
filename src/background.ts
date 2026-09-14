chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message?.type !== 'activate') return;
  (async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https?:/.test(tab.url ?? '')) throw new Error('Open an article or README on a regular website to begin. Browser pages and PDFs are not supported.');
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    return { ok: true, tabId: tab.id };
  })().then(respond).catch(error => respond({ ok: false, error: String(error.message ?? error) }));
  return true;
});
