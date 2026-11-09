import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateLineup, pactProgress } from '../src/domain.js';

const core = { id: 'core', name: '测试', category: 'core', activationRequired: 3, levels: [{ count: 3, metric: 'activation', effect: '第一档' }, { count: 6, metric: 'members', effect: '第二档' }] };
const cards = Array.from({ length: 8 }, (_, i) => ({ id: `c${i}`, name: `c${i}`, traitIds: ['core'] }));
const progress = count => pactProgress(calculateLineup(cards.slice(0, count).map(c => c.id), cards, [core]).synergies[0]);

test('ratios stop at each exact milestone before progressing to the next target', () => {
  for (const [count, label, completed, filled] of [[1, '1/3', 0, 1], [2, '2/3', 0, 2], [3, '3/3', 1, 3], [4, '4/6', 1, 1], [5, '5/6', 1, 2], [6, '6/6', 2, 3], [7, '7/6', 2, 3], [8, '8/6', 2, 3]]) {
    assert.deepEqual([progress(count).label, progress(count).completed, progress(count).filled, progress(count).segments], [label, completed, filled, 3]);
  }
});

test('segment lengths follow real tier differences, including single-tier and elite pacts', () => {
  const p = count => pactProgress({ count, activationCount: count, levels: [{ count: 2, metric: 'members', reached: count >= 2 }, { count: 5, metric: 'members', reached: count >= 5 }] });
  assert.deepEqual([p(1).label, p(1).segments, p(1).filled], ['1/2', 2, 1]);
  assert.deepEqual([p(2).label, p(2).completed, p(2).filled], ['2/2', 1, 2]);
  assert.deepEqual([p(3).label, p(3).segments, p(3).filled], ['3/5', 3, 1]);
  assert.equal(p(5).completed, 2);
  const single = pactProgress({ count: 4, activationCount: 4, levels: [{ count: 2, reached: true }] });
  assert.deepEqual([single.label, single.completed, single.segments, single.filled], ['4/2', 1, 2, 2]);
});

test('activation bonuses and literal member counts retain their distinct semantics', () => {
  const first = pactProgress({ count: 2, activationCount: 3, levels: core.levels.map(l => ({ ...l, reached: l.count === 3 })) });
  assert.deepEqual([first.label, first.filled, first.completed], ['3/3', 3, 1]);
  const next = pactProgress({ count: 5, activationCount: 6, levels: core.levels.map(l => ({ ...l, reached: l.count === 3 })) });
  assert.deepEqual([next.label, next.filled, next.completed], ['5/6', 2, 1]);
  const expired = pactProgress({ count: 2, activationCount: 2, inactive: true, levels: [{ count: 1, reached: false }] });
  assert.deepEqual([expired.label, expired.completed, expired.filled], ['2/1', 0, 0]);
});
