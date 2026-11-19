import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EmbeddingProgress, EmbeddingProvider } from '../ai/provider';
import { WorkerEmbeddingProvider } from '../ai/worker-provider';
import { embeddingText, tabSignature } from '../tabs/tabs';
import type { BrowserTab } from '../tabs/tabs';
import { clusterTabs } from './tree';
import type { Cluster } from './tree';

type Progress = EmbeddingProgress | { phase: 'grouping' };

export interface GroupingResult {
  tabs: BrowserTab[];
  signature: string;
  cluster: Cluster | undefined;
  embeddings: Float32Array[];
}

export function useSemanticGrouping(
  tabs: BrowserTab[],
  savedSignature: string,
  apply: (result: GroupingResult) => void,
) {
  const [progress, setProgress] = useState<Progress>();
  const [error, setError] = useState<string>();
  const signature = useMemo(() => tabSignature(tabs), [tabs]);
  const current = useRef({ tabs, signature });
  current.current = { tabs, signature };
  const provider = useRef<EmbeddingProvider | undefined>(undefined);
  const lastAttempt = useRef<string | undefined>(undefined);
  const running = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      provider.current?.dispose();
      provider.current = undefined;
    };
  }, []);

  const organize = useCallback(async () => {
    const snapshot = current.current;
    if (running.current || snapshot.tabs.length < 2) return;
    running.current = true;
    lastAttempt.current = snapshot.signature;
    setError(undefined);
    setProgress({ phase: 'loading' });

    try {
      const ai = provider.current ??= new WorkerEmbeddingProvider();
      const embeddings = await ai.embed(snapshot.tabs.map(embeddingText), next => {
        if (mounted.current) setProgress(next);
      });
      if (!mounted.current || current.current.signature !== snapshot.signature) return;
      setProgress({ phase: 'grouping' });
      apply({ ...snapshot, embeddings, cluster: clusterTabs(snapshot.tabs, embeddings) });
    } catch (error) {
      if (mounted.current && current.current.signature === snapshot.signature) {
        setError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      running.current = false;
      if (mounted.current) setProgress(undefined);
    }
  }, [apply]);

  const busy = progress !== undefined;
  useEffect(() => {
    if (busy || tabs.length < 2 || savedSignature === signature || lastAttempt.current === signature) return;
    const timer = setTimeout(() => void organize(), 650);
    return () => clearTimeout(timer);
  }, [busy, tabs.length, savedSignature, signature, organize]);

  return { progress, error, organize };
}
