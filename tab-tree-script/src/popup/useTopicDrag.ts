import { useRef, useState } from 'react';
import type { PointerEvent } from 'react';

export function useTopicDrag(
  start: (topic: string) => void,
  move: (topic: string) => void,
  finish: (tab?: number) => void,
) {
  const pointer = useRef<number | undefined>(undefined);
  const [hoveredTab, setHoveredTab] = useState<number>();

  function end(event: PointerEvent<HTMLElement>, commit: boolean) {
    if (pointer.current !== event.pointerId) return;
    pointer.current = undefined;
    setHoveredTab(undefined);
    const host = event.currentTarget;
    if (host.hasPointerCapture(event.pointerId)) host.releasePointerCapture(event.pointerId);
    const tab = commit ? hit(event)?.closest<HTMLElement>('[data-tab-id]') : undefined;
    finish(tab && host.contains(tab) ? Number(tab.dataset.tabId) : undefined);
  }

  function hit(event: PointerEvent<HTMLElement>) {
    return document.elementFromPoint(event.clientX, event.clientY);
  }

  const handlers = {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      if (!event.isPrimary || event.button !== 0) return;
      const topic = hit(event)?.closest<HTMLElement>('[data-topic-id]')?.dataset.topicId;
      if (!topic) return;
      event.preventDefault();
      pointer.current = event.pointerId;
      event.currentTarget.setPointerCapture(event.pointerId);
      start(topic);
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      if (pointer.current !== event.pointerId) return;
      if (!(event.buttons & 1)) {
        end(event, false);
        return;
      }
      const element = hit(event);
      const topic = element?.closest<HTMLElement>('[data-topic-id]')?.dataset.topicId;
      if (topic) move(topic);
      const tab = element?.closest<HTMLElement>('[data-tab-id]')?.dataset.tabId;
      setHoveredTab(tab === undefined ? undefined : Number(tab));
    },
    onPointerUp: (event: PointerEvent<HTMLElement>) => end(event, true),
    onPointerCancel: (event: PointerEvent<HTMLElement>) => end(event, false),
    onLostPointerCapture(event: PointerEvent<HTMLElement>) {
      // Chromium can drop capture while the extension surface expands.
      if (!(event.buttons & 1)) end(event, false);
    },
  };
  return { hoveredTab, handlers };
}
