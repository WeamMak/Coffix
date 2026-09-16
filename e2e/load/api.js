const assert = require('node:assert/strict');

/** @param {number[]} durations */
function assertLatency(durations) {
  assert.ok(durations.length > 0, 'No latency samples');
  assert.ok(durations.every(value => Number.isFinite(value) && value >= 0));
  const sorted = [...durations].sort((a, b) => a - b);
  const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1];
  assert.ok(p95 < 2000, `API p95 ${p95.toFixed(1)}ms must be below 2000ms`);
  return p95;
}

/** Agreed profile: 10 concurrent clients, 500 reads, after 20 warmup reads.
 * @param {(index: number) => Promise<void>} read
 */
async function apiLoad(read) {
  for (let index = 0; index < 20; index++) await read(index);
  /** @type {number[]} */
  const durations = [];
  // allSettled drains every client before propagating a failure and resetting fixtures.
  const clients = await Promise.allSettled(Array.from({ length: 10 }, async (_, client) => {
    for (let index = client; index < 500; index += 10) {
      const started = performance.now();
      await read(index);
      durations.push(performance.now() - started);
    }
  }));
  for (const client of clients) if (client.status === 'rejected') throw client.reason;
  assert.equal(durations.length, 500);
  return { clients: 10, requests: durations.length, p95_ms: assertLatency(durations) };
}
module.exports = { assertLatency, apiLoad };
