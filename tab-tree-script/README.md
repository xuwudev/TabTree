# TabTree

TabTree is an Edge-first Manifest V3 extension that organizes the current window's open tabs into a full-width topic bar. A folder-based side panel is also available.

## Build and load in Edge

1. From the repository root, run the following with Node.js 22.12+ and npm.

   ```powershell
   cd tab-tree-script
   npm ci
   npm run build
   ```

   The first build downloads a pinned, checksum-verified quantized MiniLM model and caches it in `.model-cache/`. The production package in `dist/` includes the model, tokenizer, worker, and ONNX Runtime WebAssembly files. Subsequent builds can reuse the cache.

2. Open `edge://extensions` and enable **Developer mode**.
3. Choose **Load unpacked**, then select `tab-tree-script/dist` (the folder containing the generated `manifest.json`).
4. Pin **TabTree** from the extensions menu and click its toolbar icon to show the bar. Reload the extension from the extensions page after rebuilding.

Chrome uses the same package. Follow the same steps at `chrome://extensions`.

## Use

- Click the pinned icon or press **Alt+Shift+Y** to show the full-width bar below the browser controls. Browser settings and other pages that block overlays use a compact toolbar popup in the same browser window.
- Hover over or focus a group to reveal its trash icon in the bar or side panel. The confirmation lists the open tabs to close and the saved pages to remove. Pinned tabs and browser-internal pages stay open.
- Press and hold a topic. Its tabs appear immediately. Keep the button held, move to a tab, and release to switch. Sweep across another topic while holding to change the revealed tabs. Releasing elsewhere cancels the selection.
- Local AI uses representative tab titles to name topics. The bar flattens each topic into one row of choices, and the **Open side panel** button opens the searchable folder explorer.

### Side panel

- To keep one live web tab, go to the page you want to keep, open the side panel, and choose **Park other tabs** from the **Tab actions** menu. The confirmation saves the active page and the eligible background tabs, then closes only the background tabs you confirmed. Pinned tabs and browser-internal pages stay open.
- Saved pages appear in the same topic bar and side-panel tree. Selecting one navigates the workspace tab to its URL. Use **Save page** to add the current page without closing anything.
- Parking stores URLs and titles locally across browser restarts. It saves addresses only, so a restored page loads again and unsaved edits may be lost. The browser manages any memory used for its own navigation caches. Parking is disabled in InPrivate and Incognito windows.

- The side panel lists the current window's tabs immediately. It organizes automatically after titles or URLs settle. **Organize tabs** in the **Tab actions** menu reruns grouping or retries after an AI error.
- Click a folder to expand or collapse it. Click a tab to switch to it, or hover or focus its row to show the close button.
- Search by title, domain, URL, or folder name. Search reveals matching tabs inside collapsed folders. Press **Esc** to clear it.
- TabTree uses a white background and black controls. It saves the generated tree and collapsed folders in extension storage for reopening the panel in the same browser window.

## Architecture

- `src/tabs/` reads Chrome's tab APIs, watches changes, and handles toolbar and tab actions.
- `src/ai/` defines the embedding provider interface and its dedicated worker implementation. The worker runs **Xenova/all-MiniLM-L6-v2** with q8 weights on WASM and caches up to 768 unique embedding inputs while the panel is open. A future Edge-native implementation can implement the same provider interface.
- `src/clustering/` computes cosine similarity and average-linkage agglomerative clusters. Both surfaces reuse the results to display named topics.
- `src/storage/` persists bar and side-panel layouts per browser window with `chrome.storage.local`.
- `src/popup/` renders the topic bar for both the isolated overlay and the toolbar popup.
- `src/ui/` renders and filters the React explorer.

AI uses tab titles and domains locally. Build-time downloads supply the model. Installed inference works offline without a backend, API key, or browser flags. Tab favicons use the URLs exposed by the browser.
