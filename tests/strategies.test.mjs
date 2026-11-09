import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { filterStrategies } from '../src/strategies.js';

const read = async name => JSON.parse(await readFile(new URL(`../data/${name}.json`, import.meta.url)));
const records = await read('strategies'), traits = await read('traits'), sources = await read('sources');

test('the current mode ships all 61 strategies with life, unlocks, local portraits and valid pact references', async () => {
  assert.equal(records.length, 61);
  assert.equal(new Set(records.map(s => s.id)).size, 61);
  assert.equal(sources.strategyCount, 61);
  assert.equal(records.filter(s => s.unlock === '初始解锁').length, 16);
  for (const s of records) {
    assert.ok(s.name && s.initiator && s.effect && s.unlock);
    assert.ok(Number.isInteger(s.initialLife) && s.initialLife >= 20 && s.initialLife <= 40);
    assert.ok(s.usageTypes.length && s.usageTypes.every(t => ['被动', '点击', '拖拽'].includes(t)));
    assert.ok(s.traitIds.every(id => traits.some(t => t.id === id)));
    assert.ok(s.sourceUrl.startsWith(sources.modeSourceUrl + '#'));
    assert.match(s.image, /^\/assets\/strategies\/strategy-[a-f0-9]+\.webp$/);
    await access(new URL('..' + s.image, import.meta.url));
    assert.doesNotMatch(s.effect, /术语:|display:none|<span|<br/);
  }
  assert.equal(records.find(s => s.initiator === '华法琳').initialLife, 24);
  assert.match(records.find(s => s.initiator === '望').effect, /在场9名不同【炎】干员/);
  assert.match(records.find(s => s.initiator === '耶拉').effect, /25秒/);
  assert.equal(filterStrategies(records, { usage: '点击' }).some(s => s.initiator === 'Mechanist'), true);
  assert.equal(filterStrategies(records, { usage: '被动' }).some(s => s.initiator === 'Mechanist'), true);
});

test('strategy search combines initiator, effect and unlock keywords with usage and pact filters', () => {
  assert.deepEqual(filterStrategies(records, { query: '阿米娅' }).map(s => s.name), ['众志合一']);
  assert.deepEqual(filterStrategies(records, { query: 'ＭＥＣＨＡＮＩＳＴ' }).map(s => s.name), ['精巧设计']);
  assert.deepEqual(filterStrategies(records, { query: '望 9名', usage: '拖拽', trait: 'core-yan' }).map(s => s.name), ['黑白相易']);
  assert.equal(filterStrategies(records, { query: '望 9名', usage: '被动' }).length, 0);
  assert.deepEqual(filterStrategies(records, { query: '通关 6名', trait: 'core-yan' }).map(s => s.name), ['广交豪杰']);
  assert.equal(filterStrategies(records, { query: '没有这种策略' }).length, 0);
  assert.equal(filterStrategies(records, { query: '   ' }).length, 61);
});
