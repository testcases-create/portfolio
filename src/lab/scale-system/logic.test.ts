import { describe, expect, it } from 'vitest';
import { MODEL, createSim, percentile, type Config } from './logic';

/** Runs a fresh simulation for `ms` and returns its metrics. */
function run(config: Partial<Config>, ms = 12_000, seed = 1) {
  const sim = createSim(config, seed);
  sim.advance(ms);
  return sim.metrics();
}

describe('percentile', () => {
  it('uses the nearest rank', () => {
    const v = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(v, 0.95)).toBe(95);
    expect(percentile(v, 0.5)).toBe(50);
    expect(percentile([], 0.95)).toBe(0);
  });
});

describe('scale a system', () => {
  it('is deterministic for a seed', () => {
    expect(run({ rps: 400 }, 6000, 7)).toEqual(run({ rps: 400 }, 6000, 7));
  });

  it('serves light load without errors, at the offered rate', () => {
    const m = run({ rps: 100, replicas: 2 });
    expect(m.errorRate).toBe(0);
    expect(m.throughput).toBeGreaterThan(90);
    expect(m.throughput).toBeLessThan(110);
    // Unloaded, a read is about app + database time (10 + 10 ms): p95 well under 100 ms.
    expect(m.p95).toBeLessThan(100);
  });

  it("obeys Little's law: requests in the system = arrival rate × mean latency", () => {
    const m = run({ rps: 600, replicas: 2 }, 20_000);
    const predicted = (600 / 1000) * m.meanLatency;
    expect(Math.abs(m.inSystem - predicted) / predicted).toBeLessThan(0.1);
  });

  it('breaks down past one replica’s capacity, and recovers with more replicas', () => {
    // One replica: 4 workers × (1000 / ~20 ms) ≈ 200 requests per second.
    const one = run({ rps: 500, replicas: 1 });
    const four = run({ rps: 500, replicas: 4 });
    expect(one.errorRate).toBeGreaterThan(0.3);
    // Successful requests waited behind a full queue: 100 × ~20 ms / 4 workers.
    expect(one.p95).toBeGreaterThan(300);
    expect(four.errorRate).toBeLessThan(0.01);
    expect(four.p95).toBeLessThan(one.p95 / 5);
  });

  it('a cache takes load off the database and cuts latency', () => {
    const without = createSim({ rps: 800, replicas: 6 });
    const withCache = createSim({ rps: 800, replicas: 6, cache: true });
    without.advance(10_000);
    withCache.advance(10_000);
    expect(withCache.dbBusyMs()).toBeLessThan(without.dbBusyMs() * 0.5);
    expect(withCache.metrics().p50).toBeLessThan(without.metrics().p50);
  });

  it('a crashed replica fails requests until the health check removes it', () => {
    const sim = createSim({ rps: 300, replicas: 3 });
    sim.advance(5000);
    expect(sim.metrics().errorRate).toBe(0);
    sim.set({ failure: 'replica' });
    sim.advance(MODEL.healthCheckMs);
    const during = sim.metrics();
    expect(during.errorRate).toBeGreaterThan(0.05);
    expect(during.replicas[0]?.routed).toBe(false);
    sim.advance(MODEL.windowMs + 500);
    // Two replicas carry 300 requests per second, so errors stop.
    expect(sim.metrics().errorRate).toBe(0);
    sim.set({ failure: 'none' });
    expect(sim.metrics().replicas[0]).toMatchObject({ up: true, routed: true });
  });

  it('a slow database raises latency, and the write queue absorbs the backlog', () => {
    const normal = run({ rps: 500, replicas: 4 });
    const sim = createSim({ rps: 500, replicas: 4, failure: 'slow-db' });
    sim.advance(12_000);
    const slow = sim.metrics();
    expect(slow.p95).toBeGreaterThan(normal.p95 * 2);
    expect(slow.queueDepth).toBeGreaterThan(normal.queueDepth + 50);
    expect(slow.dbUtilisation).toBeGreaterThan(normal.dbUtilisation);
  });

  it('never loses a request: every arrival finishes as a success or an error', () => {
    const sim = createSim({ rps: 900, replicas: 2 });
    let arrivals = 0;
    let finished = 0;
    for (let t = 0; t < 8000; t += 100) {
      if (t === 3000) sim.set({ failure: 'replica' });
      sim.advance(100);
      for (const h of sim.drainHops()) {
        if (h.from === 'client') arrivals++;
        if (h.to === 'client') finished++;
      }
    }
    sim.set({ rps: 20, failure: 'none' });
    sim.advance(MODEL.timeoutMs + 3000);
    for (const h of sim.drainHops()) {
      if (h.from === 'client') arrivals++;
      if (h.to === 'client') finished++;
    }
    // Requests still in flight at the very end are at most the last few arrivals.
    expect(arrivals - finished).toBeLessThan(5);
    expect(arrivals - finished).toBeGreaterThanOrEqual(0);
  });
});
