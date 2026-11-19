import type { BrowserTab } from '../tabs/tabs';
import { topicName } from './keywords';
import { cosineSimilarity, GROUP_THRESHOLD } from './tree';
import type { Cluster } from './tree';

export type RelationNode =
  | { kind: 'tab'; id: number }
  | {
      kind: 'branch';
      id: string;
      name: string;
      similarity: number;
      children: [RelationNode, RelationNode];
    };

export interface RelationLayout {
  version: 2;
  signature: string;
  root?: RelationNode;
}

export const emptyRelations: RelationLayout = { version: 2, signature: '' };

export function relationTree(
  cluster: Cluster | undefined,
  tabs: BrowserTab[],
  embeddings: Float32Array[],
): RelationNode | undefined {
  if (!cluster) return;
  const representativesByBranch = new Map<string, BrowserTab[]>();
  function build(node: Cluster): { tree: RelationNode; firstId: number; topic: string; vector: Float32Array } {
    if (!node.children) {
      const index = node.indices[0];
      const tab = tabs[index];
      return { tree: { kind: 'tab', id: tab.id }, firstId: tab.id, topic: topicName([tab]), vector: embeddings[index] };
    }
    const [left, right] = node.children.map(build);
    const firstId = Math.min(left.firstId, right.firstId);
    const secondId = Math.max(left.firstId, right.firstId);
    const vector = left.vector.map((value, index) => value + right.vector[index]);
    const representatives = node.indices
      .map(index => ({ index, similarity: cosineSimilarity(embeddings[index], vector) }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 8)
      .map(({ index }) => tabs[index]);
    const topic = topicName(representatives);
    const childTopics = [...new Set([left.topic, right.topic])];
    const id = `split:${firstId}:${secondId}`;
    representativesByBranch.set(id, representatives);
    return {
      firstId,
      topic,
      vector,
      tree: {
        kind: 'branch',
        id,
        name: node.similarity >= GROUP_THRESHOLD ? topic : childTopics.join(' / '),
        similarity: node.similarity,
        children: [left.tree, right.tree],
      },
    };
  }
  const ancestorNames = new Set<string>();
  function distinguish(node: RelationNode): void {
    if (node.kind === 'tab') return;
    const existing = node.name.toLowerCase();
    if (ancestorNames.has(existing)) {
      const alternatives = representativesByBranch.get(node.id) ?? [];
      const alternative = topicName(alternatives, node.name);
      if (!ancestorNames.has(alternative.toLowerCase())) node.name = alternative;
    }
    const name = node.name.toLowerCase();
    const alreadyUsed = ancestorNames.has(name);
    ancestorNames.add(name);
    node.children.forEach(distinguish);
    if (!alreadyUsed) ancestorNames.delete(name);
  }
  const root = build(cluster).tree;
  distinguish(root);
  return root;
}

export function liveRelations(root: RelationNode | undefined, tabs: BrowserTab[]): RelationNode[] {
  const live = new Set(tabs.map(tab => tab.id));
  function prune(node: RelationNode): RelationNode | undefined {
    if (node.kind === 'tab') return live.delete(node.id) ? node : undefined;
    const left = prune(node.children[0]);
    const right = prune(node.children[1]);
    return left && right ? { ...node, children: [left, right] } : left ?? right;
  }
  const saved = root && prune(root);
  return [
    ...(saved ? [saved] : []),
    ...tabs.filter(tab => live.has(tab.id)).map(tab => ({ kind: 'tab' as const, id: tab.id })),
  ];
}
