import type { EmbeddingProgress, EmbeddingProvider, WorkerResponse } from './provider';

export class WorkerEmbeddingProvider implements EmbeddingProvider {
  private worker?: Worker;
  private rejectPending?: (error: Error) => void;

  async embed(texts: string[], onProgress: (progress: EmbeddingProgress) => void): Promise<Float32Array[]> {
    if (typeof Worker === 'undefined' || typeof WebAssembly === 'undefined') {
      throw new Error('Local AI requires Web Workers and WebAssembly. Open TabTree in Edge or Chrome.');
    }
    if (this.rejectPending) throw new Error('Tab organization is already running.');
    const worker = this.worker ??= new Worker(new URL('./inference.worker.ts', import.meta.url), { type: 'module' });

    return new Promise((resolve, reject) => {
      const finish = () => {
        this.rejectPending = undefined;
        worker.onmessage = worker.onerror = worker.onmessageerror = null;
      };
      const fail = (error: Error) => {
        finish();
        worker.terminate();
        this.worker = undefined;
        reject(error);
      };
      this.rejectPending = fail;
      worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
        if (data.type === 'progress') {
          onProgress(data.progress);
        } else if (data.type === 'error') {
          fail(new Error(data.message));
        } else {
          finish();
          resolve(data.embeddings);
        }
      };
      worker.onerror = event => {
        event.preventDefault();
        fail(new Error(event.message || 'The local AI worker could not start.'));
      };
      worker.onmessageerror = () => fail(new Error('The local AI worker returned an unreadable message.'));
      try {
        worker.postMessage(texts);
      } catch (error) {
        fail(new Error('Could not send tabs to the local AI worker.', { cause: error }));
      }
    });
  }

  dispose(): void {
    this.rejectPending?.(new Error('The local AI worker was stopped.'));
    this.worker?.terminate();
    this.worker = undefined;
  }
}
