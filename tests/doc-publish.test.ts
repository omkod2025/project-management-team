/**
 * Publishing a page as a read-only link (spec 10 §8b).
 *
 * This is the only feature in the product that answers a request with no
 * session behind it, so what an outsider may reach is not a detail — it is the
 * whole feature. Every test here names one thing the link must *not* be able
 * to do.
 */

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  mintPublishToken, isPublishToken, publishedHref, publishedAssetHref, publishedLink,
} from '../src/lib/doc-publish-rules.ts';
import { docAssetIds } from '../src/lib/doc-asset-references.ts';

const ASSET = '4b7f2a10-1c3d-4e5f-8a9b-0c1d2e3f4a5b';
const OTHER = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const TOKEN = mintPublishToken();
const referenced = new Set([ASSET]);
const link = (href: unknown) => publishedLink(href, TOKEN, referenced);

describe('the token', () => {
  test('is 43 base64url characters', () => {
    assert.match(mintPublishToken(), /^[A-Za-z0-9_-]{43}$/);
  });

  test('is different every time', () => {
    const minted = new Set(Array.from({ length: 200 }, mintPublishToken));
    assert.equal(minted.size, 200);
  });

  test('accepts its own shape', () => {
    assert.equal(isPublishToken(mintPublishToken()), true);
  });

  /* A route parameter is whatever somebody typed. Anything that is not the
     exact shape is refused before it reaches the database. */
  test('refuses anything else', () => {
    for (const bad of ['', 'short', 'x'.repeat(42), 'x'.repeat(44), `${'x'.repeat(42)}/`, null, 42, undefined]) {
      assert.equal(isPublishToken(bad), false, String(bad));
    }
  });

  test('is not derived from the page, so a revoked link cannot be rebuilt', () => {
    assert.notEqual(mintPublishToken(), mintPublishToken());
  });
});

describe('the published addresses', () => {
  test('name the token, not the page', () => {
    assert.equal(publishedHref(TOKEN), `/d/${TOKEN}`);
    assert.equal(publishedAssetHref(TOKEN, ASSET), `/d/${TOKEN}/assets/${ASSET}`);
  });
});

describe('a link inside a published page', () => {
  test('keeps an external address', () => {
    assert.equal(link('https://figma.com/file/abc'), 'https://figma.com/file/abc');
    assert.equal(link('mailto:someone@example.com'), 'mailto:someone@example.com');
  });

  test('keeps a fragment, which points inside this very page', () => {
    assert.equal(link('#heading-3'), '#heading-3');
  });

  /* The reader has no session. Following one of these would land them on a
     sign-in page, and the URL would have named a project on the way. */
  test('refuses to point back into the product', () => {
    assert.equal(link('/p/acme/list'), null);
    assert.equal(link('/p/acme/docs/roadmap'), null);
    assert.equal(link('/api/projects/123/ledger'), null);
    assert.equal(link('/'), null);
  });

  test('refuses another published link, so one leak is not every leak', () => {
    assert.equal(link(`/d/${mintPublishToken()}`), null);
  });

  test('refuses a scheme a document may not hold anyway', () => {
    assert.equal(link('javascript:alert(1)'), null);
    assert.equal(link('data:text/html,<script>'), null);
    assert.equal(link('file:///etc/passwd'), null);
  });

  test('refuses nothing at all', () => {
    assert.equal(link(''), null);
    assert.equal(link(null), null);
    assert.equal(link(undefined), null);
  });
});

describe('an asset inside a published page', () => {
  test('is rewritten onto the token’s own path', () => {
    assert.equal(link(`/api/doc-assets/${ASSET}`), publishedAssetHref(TOKEN, ASSET));
  });

  test('is case-folded to the id the registry holds', () => {
    assert.equal(link(`/api/doc-assets/${ASSET.toUpperCase()}`), publishedAssetHref(TOKEN, ASSET));
  });

  /* The narrowest hole that still renders the page: this token may read the
     files this page references and no others. A hand-edited copy pointing at
     the project's wider file store gets nothing. */
  test('the page does not reference is refused', () => {
    assert.equal(link(`/api/doc-assets/${OTHER}`), null);
  });

  test('and the authenticated endpoint is never handed out', () => {
    assert.equal(link(`/api/doc-assets/${ASSET}`)?.startsWith('/api/'), false);
  });
});

describe('the set of assets a token may read', () => {
  /* Built from the page's own content by the same collector the deletion
     sweep uses, so "what the page shows" and "what the link may fetch" cannot
     drift apart. */
  test('is exactly what the page references', () => {
    const content = {
      body: `![shot](/api/doc-assets/${ASSET})`,
      scope: `see [the file](/api/doc-assets/${OTHER})`,
    };
    assert.deepEqual([...docAssetIds(content)].sort(), [ASSET, OTHER].sort());
  });

  test('is empty for a page with no files', () => {
    assert.equal(docAssetIds({ body: 'plain words and https://example.com' }).size, 0);
  });
});
