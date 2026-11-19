import { env, pipeline } from '@huggingface/transformers';
import type { FeatureExtractionPipeline } from '@huggingface/transformers';
import type { WorkerResponse } from './provider';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const MAX_CACHED_EMBEDDINGS = 768;
const BATCH_SIZE = 16;
const cache = new Map<string, Float32Array>();
let extractor: FeatureExtractionPipeline | undefined;

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = new URL('../models/', scope.location.href).href;
env.useBrowserCache = false;
const wasm = env.backends.onnx.wasm;
if (wasm) {
  // Clear Transformers.js's CDN override so ONNX Runtime uses Vite's packaged WASM asset.
  wasm.wasmPaths = undefined;
  // Inference already runs off the UI thread. Avoid nested workers and COOP/COEP requirements.
  wasm.numThreads = 1;
  wasm.proxy = false;
}

function send(message: WorkerResponse): void {
  scope.postMessage(message);
}

scope.onmessage = async ({ data: texts }: MessageEvent<string[]>) => {
  try {
    const results = new Map<string, Float32Array>();
    const unique = [...new Set(texts)];
    const missing = unique.filter(text => {
      const value = cache.get(text);
      if (value) {
        cache.delete(text);
        cache.set(text, value);
        results.set(text, value);
      }
      return !value;
    });

    if (missing.length && !extractor) {
      send({ type: 'progress', progress: { phase: 'loading' } });
      extractor = await pipeline<'feature-extraction'>('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
        device: 'wasm',
        dtype: 'q8',
      });
    }

    for (let offset = 0; offset < missing.length; offset += BATCH_SIZE) {
      const progress = { phase: 'embedding', completed: results.size, total: unique.length } as const;
      send({ type: 'progress', progress });
      const batch = missing.slice(offset, offset + BATCH_SIZE);
      const output = await extractor!(batch, { pooling: 'mean', normalize: true });
      const width = output.dims[1];
      const data = output.data as Float32Array;
      batch.forEach((text, i) => {
        const vector = data.slice(i * width, (i + 1) * width);
        results.set(text, vector);
        cache.set(text, vector);
      });
      while (cache.size > MAX_CACHED_EMBEDDINGS) {
        cache.delete(cache.keys().next().value!);
      }
    }

    send({ type: 'result', embeddings: texts.map(text => results.get(text)!) });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    send({ type: 'error', message: `Local AI could not organize tabs. ${detail}` });
  }
};
