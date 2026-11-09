/**
 * The List tools' pure rules over MCP: which id a token may name, and the
 * patch an `update_task` call becomes. The patch must carry exactly the keys
 * the call gave — an estimate never fills an actual, nor the other way round
 * (CLAUDE.md, "The rule the product exists for"). Pure, no database.
 */

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { scopedId, taskPatch } from '../src/lib/mcp-rules.ts';

const a = '0f8e2d4c-1b3a-4c5d-8e9f-a0b1c2d3e4f5';
const b = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

describe('taskPatch', () => {
  test('an estimate end alone stays alone — no actual is derived from it', () => {
    const patch = taskPatch({ estimate_end: '2026-12-01' });
    assert.deepEqual(patch, { estimateEnd: '2026-12-01' });
    assert.equal('actualEnd' in patch, false);
  });

  test('null clears, and is carried as null', () => {
    assert.deepEqual(taskPatch({ actual_start: null }), { actualStart: null });
  });

  test('nothing given is nothing written', () => {
    assert.deepEqual(taskPatch({}), {});
  });

  test('every key maps snake to camel, values passed through', () => {
    assert.deepEqual(
      taskPatch({ name: 'งาน', estimate_start: '2026-01-01', actual_end: '2026-01-09', values: { f: 1 } }),
      { name: 'งาน', estimateStart: '2026-01-01', actualEnd: '2026-01-09', values: { f: 1 } },
    );
  });
});

describe('scopedId', () => {
  test('a uuid in scope, in any case, comes back lowercased', () => {
    assert.equal(scopedId([a], a.toUpperCase()), a);
  });

  test('malformed, absent from scope, or not a string is null', () => {
    assert.equal(scopedId([a], 'x'), null);
    assert.equal(scopedId([a], b), null);
    assert.equal(scopedId([a], 5), null);
    assert.equal(scopedId([a], undefined), null);
  });
});
