/**
 * The page-wide activity bar: which requests it waits on, and the quiet mark
 * that keeps background work (the bell's poll, a document's typing autosave)
 * off it without ever reaching the server.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { QUIET_HEADER, isApiRequest, takeQuiet } from '../src/lib/api-activity-rules.ts';

const origin = 'https://pm.example.test';

test('a call to this app\'s API counts, relative or absolute', () => {
  assert.equal(isApiRequest('/api/nodes/1', origin), true);
  assert.equal(isApiRequest(`${origin}/api/wiki-pages/9?x=1`, origin), true);
  assert.equal(isApiRequest('/base/api/projects', origin), true);
});

test('pages, assets and other origins do not count', () => {
  assert.equal(isApiRequest('/p/demo', origin), false);
  assert.equal(isApiRequest('/_next/static/chunk.js', origin), false);
  assert.equal(isApiRequest('https://cdn.example.test/api/x', origin), false);
  assert.equal(isApiRequest('/apiary', origin), false);
});

test('a request without the mark is untouched', () => {
  const headers = { 'content-type': 'application/json' };
  const out = takeQuiet(headers);
  assert.equal(out.quiet, false);
  assert.equal(out.headers, headers);
  assert.deepEqual(takeQuiet(undefined), { quiet: false, headers: undefined });
});

test('the quiet mark is read and never sent', () => {
  const out = takeQuiet({ 'content-type': 'application/json', [QUIET_HEADER]: '1' });
  assert.equal(out.quiet, true);
  const sent = new Headers(out.headers);
  assert.equal(sent.has(QUIET_HEADER), false);
  assert.equal(sent.get('content-type'), 'application/json');
});
