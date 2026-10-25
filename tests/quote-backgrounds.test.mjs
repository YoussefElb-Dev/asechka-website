import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { nextQuoteBackground, quoteBackgroundSource, quoteBackgroundSequence } from '../dist/quote-backgrounds.js';

function assign(keys) {
  let previous = -1;
  return keys.map(key => previous = nextQuoteBackground(key, previous));
}
test('all ten quote backgrounds ship identically to the website and both offline apps', async () => {
  assert.equal((await readdir(new URL('../dist/assets/quote-backgrounds/', import.meta.url))).length, 10);
  for (let index = 0; index < 10; index++) {
    const file = quoteBackgroundSource(index).slice(7);
    const [web, android, ios] = await Promise.all([
      readFile(new URL('../dist/assets/' + file, import.meta.url)),
      readFile(new URL('../mobile/android/app/src/main/assets/default/' + file, import.meta.url)),
      readFile(new URL('../mobile/ios/Resources/default/' + file, import.meta.url)),
    ]);
    assert.deepEqual(android, web); assert.deepEqual(ios, web);
    assert.equal(web.readUInt16BE(0), 0xffd8, 'Real JPEG artwork');
    assert.ok(web.length > 1000 && web.length < 100000, 'Optimized bundled image');
  }
});
test('background selection stays stable and uses all ten designs', () => {
  const keys = Array.from({ length: 2000 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
  const result = assign(keys);
  assert.deepEqual(assign(keys), result);
  assert.equal(new Set(result).size, 10);
  result.forEach((value, i) => { assert.ok(value >= 0 && value < 10); if (i) assert.notEqual(value, result[i - 1]); });
});
test('consecutive quotes never match even with collisions, legacy text, filtering and insertions', () => {
  for (const keys of [Array(2000).fill('same quote'), Array(2000).fill(''), ['😀', '♡', 'שלום', 'أحبك', '😀'], ...[3, 7, 11].map(step => Array.from({ length: 1000 }, (_, i) => `Quote ${i * step}`).filter((_, i) => i % 5))]) {
    for (const sequence of [keys, [...keys].reverse(), ['new post', ...keys], keys.slice(7)]) {
      const values = assign(sequence);
      for (let i = 1; i < values.length; i++) assert.notEqual(values[i], values[i - 1]);
    }
  }
});
test('the scrolling quote carousel also avoids a matching last-to-first seam', () => {
  for (let length = 2; length < 200; length++) {
    const values = quoteBackgroundSequence(Array.from({ length }, (_, i) => `Quote ${i % 3}`), true);
    for (let i = 0; i < values.length; i++) assert.notEqual(values[i], values[(i + 1) % values.length]);
  }
});
