'use client';

import { useState } from 'react';

const copyIcon = (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="5.5" y="5.5" width="8" height="8" />
    <path d="M10.5 5.5v-3h-8v8h3" />
  </svg>
);
const doneIcon = (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M3 8.5l3 3 7-7" />
  </svg>
);

/**
 * Copies a block's source text. The clipboard can refuse (no permission, an
 * insecure origin, a locked-down browser); the button says so rather than
 * throw. With `icon`, the button is drawn as an icon and the label becomes
 * its accessible name and tooltip.
 */
export default function CopySourceButton({ source, label, className, icon = false }: {
  source: string;
  label: string;
  className: string;
  icon?: boolean;
}) {
  const [shown, setShown] = useState(label);
  const copy = () => {
    navigator.clipboard
      .writeText(source)
      .then(() => setShown('Copied'), () => setShown('Copy failed'))
      .finally(() => setTimeout(() => setShown(label), 2000));
  };
  if (icon) {
    return (
      <button type="button" className={className} onClick={copy} aria-label={shown} title={shown}>
        {shown === 'Copied' ? doneIcon : copyIcon}
      </button>
    );
  }
  return <button type="button" className={className} onClick={copy}>{shown}</button>;
}
