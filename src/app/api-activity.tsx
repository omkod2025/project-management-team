'use client';

import { useEffect, useState } from 'react';
import { isApiRequest, takeQuiet } from '@/lib/api-activity-rules';
import './api-activity.css';

/** Below this a request reads as instant, and a bar would only flicker. */
const SHOW_AFTER_MS = 150;
/** How long the finished bar takes to run out and fade. Matches the CSS. */
const SETTLE_MS = 240;

type Phase = 'idle' | 'busy' | 'done';

const WRAPPED = Symbol.for('t-timeline.api-activity');

/**
 * The page-wide activity bar: a 2px blue line across the top of the window
 * while any call to the app's own API is in flight. It is the floor under
 * every action, including the ones with no button to spin — a cell committed
 * in the List, a bar dragged on the Timeline, a title renamed in place.
 * Buttons that started a call say so themselves with `aria-busy` (globals.css);
 * this bar only says "the server is working", so it is decorative to a screen
 * reader.
 *
 * It wraps `window.fetch` once, for the life of the tab. Which requests count
 * is decided in `src/lib/api-activity-rules.ts`.
 */
export default function ApiActivity() {
  const [phase, setPhase] = useState<Phase>('idle');

  useEffect(() => {
    const host = window as typeof window & { [WRAPPED]?: true };
    if (host[WRAPPED]) return;
    host[WRAPPED] = true;

    const original = window.fetch.bind(window);
    let inFlight = 0;
    let showTimer: ReturnType<typeof setTimeout> | undefined;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;

    const begin = () => {
      inFlight += 1;
      if (inFlight > 1) return;
      clearTimeout(settleTimer);
      showTimer = setTimeout(() => {
        document.documentElement.dataset.apiBusy = '';
        setPhase('busy');
      }, SHOW_AFTER_MS);
    };
    const end = () => {
      inFlight = Math.max(0, inFlight - 1);
      if (inFlight > 0) return;
      clearTimeout(showTimer);
      delete document.documentElement.dataset.apiBusy;
      setPhase((p) => (p === 'busy' ? 'done' : 'idle'));
      settleTimer = setTimeout(() => setPhase('idle'), SETTLE_MS);
    };

    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const { quiet, headers } = takeQuiet(init?.headers);
      const sent = quiet ? { ...init, headers } : init;
      if (quiet || !isApiRequest(url, window.location.origin)) return original(input, sent);
      begin();
      return original(input, sent).finally(end);
    };
    // Never unwrapped: the wrap is per tab, and a dev-mode remount must not
    // stack a second one over the first. The symbol guards that.
  }, []);

  return <div className="api-activity" data-phase={phase} aria-hidden="true" />;
}
