// The paste reader must understand what Apple's Measure app copies and what people type.
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseLength, splitInches } = require('../src/assets/js/formulas.js');
const ftin = (t) => { const r = parseLength(t); return r && [r.ft, r.inch]; };

test('feet and inches in common forms', () => {
  assert.deepEqual(ftin(`4' 3"`), [4, 3]);
  assert.deepEqual(ftin('4′ 3″'), [4, 3]);   // Measure app style primes
  assert.deepEqual(ftin('4 ft 3 in'), [4, 3]);
  assert.deepEqual(ftin('4ft 3.5in'), [4, 3.5]);
  assert.deepEqual(ftin('12 feet 6 inches'), [12, 6]);
  assert.deepEqual(ftin('4 ft 3½ in'), [4, 3.5]);
});

test('single units', () => {
  assert.deepEqual(ftin('51"'), [4, 3]);
  assert.deepEqual(ftin('51 in'), [4, 3]);
  assert.deepEqual(ftin('4.25 ft'), [4, 3]);
  assert.deepEqual(ftin("14'"), [14, 0]);
  assert.deepEqual(ftin('14'), [14, 0]);
});

test('metric, including comma decimals', () => {
  assert.deepEqual(ftin('1.3 m'), [4, 3]);    // 51.18 in
  assert.deepEqual(ftin('1,3 m'), [4, 3]);
  assert.deepEqual(ftin('130 cm'), [4, 3]);
  assert.deepEqual(ftin('2540 mm'), [8, 4]);
});

test('rejects junk', () => {
  assert.equal(parseLength(''), null);
  assert.equal(parseLength('hello'), null);
  assert.equal(parseLength('0 ft'), null);
  assert.equal(parseLength(null), null);
});

test('rounding to the nearest half inch carries into feet', () => {
  assert.deepEqual([splitInches(47.9).ft, splitInches(47.9).inch], [4, 0]);
  assert.deepEqual([splitInches(50.2).ft, splitInches(50.2).inch], [4, 2]);
});
