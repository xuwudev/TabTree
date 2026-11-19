import { useEffect, useMemo, useState } from 'react';
import { canPark, PARKED_KEY, requestParking, withParkedPages } from './parking';
import type { ParkedWorkspace, ParkingRequest } from './parking';
import type { BrowserTab } from './tabs';

export function useParking(windowId: number, tabs: BrowserTab[]) {
  const [available, setAvailable] = useState(false);
  const [saved, setSaved] = useState<BrowserTab[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  useEffect(() => {
    let connected = true;
    let changed = false;
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes[PARKED_KEY]) {
        changed = true;
        setSaved((changes[PARKED_KEY].newValue as ParkedWorkspace | undefined)?.pages ?? []);
      }
    };

    void (async () => {
      const window = await chrome.windows.get(windowId);
      if (!connected || window.incognito) return;
      chrome.storage.onChanged.addListener(onChanged);
      const workspace = (await chrome.storage.local.get(PARKED_KEY))[PARKED_KEY] as ParkedWorkspace | undefined;
      if (!connected) return;
      if (!changed) setSaved(workspace?.pages ?? []);
      setAvailable(true);
    })().catch(() => { if (connected) setError('Could not load saved pages.'); });

    return () => {
      connected = false;
      chrome.storage.onChanged.removeListener(onChanged);
    };
  }, [windowId]);

  const entries = useMemo(() => withParkedPages(tabs, saved), [tabs, saved]);
  const active = tabs.find(tab => tab.active);
  const candidates = tabs.filter(tab => !tab.active && canPark(tab));

  async function perform(request: ParkingRequest) {
    setError(undefined);
    setNotice(undefined);
    setBusy(true);
    try {
      const { closed = 0, removed = 0 } = await requestParking(request);
      if (request.action === 'park') {
        setNotice(closed ? `Parked ${closed} ${closed === 1 ? 'tab' : 'tabs'}.` : 'No tabs were closed.');
      } else if (request.action === 'save') setNotice('Page saved.');
      else if (request.action === 'delete-group') {
        setNotice(closed || removed
          ? `Closed ${closed} ${closed === 1 ? 'tab' : 'tabs'} and removed ${removed} saved ${removed === 1 ? 'page' : 'pages'}.`
          : 'No group items were deleted.');
      }
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { available, active, candidates, entries, busy, error, notice, perform };
}
