import type { BrowserTab } from '../tabs/tabs';
import { folderName } from './keywords';

export type TreeNode =
  | { kind: 'tab'; id: number }
  | { kind: 'folder'; id: string; name: string; children: TreeNode[] };

export interface Cluster {
  indices: number[];
  similarity: number;
  children?: [Cluster, Cluster];
}

export const GROUP_THRESHOLD = 0.43;
const SUBGROUP_GAP = 0.10;

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] ** 2;
    normB += b[i] ** 2;
  }
  return normA && normB ? dot / Math.sqrt(normA * normB) : 0;
}

export function clusterTabs(tabs: BrowserTab[], embeddings: Float32Array[]): Cluster | undefined {
  if (tabs.length < 2) return tabs.length ? { indices: [0], similarity: 1 } : undefined;
  if (embeddings.length !== tabs.length || !embeddings[0]?.length ||
      embeddings.some(vector => vector.length !== embeddings[0].length)) {
    throw new Error('Local AI returned incomplete tab embeddings.');
  }

  const clusters: Cluster[] = tabs.map((_, i) => ({ indices: [i], similarity: 1 }));
  const similarities = tabs.map(() => new Float32Array(tabs.length));
  for (let i = 0; i < tabs.length; i++) {
    for (let j = 0; j < i; j++) {
      similarities[i][j] = similarities[j][i] = cosineSimilarity(embeddings[i], embeddings[j]);
    }
  }

  const active = new Set(tabs.map((_, i) => i));
  const chain: number[] = [];
  while (active.size > 1) {
    if (!chain.length) chain.push(active.values().next().value!);
    const a = chain.at(-1)!;
    const previous = chain.at(-2);
    let b = previous ?? -1;
    for (const candidate of active) {
      if (candidate !== a && (b === -1 || similarities[a][candidate] > similarities[a][b])) {
        b = candidate;
      }
    }
    if (b !== previous) {
      chain.push(b);
      continue;
    }

    // Reciprocal nearest neighbors can merge under average linkage.
    chain.length -= 2;
    active.delete(b);
    const left = clusters[a];
    const right = clusters[b];
    const indices = [...left.indices, ...right.indices].sort((x, y) => x - y);
    const children: [Cluster, Cluster] = left.indices[0] < right.indices[0] ? [left, right] : [right, left];
    clusters[a] = { indices, similarity: similarities[a][b], children };
    for (const other of active) {
      if (other === a) continue;
      similarities[a][other] = similarities[other][a] =
        (similarities[a][other] * left.indices.length + similarities[b][other] * right.indices.length) / indices.length;
    }
  }

  return clusters[active.values().next().value!];
}

export function folderTree(root: Cluster | undefined, tabs: BrowserTab[]): TreeNode[] {
  if (!root) return [];
  function render(cluster: Cluster, parent?: { name: string; similarity: number }): TreeNode[] {
    if (!cluster.children) return [{ kind: 'tab', id: tabs[cluster.indices[0]].id }];
    if (cluster.similarity < GROUP_THRESHOLD ||
        (parent && cluster.similarity < parent.similarity + SUBGROUP_GAP)) {
      return cluster.children.flatMap(child => render(child, parent));
    }

    const members = cluster.indices.map(index => tabs[index]);
    const name = folderName(members);
    if (parent?.name.toLowerCase() === name.toLowerCase()) {
      return cluster.children.flatMap(child => render(child, parent));
    }
    const children = cluster.children.flatMap(child => render(child, { name, similarity: cluster.similarity }));
    const id = `folder:${members.map(tab => tab.id).sort((a, b) => a - b).join(',')}`;
    return [{ kind: 'folder', id, name, children }];
  }

  const ordered = new Map(tabs.map((tab, i) => [tab.id, i]));
  function order(nodes: TreeNode[]): number {
    const positions = new Map<TreeNode, number>();
    for (const node of nodes) {
      positions.set(node, node.kind === 'tab' ? ordered.get(node.id)! : order(node.children));
    }
    nodes.sort((a, b) => positions.get(a)! - positions.get(b)!);
    return positions.get(nodes[0])!;
  }

  const tree = render(root);
  order(tree);
  return tree;
}

export function reconcileTree(tree: TreeNode[], tabs: BrowserTab[]): TreeNode[] {
  const live = new Set(tabs.map(tab => tab.id));
  function prune(nodes: TreeNode[]): TreeNode[] {
    return nodes.flatMap((node): TreeNode[] => {
      if (node.kind === 'tab') return live.delete(node.id) ? [node] : [];
      const children = prune(node.children);
      return children.length ? [{ ...node, children }] : [];
    });
  }
  return [...prune(tree), ...tabs.filter(tab => live.has(tab.id)).map(tab => ({ kind: 'tab' as const, id: tab.id }))];
}

export function folderIds(tree: TreeNode[]): string[] {
  return tree.flatMap(node => node.kind === 'folder' ? [node.id, ...folderIds(node.children)] : []);
}
