import { useState } from 'react';
import { canPark } from '../tabs/parking';
import type { GroupEntry } from '../tabs/parking';
import type { BrowserTab } from '../tabs/tabs';
import type { useParking } from '../tabs/useParking';

export function useGroupDeletion(windowId: number, parking: ReturnType<typeof useParking>) {
  const [pending, setPending] = useState<{ name: string; entries: GroupEntry[]; skipped: number }>();

  function confirm(name: string, tabs: BrowserTab[]) {
    const entries = tabs.flatMap(tab => {
      if (tab.parked) return [{ id: tab.id, url: tab.url }];
      return canPark(tab) ? [{ id: tab.id, url: tab.url, liveId: tab.liveId ?? tab.id }] : [];
    });
    setPending({ name, entries, skipped: tabs.length - entries.length });
  }

  const live = pending?.entries.filter(entry => entry.liveId !== undefined).length ?? 0;
  const saved = pending?.entries.filter(entry => entry.id < 0).length ?? 0;
  const dialog = pending && (
    <section className="parking-confirm group-delete-confirm" aria-label={`Delete group ${pending.name}`}>
      <strong>Delete {pending.name}?</strong>
      {pending.entries.length ? (
        <p>
          {live > 0 && `Close ${live} open ${live === 1 ? 'tab' : 'tabs'}. `}
          {saved > 0 && `Remove ${saved} saved ${saved === 1 ? 'page' : 'pages'}. `}
          {live > 0 && 'Unsaved work may be lost.'}
        </p>
      ) : <p>This group has no removable tabs or saved pages.</p>}
      {pending.skipped > 0 && <p>Pinned tabs and browser-internal pages stay open.</p>}
      <div className="parking-actions">
        <button type="button" className="parking-action delete-group-button"
          disabled={parking.busy || !pending.entries.length} onClick={() => {
            const { entries } = pending;
            setPending(undefined);
            void parking.perform({ action: 'delete-group', windowId, entries });
          }}>Delete group</button>
        <button type="button" className="parking-action" onClick={() => setPending(undefined)}>Cancel</button>
      </div>
    </section>
  );

  return { confirm, dialog };
}
