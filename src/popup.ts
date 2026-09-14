import { defaults, type Command, type Reply, type Snapshot } from './core.ts';
import { mountControls } from './ui.ts';
let tabId: number | undefined;
let viewedTabId: number | undefined;
const error = document.querySelector<HTMLElement>('#error')!;
const update = mountControls(document.querySelector('#controls')!, command => void send(command));
update({ status: 'idle', settings: defaults, index: 0, start: 0, end: 0, count: 0, word: '', message: 'Choose a word. Follow the flow.', title: '' });
async function activate() {
  const result = await chrome.runtime.sendMessage({ type: 'activate' });
  if (!result.ok) throw new Error(result.error);
  tabId = result.tabId;
}
async function send(command: Command) {
  try {
    if (!tabId) await activate();
    const reply: Reply = await chrome.tabs.sendMessage(tabId!, { channel: 'wordglide', command });
    if (!reply.ok) throw new Error(reply.error);
    error.textContent = ''; update(reply.snapshot);
    if (command.type.startsWith('pick-')) window.close();
  } catch (e) { error.textContent = e instanceof Error ? e.message : String(e); }
}
void (async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  viewedTabId = tab.id;
  try {
    const reply: Reply = await chrome.tabs.sendMessage(tab.id, { channel: 'wordglide', command: { type: 'snapshot' } });
    if (reply.ok) { tabId = tab.id; update(reply.snapshot); return; }
  } catch { /* First activation happens on a user command. */ }
  const saved = await chrome.storage.local.get('settings');
  if (saved.settings) update({ status: 'idle', settings: { ...defaults, ...saved.settings }, index: 0, start: 0, end: 0, count: 0, word: '', message: 'Choose a word. Follow the flow.', title: '' });
})();
const listener = (message: { channel?: string; snapshot?: Snapshot }, sender: chrome.runtime.MessageSender) => {
  if (message.channel === 'wordglide-state' && message.snapshot && sender.tab?.id === (tabId ?? viewedTabId)) update(message.snapshot);
};
chrome.runtime.onMessage.addListener(listener);
