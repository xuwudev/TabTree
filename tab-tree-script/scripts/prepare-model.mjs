import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';

const repository = 'Xenova/all-MiniLM-L6-v2';
const revision = '751bff37182d3f1213fa05d7196b954e230abad9';
const upstream = `https://huggingface.co/${repository}/resolve/${revision}/`;
const root = new URL(`../.model-cache/${repository}/`, import.meta.url);
const weights = 'onnx/model_quantized.onnx';
const weightsHash = 'afdb6f1a0e45b715d0bb9b11772f032c399babd23bfc31fed1c170afc848bdb1';

const files = {
  'config.json': upstream + 'config.json',
  'tokenizer.json': upstream + 'tokenizer.json',
  'tokenizer_config.json': upstream + 'tokenizer_config.json',
  'README.md': upstream + 'README.md',
  'LICENSE': 'https://www.apache.org/licenses/LICENSE-2.0.txt',
  [weights]: upstream + weights,
};

function verify(file, bytes) {
  if (!bytes.length) throw new Error('File is empty');
  if (file.endsWith('.json')) JSON.parse(bytes.toString());
  if (file === weights && createHash('sha256').update(bytes).digest('hex') !== weightsHash) {
    throw new Error('Model checksum mismatch');
  }
}

await Promise.all(Object.entries(files).map(async ([file, url]) => {
  const target = new URL(file, root);
  try {
    verify(file, await readFile(target));
    return;
  } catch {
    // Missing or incomplete cache entries are downloaded again.
  }

  console.log(`Downloading ${file}`);
  const temporary = new URL(`${file}.${process.pid}.part`, root);
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(180_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    verify(file, bytes);
    await mkdir(new URL('.', target), { recursive: true });
    await writeFile(temporary, bytes);
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw new Error(`Could not prepare ${file} from ${url}: ${error.message}`, { cause: error });
  }
}));
