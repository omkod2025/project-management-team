/**
 * The wiki tree's ordering and where a page may move (wiki spec §4: three
 * levels, a page never inside its own subtree). Pure, no database.
 */

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { moveTargets, subtreeOf, treeOrder, type TreePage } from '../src/app/(signed-in)/wiki/wiki-tree-order.ts';

const page = (id: string, parentId: string | null, depth: number): TreePage => ({ id, parentId, depth, title: id, slug: `page-${id}` });

// a ── a1 ── a1x
// │    └ a2
// b
const PAGES = [page('a', null, 1), page('b', null, 1), page('a1', 'a', 2), page('a2', 'a', 2), page('a1x', 'a1', 3)];

describe('treeOrder', () => {
  test('each parent is followed by its children, siblings keep the order given', () => {
    assert.deepEqual(treeOrder(PAGES).map((p) => p.id), ['a', 'a1', 'a1x', 'a2', 'b']);
  });
  test('a page whose parent is not listed is left out rather than drawn at the wrong depth', () => {
    assert.deepEqual(treeOrder([page('x', 'gone', 2), page('b', null, 1)]).map((p) => p.id), ['b']);
  });
});

describe('subtreeOf', () => {
  test('is the page and everything below it', () => {
    assert.deepEqual([...subtreeOf(PAGES, 'a')].sort(), ['a', 'a1', 'a1x', 'a2']);
    assert.deepEqual([...subtreeOf(PAGES, 'b')], ['b']);
  });
});

describe('moveTargets', () => {
  test('never offers the page itself or anything below it', () => {
    const ids = moveTargets(PAGES, 'a1').map((p) => p.id);
    assert.ok(!ids.includes('a1') && !ids.includes('a1x'));
  });
  test('offers only parents that keep the whole subtree within three levels', () => {
    // a1 carries a child, so it may sit at depth 2 at most: under a top-level page only.
    assert.deepEqual(moveTargets(PAGES, 'a1').map((p) => p.id), ['a', 'b']);
    // a leaf may go under any page of depth 1 or 2.
    assert.deepEqual(moveTargets(PAGES, 'a2').map((p) => p.id), ['a', 'a1', 'b']);
    // a three-level subtree can only stay at the top.
    assert.deepEqual(moveTargets(PAGES, 'a').map((p) => p.id), []);
  });
  test('an unknown page has nowhere to go', () => {
    assert.deepEqual(moveTargets(PAGES, 'nope'), []);
  });
});
