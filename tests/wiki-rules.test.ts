/**
 * Pure wiki rule tests (wiki plan Task 2).
 *
 * Covers the §5a role/visibility matrix, input parsing, search term/snippet
 * handling, and the LIKE escape. The token rules (effective scope, token
 * input, secrets, status, rate limiter) live in `tests/token-rules.test.ts`
 * alongside `src/lib/token-rules.ts`.
 */

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  isInstallAdmin, wikiRole, canSeeWiki, canWriteWiki, canManageWiki, canDeleteWiki, wikiAbilities,
  parseNewWiki, parseMemberGrants, parseMemberRef, parseMemberRefs, MEMBER_BATCH_MAX, parseWikiUpdate, assertNotOwner, isUuid,
  searchTerms, likePattern, searchSnippet, publicWikiToken, pageSearchText,
  parsePageSlug, generatedPageSlug, parseNewWikiPage, parsePageMove, pageBreadcrumb,
  parseWikiSort, sortWikis,
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

describe('D-82 — deleting a wiki', () => {
  const live: WikiFacts = { ownerId: OWNER_ID, archived: false, memberAccess: null };

  test('the install admin deletes any wiki, live or archived, owned by anyone', () => {
    const v = viewer(INSTALL_ID, PROTECTED_EMAIL);
    assert.equal(canDeleteWiki(v, live), true);
    assert.equal(canDeleteWiki(v, { ...live, archived: true }), true);
    assert.equal(canDeleteWiki(v, { ...live, ownerId: INSTALL_ID }), true);
  });

  test('the owner deletes their own wiki, live or archived (updated 2026-11-12)', () => {
    assert.equal(canDeleteWiki(viewer(OWNER_ID, 'owner@cit.com'), live), true);
    assert.equal(canDeleteWiki(viewer(OWNER_ID, 'owner@cit.com'), { ...live, archived: true }), true);
  });

  test('a writer and a reader may not — writing a wiki is not deleting it', () => {
    assert.equal(canDeleteWiki(viewer(WRITE_MEMBER_ID, 'writer@cit.com'), { ...live, memberAccess: 'write' }), false);
    assert.equal(canDeleteWiki(viewer(READ_MEMBER_ID, 'reader@cit.com'), { ...live, memberAccess: 'read' }), false);
  });

  test("an owner is not the owner of someone else's wiki", () => {
    assert.equal(canDeleteWiki(viewer(OWNER_ID, 'owner@cit.com'), { ...live, ownerId: WRITE_MEMBER_ID, memberAccess: 'write' }), false);
  });

  test('a stranger and an inactive install admin may not', () => {
    assert.equal(canDeleteWiki(viewer(STRANGER_ID, 'stranger@cit.com'), live), false);
    assert.equal(canDeleteWiki(viewer(INSTALL_ID, PROTECTED_EMAIL, false), live), false);
  });
});

describe('wikiAbilities — what the screens draw', () => {
  test('agrees with canWriteWiki, canManageWiki and canDeleteWiki for every role, live and archived', () => {
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
          canWrite: canWriteWiki(v, facts), canManage: canManageWiki(v, facts), canDelete: canDeleteWiki(v, facts),
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

describe('parseMemberGrants', () => {
  test('the single { userId } every earlier client sends still passes, as a list of one', () => {
    assert.deepEqual(parseMemberGrants({ userId: READ_MEMBER_ID, access: 'read' }), { userIds: [READ_MEMBER_ID], access: 'read' });
  });

  test('several people take one access; duplicates collapse, whatever their case', () => {
    assert.deepEqual(parseMemberGrants({ userIds: [READ_MEMBER_ID, OWNER_ID, READ_MEMBER_ID.toUpperCase()], access: 'write' }),
      { userIds: [READ_MEMBER_ID, OWNER_ID], access: 'write' });
  });

  test('one bad id refuses the whole batch', () => {
    refuses('E_INVALID_DOC', () => parseMemberGrants({ userIds: [READ_MEMBER_ID, 'not-a-uuid'], access: 'read' }));
    refuses('E_INVALID_DOC', () => parseMemberGrants({ userIds: [READ_MEMBER_ID, 7], access: 'read' }));
    refuses('E_INVALID_DOC', () => parseMemberGrants({ userId: '', access: 'read' }));
  });

  test('nobody, or more than the ceiling, is refused', () => {
    refuses('E_INVALID_DOC', () => parseMemberGrants({ userIds: [], access: 'read' }));
    refuses('E_INVALID_DOC', () => parseMemberGrants({ access: 'read' }));
    refuses('E_INVALID_DOC', () => parseMemberGrants({ userIds: READ_MEMBER_ID, access: 'read' }));
    const many = Array.from({ length: MEMBER_BATCH_MAX + 1 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
    refuses('E_INVALID_DOC', () => parseMemberGrants({ userIds: many, access: 'read' }));
    assert.equal(parseMemberGrants({ userIds: many.slice(1), access: 'read' }).userIds.length, MEMBER_BATCH_MAX);
  });

  test('an invalid access value throws E_INVALID_DOC', () => {
    refuses('E_INVALID_DOC', () => parseMemberGrants({ userIds: [READ_MEMBER_ID], access: 'admin' }));
  });
});

describe('parseMemberRefs', () => {
  test('one or several uuids pass; anything else is E_INVALID_DOC', () => {
    assert.deepEqual(parseMemberRefs({ userId: READ_MEMBER_ID }), { userIds: [READ_MEMBER_ID] });
    assert.deepEqual(parseMemberRefs({ userIds: [READ_MEMBER_ID, OWNER_ID] }), { userIds: [READ_MEMBER_ID, OWNER_ID] });
    refuses('E_INVALID_DOC', () => parseMemberRefs({ userId: 'x' }));
    refuses('E_INVALID_DOC', () => parseMemberRefs({ userIds: [] }));
    refuses('E_INVALID_DOC', () => parseMemberRefs(null));
  });
});

describe('parseMemberRef', () => {
  test('the new owner in a transfer is one uuid; anything else is E_INVALID_DOC', () => {
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
    // `/wiki/<id>/settings` is the settings screen, so no page may take it.
    refuses('E_INVALID_DOC', () => parsePageSlug('settings'));
    refuses('E_INVALID_DOC', () => parsePageSlug(' Settings '));
    assert.equal(parsePageSlug('settings-notes'), 'settings-notes');
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

describe('the Wiki list, sorted by name', () => {
  const wikis = [
    { id: '1', title: 'คู่มือ' }, { id: '2', title: 'beta' }, { id: '3', title: 'Alpha 10' },
    { id: '4', title: 'Alpha 2' }, { id: '5', title: 'กฎหมาย' },
  ];

  test('-name is Z to A; anything else, or nothing, is A to Z', () => {
    assert.equal(parseWikiSort('-name'), '-name');
    for (const v of [undefined, '', 'name', 'Name', 'updated', ['-name'], 7]) assert.equal(parseWikiSort(v), 'name');
  });

  test('name orders case-blind, numbers by value, Thai in dictionary order', () => {
    const ids = sortWikis(wikis, 'name').map((w) => w.id);
    assert.ok(ids.indexOf('4') < ids.indexOf('3'), 'Alpha 2 before Alpha 10');
    assert.ok(ids.indexOf('3') < ids.indexOf('2'), 'Alpha before beta, whatever the case');
    assert.ok(ids.indexOf('5') < ids.indexOf('1'), 'กฎหมาย before คู่มือ');
  });

  test('-name is the exact reverse; nothing is mutated', () => {
    const before = wikis.map((w) => w.id);
    assert.deepEqual(sortWikis(wikis, '-name').map((w) => w.id), sortWikis(wikis, 'name').map((w) => w.id).reverse());
    assert.deepEqual(wikis.map((w) => w.id), before);
  });
});
