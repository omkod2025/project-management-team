/**
 * Pure wiki rule tests (wiki plan Task 2).
 *
 * Covers the §5a role/visibility matrix, token effective-scope computation,
 * input parsing, the bearer/token shapes, search term/snippet handling, the
 * LIKE escape, and the in-memory rate limiter.
 */

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  isInstallAdmin, wikiRole, canSeeWiki, canWriteWiki, canManageWiki, wikiAbilities,
  parseNewWiki, parseMemberGrant, parseMemberRef, parseWikiUpdate, assertNotOwner, isUuid,
  TOKEN_PREFIX, MAX_ACTIVE_TOKENS, newTokenSecret, hashTokenSecret, bearerSecret,
  effectiveTokenWikis, parseTokenInput, tokenStatus, shouldTouchLastUsed, parseTokenIds,
  searchTerms, likePattern, searchSnippet, takeRateSlot, publicWikiToken, pageSearchText,
  parsePageSlug, generatedPageSlug, parseNewWikiPage, parsePageMove, pageBreadcrumb,
  type WikiViewer, type WikiFacts,
} from '../src/lib/wiki-rules.ts';
import { PROTECTED_EMAIL } from '../src/lib/admin-rules.ts';
import { DomainError } from '../src/lib/errors.ts';
import { encodeRich } from '../src/lib/doc-rich-content.ts';

function refuses(code: string, fn: () => unknown) {
  assert.throws(fn, (err: unknown) => {
    assert.ok(err instanceof DomainError, `expected a DomainError, got ${String(err)}`);
    assert.equal(err.code, code);
    return true;
  });
}

const OWNER_ID = '11111111-1111-1111-1111-111111111111';
const READ_MEMBER_ID = '22222222-2222-2222-2222-222222222222';
const WRITE_MEMBER_ID = '33333333-3333-3333-3333-333333333333';
const STRANGER_ID = '44444444-4444-4444-4444-444444444444';
const INSTALL_ID = '55555555-5555-5555-5555-555555555555';

function viewer(userId: string, email: string, active = true): WikiViewer {
  return { userId, email, active };
}

describe('isInstallAdmin', () => {
  test('active install email, any case or padding', () => {
    assert.equal(isInstallAdmin(viewer(INSTALL_ID, ` ${PROTECTED_EMAIL.toUpperCase()} `)), true);
  });

  test('inactive install email is not the install admin', () => {
    assert.equal(isInstallAdmin(viewer(INSTALL_ID, PROTECTED_EMAIL, false)), false);
  });

  test('any other email is not the install admin', () => {
    assert.equal(isInstallAdmin(viewer(STRANGER_ID, 'member@cit.com')), false);
  });
});

describe('§5a — the role and visibility matrix', () => {
  const liveWiki: WikiFacts = { ownerId: OWNER_ID, archived: false, memberAccess: null };

  test('the install admin sees and manages a wiki owned by someone else', () => {
    const v = viewer(INSTALL_ID, PROTECTED_EMAIL);
    assert.equal(wikiRole(v, liveWiki), 'install');
    assert.equal(canSeeWiki(v, liveWiki), true);
    assert.equal(canWriteWiki(v, liveWiki), true);
    assert.equal(canManageWiki(v, liveWiki), true);
  });

  test('a read member can see but not write or manage', () => {
    const w: WikiFacts = { ...liveWiki, memberAccess: 'read' };
    const v = viewer(READ_MEMBER_ID, 'reader@cit.com');
    assert.equal(wikiRole(v, w), 'read');
    assert.equal(canSeeWiki(v, w), true);
    assert.equal(canWriteWiki(v, w), false);
    assert.equal(canManageWiki(v, w), false);
  });

  test('a write member can see and write but not manage', () => {
    const w: WikiFacts = { ...liveWiki, memberAccess: 'write' };
    const v = viewer(WRITE_MEMBER_ID, 'writer@cit.com');
    assert.equal(wikiRole(v, w), 'write');
    assert.equal(canSeeWiki(v, w), true);
    assert.equal(canWriteWiki(v, w), true);
    assert.equal(canManageWiki(v, w), false);
  });

  test('the owner can see, write and manage', () => {
    const v = viewer(OWNER_ID, 'owner@cit.com');
    assert.equal(wikiRole(v, liveWiki), 'owner');
    assert.equal(canSeeWiki(v, liveWiki), true);
    assert.equal(canWriteWiki(v, liveWiki), true);
    assert.equal(canManageWiki(v, liveWiki), true);
  });

  test('a stranger sees nothing', () => {
    const v = viewer(STRANGER_ID, 'stranger@cit.com');
    assert.equal(wikiRole(v, liveWiki), null);
    assert.equal(canSeeWiki(v, liveWiki), false);
    assert.equal(canWriteWiki(v, liveWiki), false);
    assert.equal(canManageWiki(v, liveWiki), false);
  });

  test('any inactive viewer sees nothing, even the owner or install admin', () => {
    for (const v of [
      viewer(OWNER_ID, 'owner@cit.com', false),
      viewer(INSTALL_ID, PROTECTED_EMAIL, false),
      viewer(READ_MEMBER_ID, 'reader@cit.com', false),
    ]) {
      assert.equal(wikiRole(v, { ...liveWiki, memberAccess: 'read' }), null);
      assert.equal(canSeeWiki(v, { ...liveWiki, memberAccess: 'read' }), false);
    }
  });

  test('an archived wiki: owner and install admin can see it, write/read members cannot, and nobody may write', () => {
    const archived: WikiFacts = { ownerId: OWNER_ID, archived: true, memberAccess: 'write' };
    const owner = viewer(OWNER_ID, 'owner@cit.com');
    const install = viewer(INSTALL_ID, PROTECTED_EMAIL);
    const writeMember = viewer(WRITE_MEMBER_ID, 'writer@cit.com');
    const readMember = viewer(READ_MEMBER_ID, 'reader@cit.com');

    assert.equal(canSeeWiki(owner, archived), true);
    assert.equal(canSeeWiki(install, archived), true);
    assert.equal(canSeeWiki(writeMember, archived), false);
    assert.equal(canSeeWiki({ ...readMember }, { ...archived, memberAccess: 'read' }), false);

    assert.equal(canWriteWiki(owner, archived), false);
    assert.equal(canWriteWiki(install, archived), false);
    assert.equal(canWriteWiki(writeMember, archived), false);
  });
});

describe('wikiAbilities — what the screens draw', () => {
  test('agrees with canWriteWiki and canManageWiki for every role, live and archived', () => {
    const cases: Array<[WikiViewer, WikiFacts['memberAccess']]> = [
      [viewer(INSTALL_ID, PROTECTED_EMAIL), null],
      [viewer(OWNER_ID, 'owner@cit.com'), null],
      [viewer(WRITE_MEMBER_ID, 'writer@cit.com'), 'write'],
      [viewer(READ_MEMBER_ID, 'reader@cit.com'), 'read'],
    ];
    for (const archived of [false, true]) {
      for (const [v, memberAccess] of cases) {
        const facts: WikiFacts = { ownerId: OWNER_ID, archived, memberAccess };
        const role = wikiRole(v, facts)!;
        assert.deepEqual(wikiAbilities(role, archived), {
          canWrite: canWriteWiki(v, facts), canManage: canManageWiki(v, facts),
        }, `${role}, archived=${archived}`);
      }
    }
  });
});

describe('parseNewWiki', () => {
  test('a valid title and description pass through trimmed', () => {
    assert.deepEqual(parseNewWiki({ title: '  Runbook  ', description: ' notes ' }), {
      title: 'Runbook', description: 'notes',
    });
  });

  test('description is optional: absent or null becomes empty', () => {
    assert.deepEqual(parseNewWiki({ title: 'Runbook' }), { title: 'Runbook', description: '' });
    assert.deepEqual(parseNewWiki({ title: 'Runbook', description: null }), { title: 'Runbook', description: '' });
  });

  test('an empty title throws E_INVALID_DOC', () => {
    refuses('E_INVALID_DOC', () => parseNewWiki({ title: '   ' }));
    refuses('E_INVALID_DOC', () => parseNewWiki({}));
    refuses('E_INVALID_DOC', () => parseNewWiki(null));
  });

  test('a 200-character title passes, a 201-character title throws', () => {
    assert.equal(parseNewWiki({ title: 'x'.repeat(200) }).title.length, 200);
    refuses('E_INVALID_DOC', () => parseNewWiki({ title: 'x'.repeat(201) }));
  });

  test('a 1000-character description passes, a 1001-character description throws', () => {
    const result = parseNewWiki({ title: 'Runbook', description: 'x'.repeat(1000) });
    assert.equal(result.description.length, 1000);
    refuses('E_INVALID_DOC', () => parseNewWiki({ title: 'Runbook', description: 'x'.repeat(1001) }));
  });

  test('a non-string description throws E_INVALID_DOC', () => {
    refuses('E_INVALID_DOC', () => parseNewWiki({ title: 'Runbook', description: 42 }));
    refuses('E_INVALID_DOC', () => parseNewWiki({ title: 'Runbook', description: {} }));
  });
});

describe('parseMemberGrant', () => {
  test('a valid grant passes through', () => {
    assert.deepEqual(parseMemberGrant({ userId: READ_MEMBER_ID, access: 'read' }), {
      userId: READ_MEMBER_ID, access: 'read',
    });
  });

  test('a malformed user id throws E_INVALID_DOC', () => {
    refuses('E_INVALID_DOC', () => parseMemberGrant({ userId: 'not-a-uuid', access: 'read' }));
    refuses('E_INVALID_DOC', () => parseMemberGrant({ userId: '', access: 'read' }));
    refuses('E_INVALID_DOC', () => parseMemberGrant({}));
  });

  test('an invalid access value throws E_INVALID_DOC', () => {
    refuses('E_INVALID_DOC', () => parseMemberGrant({ userId: READ_MEMBER_ID, access: 'admin' }));
  });
});

describe('parseMemberRef', () => {
  test('a uuid passes; anything else is E_INVALID_DOC', () => {
    assert.deepEqual(parseMemberRef({ userId: READ_MEMBER_ID }), { userId: READ_MEMBER_ID });
    refuses('E_INVALID_DOC', () => parseMemberRef({ userId: 'x' }));
    refuses('E_INVALID_DOC', () => parseMemberRef(null));
  });
});

describe('parseWikiUpdate', () => {
  test('each action parses to its own shape, trimmed', () => {
    assert.deepEqual(parseWikiUpdate({ action: 'rename', title: '  คู่มือ  ' }), { action: 'rename', title: 'คู่มือ' });
    assert.deepEqual(parseWikiUpdate({ action: 'describe', description: ' d ' }), { action: 'describe', description: 'd' });
    assert.deepEqual(parseWikiUpdate({ action: 'describe' }), { action: 'describe', description: '' });
    assert.deepEqual(parseWikiUpdate({ action: 'archive' }), { action: 'archive' });
    assert.deepEqual(parseWikiUpdate({ action: 'restore' }), { action: 'restore' });
    assert.deepEqual(parseWikiUpdate({ action: 'transfer', userId: OWNER_ID }), { action: 'transfer', userId: OWNER_ID });
  });

  test('the same limits as creating apply', () => {
    refuses('E_INVALID_DOC', () => parseWikiUpdate({ action: 'rename', title: '  ' }));
    refuses('E_INVALID_DOC', () => parseWikiUpdate({ action: 'rename', title: 'x'.repeat(201) }));
    refuses('E_INVALID_DOC', () => parseWikiUpdate({ action: 'describe', description: 'x'.repeat(1001) }));
    refuses('E_INVALID_DOC', () => parseWikiUpdate({ action: 'transfer', userId: 'nope' }));
  });

  test('an unknown or missing action is refused', () => {
    refuses('E_INVALID_DOC', () => parseWikiUpdate({ action: 'delete' }));
    refuses('E_INVALID_DOC', () => parseWikiUpdate({}));
  });
});

describe('assertNotOwner', () => {
  test('refuses the owner, allows anyone else', () => {
    refuses('E_INVALID_DOC', () => assertNotOwner(OWNER_ID, OWNER_ID));
    assertNotOwner(READ_MEMBER_ID, OWNER_ID);
    assertNotOwner(READ_MEMBER_ID, null);
  });
});

describe('isUuid', () => {
  test('shape only', () => {
    assert.equal(isUuid(OWNER_ID), true);
    assert.equal(isUuid('not-a-uuid'), false);
    assert.equal(isUuid(''), false);
  });
});

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

  describe('effectiveTokenWikis', () => {
    const now = new Date('2026-11-04T12:00:00Z');
    const live = { revokedAt: null, expiresAt: null, ownerActive: true };

    test('intersects scopes with what is currently visible', () => {
      assert.deepEqual(effectiveTokenWikis(live, ['a', 'b', 'c'], new Set(['a', 'c']), now), ['a', 'c']);
    });

    test('a revoked token reads nothing', () => {
      assert.deepEqual(
        effectiveTokenWikis({ ...live, revokedAt: new Date('2026-01-01') }, ['a'], new Set(['a']), now),
        [],
      );
    });

    test('an expired token reads nothing', () => {
      assert.deepEqual(
        effectiveTokenWikis({ ...live, expiresAt: new Date('2026-01-01') }, ['a'], new Set(['a']), now),
        [],
      );
    });

    test('an inactive owner reads nothing', () => {
      assert.deepEqual(
        effectiveTokenWikis({ ...live, ownerActive: false }, ['a'], new Set(['a']), now),
        [],
      );
    });

    test('visibility regained later includes the wiki again', () => {
      assert.deepEqual(effectiveTokenWikis(live, ['a', 'b'], new Set(['a']), now), ['a']);
      assert.deepEqual(effectiveTokenWikis(live, ['a', 'b'], new Set(['a', 'b']), now), ['a', 'b']);
    });
  });

  describe('tokenStatus', () => {
    const now = new Date('2026-11-04T12:00:00Z');
    test('live, revoked and expired', () => {
      assert.equal(tokenStatus({ revokedAt: null, expiresAt: null }, now), 'active');
      assert.equal(tokenStatus({ revokedAt: null, expiresAt: new Date('2026-12-01') }, now), 'active');
      assert.equal(tokenStatus({ revokedAt: null, expiresAt: now }, now), 'expired');
      assert.equal(tokenStatus({ revokedAt: new Date('2026-01-01'), expiresAt: new Date('2026-02-01') }, now), 'revoked');
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

  describe('parseTokenInput', () => {
    const visible = new Set([OWNER_ID, READ_MEMBER_ID]);

    test('a valid token input passes through', () => {
      const result = parseTokenInput({ label: 'laptop', wikiIds: [OWNER_ID] }, visible);
      assert.equal(result.label, 'laptop');
      assert.deepEqual(result.wikiIds, [OWNER_ID]);
      assert.equal(result.expiresAt, null);
    });

    test('a wiki outside what is visible throws E_NOT_FOUND', () => {
      refuses('E_NOT_FOUND', () => parseTokenInput({ label: 'laptop', wikiIds: [STRANGER_ID] }, visible));
    });

    test('a malformed wiki id also throws E_NOT_FOUND, not E_INVALID_DOC', () => {
      refuses('E_NOT_FOUND', () => parseTokenInput({ label: 'laptop', wikiIds: ['not-a-uuid'] }, visible));
    });

    test('an empty label throws E_INVALID_DOC', () => {
      refuses('E_INVALID_DOC', () => parseTokenInput({ label: '  ', wikiIds: [] }, visible));
    });

    test('a 101-character label throws', () => {
      refuses('E_INVALID_DOC', () => parseTokenInput({ label: 'x'.repeat(101), wikiIds: [] }, visible));
    });

    test('dedupes wiki ids', () => {
      const result = parseTokenInput({ label: 'laptop', wikiIds: [OWNER_ID, OWNER_ID] }, visible);
      assert.deepEqual(result.wikiIds, [OWNER_ID]);
    });

    test('expiresAt accepts a future ISO date', () => {
      const future = new Date(Date.now() + 86_400_000).toISOString();
      const result = parseTokenInput({ label: 'laptop', wikiIds: [], expiresAt: future }, visible);
      assert.ok(result.expiresAt instanceof Date);
    });

    test('expiresAt rejects a past date', () => {
      refuses('E_INVALID_DOC', () => parseTokenInput(
        { label: 'laptop', wikiIds: [], expiresAt: '2000-01-01T00:00:00Z' },
        visible,
      ));
    });

    test('expiresAt rejects garbage', () => {
      refuses('E_INVALID_DOC', () => parseTokenInput(
        { label: 'laptop', wikiIds: [], expiresAt: 'not-a-date' },
        visible,
      ));
    });
  });
});

describe('search', () => {
  test('searchTerms trims, splits, dedupes, and drops empties', () => {
    assert.deepEqual(searchTerms('  ปลั๊ก   ไฟ ปลั๊ก '), ['ปลั๊ก', 'ไฟ']);
  });

  test('searchTerms on an empty or blank query is []', () => {
    assert.deepEqual(searchTerms(''), []);
    assert.deepEqual(searchTerms('   '), []);
    assert.deepEqual(searchTerms(undefined), []);
    assert.deepEqual(searchTerms(null), []);
  });

  test('nine distinct words become eight terms', () => {
    const words = Array.from({ length: 9 }, (_, i) => `w${i}`);
    assert.equal(searchTerms(words.join(' ')).length, 8);
  });

  test('likePattern escapes backslash, percent and underscore', () => {
    assert.equal(likePattern('50%_a\\b'), '%50\\%\\_a\\\\b%');
  });

  test('likePattern leaves a quote untouched — it is bound, not escaped', () => {
    const result = likePattern("'); DROP TABLE pmt_wikis; --");
    assert.ok(result.includes("'"));
    assert.ok(result.startsWith('%'));
    assert.ok(result.endsWith('%'));
  });

  test('searchSnippet centres the window on the first match', () => {
    const text = 'x'.repeat(500) + 'NEEDLE' + 'y'.repeat(500);
    const snippet = searchSnippet(text, ['needle'], 200);
    assert.ok(snippet.includes('NEEDLE'));
    assert.ok(snippet.startsWith('…'));
    assert.ok(snippet.endsWith('…'));
    assert.ok(snippet.length <= 202);
  });

  test('searchSnippet near the start adds no leading ellipsis', () => {
    const text = 'NEEDLE' + 'y'.repeat(500);
    const snippet = searchSnippet(text, ['needle'], 200);
    assert.ok(!snippet.startsWith('…'));
    assert.ok(snippet.endsWith('…'));
  });

  test('searchSnippet near the end adds no trailing ellipsis', () => {
    const text = 'x'.repeat(500) + 'NEEDLE';
    const snippet = searchSnippet(text, ['needle'], 200);
    assert.ok(snippet.startsWith('…'));
    assert.ok(!snippet.endsWith('…'));
  });

  test('searchSnippet on short text with no cuts has no ellipsis at all', () => {
    const text = 'a short bit of text with NEEDLE in it';
    const snippet = searchSnippet(text, ['needle'], 200);
    assert.equal(snippet, text);
  });
});

describe('takeRateSlot', () => {
  test('the 60th hit is allowed, the 61st is refused', () => {
    const now = 1_000_000;
    let hits: number[] = Array.from({ length: 59 }, (_, i) => now - i);
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

describe('publicWikiToken', () => {
  test('is a base64url string of reasonable length, and never repeats', () => {
    const a = publicWikiToken();
    const b = publicWikiToken();
    assert.match(a, /^[A-Za-z0-9_-]{40,}$/);
    assert.notEqual(a, b);
  });
});

describe('pageSearchText', () => {
  const mermaid = 'graph TD\n  A[เริ่ม] --> B{"ok?"}';
  const body = encodeRich({ type: 'doc', content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'ปลั๊ก' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'ใช้ไฟ', marks: [{ type: 'bold' }] }] },
    { type: 'codeBlock', attrs: { language: 'mermaid' }, content: [{ type: 'text', text: mermaid }] },
  ] });

  test('a rich body gives its words and the Mermaid source, never its JSON', () => {
    const text = pageSearchText('หน้าแรก', body);
    assert.ok(text.includes('ปลั๊ก'));
    assert.ok(text.includes('ใช้ไฟ'));
    assert.ok(text.includes('หน้าแรก'), 'the title is searchable');
    assert.ok(text.includes('A[เริ่ม] --> B{"ok?"}'), 'Mermaid source kept verbatim');
    assert.ok(!text.includes('"type"'));
    assert.ok(!text.includes('fieldbook-rich-v1'));
  });

  test('Markdown syntax is stripped from the prose', () => {
    const text = pageSearchText('t', '## หัวข้อ\n\n**หนา** and [ลิงก์](https://x.test) - item');
    assert.ok(!text.includes('##'));
    assert.ok(!text.includes('**'));
    assert.ok(text.includes('หัวข้อ'));
    assert.ok(text.includes('ลิงก์'));
  });
});

describe('page input', () => {
  test('a blank slug means generate; a chosen slug is lowercased and checked', () => {
    assert.equal(parsePageSlug(undefined), null);
    assert.equal(parsePageSlug('  '), null);
    assert.equal(parsePageSlug('Level-Two'), 'level-two');
    refuses('E_INVALID_DOC', () => parsePageSlug('ปลั๊ก'));
    refuses('E_INVALID_DOC', () => parsePageSlug("a'; --"));
    refuses('E_INVALID_DOC', () => parsePageSlug('a--b'));
    assert.match(generatedPageSlug(), /^page-[0-9a-f]{8}$/);
  });

  test('a new page needs a title; parent and move targets must be ids', () => {
    refuses('E_INVALID_DOC', () => parseNewWikiPage({ title: ' ' }));
    refuses('E_INVALID_DOC', () => parseNewWikiPage({ title: 'x', parentId: 'nope' }));
    assert.deepEqual(parseNewWikiPage({ title: ' ก ' }), { title: 'ก', slug: null, parentId: null, body: undefined });
    assert.deepEqual(parsePageMove({ parentId: null }), { parentId: null, beforeId: null });
    refuses('E_INVALID_DOC', () => parsePageMove({ parentId: 'x' }));
  });
});

describe('breadcrumb (MCP read_page)', () => {
  const pages = [
    { id: 'a', parentId: null, title: 'หนึ่ง' },
    { id: 'b', parentId: 'a', title: 'สอง' },
    { id: 'c', parentId: 'b', title: 'สาม' },
    { id: 'd', parentId: 'missing', title: 'กำพร้า' },
  ];

  test('ancestors from the top down, not including the page itself', () => {
    assert.deepEqual(pageBreadcrumb(pages, 'c'), ['หนึ่ง', 'สอง']);
    assert.deepEqual(pageBreadcrumb(pages, 'a'), []);
  });

  test('a parent that is not among the pages ends the trail; a cycle cannot loop', () => {
    assert.deepEqual(pageBreadcrumb(pages, 'd'), []);
    const cyclic = [{ id: 'x', parentId: 'y', title: 'X' }, { id: 'y', parentId: 'x', title: 'Y' }];
    assert.deepEqual(pageBreadcrumb(cyclic, 'x'), ['Y']);
  });
});
