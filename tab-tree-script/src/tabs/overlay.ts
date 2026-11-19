// Chrome serializes this function into the isolated world. Keep it self-contained.
export function toggleOverlay(url: string): Promise<boolean> {
  const scope = globalThis as typeof globalThis & { tabTreeDismiss?: () => void };
  if (scope.tabTreeDismiss) {
    scope.tabTreeDismiss();
    return Promise.resolve(true);
  }

  return new Promise(resolve => {
    const host = document.createElement('div');
    host.style.cssText = 'all:initial!important;position:fixed!important;inset:0 auto auto 0!important;width:100vw!important;z-index:2147483647!important;display:block!important;';
    const frame = document.createElement('iframe');
    frame.title = 'TabTree topic bar';
    frame.style.cssText = 'display:block;width:100%;height:52px;border:0;color-scheme:only light;';
    const origin = new URL(url).origin;
    const timer = window.setTimeout(() => dismiss(false), 3200);
    const shadow = host.attachShadow({ mode: 'closed' });

    function dismiss(handled = true) {
      clearTimeout(timer);
      host.remove();
      delete scope.tabTreeDismiss;
      window.removeEventListener('message', receive);
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', escape, true);
      resolve(handled);
    }

    function receive(event: MessageEvent) {
      if (event.source !== frame.contentWindow || event.origin !== origin) return;
      if (event.data?.type === 'tabtree:dismiss') dismiss();
      if (event.data?.type !== 'tabtree:size' || !Number.isFinite(event.data.height)) return;
      clearTimeout(timer);
      frame.style.height = `${Math.max(44, Math.min(400, Math.ceil(event.data.height)))}px`;
      resolve(true);
    }

    function outside(event: Event) {
      if (!event.composedPath().includes(host)) dismiss();
    }

    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') dismiss();
    }

    scope.tabTreeDismiss = dismiss;
    window.addEventListener('message', receive);
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', escape, true);
    frame.src = url;
    shadow.append(frame);
    document.documentElement.append(host);
  });
}
