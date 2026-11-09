import { redirect } from 'next/navigation';

/**
 * The guide moved with Tokens / MCP out of the Wiki (central MCP tokens
 * design): it now covers List, Docs and the Wiki together. The old address
 * is kept as a redirect so bookmarks and any link still pointing here land.
 */
export default function WikiTokensGuidePage() {
  redirect('/tokens/guide');
}
