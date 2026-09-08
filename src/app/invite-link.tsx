'use client';

import { useState } from 'react';
import './invite-link.css';

/**
 * The whole address, not the path.
 *
 * The admin has to send this to somebody through a different medium, and a
 * bare `/set-password?token=…` is not something that can be pasted into a chat
 * window and clicked. Built here rather than on the server because the origin
 * a person actually reaches this install on is the one in their address bar,
 * and only the browser knows it. Safe to read `window` — every caller runs this
 * inside an event handler, never during render.
 */
export function inviteUrl(token: string): string {
  return `${window.location.origin}/set-password?token=${encodeURIComponent(token)}`;
}

/**
 * The one-time link, with the one thing anybody does to it.
 *
 * The link is shown once and never again — the token is not readable back out
 * of the board — so the copy button is not a convenience. It is the difference
 * between handing the link over and having to delete the account and start
 * again. The address stays visible beside it: a button that reports "copied"
 * without showing what it copied asks to be trusted for no reason.
 */
export default function InviteLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <span className="token-line">
      <code>{url}</code>
      <button
        type="button"
        className="token-copy"
        onClick={() => {
          void navigator.clipboard.writeText(url).then(
            () => { setCopied(true); window.setTimeout(() => setCopied(false), 2000); },
            // Clipboard access can be refused outright. Leaving the button at
            // rest beats one that looks as though it worked.
            () => setCopied(false),
          );
        }}
      >
        {copied ? 'Copied' : 'Copy link'}
      </button>
    </span>
  );
}
