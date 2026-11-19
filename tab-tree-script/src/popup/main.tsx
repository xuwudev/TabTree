import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import { TabPalette } from './Palette';
import '../ui/styles.css';
import './palette.css';

const root = document.getElementById('root')!;
const embedded = window.top !== window;

async function mount() {
  if (!embedded) {
    document.documentElement.classList.add('toolbar-popup');
    createRoot(root).render(<TabPalette dismiss={() => window.close()} />);
    return;
  }

  const token = window.location.hash.slice(1);
  if (!token) return;
  const session = await chrome.runtime.sendMessage({ type: 'tabtree:authorize', token }) as { windowId?: number } | undefined;
  if (session?.windowId === undefined) return;

  new ResizeObserver(() => {
    window.parent.postMessage({ type: 'tabtree:size', height: root.getBoundingClientRect().height }, '*');
  }).observe(root);
  createRoot(root).render(<TabPalette targetWindow={session.windowId}
    dismiss={() => window.parent.postMessage({ type: 'tabtree:dismiss' }, '*')} />);
}

void mount().catch(error => console.error('Could not initialize the TabTree bar', error));
