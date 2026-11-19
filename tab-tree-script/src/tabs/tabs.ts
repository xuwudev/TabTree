export interface BrowserTab {
  id: number;
  title: string;
  url: string;
  domain: string;
  favicon?: string;
  active: boolean;
  pinned?: boolean;
  parked?: boolean;
  liveId?: number;
}

export function domainOf(url: string): string {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'file:') return 'Local file';
    if (parsed.protocol === 'edge:' || parsed.protocol === 'chrome:') {
      return `${parsed.protocol}//${parsed.hostname}`;
    }
    return parsed.hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

export async function listTabs(windowId: number): Promise<BrowserTab[]> {
  const tabs = await chrome.tabs.query({ windowId });
  return tabs.sort((a, b) => a.index - b.index).flatMap(tab => {
    if (tab.id === undefined || tab.id < 0) return [];
    const url = tab.url || tab.pendingUrl || '';
    const domain = domainOf(url);
    return [{
      id: tab.id,
      title: tab.title?.trim() || domain || 'New tab',
      url,
      domain,
      favicon: tab.favIconUrl,
      active: tab.active,
      pinned: tab.pinned,
    }];
  });
}

export function watchTabs(windowId: number, refresh: () => void): () => void {
  const created = (tab: chrome.tabs.Tab) => { if (tab.windowId === windowId) refresh(); };
  const updated = (_id: number, _change: object, tab: chrome.tabs.Tab) => created(tab);
  const changed = (_id: number, info: { windowId: number }) => {
    if (info.windowId === windowId) refresh();
  };
  const activated = (info: { windowId: number }) => changed(0, info);
  const attached = (_id: number, info: { newWindowId: number }) => changed(0, { windowId: info.newWindowId });
  const detached = (_id: number, info: { oldWindowId: number }) => changed(0, { windowId: info.oldWindowId });

  chrome.tabs.onCreated.addListener(created);
  chrome.tabs.onUpdated.addListener(updated);
  chrome.tabs.onRemoved.addListener(changed);
  chrome.tabs.onMoved.addListener(changed);
  chrome.tabs.onActivated.addListener(activated);
  chrome.tabs.onAttached.addListener(attached);
  chrome.tabs.onDetached.addListener(detached);
  chrome.tabs.onReplaced.addListener(refresh);
  return () => {
    chrome.tabs.onCreated.removeListener(created);
    chrome.tabs.onUpdated.removeListener(updated);
    chrome.tabs.onRemoved.removeListener(changed);
    chrome.tabs.onMoved.removeListener(changed);
    chrome.tabs.onActivated.removeListener(activated);
    chrome.tabs.onAttached.removeListener(attached);
    chrome.tabs.onDetached.removeListener(detached);
    chrome.tabs.onReplaced.removeListener(refresh);
  };
}

export async function activateTab(id: number): Promise<void> {
  await chrome.tabs.update(id, { active: true });
}

export async function closeTab(id: number): Promise<void> {
  await chrome.tabs.remove(id);
}

export function embeddingText(tab: BrowserTab): string {
  // Use the title as the primary signal, with the site as lightweight context.
  const site = tab.domain.replace(/\.(com|org|net|io|dev|edu)(?=\b)/gi, '').replace(/[.-]/g, ' ');
  const title = tab.title.replace(/\s+/g, ' ').slice(0, 300);
  return site && !title.toLowerCase().includes(site.toLowerCase()) ? `${title} [${site}]` : title;
}

export function tabSignature(tabs: BrowserTab[]): string {
  return JSON.stringify(tabs.map(tab => [tab.id, tab.title, tab.url]).sort(([a], [b]) => Number(a) - Number(b)));
}
