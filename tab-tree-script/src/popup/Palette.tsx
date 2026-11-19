import { AppWindow, Menu, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { emptyRelations, relationTree } from '../clustering/relations';
import type { RelationLayout } from '../clustering/relations';
import { useSemanticGrouping } from '../clustering/useSemanticGrouping';
import type { GroupingResult } from '../clustering/useSemanticGrouping';
import { loadRelations, saveRelations } from '../storage/layout';
import { useSavedLayout } from '../storage/useSavedLayout';
import { activateTab } from '../tabs/tabs';
import type { BrowserTab } from '../tabs/tabs';
import { useParking } from '../tabs/useParking';
import { useWindowTabs } from '../tabs/useWindowTabs';
import { Favicon } from '../ui/TabTree';
import { useGroupDeletion } from '../ui/DeleteGroup';
import { topicsFor } from './topics';
import type { Topic } from './topics';
import { useButtonCursor } from '../ui/useButtonCursor';
import { useTopicDrag } from './useTopicDrag';

interface Surface {
  targetWindow?: number;
  dismiss: () => void;
}

export function TabPalette({ targetWindow, dismiss }: Surface) {
  const state = useWindowTabs(loadRelations, emptyRelations, targetWindow);
  return state.windowId !== undefined && state.initialLayout ? (
    <TopicBar key={state.windowId} windowId={state.windowId} initial={state.initialLayout}
      tabs={state.tabs} tabError={state.error} dismiss={dismiss} />
  ) : (
    <main className="topic-bar"><p className="bar-message" role="status">{state.error ?? 'Reading open tabs…'}</p></main>
  );
}

function TopicBar({ windowId, initial, tabs, tabError, dismiss }: {
  windowId: number;
  initial: RelationLayout;
  tabs: BrowserTab[];
  tabError?: string;
  dismiss: () => void;
}) {
  const parking = useParking(windowId, tabs);
  const deletion = useGroupDeletion(windowId, parking);
  const { entries } = parking;
  const { layout, setLayout, storageError } = useSavedLayout(windowId, initial, saveRelations);
  const apply = useCallback(({ cluster, tabs, embeddings, signature }: GroupingResult) => {
    setLayout({ version: 2, signature, root: relationTree(cluster, tabs, embeddings) });
  }, [setLayout]);
  const { progress, error, organize } = useSemanticGrouping(entries, layout.signature, apply);
  const topics = useMemo(() => topicsFor(layout.root, entries), [layout.root, entries]);
  const [heldTopics, setHeldTopics] = useState<Topic[]>();
  const [openId, setOpenId] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const surface = useRef<HTMLElement>(null);
  const cursor = useButtonCursor(surface);
  const visible = heldTopics ?? topics;
  const open = visible.find(topic => topic.id === openId);
  const message = tabError ?? actionError ?? parking.error ?? error ?? storageError;

  function switchTab(id: number) {
    const liveId = entries.find(entry => entry.id === id)?.liveId ?? id;
    if (liveId < 0) {
      void parking.perform({ action: 'open', windowId, id }).then(success => { if (success) dismiss(); });
      return;
    }
    void activateTab(liveId).then(dismiss, () => setActionError('That tab may have already closed.'));
  }

  const { handlers, hoveredTab } = useTopicDrag(
    id => {
      setHeldTopics(topics);
      setOpenId(id);
    },
    setOpenId,
    id => {
      setHeldTopics(undefined);
      setOpenId(undefined);
      if (id !== undefined) switchTab(id);
    },
  );

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [dismiss]);

  function openSidePanel() {
    if (!chrome.sidePanel?.open) return;
    void chrome.sidePanel.open({ windowId }).then(dismiss, () => setActionError('Could not open the side panel.'));
  }

  return (
    <main ref={surface} className="topic-bar" aria-label="TabTree" data-holding={!!heldTopics} {...handlers}>
      <div className="bar-row">
        <span className="bar-mark" aria-hidden="true"><AppWindow size={17} strokeWidth={1.5} /></span>
        <div className="bar-topics" role="group" aria-label="Hold a topic and drag to a tab">
          {visible.map(topic => (
            <div className="bar-topic-wrap" key={topic.id}>
              <button type="button" className="bar-topic" data-topic-id={topic.id}
                aria-expanded={topic.id === open?.id} aria-controls={topic.id === open?.id ? 'bar-tabs' : undefined}
                title={topic.name} onClick={event => {
                  if (event.detail === 0) setOpenId(openId === topic.id ? undefined : topic.id);
                }}>
                <span className="bar-button-content">
                  <span className="bar-label">{topic.name}</span>
                  <span className="bar-count">{topic.tabs.length}</span>
                </span>
              </button>
              {parking.available && topic.id !== 'all' && <button type="button" className="icon-button bar-delete"
                title="Delete group" aria-label={`Delete group: ${topic.name}`} disabled={parking.busy || !!heldTopics}
                onClick={() => deletion.confirm(topic.name, topic.tabs)}><Trash2 size={14} aria-hidden /></button>}
            </div>
          ))}
        </div>
        <div className="bar-tools">
          <button type="button" className="icon-button" aria-label="Open side panel" title="Open side panel"
            onClick={openSidePanel}><Menu size={17} aria-hidden /></button>
          <button type="button" className="icon-button" aria-label="Close tab bar" title="Close tab bar"
            onClick={dismiss}><X size={17} aria-hidden /></button>
        </div>
      </div>
      {open && (
        <div id="bar-tabs" className="bar-picker" role="group" aria-label={open.name}>
          {open.tabs.map(tab => (
            <button type="button" className="bar-tab" key={tab.id} data-tab-id={tab.id} data-target={tab.id === hoveredTab}
              aria-current={tab.active ? 'page' : undefined}
              title={[tab.title, tab.domain, tab.parked && 'Saved page'].filter(Boolean).join('\n')}
              onClick={event => { if (event.detail === 0) switchTab(tab.id); }}>
              <span className="bar-button-content">
                <Favicon url={tab.favicon} />
                <span className="bar-label">{tab.title}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      <span ref={cursor} className="button-cursor" aria-hidden="true" />
      {deletion.dialog}
      {message && <div className="bar-message error" role="alert">
        {message} {error && <button type="button" onClick={() => void organize()}>Retry</button>}
      </div>}
      {parking.notice && <p className="bar-message" role="status">{parking.notice}</p>}
      {!message && !entries.length && <p className="bar-message">No tabs or saved pages.</p>}
      {progress && <span className="bar-sr-only" role="status">Organizing tabs…</span>}
    </main>
  );
}
