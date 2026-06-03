const { test } = require('node:test');
const assert = require('node:assert/strict');
const { calculatePoints } = require('../lib/scoring');

test('exact score → 7', () => {
  assert.equal(calculatePoints(2, 1, 2, 1), 7);
  assert.equal(calculatePoints(0, 0, 0, 0), 7);
  assert.equal(calculatePoints(3, 3, 3, 3), 7);
});

test('correct winner + one team score → 4', () => {
  assert.equal(calculatePoints(3, 1, 2, 1), 4);
  assert.equal(calculatePoints(0, 2, 0, 3), 4);
  assert.equal(calculatePoints(3, 0, 1, 0), 4);
});

test('correct winner, no score match → 2', () => {
  assert.equal(calculatePoints(3, 0, 2, 1), 2);
  assert.equal(calculatePoints(0, 3, 1, 2), 2);
});

test('correct draw (wrong score) → 2', () => {
  assert.equal(calculatePoints(1, 1, 2, 2), 2);
  assert.equal(calculatePoints(0, 0, 3, 3), 2);
});

test('wrong winner but one team score → 1', () => {
  assert.equal(calculatePoints(3, 1, 0, 1), 1);
  assert.equal(calculatePoints(1, 3, 1, 0), 1);
  assert.equal(calculatePoints(2, 2, 2, 1), 1);
  assert.equal(calculatePoints(2, 1, 1, 1), 1);
});

test('complete miss → 0', () => {
  assert.equal(calculatePoints(2, 0, 0, 3), 0);
  assert.equal(calculatePoints(0, 1, 3, 2), 0);
  assert.equal(calculatePoints(1, 2, 3, 0), 0);
});
