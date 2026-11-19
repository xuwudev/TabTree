import { ChevronRight, FileText, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { TreeNode } from '../clustering/tree';
import type { BrowserTab } from '../tabs/tabs';

export function filterTree(nodes: TreeNode[], tabs: Map<number, BrowserTab>, query: string): TreeNode[] {
  if (!query) return nodes;
  const terms = query.toLowerCase().split(/\s+/);
  const matches = (text: string) => {
    const lower = text.toLowerCase();
    return terms.every(term => lower.includes(term));
  };
  function filter(children: TreeNode[]): TreeNode[] {
    return children.flatMap((node): TreeNode[] => {
      if (node.kind === 'tab') {
        const tab = tabs.get(node.id);
        return tab && matches(`${tab.title} ${tab.domain} ${tab.url}`) ? [node] : [];
      }
      if (matches(node.name)) return [node];
      const nested = filter(node.children);
      return nested.length ? [{ ...node, children: nested }] : [];
    });
  }
  return filter(nodes);
}

export function countTabs(nodes: TreeNode[]): number {
  return nodes.reduce((sum, node) => sum + (node.kind === 'tab' ? 1 : countTabs(node.children)), 0);
}

interface TreeProps {
  nodes: TreeNode[];
  tabs: Map<number, BrowserTab>;
  collapsed: Set<string>;
  searching: boolean;
  onToggle: (id: string) => void;
  onDeleteGroup?: (id: string) => void;
  onActivate: (id: number) => void;
  onClose: (id: number) => void;
  nested?: boolean;
}

export function TabTree({ nodes, tabs, collapsed, searching, onToggle, onDeleteGroup, onActivate, onClose, nested }: TreeProps) {
  return (
    <ul className={nested ? 'tree-branch' : 'tree-root'}>
      {nodes.map(node => {
        if (node.kind === 'tab') {
          const tab = tabs.get(node.id);
          if (!tab) return null;
          const tooltip = [tab.title, tab.domain, tab.parked && 'Saved page'].filter(Boolean).join('\n');
          const action = tab.parked ? 'Remove saved page' : 'Close tab';
          return (
            <li key={node.id} className={`tab-row${tab.active ? ' tab-row-active' : ''}`}>
              <button
                type="button"
                className="tab-activate flex min-w-0 flex-1 items-center gap-2 text-left"
                title={tooltip}
                aria-current={tab.active ? 'page' : undefined}
                onClick={() => onActivate(tab.id)}
              >
                <Favicon url={tab.favicon} />
                <span className="truncate">{tab.title}</span>
                {tab.parked && <small className="saved-page-label">Saved</small>}
              </button>
              <button className="tab-close icon-button" type="button" onClick={() => onClose(tab.id)}
                title={action} aria-label={`${action}: ${tab.title}`}>
                <X size={13} aria-hidden />
              </button>
            </li>
          );
        }
        const open = searching || !collapsed.has(node.id);
        return (
          <li key={node.id} className="folder">
            <div className="folder-heading">
              <button type="button" className="folder-row flex min-w-0 flex-1 items-center gap-1.5 text-left"
                title={node.name} aria-expanded={open} aria-disabled={searching || undefined}
                onClick={() => { if (!searching) onToggle(node.id); }}>
                <ChevronRight className={open ? 'chevron chevron-open' : 'chevron'} size={14} aria-hidden />
                <span className="min-w-0 flex-1 truncate">{node.name}</span>
                <span className="folder-count">{countTabs(node.children)}</span>
              </button>
              {onDeleteGroup && <button type="button" className="icon-button folder-delete"
                title="Delete group" aria-label={`Delete group: ${node.name}`}
                onClick={() => onDeleteGroup(node.id)}><Trash2 size={13} aria-hidden /></button>}
            </div>
            {open && <TabTree nodes={node.children} tabs={tabs} collapsed={collapsed} searching={searching}
              onToggle={onToggle} onDeleteGroup={onDeleteGroup} onActivate={onActivate} onClose={onClose} nested />}
          </li>
        );
      })}
    </ul>
  );
}

export function Favicon({ url }: { url?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  return url && !failed && /^(https?:|data:image\/|chrome-extension:|edge-extension:)/i.test(url)
    ? <img className="favicon" src={url} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    : <FileText className="favicon favicon-fallback" size={15} aria-hidden />;
}
