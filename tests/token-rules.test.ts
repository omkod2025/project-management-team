/**
 * Pure token rule tests (central MCP tokens Task 1).
 *
 * Covers the shared token/secret/status/rate-limiter helpers moved out of
 * `wiki-rules.ts`, plus the new module registry and per-module grant/scope
 * rules that the rest of the central MCP tokens work builds on.
 */

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  TOKEN_PREFIX, MAX_ACTIVE_TOKENS, newTokenSecret, hashTokenSecret, bearerSecret,
  type TokenFacts, type TokenStatus, tokenStatus, LAST_USED_GRANULARITY_MS, shouldTouchLastUsed,
  parseTokenIds, takeRateSlot,
  TOKEN_MODULES, parseTokenGrants, hasModule, hasGrant, grantRows, grantsFromRows,
  parseTokenScope, normalizeScope, scopeKindsInUse, parseTokenBasics, effectiveScope,
  type TokenGrants, type TokenScope, type Visible,
} from '../src/lib/token-rules.ts';
import { DomainError } from '../src/lib/errors.ts';

function refuses(code: string, fn: () => unknown) {
  assert.throws(fn, (err: unknown) => {
    assert.ok(err instanceof DomainError, `expected a DomainError, got ${String(err)}`);
    assert.equal(err.code, code);
    return true;
  });
}

const OWNER_ID = '11111111-1111-1111-1111-111111111111';
const STRANGER_ID = '44444444-4444-4444-4444-444444444444';
const PROJECT_ID = '66666666-6666-6666-6666-666666666666';
const WIKI_ID = '77777777-7777-7777-7777-777777777777';

/* ----------------------------------------------------------------- tokens */

describe('tokens', () => {
  test('TOKEN_PREFIX and MAX_ACTIVE_TOKENS', () => {
    assert.equal(TOKEN_PREFIX, 'pmw_');
    assert.equal(MAX_ACTIVE_TOKENS, 20);
  });

  test('newTokenSecret shapes the secret, hash and prefix, and never repeats', () => {
    const a = newTokenSecret();
    const b = newTokenSecret();
    assert.match(a.secret, /^pmw_[A-Za-z0-9_-]{43}$/);
    assert.equal(a.hash, hashTokenSecret(a.secret));
    assert.equal(a.prefix, a.secret.slice(4, 12));
    assert.notEqual(a.secret, b.secret);
  });

  test('bearerSecret extracts the token from a well-formed header', () => {
    const secret = 'pmw_' + 'A'.repeat(43);
    assert.equal(bearerSecret(`Bearer ${secret}`), secret);
  });

  test('bearerSecret refuses everything else', () => {
    const secret = 'pmw_' + 'A'.repeat(43);
    assert.equal(bearerSecret(secret), null); // missing "Bearer "
    assert.equal(bearerSecret('Bearer pmw_' + 'A'.repeat(42)), null); // wrong length
    assert.equal(bearerSecret('connect.sid=s%3Aabc123'), null); // cookie-like
    assert.equal(bearerSecret(null), null);
  });

  describe('tokenStatus', () => {
    const now = new Date('2026-11-04T12:00:00Z');
    test('live, revoked and expired', () => {
      assert.equal(tokenStatus({ revokedAt: null, expiresAt: null }, now), 'active');
      assert.equal(tokenStatus({ revokedAt: null, expiresAt: new Date('2026-12-01') }, now), 'active');
      assert.equal(tokenStatus({ revokedAt: null, expiresAt: now }, now), 'expired');
      assert.equal(tokenStatus({ revokedAt: new Date('2026-01-01'), expiresAt: new Date('2026-02-01') }, now), 'revoked');
    });

    test('the type is exported', () => {
      const status: TokenStatus = 'active';
      assert.equal(status, 'active');
    });
  });

  describe('shouldTouchLastUsed', () => {
    const now = new Date('2026-11-04T12:00:00Z');
    test('never used, or more than 60 s ago, is touched; within 60 s is not', () => {
      assert.equal(shouldTouchLastUsed(null, now), true);
      assert.equal(shouldTouchLastUsed(new Date(now.getTime() - 61_000), now), true);
      assert.equal(shouldTouchLastUsed(new Date(now.getTime() - 60_000), now), false);
      assert.equal(shouldTouchLastUsed(new Date(now.getTime() - 5_000), now), false);
    });

    test('LAST_USED_GRANULARITY_MS is a minute', () => {
      assert.equal(LAST_USED_GRANULARITY_MS, 60_000);
    });
  });

  describe('parseTokenIds', () => {
    test('dedupes a list of strings', () => {
      assert.deepEqual(parseTokenIds({ tokenIds: [OWNER_ID, OWNER_ID] }), [OWNER_ID]);
      assert.deepEqual(parseTokenIds({ tokenIds: [] }), []);
    });
    test('a missing list or a non-string entry is E_INVALID_DOC', () => {
      refuses('E_INVALID_DOC', () => parseTokenIds({}));
      refuses('E_INVALID_DOC', () => parseTokenIds({ tokenIds: [1] }));
      refuses('E_INVALID_DOC', () => parseTokenIds(null));
    });
    test('a malformed id is E_NOT_FOUND, like a token that is not yours', () => {
      refuses('E_NOT_FOUND', () => parseTokenIds({ tokenIds: ['nope'] }));
    });
  });
});

describe('takeRateSlot', () => {
  test('the 60th hit is allowed, the 61st is refused', () => {
    const now = 1_000_000;
    const hits: number[] = Array.from({ length: 59 }, (_, i) => now - i);
    const sixtieth = takeRateSlot(hits, now);
    assert.equal(sixtieth.allowed, true);
    assert.equal(sixtieth.hits.length, 60);

    const sixtyFirst = takeRateSlot(sixtieth.hits, now);
    assert.equal(sixtyFirst.allowed, false);
    assert.equal(sixtyFirst.hits.length, 60);
  });

  test('a hit 60,001 ms after the oldest is allowed again', () => {
    const oldest = 1_000_000;
    const hits: number[] = Array.from({ length: 60 }, (_, i) => oldest + i);
    const later = oldest + 60_001;
    const result = takeRateSlot(hits, later);
    assert.equal(result.allowed, true);
  });
});

/* -------------------------------------------------------- module registry */

describe('TOKEN_MODULES', () => {
  test('keys, in order', () => {
    assert.deepEqual(TOKEN_MODULES.map((m) => m.key), ['list', 'docs', 'wiki']);
  });

  test('every permission key is well-shaped and unique within its module, and none is "read"', () => {
    const keyRe = /^[a-z][a-z0-9_]{0,31}$/;
    for (const mod of TOKEN_MODULES) {
      const keys = mod.permissions.map((p) => p.key);
      assert.equal(new Set(keys).size, keys.length, `duplicate permission key in ${mod.key}`);
      for (const key of keys) {
        assert.match(key, keyRe, `${mod.key}.${key} is not well-shaped`);
        assert.notEqual(key, 'read', `${mod.key} must not declare a "read" permission`);
      }
    }
  });
});

describe('parseTokenGrants', () => {
  test('a valid grants object passes through, with duplicates collapsed', () => {
    assert.deepEqual(parseTokenGrants({ list: ['create_task'], wiki: [] }), { list: ['create_task'], wiki: [] });
    assert.deepEqual(parseTokenGrants({ list: ['create_task', 'create_task'] }), { list: ['create_task'] });
  });

  test('{} is allowed and gives {}', () => {
    assert.deepEqual(parseTokenGrants({}), {});
  });

  test('an unknown module throws E_INVALID_DOC', () => {
    refuses('E_INVALID_DOC', () => parseTokenGrants({ defects: [] }));
  });

  test('an unknown permission throws E_INVALID_DOC', () => {
    refuses('E_INVALID_DOC', () => parseTokenGrants({ list: ['delete_task'] }));
  });

  test('"read" in a list throws E_INVALID_DOC', () => {
    refuses('E_INVALID_DOC', () => parseTokenGrants({ list: ['read'] }));
  });

  test('a non-object throws E_INVALID_DOC', () => {
    refuses('E_INVALID_DOC', () => parseTokenGrants(null));
    refuses('E_INVALID_DOC', () => parseTokenGrants('nope'));
    refuses('E_INVALID_DOC', () => parseTokenGrants([]));
    refuses('E_INVALID_DOC', () => parseTokenGrants(42));
  });
});

describe('hasModule and hasGrant', () => {
  test('a present key with no permissions is read-only', () => {
    const g: TokenGrants = { docs: [] };
    assert.equal(hasModule(g, 'docs'), true);
    assert.equal(hasGrant(g, 'docs', 'create_doc'), false);
  });

  test('an absent module has no module and no grant', () => {
    const g: TokenGrants = {};
    assert.equal(hasModule(g, 'docs'), false);
    assert.equal(hasGrant(g, 'docs', 'create_doc'), false);
  });

  test('a granted permission is reported', () => {
    const g: TokenGrants = { docs: ['create_doc'] };
    assert.equal(hasGrant(g, 'docs', 'create_doc'), true);
    assert.equal(hasGrant(g, 'docs', 'write_page'), false);
  });
});

describe('grantRows and grantsFromRows', () => {
  test('grantRows includes the implied read row first', () => {
    assert.deepEqual(grantRows({ wiki: ['create_page'] }), [
      { module: 'wiki', permission: 'read' },
      { module: 'wiki', permission: 'create_page' },
    ]);
  });

  test('grantsFromRows ignores an unknown module', () => {
    assert.deepEqual(grantsFromRows([{ module: 'defects', permission: 'read' }]), {});
  });

  test('round-trips through rows', () => {
    const g: TokenGrants = { list: ['create_task', 'write_task'], wiki: [] };
    assert.deepEqual(grantsFromRows(grantRows(g)), g);
  });

  test('grantsFromRows ignores an unknown permission within a known module', () => {
    assert.deepEqual(grantsFromRows([{ module: 'wiki', permission: 'read' }, { module: 'wiki', permission: 'delete' }]), { wiki: [] });
  });
});

describe('parseTokenScope', () => {
  const visible: Visible = { project: new Set([PROJECT_ID]), wiki: new Set([WIKI_ID]) };

  test('an uppercase visible uuid is lowercased and kept', () => {
    const result = parseTokenScope({ projectIds: [PROJECT_ID.toUpperCase()] }, visible);
    assert.deepEqual(result.projectIds, [PROJECT_ID]);
  });

  test('a malformed id throws E_NOT_FOUND', () => {
    refuses('E_NOT_FOUND', () => parseTokenScope({ projectIds: ['not-a-uuid'] }, visible));
  });

  test('an id not in visible throws E_NOT_FOUND, indistinguishably', () => {
    refuses('E_NOT_FOUND', () => parseTokenScope({ projectIds: [STRANGER_ID] }, visible));
  });

  test('a missing key gives []', () => {
    const result = parseTokenScope({}, visible);
    assert.deepEqual(result, { projectIds: [], wikiIds: [] });
  });

  test('dedupes within each list', () => {
    const result = parseTokenScope({ wikiIds: [WIKI_ID, WIKI_ID] }, visible);
    assert.deepEqual(result.wikiIds, [WIKI_ID]);
  });
});

describe('scopeKindsInUse', () => {
  test('the wiki module uses wiki scope', () => {
    assert.deepEqual(scopeKindsInUse({ wiki: [] }), new Set(['wiki']));
  });

  test('list and docs both use project scope, counted once', () => {
    assert.deepEqual(scopeKindsInUse({ list: [], docs: [] }), new Set(['project']));
  });

  test('every module uses both kinds', () => {
    assert.deepEqual(scopeKindsInUse({ list: ['write_task'], wiki: ['create_page'] }), new Set(['project', 'wiki']));
  });

  test('no module uses no scope', () => {
    assert.deepEqual(scopeKindsInUse({}), new Set());
  });
});

describe('normalizeScope', () => {
  const stored: TokenScope = { projectIds: [PROJECT_ID], wikiIds: [WIKI_ID] };

  test('a wiki-only grant drops project ids', () => {
    assert.deepEqual(normalizeScope({ wiki: [] }, stored), { projectIds: [], wikiIds: [WIKI_ID] });
  });

  test('a list-only grant keeps project ids and drops wiki ids', () => {
    assert.deepEqual(normalizeScope({ list: [] }, stored), { projectIds: [PROJECT_ID], wikiIds: [] });
  });

  test('no grants at all drops everything', () => {
    assert.deepEqual(normalizeScope({}, stored), { projectIds: [], wikiIds: [] });
  });

  test('a grant on both scope kinds keeps both', () => {
    assert.deepEqual(normalizeScope({ docs: [], wiki: [] }, stored), stored);
  });
});

describe('effectiveScope', () => {
  const now = new Date('2026-11-04T12:00:00Z');
  const live: TokenFacts = { revokedAt: null, expiresAt: null, ownerActive: true };
  const stored: TokenScope = { projectIds: [PROJECT_ID], wikiIds: [WIKI_ID] };
  const visible: Visible = { project: new Set([PROJECT_ID]), wiki: new Set([WIKI_ID]) };

  test('revoked gives nothing', () => {
    assert.deepEqual(
      effectiveScope({ ...live, revokedAt: new Date('2026-01-01') }, stored, visible, now),
      { projectIds: [], wikiIds: [] },
    );
  });

  test('expired gives nothing', () => {
    assert.deepEqual(
      effectiveScope({ ...live, expiresAt: new Date('2026-01-01') }, stored, visible, now),
      { projectIds: [], wikiIds: [] },
    );
  });

  test('an inactive owner gives nothing', () => {
    assert.deepEqual(
      effectiveScope({ ...live, ownerActive: false }, stored, visible, now),
      { projectIds: [], wikiIds: [] },
    );
  });

  test('otherwise each list is intersected with what is visible, deduplicated and order-preserving', () => {
    const otherProject = '88888888-8888-8888-8888-888888888888';
    const wideStored: TokenScope = { projectIds: [otherProject, PROJECT_ID, PROJECT_ID], wikiIds: [WIKI_ID] };
    assert.deepEqual(effectiveScope(live, wideStored, visible, now), { projectIds: [PROJECT_ID], wikiIds: [WIKI_ID] });
  });
});

describe('parseTokenBasics', () => {
  test('a valid label and no expiry passes through', () => {
    const result = parseTokenBasics({ label: 'laptop' });
    assert.equal(result.label, 'laptop');
    assert.equal(result.expiresAt, null);
  });

  test('a blank label throws E_INVALID_DOC', () => {
    refuses('E_INVALID_DOC', () => parseTokenBasics({ label: '  ' }));
  });

  test('101 characters throws', () => {
    refuses('E_INVALID_DOC', () => parseTokenBasics({ label: 'x'.repeat(101) }));
  });

  test('a Thai label of 100 characters passes', () => {
    const label = 'ก'.repeat(100);
    const result = parseTokenBasics({ label });
    assert.equal(result.label, label);
  });

  test('expiresAt accepts a future ISO date', () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const result = parseTokenBasics({ label: 'laptop', expiresAt: future });
    assert.ok(result.expiresAt instanceof Date);
  });

  test('expiresAt rejects a past date', () => {
    refuses('E_INVALID_DOC', () => parseTokenBasics({ label: 'laptop', expiresAt: '2000-01-01T00:00:00Z' }));
  });

  test('expiresAt rejects garbage', () => {
    refuses('E_INVALID_DOC', () => parseTokenBasics({ label: 'laptop', expiresAt: 'not-a-date' }));
  });

  test('expiresAt null or absent gives null', () => {
    assert.equal(parseTokenBasics({ label: 'laptop', expiresAt: null }).expiresAt, null);
    assert.equal(parseTokenBasics({ label: 'laptop' }).expiresAt, null);
  });
});
