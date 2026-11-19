import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

export function useButtonCursor(surface: RefObject<HTMLElement | null>) {
  const cursor = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const container = surface.current;
    const circle = cursor.current;
    if (!container || !circle) return;

    const motion = window.matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference) and (forced-colors: none)');
    let hovered: HTMLButtonElement | null = null;
    let visible = false;

    const leaveButton = () => {
      hovered?.removeAttribute('data-cursor-fill');
      hovered = null;
    };

    const hide = () => {
      leaveButton();
      visible = false;
      container.removeAttribute('data-circle-cursor');
      circle.removeAttribute('data-merged');
    };

    const move = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || !motion.matches) {
        if (visible) hide();
        return;
      }

      // Pointer capture can retarget events to the bar during a drag.
      const hit = document.elementFromPoint(event.clientX, event.clientY);
      const button = hit?.closest<HTMLButtonElement>('button:enabled') ?? null;
      if (!hit || !container.contains(hit) ||
          (!button && hit.closest('input, textarea, [contenteditable], :disabled, :popover-open'))) {
        if (visible) hide();
        return;
      }

      if (!visible) {
        visible = true;
        container.setAttribute('data-circle-cursor', '');
      }
      circle.style.transform = `translate3d(${event.clientX}px, ${event.clientY}px, 0)`;

      if (button === hovered) return;
      leaveButton();
      circle.toggleAttribute('data-merged', !!button);
      if (!button) return;

      const bounds = button.getBoundingClientRect();
      const x = event.clientX - bounds.left;
      const y = event.clientY - bounds.top;
      const radius = Math.hypot(Math.max(x, bounds.width - x), Math.max(y, bounds.height - y)) + 1;
      button.style.setProperty('--cursor-origin', `${x}px ${y}px`);
      button.style.setProperty('--cursor-radius', `${radius}px`);
      // Commit the starting shape before expanding so the fill begins at the pointer.
      void getComputedStyle(button, '::before').clipPath;
      button.setAttribute('data-cursor-fill', '');
      hovered = button;
    };

    container.addEventListener('pointermove', move, { passive: true });
    container.addEventListener('pointerleave', hide);
    container.addEventListener('pointercancel', hide);
    window.addEventListener('blur', hide);
    motion.addEventListener('change', hide);
    return () => {
      hide();
      container.removeEventListener('pointermove', move);
      container.removeEventListener('pointerleave', hide);
      container.removeEventListener('pointercancel', hide);
      window.removeEventListener('blur', hide);
      motion.removeEventListener('change', hide);
    };
  }, [surface]);

  return cursor;
}
