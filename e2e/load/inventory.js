const assert = require('node:assert/strict');

/** @param {number[]} statuses @param {number} stock */
function assertReservations(statuses, stock) {
  assert.ok(statuses.length > stock, 'Contention requires more buyers than stock');
  assert.ok(statuses.every(status => status === 201 || status === 409), 'Unexpected reservation response');
  assert.equal(statuses.filter(status => status === 201).length, stock, 'Sold quantity differs from stock');
}

/** @param {(() => Promise<number>)[]} reservations @param {number} stock */
async function inventoryLoad(reservations, stock) {
  const results = await Promise.allSettled(reservations.map(reserve => reserve()));
  const statuses = results.map(result => {
    if (result.status === 'rejected') throw result.reason;
    return result.value;
  });
  assertReservations(statuses, stock);
  return { contenders: statuses.length, reserved: stock, rejected: statuses.length - stock };
}
module.exports = { assertReservations, inventoryLoad };
