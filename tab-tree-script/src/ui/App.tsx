import { AppWindow, Ellipsis, Search, Sparkles, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useOrganization } from '../clustering/useOrganization';
import type { TreeNode } from '../clustering/tree';
import { emptyLayout, loadLayout } from '../storage/layout';
import type { Layout } from '../storage/layout';
import { activateTab, closeTab } from '../tabs/tabs';
import type { BrowserTab } from '../tabs/tabs';
import { useParking } from '../tabs/useParking';
import { useWindowTabs } from '../tabs/useWindowTabs';
import { countTabs, filterTree, TabTree } from './TabTree';
import { ParkingControls } from './ParkingControls';
import { useGroupDeletion } from './DeleteGroup';
import { useButtonCursor } from './useButtonCursor';

export function App() {
  const state = useWindowTabs(loadLayout, emptyLayout);
  const surface = useRef<HTMLDivElement>(null);
  const cursor = useButtonCursor(surface);
  return (
    <div className="app" ref={surface}>
      {state.windowId !== undefined && state.initialLayout ? (
        <Explorer key={state.windowId} windowId={state.windowId} initialLayout={state.initialLayout}
          tabs={state.tabs} tabError={state.error} />
      ) : (
        <>
          <PanelTitle />
          <p className="empty-state" role="status">{state.error ?? 'Reading open tabs…'}</p>
        </>
      )}
      <span ref={cursor} className="button-cursor" aria-hidden="true" />
    </div>
  );
}

function PanelTitle({ children }: { children?: ReactNode }) {
  return (
    <div className="app-header">
      <AppWindow size={16} strokeWidth={1.5} aria-hidden />
      <h1>TabTree</h1>
      {children}
    </div>
  );
}

function Explorer({ windowId, tabs, initialLayout, tabError }: {
  windowId: number;
  tabs: BrowserTab[];
  initialLayout: Layout;
  tabError?: string;
}) {
  const parking = useParking(windowId, tabs);
  const deletion = useGroupDeletion(windowId, parking);
  const { entries } = parking;
  const parked = entries.length - tabs.length;
  const { tree, collapsed, progress, error, storageError, organize, toggleFolder } =
    useOrganization(windowId, entries, initialLayout);
  const [input, setInput] = useState('');
  const [actionError, setActionError] = useState<string>();
  const searchRef = useRef<HTMLInputElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const query = input.trim();
  const tabsById = useMemo(() => new Map(entries.map(tab => [tab.id, tab])), [entries]);
  const collapsedIds = useMemo(() => new Set(collapsed), [collapsed]);
  const visible = useMemo(() => filterTree(tree, tabsById, query), [tree, tabsById, query]);
  const visibleCount = query ? countTabs(visible) : entries.length;
  const message = tabError ?? actionError ?? parking.error ?? error ?? storageError;

  function clearSearch() {
    setInput('');
    searchRef.current?.focus();
  }

  function deleteGroup(id: string) {
    function find(nodes: TreeNode[]): Extract<TreeNode, { kind: 'folder' }> | undefined {
      for (const node of nodes) {
        if (node.kind === 'tab') continue;
        if (node.id === id) return node;
        const nested = find(node.children);
        if (nested) return nested;
      }
    }
    function members(nodes: TreeNode[]): BrowserTab[] {
      return nodes.flatMap(node => node.kind === 'folder' ? members(node.children) : tabsById.get(node.id) ?? []);
    }
    const group = find(tree);
    if (group) deletion.confirm(group.name, members(group.children));
  }

  async function performTabAction(action: 'activate' | 'close', id: number) {
    setActionError(undefined);
    const liveId = tabsById.get(id)?.liveId ?? id;
    if (liveId < 0) {
      await parking.perform({ action: action === 'activate' ? 'open' : 'remove', windowId, id });
      return;
    }
    try {
      await (action === 'activate' ? activateTab(liveId) : closeTab(liveId));
    } catch (error) {
      console.error(`Could not ${action} tab`, error);
      setActionError(`Could not ${action} this tab. It may have already closed.`);
    }
  }

  let progressLabel = 'Grouping related tabs…';
  if (progress?.phase === 'loading') progressLabel = 'Loading local AI…';
  if (progress?.phase === 'embedding') progressLabel = `Analyzing tabs… ${progress.completed} / ${progress.total}`;

  return (
    <>
      <header className="explorer-header">
        <PanelTitle>
          <button type="button" className="icon-button" popoverTarget="tab-actions" aria-label="Tab actions" title="Tab actions">
            <Ellipsis size={18} aria-hidden />
          </button>
        </PanelTitle>
        <div ref={actionsRef} id="tab-actions" className="actions-popover" popover="auto" aria-label="Tab actions">
          <button type="button" className="action-row" disabled={!!progress || entries.length < 2} onClick={() => {
            actionsRef.current?.hidePopover();
            void organize();
          }}>
            <Sparkles size={15} aria-hidden /> Organize tabs
          </button>
          <ParkingControls parking={parking} windowId={windowId} />
        </div>
        <div className="search-box">
          <Search size={15} aria-hidden />
          <input ref={searchRef} className="min-w-0 flex-1" type="search" placeholder="Search tabs"
            aria-label="Search tabs and folders" value={input} onChange={event => setInput(event.target.value)}
            onKeyDown={event => { if (event.key === 'Escape') clearSearch(); }} />
          {input && <button type="button" className="icon-button" aria-label="Clear search" onClick={clearSearch}>
            <X size={14} aria-hidden />
          </button>}
        </div>
        {(deletion.dialog || parking.notice || progress || message) && <div className="sidebar-feedback">
          {deletion.dialog}
          {parking.notice && <p className="status" role="status">{parking.notice}</p>}
          {progress && <div className="status" role="status">
            <span>{progressLabel}</span>
            {progress.phase === 'embedding'
              ? <progress aria-label="Tabs analyzed" value={progress.completed} max={progress.total} />
              : <progress aria-label={progressLabel} />}
          </div>}
          {message && <p className="error" role="alert" title={message}>{message}</p>}
        </div>}
      </header>
      <main className="explorer" aria-labelledby="tabs-heading">
        <div className="section-header flex items-center justify-between">
          <h2 id="tabs-heading">{query ? 'Search results' : parked ? 'Tabs and saved pages' : 'Open tabs'}</h2>
          <span className="tab-count" aria-live="polite">
            {visibleCount} {parked ? (visibleCount === 1 ? 'item' : 'items') : (visibleCount === 1 ? 'tab' : 'tabs')}
          </span>
        </div>
        {visible.length ? (
          <TabTree nodes={visible} tabs={tabsById} collapsed={collapsedIds} searching={!!query}
            onToggle={toggleFolder} onActivate={id => void performTabAction('activate', id)}
            onDeleteGroup={parking.available && !parking.busy ? deleteGroup : undefined}
            onClose={id => void performTabAction('close', id)} />
        ) : (
          <p className="empty-state">{query ? 'No items match your search.' : 'No tabs or saved pages.'}</p>
        )}
      </main>
    </>
  );
}
