import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { calculateLineup, filterCards, featureFacets, validateData, normalizeBuild, squadCapacity, equippedTraits } from '../src/domain.js';
const read = async name => JSON.parse(await readFile(new URL(`../data/${name}.json`, import.meta.url)));
const cards = await read('cards'), traits = await read('traits'), equipment = await read('equipment');
const card = name => cards.find(c => c.name === name), gear = name => equipment.find(e => e.name === name);

test('all mode records and 26 pact rules come from the designated PRTS page, including six-tier and elite features', async () => {
  assert.doesNotThrow(() => validateData(cards, traits));
  assert.equal(cards.length, 141);
  assert.equal(traits.filter(t => t.category === 'core').length, 10);
  assert.equal(traits.filter(t => t.category === 'additional').length, 16);
  for (const t of traits) { assert.ok(t.image?.startsWith('/assets/pacts/'), t.name); await access(new URL(`..${t.image}`, import.meta.url)); }
  for (const c of cards) {
    assert.equal(c.modeData.source, 'PRTS'); assert.equal(c.corePact.status, 'source');
    assert.ok(c.modeFeature && c.eliteFeature && c.featureCategory, c.name);
    assert.ok(c.modeData.sourceUrl.includes('PRTS'), c.name);
    assert.ok(!c.modeFeature.includes('术语:'), c.name);
  }
  for (const t of traits.filter(t => t.category === 'core')) assert.deepEqual(t.levels.map(l => l.count), [3, 6], t.name);
  assert.deepEqual(traits.find(t => t.name === '精准').levels.map(l => l.count), [2, 3]);
  assert.deepEqual(traits.find(t => t.name === '绝技').levels.map(l => l.count), [2, 5]);
  assert.deepEqual(traits.find(t => t.name === '迅捷').levels.map(l => l.count), [2]); // 40 layers is not 40 people.
  assert.equal(cards.filter(c => c.tier === 6 && c.eliteFeature).length, 20);
});

test('source memberships and normal/elite texts replace manual overrides, and all feature facets count operators once', () => {
  assert.deepEqual(card('魔王').traitIds, ['additional-harmony']);
  assert.deepEqual(card('塔露拉').traitIds, ['core-ursus', 'additional-arcane', 'additional-cooperative-defender']);
  assert.match(card('折桠').modeFeature, /转化2层/); assert.match(card('折桠').eliteFeature, /转化4层/);
  assert.ok(filterCards(cards, { query: '<战斗中>', trait: 'core-victoria' }, traits).some(c => c.name === '哈洛德'));
  assert.ok(filterCards(cards, { query: '＜战斗中＞' }, traits).some(c => c.name === '哈洛德'));
  assert.ok(filterCards(cards, { query: '阿戈尔' }, traits).some(c => c.name === '幽灵鲨'));
  const filters = { trait: 'core-victoria', feature: '战斗中' };
  const facets = featureFacets(cards, filters, traits);
  assert.equal(facets.total, cards.filter(c => c.traitIds.includes(filters.trait)).length);
  assert.equal(facets.items.find(i => i.name === '战斗中').count, filterCards(cards, filters, traits).length);
  assert.equal(featureFacets(cards, { ...filters, feature: '' }, traits).total, facets.total);
});

test('conversion requires the same member to carry both a homologue and mapped equipment, and never double-counts a native pact', () => {
  const target = card('折桠'), morph = gear('变形同构体'), knife = gear('炎国短刀');
  assert.equal(equippedTraits(target, [knife.id], equipment).equipmentTraitIds.length, 0);
  assert.equal(equippedTraits(target, [morph.id], equipment).equipmentTraitIds.length, 0);
  const slots = [morph.id, knife.id];
  assert.deepEqual(equippedTraits(target, slots, equipment).equipmentTraitIds, ['core-yan']);
  const converted = calculateLineup([target.id], cards, traits, { equipment, loadout: { [target.id]: slots } });
  assert.equal(converted.synergies.find(t => t.id === 'core-yan').count, 1);
  assert.equal(calculateLineup([target.id], cards, traits, { equipment, loadout: { [target.id]: [null, knife.id] } }).synergies.some(t => t.id === 'core-yan'), false);
  const native = cards.find(c => c.traitIds.includes('core-yan'));
  const duplicate = calculateLineup([native.id], cards, traits, { equipment, loadout: { [native.id]: slots } });
  assert.equal(duplicate.synergies.find(t => t.id === 'core-yan').count, 1);
  assert.equal(duplicate.members[0].equipmentTraitIds.length, 0);
  const separate = calculateLineup([target.id, native.id], cards, traits, { equipment, loadout: { [target.id]: [morph.id], [native.id]: [knife.id] } });
  assert.equal(separate.synergies.find(t => t.id === 'core-yan').count, 1);
});

test('solo expires with two members; all selected elite operators qualify for absolute technique', () => {
  const solo = cards.filter(c => c.traitIds.includes('additional-solitude')).slice(0, 2);
  assert.equal(calculateLineup([solo[0].id], cards, traits).synergies.find(t => t.id === 'additional-solitude').isActive, true);
  const inactive = calculateLineup(solo.map(c => c.id), cards, traits).synergies.find(t => t.id === 'additional-solitude');
  assert.equal(inactive.isActive, false); assert.equal(inactive.inactive, true);
  const ids = cards.slice(0, 5).map(c => c.id);
  const absolute = traits.find(t => t.name === '绝技');
  const special = calculateLineup(ids, cards, traits, { eliteIds: ids.slice(0, 2) }).synergies.find(t => t.id === absolute.id);
  assert.equal(special.count, 2); assert.equal(special.activeLevel.count, 2);
  assert.equal(calculateLineup(ids, cards, traits, { eliteIds: ids }).synergies.find(t => t.id === absolute.id).activeLevel.count, 5);
  assert.equal(calculateLineup(ids, cards, traits).synergies.some(t => t.id === absolute.id), false);
});

test('harmony adds a single activation bonus, while six-distinct-member conditions use physical members', () => {
  const core = traits.find(t => t.name === '炎'), harmony = traits.find(t => t.name === '调和');
  const fixture = Array.from({ length: 6 }, (_, n) => ({ id: `c${n}`, name: `c${n}`, traitIds: [core.id] })).concat([{ id: 'h', name: 'h', traitIds: [harmony.id] }, { id: 'h2', name: 'h2', traitIds: [harmony.id] }]);
  const get = ids => calculateLineup(ids, fixture, [core, harmony]).synergies.find(t => t.id === core.id);
  assert.equal(get(['c0', 'c1', 'h']).isActive, true);
  const five = get(['c0', 'c1', 'c2', 'c3', 'c4', 'h', 'h2']);
  assert.equal(five.count, 5); assert.equal(five.activationBonus, 1); assert.equal(five.activationCount, 6); assert.equal(five.activeLevel.count, 3);
  assert.equal(get(['c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'h']).activeLevel.count, 6);
});

test('build normalization preserves old squads, keeps only two valid carrying slots, and round-trips expansion and elites', () => {
  const ids = cards.slice(0, 10).map(c => c.id), morph = gear('变形同构体'), knife = gear('炎国短刀'), document = gear('人事部文档');
  const raw = { selected: ids, capacityExpanded: true, eliteIds: [ids[0], 'unknown'], loadout: { [ids[0]]: [morph.id, knife.id, knife.id], [ids[1]]: [document.id, 'unknown'], stale: [morph.id] } };
  const normalized = normalizeBuild(raw, cards, equipment);
  assert.equal(normalized.cardIds.length, 10); // Never silently discard members from a legacy squad.
  assert.equal(squadCapacity(normalized), 9); assert.equal(squadCapacity({}), 8);
  assert.deepEqual(normalized.eliteIds, [ids[0]]); assert.deepEqual(normalized.loadout, { [ids[0]]: [morph.id, knife.id] });
  assert.deepEqual(normalizeBuild(JSON.parse(JSON.stringify(normalized)), cards, equipment), normalized);
  assert.equal(document.capacityLimit, 9); assert.equal(document.consumable, true);
  assert.equal(equipment.length, 70); assert.equal(equipment.filter(e => e.conversionTraitId).length, 19);
});
