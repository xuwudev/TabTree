import tailwind from '@tailwindcss/vite';
import { cp, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  base: './',
  plugins: [
    tailwind(),
    {
      name: 'extension-assets',
      apply: 'build',
      async writeBundle({ dir }) {
        const output = resolve(dir ?? 'dist');
        await Promise.all([
          copyFile(resolve(root, 'manifest.json'), resolve(output, 'manifest.json')),
          copyFile(resolve(root, 'node_modules/@fontsource-variable/inter/LICENSE'), resolve(output, 'Inter-OFL.txt')),
          cp(resolve(root, 'icons'), resolve(output, 'icons'), { recursive: true }),
          cp(resolve(root, '.model-cache'), resolve(output, 'models'), { recursive: true }),
        ]);
      },
    },
  ],
  worker: { format: 'es' },
  build: {
    target: 'chrome120',
    rollupOptions: {
      input: {
        sidebar: resolve(root, 'sidebar/sidebar.html'),
        popup: resolve(root, 'popup/popup.html'),
        background: resolve(root, 'src/tabs/background.ts'),
      },
      output: {
        entryFileNames: chunk => chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js',
      },
    },
  },
});
