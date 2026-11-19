import { liveRelations } from '../clustering/relations';
import type { RelationNode } from '../clustering/relations';
import { GROUP_THRESHOLD } from '../clustering/tree';
import type { BrowserTab } from '../tabs/tabs';

export interface Topic {
  id: string;
  name: string;
  tabs: BrowserTab[];
}

export function topicsFor(root: RelationNode | undefined, tabs: BrowserTab[]): Topic[] {
  if (!tabs.length) return [];
  if (!root || root.kind === 'tab') return [{ id: 'all', name: 'Open tabs', tabs }];
  const byId = new Map(tabs.map(tab => [tab.id, tab]));
  const topics: Topic[] = [];
  const loose: BrowserTab[] = [];

  function members(node: RelationNode): BrowserTab[] {
    return node.kind === 'tab' ? [byId.get(node.id)!] : node.children.flatMap(members);
  }

  function add(node: RelationNode) {
    if (node.kind === 'tab') loose.push(byId.get(node.id)!);
    else if (node.similarity < GROUP_THRESHOLD) node.children.forEach(add);
    else topics.push({ id: node.id, name: node.name, tabs: members(node) });
  }

  liveRelations(root, tabs).forEach(add);
  if (loose.length) topics.push({ id: 'loose', name: topics.length ? 'Other tabs' : root.name, tabs: loose });
  return topics;
}
