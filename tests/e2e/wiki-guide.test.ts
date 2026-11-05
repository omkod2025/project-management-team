/**
 * The MCP connection guide (wiki Task 11): one Markdown source, shown in the
 * repo at docs/guides/wiki-mcp.md and inside the app at /wiki/tokens/guide.
 *
 * The page tests defend that the in-app copy names the real origin rather
 * than a placeholder, and that it is for signed-in people only.
 *
 * The example tests defend the guide against drift: every JSON block must
 * parse, and every way the guide tells a client to connect — the
 * `claude mcp add` command, the Claude Desktop bridge config, and the
 * VS Code / Cursor `mcp.json` — is turned into the URL and header it would
 * send and used in a real `initialize` call with a fresh token. If the
 * endpoint path or the header form changes and the guide does not, this
 * fails.
 */

import test, { before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setup, signIn, makeUser, BASE_URL, type Fixture, type Jar } from '../helpers/harness.ts';

const GUIDE = new URL('../../docs/guides/wiki-mcp.md', import.meta.url);

let fx: Fixture;
let jar: Jar;
let secret = '';
let guide = '';

before(async () => {
  fx = await setup();
  const user = await makeUser(fx.client, 'guide');
  jar = await signIn(user.email, user.password);
  // Missing guide reads as empty, so each test fails on its own assertion.
  guide = await readFile(GUIDE, 'utf8').catch(() => '');
  // A token with no wiki still authenticates: `initialize` needs no scope.
  const res = await fetch(`${BASE_URL}/api/wiki-tokens`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: jar.header },
    body: JSON.stringify({ label: 'guide examples', wikiIds: [] }),
  });
  const body = await res.json() as { secret: string };
  assert.equal(res.status, 200, JSON.stringify(body));
  secret = body.secret;
});

after(async () => {
  await fx?.cleanup();
});

/** Every fenced block in the guide, with its info-string language. */
function fences(markdown: string): Array<{ lang: string; code: string }> {
  return [...markdown.matchAll(/^```([\w-]*)[^\n]*\n([\s\S]*?)^```\s*$/gm)]
    .map((m) => ({ lang: m[1]!.toLowerCase(), code: m[2]! }));
}

/** The guide's placeholders filled in the way a reader would fill them. */
const fill = (s: string) => s.replaceAll('<origin>', BASE_URL).replaceAll('<secret>', secret);

/** `initialize` with exactly the URL and header a client following the guide would send. */
async function initialize(url: string, header: { name: string; value: string }) {
  const res = await fetch(url, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      [header.name]: header.value,
    },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'guide-e2e', version: '0' } },
    }),
  });
  const text = await res.text();
  assert.equal(res.status, 200, `${url}: ${text}`);
  assert.equal(JSON.parse(text).result.serverInfo.name, 't-timeline-wiki');
}

/** "Name: value" or "Name:value", split on the first colon the way clients do. */
function splitHeader(raw: string) {
  const at = raw.indexOf(':');
  assert.ok(at > 0, `a header needs a colon: ${raw}`);
  return { name: raw.slice(0, at).trim(), value: raw.slice(at + 1).trim() };
}

describe('the guide page', () => {
  test('a signed-in reader gets the guide with the real origin, never the placeholder', async () => {
    const res = await fetch(`${BASE_URL}/wiki/tokens/guide`, { headers: { cookie: jar.header }, redirect: 'manual' });
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes('claude mcp add'), 'the Claude Code command is on the page');
    assert.ok(html.includes(`${BASE_URL}/api/mcp`), 'the endpoint carries this server\'s own origin');
    assert.ok(!html.includes('&lt;origin&gt;') && !html.includes('<origin>'), 'no literal <origin> is left');
    assert.ok(html.includes('mcp-remote'), 'the Claude Desktop bridge is on the page');
  });

  test('signed out, the guide sends you to sign in', async () => {
    const res = await fetch(`${BASE_URL}/wiki/tokens/guide`, { redirect: 'manual' });
    assert.ok(res.status >= 300 && res.status < 400, `expected a redirect, got ${res.status}`);
    assert.match(res.headers.get('location') ?? '', /\/sign-in/);
  });

  test('the tokens page links to the guide', async () => {
    const res = await fetch(`${BASE_URL}/wiki/tokens`, { headers: { cookie: jar.header } });
    assert.equal(res.status, 200);
    assert.ok((await res.text()).includes('href="/wiki/tokens/guide"'));
  });
});

describe('the guide examples, against the real endpoint', () => {
  test('every JSON block parses', () => {
    const blocks = fences(guide).filter((f) => f.lang === 'json' || f.lang === 'jsonc');
    assert.ok(blocks.length >= 3, `expected the Desktop, VS Code and Cursor configs, found ${blocks.length} JSON blocks`);
    for (const b of blocks) assert.doesNotThrow(() => JSON.parse(b.code), b.code);
  });

  test('the claude mcp add command connects', async () => {
    const commands = fences(guide).flatMap((f) => f.code.split('\n')).filter((l) => l.trim().startsWith('claude mcp add'));
    assert.ok(commands.length >= 1, 'the guide gives a claude mcp add command');
    for (const line of commands) {
      const m = /claude mcp add --transport http (?:--scope user )?(\S+) (\S+) --header "([^"]+)"/.exec(fill(line));
      assert.ok(m, `the command matches the current Claude Code syntax: ${line}`);
      assert.match(m[3]!, /^Authorization: Bearer pmw_/);
      await initialize(m[2]!, splitHeader(m[3]!));
    }
  });

  test('every JSON config connects: the Desktop bridge, VS Code and Cursor', async () => {
    const configs = fences(guide).filter((f) => f.lang === 'json' || f.lang === 'jsonc')
      .map((f) => JSON.parse(fill(f.code)) as Record<string, Record<string, any>>);
    const seen = { bridge: 0, servers: 0, mcpServers: 0 };
    for (const config of configs) {
      for (const key of ['servers', 'mcpServers'] as const) {
        for (const server of Object.values(config[key] ?? {})) {
          seen[key]++;
          if (server.command === 'npx') {
            // Claude Desktop through mcp-remote: the header is in args with
            // ${WIKI_TOKEN} standing in for the env value.
            seen.bridge++;
            assert.equal(key, 'mcpServers', 'claude_desktop_config.json uses mcpServers');
            const args = server.args as string[];
            assert.ok(args.includes('mcp-remote'));
            const url = args.find((a) => a.startsWith('http'))!;
            const raw = args[args.indexOf('--header') + 1]!;
            assert.equal(raw, 'Authorization:${WIKI_TOKEN}');
            assert.match(server.env.WIKI_TOKEN, /^Bearer pmw_/);
            await initialize(url, splitHeader(raw.replace('${WIKI_TOKEN}', server.env.WIKI_TOKEN)));
          } else {
            assert.equal(server.type, 'http', 'a direct Streamable HTTP client says type "http"');
            const [name, value] = Object.entries(server.headers as Record<string, string>)[0]!;
            assert.equal(name, 'Authorization');
            assert.match(value, /^Bearer pmw_/);
            await initialize(server.url, { name, value });
          }
        }
      }
    }
    assert.ok(seen.bridge >= 1, 'a Claude Desktop config is given');
    assert.ok(seen.servers >= 1, 'a VS Code .vscode/mcp.json ({"servers": ...}) is given');
    assert.ok(seen.mcpServers - seen.bridge >= 1, 'a Cursor mcp.json ({"mcpServers": ...}) is given');
  });
});
