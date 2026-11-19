import { useCallback, useMemo } from 'react';
import { saveLayout } from '../storage/layout';
import type { Layout } from '../storage/layout';
import { useSavedLayout } from '../storage/useSavedLayout';
import type { BrowserTab } from '../tabs/tabs';
import { folderIds, folderTree, reconcileTree } from './tree';
import { useSemanticGrouping } from './useSemanticGrouping';
import type { GroupingResult } from './useSemanticGrouping';

export function useOrganization(windowId: number, tabs: BrowserTab[], initialLayout: Layout) {
  const { layout, setLayout, storageError } = useSavedLayout(windowId, initialLayout, saveLayout);
  const tree = useMemo(() => reconcileTree(layout.tree, tabs), [layout.tree, tabs]);
  const apply = useCallback(({ cluster, tabs, signature }: GroupingResult) => {
    const nextTree = folderTree(cluster, tabs);
    const ids = new Set(folderIds(nextTree));
    setLayout(previous => ({
      signature,
      tree: nextTree,
      collapsed: previous.collapsed.filter(id => ids.has(id)),
    }));
  }, [setLayout]);
  const grouping = useSemanticGrouping(tabs, layout.signature, apply);

  function toggleFolder(id: string) {
    setLayout(previous => ({
      ...previous,
      collapsed: previous.collapsed.includes(id)
        ? previous.collapsed.filter(folder => folder !== id)
        : [...previous.collapsed, id],
    }));
  }

  return { ...grouping, tree, collapsed: layout.collapsed, storageError, toggleFolder };
}
