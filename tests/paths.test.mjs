import test from 'node:test';
import assert from 'node:assert/strict';
import { sitePath, localAsset } from '../src/paths.js';

test('resources and navigation resolve under both root and GitHub Pages project paths', () => {
  for (const prefix of ['', '/wsxyxd']) {
    const moduleUrl = `https://example.github.io${prefix}/src/paths.js`;
    assert.equal(sitePath('', moduleUrl), `${prefix}/`);
    assert.equal(sitePath('data/cards.json', moduleUrl), `${prefix}/data/cards.json`);
    assert.equal(sitePath('/assets/operators/avatar.webp', moduleUrl), `${prefix}/assets/operators/avatar.webp`);
    assert.equal(localAsset('/assets/pacts/core-yan.webp', moduleUrl), `${prefix}/assets/pacts/core-yan.webp`);
    assert.equal(localAsset('https://prts.wiki/image.png', moduleUrl), 'https://prts.wiki/image.png');
    assert.equal(localAsset(null, moduleUrl), null);
  }
});
