'use client';

import Link, { useLinkStatus } from 'next/link';
import { useEffect } from 'react';

function PendingStatus({ label, onPending }: { label: string; onPending?: (label: string | null) => void }) {
  const { pending } = useLinkStatus();
  useEffect(() => {
    if (!pending) return;
    onPending?.(label);
    return () => onPending?.(null);
  }, [pending, label, onPending]);
  return null;
}

export default function ListTabLink({ href, active, label, onPending }: {
  href: string; active: boolean; label: string; onPending?: (label: string | null) => void;
}) {
  return (
    <Link prefetch={false} href={href} aria-current={active ? 'page' : undefined} aria-label={label}>
      {label}
      <PendingStatus label={label} onPending={onPending} />
    </Link>
  );
}
