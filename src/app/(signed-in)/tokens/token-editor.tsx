'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { TokenRow } from '@/lib/access-tokens';
import type { VisibleProject } from '@/lib/project-access';
import type { WikiRole } from '@/lib/wiki-rules';
import GuideLink from './guide-link';
import TokenStepper from './token-stepper';
import type { CreatedToken } from './token-api';

type Wiki = { id: string; title: string; role: WikiRole };

function mcpConfig(origin: string, secret: string): string {
  return JSON.stringify({
    mcpServers: { 't-timeline': { type: 'http', url: `${origin}/api/mcp`, headers: { Authorization: `Bearer ${secret}` } } },
  }, null, 2);
}

const mcpCommand = (origin: string, secret: string) =>
  `claude mcp add --transport http t-timeline ${origin}/api/mcp --header "Authorization: Bearer ${secret}"`;

function CopyBlock({ label, text }: { label: string; text: string }) {
  const [state, setState] = useState('');
  return <div className="tk-snippet">
    <div className="tk-snippet-head">
      <span>{label}</span>
      <button type="button" className="tk-btn" onClick={() => {
        void navigator.clipboard.writeText(text)
          .then(() => setState('Copied.'))
          .catch(() => setState('Could not copy. Select the text and copy it.'));
      }}>Copy</button>
    </div>
    <pre><code>{text}</code></pre>
    <p className="tk-copied" role="status">{state}</p>
  </div>;
}

/** Shown once, straight after creation. Leaving or pressing Done loses it for good. */
function SecretPanel({ created, origin, onDone }: { created: CreatedToken; origin: string; onDone: () => void }) {
  return <section className="tk-panel tk-secret" aria-labelledby="tk-secret-head">
    <h2 id="tk-secret-head">Copy your token now</h2>
    <p>This is the only time “{created.token.label}” is shown in full. It is not stored and cannot be shown again.</p>
    <CopyBlock label="Token" text={created.secret} />
    <CopyBlock label="MCP client config (JSON)" text={mcpConfig(origin, created.secret)} />
    <CopyBlock label="Claude Code" text={mcpCommand(origin, created.secret)} />
    <p className="tk-guide-line">Claude Desktop, VS Code, Cursor and troubleshooting, in a new tab so this token stays on screen: <GuideLink newTab /></p>
    <div className="tk-foot"><span /><button type="button" className="tk-primary" onClick={onDone}>Done, I have copied it</button></div>
  </section>;
}

/**
 * The stepper on a page of its own (`/tokens/new`, `/tokens/<id>/edit`).
 * A create ends on the secret, shown once, on this same page; a save, a
 * cancel or Done goes back to the list.
 */
export default function TokenEditor({ origin, projects, wikis, token }: {
  origin: string; projects: VisibleProject[]; wikis: Wiki[]; token?: TokenRow;
}) {
  const router = useRouter();
  const [created, setCreated] = useState<CreatedToken | null>(null);
  const back = () => { router.push('/tokens'); router.refresh(); };

  if (created) return <SecretPanel created={created} origin={origin} onDone={back} />;
  return <section className="tk-panel" aria-label={token ? 'Edit token' : 'Make a token'}>
    <TokenStepper projects={projects} wikis={wikis} token={token}
      onDone={(result) => (result ? setCreated(result) : back())} />
  </section>;
}
