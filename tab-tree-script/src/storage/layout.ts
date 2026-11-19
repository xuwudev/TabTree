import type { TreeNode } from '../clustering/tree';
import { emptyRelations } from '../clustering/relations';
import type { RelationLayout } from '../clustering/relations';

export interface Layout {
  signature: string;
  tree: TreeNode[];
  collapsed: string[];
}

export const emptyLayout: Layout = { signature: '', tree: [], collapsed: [] };
const keyFor = (windowId: number) => `tabtree.layout.v1:${windowId}`;

export async function loadLayout(windowId: number): Promise<Layout> {
  const key = keyFor(windowId);
  const saved = (await chrome.storage.local.get(key))[key] as Layout | undefined;
  return saved ?? emptyLayout;
}

export async function saveLayout(windowId: number, layout: Layout): Promise<void> {
  await chrome.storage.local.set({ [keyFor(windowId)]: layout });
}

const relationKey = (windowId: number) => `tabtree.relations.v1:${windowId}`;

export async function loadRelations(windowId: number): Promise<RelationLayout> {
  const key = relationKey(windowId);
  const saved = await chrome.storage.local.get<Record<string, RelationLayout | undefined>>(key);
  const layout = saved[key];
  return layout?.version === emptyRelations.version ? layout : emptyRelations;
}

export async function saveRelations(windowId: number, layout: RelationLayout): Promise<void> {
  await chrome.storage.local.set({ [relationKey(windowId)]: layout });
}
