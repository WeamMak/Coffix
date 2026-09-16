const { test } = require('node:test');
const assert = require('node:assert/strict');
const { assertLatency } = require('./api');
const { assertReservations } = require('./inventory');

test('latency acceptance rejects a slow tail even when most requests are fast', () => {
  assert.throws(() => assertLatency([...Array(94).fill(10), ...Array(6).fill(2001)]));
  assert.equal(assertLatency(Array(100).fill(25)), 25);
  assert.throws(() => assertLatency([]));
});

test('reservation acceptance rejects overselling and unexpected server errors', () => {
  assertReservations([201, 201, 409, 409], 2);
  assert.throws(() => assertReservations([201, 201, 201, 409], 2));
  assert.throws(() => assertReservations([201, 201, 500, 409], 2));
});
