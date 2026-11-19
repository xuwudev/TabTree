export interface EmbeddingProgress {
  phase: 'loading' | 'embedding';
  completed?: number;
  total?: number;
}

export interface EmbeddingProvider {
  embed(texts: string[], onProgress: (progress: EmbeddingProgress) => void): Promise<Float32Array[]>;
  dispose(): void;
}

export type WorkerResponse =
  | { type: 'progress'; progress: EmbeddingProgress }
  | { type: 'result'; embeddings: Float32Array[] }
  | { type: 'error'; message: string };
