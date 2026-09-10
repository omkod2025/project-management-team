'use client';

import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
} from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import './bell.css';

/**
 * The notification bell (spec 11 §4, §6).
 *
 * Split in two on purpose, because the halves belong to different owners:
 *
 *   - **`NotificationsProvider`** is rendered once by the signed-in group's
 *     layout. It owns the poll, the count, the tab title and the slip — none of
 *     which any individual page should know about, and all of which have to
 *     survive navigating between pages.
 *   - **`Bell`** is the button and its leaf, and each page places it in its own
 *     header, immediately before its view nav. It has to be the page's own
 *     element rather than a corner-fixed overlay: every page here draws its own
 *     header with its own controls, and a floating control belonging to none of
 *     them reads as bolted on — and did in fact land on top of the List's
 *     "Sign out" button on the first attempt.
 *
 * The layout still decides whether *any* of this exists, which is the reason
 * the route group is there: the published document page `/d/[token]`, which a
 * stranger holding a link may open, sits outside it and cannot show a bell
 * however a page inside it is written.
 *
 * The count is polled rather than pushed. There is no realtime anything in this
 * codebase, and a socket would mean a long-lived connection per reader and a
 * proxy that must not buffer it (spec 08), in exchange for turning a worst case
 * of one minute into zero.
 */

type Item = {
  id: string;
  text: string;
  nodeName: string;
  projectName: string;
  href: string;
  createdAt: string;
  read: boolean;
};

type Bag = {
  unread: number;
  items: Item[] | null;
  busy: boolean;
  load: () => Promise<void>;
  follow: (item: Item) => Promise<void>;
  clearAll: () => Promise<void>;
};

const Notifications = createContext<Bag | null>(null);

const POLL_MS = 60_000;

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<Item[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [slip, setSlip] = useState(0);

  // What the last poll saw, so a rise can be told from a steady state. A ref
  // rather than state: comparing against it must not itself schedule a render.
  const seen = useRef<number | null>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications?count=1', { cache: 'no-store' });
      if (!res.ok) return;
      const { unread: n } = (await res.json()) as { unread: number };
      setUnread(n);
      // Only a *rise* raises the slip. Reading something lowers the count, and
      // a page that announced "1 new" every time you dealt with one would be
      // announcing your own actions back at you.
      if (seen.current !== null && n > seen.current) setSlip(n - seen.current);
      seen.current = n;
    } catch {
      // A failed poll is not worth telling anybody about: the next one is a
      // minute away and the count on screen is still the last true answer.
    }
  }, []);

  useEffect(() => {
    void poll();
    const t = setInterval(() => { void poll(); }, POLL_MS);
    return () => clearInterval(t);
  }, [poll]);

  /* The tab title carries the count too, so a reader working in another tab has
     some chance of noticing. The route is a dependency because Next rewrites
     the title from the new route's metadata on every client-side navigation —
     without it, following a notification silently dropped the count from the
     tab until the next poll a minute later. The query string counts as well as
     the path: a notification into the project already on screen changes only
     `?node=`. */
  useEffect(() => {
    const base = 'T-Timeline';
    document.title = unread > 0 ? `(${unread}) ${base}` : base;
    return () => { document.title = base; };
  }, [unread, pathname, search]);

  const load = useCallback(async () => {
    setBusy(true);
    setSlip(0);
    try {
      const res = await fetch('/api/notifications', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as { unread: number; items: Item[] };
      setItems(data.items);
      setUnread(data.unread);
      seen.current = data.unread;
    } finally {
      setBusy(false);
    }
  }, []);

  /**
   * Follow one through.
   *
   * The mark-read is awaited before navigating rather than fired alongside it:
   * the destination is often a different project, so it is a full page load,
   * and a request still in flight when the document is torn down is a request
   * that may never arrive.
   */
  const follow = useCallback(async (item: Item) => {
    if (!item.read) {
      try {
        const res = await fetch(`/api/notifications/${item.id}`, { method: 'POST' });
        if (res.ok) {
          const { unread: n } = (await res.json()) as { unread: number };
          setUnread(n);
          seen.current = n;
        }
      } catch {
        // Failing to mark it read is not a reason to refuse to open the task.
      }
    }
    setItems((list) => list?.map((i) => (i.id === item.id ? { ...i, read: true } : i)) ?? null);
    router.push(item.href);
  }, [router]);

  const clearAll = useCallback(async () => {
    await fetch('/api/notifications', { method: 'POST' });
    setUnread(0);
    seen.current = 0;
    setItems((list) => list?.map((i) => ({ ...i, read: true })) ?? null);
  }, []);

  const bag: Bag = { unread, items, busy, load, follow, clearAll };

  return (
    <Notifications.Provider value={bag}>
      {slip > 0 && (
        <div className="noti-slip" role="status">
          <span className="noti-slip-text">
            {slip === 1 ? 'You have been assigned a task.' : `You have been assigned ${slip} tasks.`}
          </span>
          <button type="button" className="noti-slip-open" onClick={() => { void load(); }}>
            Refresh
          </button>
          <button type="button" onClick={() => setSlip(0)}>Dismiss</button>
        </div>
      )}
      {children}
    </Notifications.Provider>
  );
}

/**
 * The bell itself. Rendered by each page, in its own header, before its nav.
 *
 * Renders nothing outside the provider — which means outside the signed-in
 * group — so a page moved out of the group goes quiet rather than crashing on
 * a stranger's screen.
 */
export default function Bell() {
  const bag = useContext(Notifications);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  /* A leaf closes when attention leaves it — pointer elsewhere, or Escape. */
  useEffect(() => {
    if (!open) return;
    function away(e: MouseEvent) {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    }
    function key(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  if (!bag) return null;
  const { unread, items, busy, load, follow, clearAll } = bag;

  return (
    <div className="noti" ref={box}>
      <button
        type="button"
        className="noti-bell"
        aria-expanded={open}
        aria-label={unread === 0 ? 'Notifications' : `Notifications, ${unread} unread`}
        onClick={() => {
          if (open) { setOpen(false); return; }
          setOpen(true);
          void load();
        }}
      >
        <BellMark />
        {/* Indigo, the product's base pair — never vermilion. Vermilion means
            out of closure and nothing else (DESIGN.md § Colors rule 1) and an
            unread count is not a variance. */}
        {unread > 0 && <span className="noti-count figure">{unread > 99 ? '99+' : unread}</span>}
      </button>

      {open && (
        <div className="noti-leaf">
          <div className="noti-leaf-head">
            <span>Notifications</span>
            {unread > 0 && (
              <button type="button" className="noti-clear" onClick={() => { void clearAll(); }}>
                Mark all read
              </button>
            )}
          </div>

          {busy && items === null && <p className="noti-empty" role="status">Loading…</p>}

          {items !== null && items.length === 0 && (
            <p className="noti-empty">
              Nothing yet. You will be told here when somebody puts your name on a task.
            </p>
          )}

          {items !== null && items.length > 0 && (
            <ul className="noti-list">
              {items.map((item) => (
                <li key={item.id} className={item.read ? 'noti-item' : 'noti-item noti-unread'}>
                  <a
                    href={item.href}
                    onClick={(e) => { e.preventDefault(); setOpen(false); void follow(item); }}
                  >
                    <span className="noti-text">{item.text}</span>
                    <span className="noti-meta">
                      <span className="noti-project">{item.projectName}</span>
                      <span className="noti-when figure">{ago(item.createdAt)}</span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** Drawn rather than an icon font, like the List's chevron. */
function BellMark() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true" focusable="false">
      <path d="M3.5 11.5V7a4 4 0 0 1 8 0v4.5M2 11.5h11M6 13h3"
        fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M7.5 3V1.8" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

/**
 * How long ago, in the coarsest unit that is still true.
 *
 * Deliberately not a formatted timestamp: the question a bell answers is "is
 * this still current", and "3d" answers it in less space than a date.
 */
function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}
