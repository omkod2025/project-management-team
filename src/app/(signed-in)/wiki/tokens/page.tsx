import { redirect } from 'next/navigation';

/**
 * Tokens moved out of the Wiki when a token became system-wide (central MCP
 * tokens design): one token can now reach List, Docs and the Wiki. The old
 * address is kept as a redirect so bookmarks and the guide's links still land.
 */
export default function WikiTokensPage() {
  redirect('/tokens');
}
