import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { filterCards } from '../src/domain.js';
const cards = JSON.parse(await readFile(new URL('../data/cards.json', import.meta.url)));
const sources = JSON.parse(await readFile(new URL('../data/sources.json', import.meta.url)));
const traits = JSON.parse(await readFile(new URL('../data/traits.json', import.meta.url)));

test('1–6 tier default roster matches the captured source counts and excludes prototypes', () => {
  assert.equal(cards.length, 141);
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(t => cards.filter(c => c.tier === t).length), [19, 24, 26, 27, 25, 20]);
  assert.equal(new Set(cards.map(c => c.name)).size, cards.length);
  assert.equal(cards.find(c => c.name === '折桠').tier, 1);
  assert.equal(cards.find(c => c.name === '阿米娅').tier, 5);
  assert.ok(!cards.some(c => ['Sharp', 'Pith'].includes(c.name)));
  assert.equal(sources.operatorCount, cards.length);
  assert.equal(traits.filter(t => t.category === 'core').length, 10);
  assert.ok(cards.every(c => c.cost === null));
});
test('every operator has local avatar and full artwork, provenance, and complete level 4/7 skill references', async () => {
  for (const card of cards) {
    assert.equal(card.avatarStage, 'elite2', card.name);
    assert.ok(card.image.endsWith('-avatar-e2.webp'), card.name);
    assert.ok(card.sourceUrl.startsWith('https://prts.wiki/w/'), card.name);
    assert.ok(card.profession && card.branch && card.description, card.name);
    assert.ok(card.skills.length >= 2 && card.skills.length <= 3, card.name);
    for (const skill of card.skills) {
      assert.deepEqual(skill.levels.map(l => l.level), [4, 7], `${card.name}: ${skill.name}`);
      assert.ok(skill.levels.every(l => l.description && !l.description.includes('术语:') && !l.description.includes('术语：')), card.name);
    }
    for (const path of [card.image, card.artImage]) {
      assert.ok(path?.startsWith('/assets/operators/'), card.name);
      await access(new URL(`..${path}`, import.meta.url));
    }
  }
});
test('real operator name, profession and skill searches compose with tier filters', () => {
  assert.equal(filterCards(cards, { query: ' 折桠 ', tier: 1 })[0].name, '折桠');
  assert.equal(filterCards(cards, { query: '生存决心' })[0].name, '折桠');
  assert.ok(filterCards(cards, { profession: '医疗', tier: 5 }).some(c => c.name === '纯烬艾雅法拉'));
  assert.equal(filterCards(cards, { profession: '医疗', tier: 1, query: '幽灵鲨' }).length, 0);
});
