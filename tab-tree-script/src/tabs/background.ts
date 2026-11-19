import { toggleOverlay } from './overlay';
import { runParking } from './parking';
import type { ParkingResult } from './parking';

const popup = 'popup/popup.html';
const frameUrl = chrome.runtime.getURL(popup);
const launches = new Map<number, { token: string; windowId: number; expires: number }>();
let parkingQueue: Promise<unknown> = Promise.resolve();

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: false })
    .catch(error => console.error('Could not configure the TabTree side panel', error));
});

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type === 'tabtree:parking') {
    const source = sender.url?.split('#')[0];
    if (source !== frameUrl && source !== chrome.runtime.getURL('sidebar/sidebar.html')) return;
    const operation = parkingQueue.then(() => {
      if (sender.tab && sender.tab.windowId !== message.request?.windowId) {
        throw new Error('This action belongs to another browser window.');
      }
      return runParking(message.request);
    });
    parkingQueue = operation.catch(() => {});
    void operation.then(
      result => respond({ ok: true, ...result } satisfies ParkingResult),
      error => respond({ ok: false, error: error instanceof Error ? error.message : String(error) } satisfies ParkingResult),
    );
    return true;
  }
  const id = sender.tab?.id;
  if (message?.type !== 'tabtree:authorize' || id === undefined ||
      !sender.frameId || sender.url !== `${frameUrl}#${message.token}`) return;
  const launch = launches.get(id);
  if (!launch || launch.expires < Date.now() || launch.token !== message.token) return;
  launches.delete(id);
  respond({ windowId: launch.windowId });
});

chrome.action.onClicked.addListener(tab => {
  void openBar(tab).catch(error => console.error('Could not open TabTree', error));
});

chrome.tabs.onUpdated.addListener((id, change) => {
  if (change.url !== undefined) void chrome.action.setPopup({ tabId: id, popup: '' }).catch(() => {});
});

async function openBar(tab: chrome.tabs.Tab) {
  if (tab.id === undefined) return;
  const tabId = tab.id;
  if (/^https?:/i.test(tab.url ?? '')) {
    const token = crypto.randomUUID();
    launches.set(tabId, { token, windowId: tab.windowId, expires: Date.now() + 10_000 });
    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId },
        func: toggleOverlay,
        args: [`${frameUrl}#${token}`],
        injectImmediately: true,
      });
      if (result?.result) return;
    } catch (error) {
      console.debug('TabTree cannot open inside this page', error);
    } finally {
      if (launches.get(tabId)?.token === token) launches.delete(tabId);
    }
  }

  const current = await chrome.tabs.get(tabId);
  if (!current.active || current.windowId !== tab.windowId || current.url !== tab.url) return;
  await chrome.action.setPopup({ tabId, popup });
  await chrome.action.openPopup({ windowId: current.windowId });
}
