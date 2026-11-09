import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { calculateLineup, normalizeSelection, validateData, filterCards } from '../src/domain.js';
const liveCards = JSON.parse(await readFile(new URL('../data/cards.json', import.meta.url)));
const liveTraits = JSON.parse(await readFile(new URL('../data/traits.json', import.meta.url)));
const cards = [
  { id: 'luna', name: '测试甲', tier: 1, cost: 1, traitIds: ['starlight', 'ranger'], profession: '狙击' },
  { id: 'orion', name: '测试乙', tier: 3, cost: 2, traitIds: ['starlight', 'mage'], profession: '术师', skills: [{ name: '测试技能', levels: [{ level: 7, description: '测试效果' }] }] },
  { id: 'willow', name: '测试丙', tier: 2, cost: 2, traitIds: ['forest', 'ranger'], profession: '狙击' },
  { id: 'atlas', name: '测试丁', tier: 4, cost: 3, traitIds: ['starlight'], profession: '重装' },
];
const traits = [
  { id: 'starlight', name: '测试星辉', levels: [] },
  { id: 'forest', name: '测试森林', levels: [] },
  { id: 'ranger', name: '测试游侠', levels: [] },
  { id: 'mage', name: '测试秘术', levels: [] },
];

test('shipped data satisfies the data contract with source-backed levels', () => {
  assert.doesNotThrow(() => validateData(liveCards, liveTraits));
  assert.ok(liveTraits.every(t => t.levels.length > 0 && t.source === 'PRTS'));
});
test('count each selected card once per trait, ignoring stale or duplicate IDs', () => {
  const result = calculateLineup(['luna', 'orion', 'willow', 'luna', 'no-longer-exists'], cards, traits);
  assert.equal(result.members.length, 3);
  assert.equal(result.totalCost, 5);
  assert.deepEqual(Object.fromEntries(result.synergies.map(t => [t.id, t.count])), { starlight: 2, ranger: 2, forest: 1, mage: 1 });
  assert.ok(result.synergies.every(t => t.activeLevel === null && t.nextLevel === null));
});
test('removing a member updates counts; empty selection has no synergies', () => {
  assert.equal(calculateLineup(['luna'], cards, traits).synergies.find(t => t.id === 'starlight').count, 1);
  assert.deepEqual(calculateLineup([], cards, traits), { members: [], synergies: [], totalCost: 0 });
  assert.deepEqual(normalizeSelection(null, cards), []);
});
test('future configured levels are sorted and evaluated without changing the UI logic', () => {
  const configured = traits.map(t => t.id === 'starlight' ? { ...t, levels: [{ count: 4, effect: 'four' }, { count: 2, effect: 'two' }] } : t);
  const result = calculateLineup(['luna', 'orion', 'atlas'], cards, configured);
  const star = result.synergies.find(t => t.id === 'starlight');
  assert.equal(star.activeLevel.count, 2);
  assert.equal(star.nextLevel.count, 4);
  assert.deepEqual(star.levels.map(l => l.count), [2, 4]);
});
test('name and trait search compose with cost and trait filters', () => {
  assert.equal(filterCards(cards, { query: ' 测试甲 ' }, traits)[0].id, 'luna');
  assert.equal(filterCards(cards, { query: '星辉', cost: 2, trait: 'mage' }, traits)[0].id, 'orion');
  assert.equal(filterCards(cards, { query: '不存在' }, traits).length, 0);
  assert.equal(filterCards(cards, {}, traits).length, cards.length);
});
test('tiers, professions and skill names are independently searchable', () => {
  assert.equal(filterCards(cards, { tier: 3, profession: '术师' }, traits)[0].id, 'orion');
  assert.equal(filterCards(cards, { query: '测试技能' }, traits)[0].id, 'orion');
  assert.equal(filterCards(cards, { cost: 2, tier: 1 }, traits).length, 0);
  assert.throws(() => validateData([{ ...cards[0], tier: 7 }], traits), /等阶无效/);
});
test('invalid references, duplicate IDs and invalid level requirements fail early', () => {
  assert.throws(() => validateData([...cards, cards[0]], traits), /唯一/);
  assert.throws(() => validateData([{ ...cards[0], traitIds: ['unknown'] }], traits), /不存在/);
  assert.throws(() => validateData(cards, [{ ...traits[0], levels: [{ count: 0, effect: 'invalid' }] }, ...traits.slice(1)]), /档位无效/);
});
