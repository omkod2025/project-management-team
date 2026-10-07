'use client';

import {
  cloneElement, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ComponentPropsWithRef, type ReactElement, type ReactNode, type RefObject,
} from 'react';
import { flushSync } from 'react-dom';

type Watch = (row: HTMLTableRowElement, update: (visible: boolean) => void) => () => void;
const RowVisibility = createContext<Watch | null>(null);

/** One observer for the whole table; scrolling doesn't update ListView state. */
export function LazyRows({ root, children }: { root: RefObject<HTMLDivElement | null>; children: ReactNode }) {
  const callbacks = useRef(new Map<HTMLTableRowElement, (visible: boolean) => void>());
  const observer = useRef<IntersectionObserver | null>(null);
  const watch = useCallback<Watch>((row, update) => {
    callbacks.current.set(row, update);
    if (typeof IntersectionObserver === 'undefined') update(true);
    observer.current?.observe(row);
    return () => { observer.current?.unobserve(row); callbacks.current.delete(row); };
  }, []);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') {
      callbacks.current.forEach(update => update(true));
      return;
    }
    const waiting = new Map<HTMLTableRowElement, number>();
    let frame = 0;
    let disposed = false;
    const renderNext = () => {
      frame = 0;
      if (disposed) return;
      const next = [...waiting].sort((a, b) => a[1] - b[1])[0];
      if (!next) return;
      waiting.delete(next[0]);
      const update = callbacks.current.get(next[0]);
      // Commit one newly visible row before yielding to the next paint.
      // Focused/edited rows bypass this queue so input never waits behind it.
      if (update && next[0].isConnected) flushSync(() => update(true));
      if (waiting.size) frame = requestAnimationFrame(renderNext);
    };
    const instance = new IntersectionObserver(entries => {
      const viewport = root.current?.getBoundingClientRect();
      for (const entry of entries) {
        const row = entry.target as HTMLTableRowElement;
        const update = callbacks.current.get(row);
        if (!entry.isIntersecting) {
          waiting.delete(row);
          update?.(false);
        } else {
          // Rows actually on screen come before the overscan buffer.
          const box = entry.boundingClientRect;
          const distance = !viewport ? 0 : Math.max(viewport.top - box.bottom, box.top - viewport.bottom, 0);
          waiting.set(row, distance);
        }
      }
      if (waiting.size && !frame) frame = requestAnimationFrame(renderNext);
    }, { root: root.current, rootMargin: '600px 0px' });
    observer.current = instance;
    callbacks.current.forEach((_, row) => instance.observe(row));
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      waiting.clear();
      instance.disconnect();
      observer.current = null;
    };
  }, [root]);
  return <RowVisibility.Provider value={watch}>{children}</RowVisibility.Provider>;
}

export default function LazyTableRow({ id, columns, estimatedHeight, pinned, children }: {
  id?: string; columns: number; estimatedHeight: number; pinned: boolean;
  children: () => ReactElement<ComponentPropsWithRef<'tr'>>;
}) {
  const watch = useContext(RowVisibility);
  const row = useRef<HTMLTableRowElement>(null);
  const height = useRef(estimatedHeight);
  const [nearby, setNearby] = useState(false);
  const [hasFocus, setHasFocus] = useState(false);
  const active = nearby || pinned || hasFocus;
  useEffect(() => {
    if (!row.current || !watch) return;
    return watch(row.current, setNearby);
  }, [watch]);
  useEffect(() => {
    if (!active || !row.current) return;
    const element = row.current;
    const measure = () => {
      // Editors can temporarily make a row much taller. Keep the resting
      // height so closing an offscreen editor does not leave a large gap.
      if (element.querySelector('td.editing')) return;
      height.current = element.getBoundingClientRect().height || estimatedHeight;
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [active, estimatedHeight]);
  // The factory avoids constructing every Cell element for offscreen rows.
  const content = useMemo(() => active ? children() : null, [active, children]);
  if (!content) return <tr key="row" ref={row} id={id} className="lazy-row-placeholder" aria-hidden="true" data-row-mounted="false">
    <td colSpan={columns} style={{ height: height.current }} />
  </tr>;
  return cloneElement(content, {
    key: 'row',
    ref: row,
    'data-row-mounted': 'true',
    onFocusCapture: () => setHasFocus(true),
    onBlurCapture: event => setHasFocus(event.currentTarget.contains(event.relatedTarget as Node | null)),
  } as ComponentPropsWithRef<'tr'>);
}
