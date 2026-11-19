import { activateTab, domainOf } from './tabs';
import type { BrowserTab } from './tabs';

export const PARKED_KEY = 'tabtree.parked.v1';
export interface ParkedWorkspace {
  pages: BrowserTab[];
  nextId: number;
}

export type ParkingRequest = { windowId: number } & (
  | { action: 'park'; anchorId: number; candidates: { id: number; url: string }[] }
  | { action: 'save'; anchorId: number }
  | { action: 'open' | 'remove'; id: number }
  | { action: 'delete-group'; entries: GroupEntry[] }
);

export interface GroupEntry {
  id: number;
  url: string;
  liveId?: number;
}

interface ParkingOutcome { closed?: number; removed?: number }
export type ParkingResult = ({ ok: true } & ParkingOutcome) | { ok: false; error: string };

export function isWebPage(url?: string): url is string {
  return !!url && /^https?:\/\//i.test(url);
}

export function canPark(tab: { url?: string; pinned?: boolean }): boolean {
  return isWebPage(tab.url) && !tab.pinned;
}

export async function requestParking(request: ParkingRequest): Promise<ParkingOutcome> {
  const result = await chrome.runtime.sendMessage({ type: 'tabtree:parking', request }) as ParkingResult | undefined;
  if (!result) throw new Error('TabTree could not reach its workspace.');
  if (!result.ok) throw new Error(result.error);
  return result;
}

export function withParkedPages(live: BrowserTab[], saved: BrowserTab[]): BrowserTab[] {
  const byUrl = new Map(saved.map(page => [page.url, page]));
  const open = live.map(tab => {
    const page = byUrl.get(tab.url);
    if (!page) return tab;
    byUrl.delete(tab.url);
    return { ...tab, id: page.id, title: page.title, liveId: tab.id };
  });
  return [...open, ...byUrl.values()];
}

const anchorKey = (windowId: number) => `tabtree.viewer:${windowId}`;

export async function runParking(request: ParkingRequest): Promise<ParkingOutcome | void> {
  const { windowId } = request;
  if ((await chrome.windows.get(windowId)).incognito) throw new Error('Parking is unavailable in InPrivate windows.');
  const saved = (await chrome.storage.local.get(PARKED_KEY))[PARKED_KEY] as ParkedWorkspace | undefined;
  let pages = saved?.pages ?? [];
  let nextId = saved?.nextId ?? -1;

  function remember(tab: chrome.tabs.Tab) {
    const url = tab.url;
    if (!isWebPage(url)) return;
    const domain = domainOf(url);
    const existing = pages.find(page => page.url === url);
    const entry: BrowserTab = {
      id: existing?.id ?? nextId--, url, domain,
      title: tab.title?.trim() || existing?.title || domain,
      active: false, parked: true,
    };
    pages = existing ? pages.map(page => page.id === existing.id ? entry : page) : [...pages, entry];
  }

  const store = () => chrome.storage.local.set({ [PARKED_KEY]: { pages, nextId } satisfies ParkedWorkspace });
  const setAnchor = (id: number) => chrome.storage.session.set({ [anchorKey(windowId)]: id });

  if (request.action === 'remove') {
    pages = pages.filter(page => page.id !== request.id);
    await store();
    return;
  }

  const tabs = await chrome.tabs.query({ windowId });
  async function closeMatching(expected: Map<number, string>, preserveActive: boolean) {
    const matches = (tab: chrome.tabs.Tab) => tab.id !== undefined && tab.windowId === windowId &&
      !tab.pendingUrl && canPark(tab) && (!preserveActive || !tab.active) && expected.get(tab.id) === tab.url;
    const selected = tabs.filter(matches);
    if (selected.length && selected.length === tabs.length) {
      await chrome.tabs.create({ windowId, url: 'about:blank', active: true });
    }
    const results = await Promise.allSettled(selected.map(async tab => {
      if (!matches(await chrome.tabs.get(tab.id!))) return;
      await chrome.tabs.remove(tab.id!);
      return tab.id;
    }));
    return new Set(results.flatMap(result =>
      result.status === 'fulfilled' && result.value !== undefined ? [result.value] : [],
    ));
  }

  if (request.action === 'delete-group') {
    const expected = new Map(request.entries.flatMap(entry =>
      entry.liveId === undefined ? [] : [[entry.liveId, entry.url]],
    ));
    const closed = await closeMatching(expected, false);
    const saved = new Map(request.entries.flatMap(entry =>
      entry.id < 0 && (entry.liveId === undefined || closed.has(entry.liveId)) ? [[entry.id, entry.url]] : [],
    ));
    const before = pages.length;
    pages = pages.filter(page => saved.get(page.id) !== page.url);
    if (before !== pages.length) await store();
    return { closed: closed.size, removed: before - pages.length };
  }

  const active = tabs.find(tab => tab.active);
  if (request.action === 'save' || request.action === 'park') {
    if (!active || active.id !== request.anchorId || !isWebPage(active.url) || active.pendingUrl) {
      throw new Error('Return to the web page you want to keep open and try again.');
    }
    remember(active);
    if (request.action === 'save') {
      await store();
      return;
    }
    const expected = new Map(request.candidates.map(tab => [tab.id, tab.url]));
    const selected = tabs.filter(tab => tab.id !== undefined && !tab.active && !tab.pendingUrl &&
      canPark(tab) && expected.get(tab.id) === tab.url);
    selected.forEach(remember);
    await store();
    if (!active.pinned) await setAnchor(request.anchorId);

    const closed = await closeMatching(expected, true);
    return { closed: closed.size };
  }

  const page = pages.find(entry => entry.id === request.id);
  if (!page || !isWebPage(page.url)) throw new Error('That saved page is no longer available.');
  const alreadyOpen = tabs.find(tab => !tab.pendingUrl && tab.url === page.url);
  if (alreadyOpen?.id !== undefined) {
    await activateTab(alreadyOpen.id);
    return;
  }

  const key = anchorKey(windowId);
  const anchorId = (await chrome.storage.session.get(key))[key];
  const reusable = (tab?: chrome.tabs.Tab) => tab && !tab.pinned && (
    isWebPage(tab.pendingUrl ?? tab.url) || /^(?:about:blank|(?:chrome|edge):\/\/newtab\/?)$/.test(tab.url ?? '')
  );
  const anchor = tabs.find(tab => tab.id === anchorId);
  const viewer = reusable(anchor) ? anchor : reusable(active) ? active : undefined;
  if (viewer?.id !== undefined) {
    if (!viewer.pendingUrl) remember(viewer);
    await store();
    await setAnchor(viewer.id);
    await chrome.tabs.update(viewer.id, { url: page.url, active: true });
  } else {
    const created = await chrome.tabs.create({ windowId, url: page.url, active: true });
    if (created.id !== undefined) await setAnchor(created.id);
  }
}
