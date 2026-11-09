import Link from 'next/link';

/** The connection guide, in Thai. Beside a secret it opens in a new tab, because leaving the page loses the secret. */
export default function GuideLink({ newTab = false }: { newTab?: boolean }) {
  return <Link className="tk-btn tk-guide-link" href="/tokens/guide"
    {...(newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>How to connect</Link>;
}
