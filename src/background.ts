async function activateTab(): Promise<{ ok: true; tabId: number }> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https?:/.test(tab.url ?? '')) throw new Error('Open an article or README on a regular website to begin. Browser pages and PDFs are not supported.');
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
  const pending = await chrome.storage.session.get('tutorialTab');
  if (pending.tutorialTab === tab.id) {
    await chrome.tabs.sendMessage(tab.id, { channel: 'wordglide', command: { type: 'tour-start' } });
    await chrome.storage.session.remove('tutorialTab');
  }
  return { ok: true, tabId: tab.id };
}

chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message?.type === 'open-tutorial') {
    // Fixed destination and explicit button consent; no new host permissions.
    void chrome.tabs.create({ url: 'https://quospiculum250256.substack.com/p/what-happens-when-you-pay-over-lightning' }).then(async tab => {
      await chrome.storage.session.set({ tutorialTab: tab.id }); respond({ ok: true });
    }).catch(error => respond({ ok: false, error: String(error) }));
    return true;
  }
  if (message?.type !== 'activate') return;
  activateTab().then(respond).catch(error => respond({ ok: false, error: String(error.message ?? error) }));
  return true;
});

chrome.commands.onCommand.addListener(command => {
  if (command !== 'activate') return;
  // No popup is open to surface activation errors; they land in the service worker console.
  activateTab().catch(error => console.error(error.message ?? error));
});
