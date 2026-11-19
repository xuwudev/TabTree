import { useEffect, useState } from 'react';
import { listTabs, watchTabs } from './tabs';
import type { BrowserTab } from './tabs';

interface WindowTabs<T> {
  tabs: BrowserTab[];
  windowId?: number;
  initialLayout?: T;
  error?: string;
}

export function useWindowTabs<T>(load: (windowId: number) => Promise<T>, empty: T, targetWindow?: number): WindowTabs<T> {
  const [state, setState] = useState<WindowTabs<T>>({ tabs: [] });

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let revision = 0;

    async function connect() {
      if (!globalThis.chrome?.tabs?.query || !chrome.windows?.getCurrent) {
        throw new Error('Open TabTree from the extension toolbar in Edge or Chrome.');
      }
      const windowId = targetWindow ?? (await chrome.windows.getCurrent()).id;
      if (cancelled) return;
      if (windowId === undefined) throw new Error('The current browser window is unavailable.');

      const saved = load(windowId).catch((error: unknown) => {
        console.error('Could not restore TabTree layout', error);
        return empty;
      });
      async function refresh() {
        const request = ++revision;
        try {
          const [tabs, initialLayout] = await Promise.all([listTabs(windowId!), saved]);
          if (!cancelled && request === revision) setState({ tabs, windowId, initialLayout });
        } catch (error) {
          console.error('Could not read browser tabs', error);
          if (!cancelled && request === revision) {
            setState(previous => ({ ...previous, error: 'Could not read tabs for this browser window.' }));
          }
        }
      }

      unsubscribe = watchTabs(windowId, () => {
        revision++;
        clearTimeout(timer);
        timer = setTimeout(() => void refresh(), 50);
      });
      await refresh();
    }

    void connect().catch(error => {
      if (!cancelled) setState({ tabs: [], error: error instanceof Error ? error.message : String(error) });
    });

    return () => {
      cancelled = true;
      clearTimeout(timer);
      unsubscribe?.();
    };
  }, [load, empty, targetWindow]);

  return state;
}
