import { handleMcp } from '@/lib/wiki-mcp';

/**
 * The wiki's MCP endpoint (wiki spec §7): Streamable HTTP, stateless, JSON
 * responses. Bearer token only — this route never calls `handle()` or
 * `currentUserId()`, so a session cookie reaches nothing here.
 */
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  return handleMcp(req);
}

/** No server-initiated stream and no session to end in stateless mode. */
const notAllowed = () => new Response(null, { status: 405, headers: { Allow: 'POST' } });

export async function GET() {
  return notAllowed();
}

export async function DELETE() {
  return notAllowed();
}
