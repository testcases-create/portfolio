// "Scale a system" (BRIEF.md 5, the Lab): a discrete-event simulation of
// requests moving through a load balancer, service replicas, a cache, a queue
// and a database. Plain TypeScript with no DOM, so it is unit-tested and the
// view only draws what it reports. Times are in milliseconds.
//
// The model, in plain words:
// - Requests arrive at random (a Poisson process) at the chosen rate.
// - The load balancer sends each one to the next healthy replica in turn.
// - A replica has 4 workers and a queue of 100. A full queue answers 503.
// - Reads (80%) do some work, then read from the cache (80% hits) if there is
//   one, else from the database. Writes (20%) do some work and put a job on
//   the queue, then answer at once; 2 queue workers write jobs to the database.
// - The database has 16 connections; requests wait for a free one.
// - A request that takes longer than 1 s counts as an error (a timeout).
// - Failures: one replica crashes (the balancer notices after its 2 s health
//   check), or the database slows to 5× its normal service time.

export type Failure = 'none' | 'replica' | 'slow-db';

export interface Config {
  /** Requests per second. */
  rps: number;
  replicas: number;
  cache: boolean;
  failure: Failure;
}

export const LIMITS = { rps: [20, 2000], replicas: [1, 8] } as const;

export const MODEL = {
  workers: 4,
  replicaQueue: 100,
  /** Mean service times (exponential). */
  appMs: 10,
  cacheMs: 1.5,
  dbMs: 10,
  dbConnections: 16,
  queueWorkers: 2,
  cacheHitRate: 0.8,
  writeShare: 0.2,
  timeoutMs: 1000,
  healthCheckMs: 2000,
  slowDbFactor: 5,
  /** Metrics cover this trailing window. */
  windowMs: 5000,
} as const;

/** Where a packet goes next; the view animates these. */
export type NodeId = 'client' | 'lb' | `r${number}` | 'cache' | 'db' | 'queue' | 'worker';

export interface Hop {
  from: NodeId;
  to: NodeId;
  at: number;
  /** An error hop (a 503, a refused connection or a timeout), drawn in the error style. */
  error?: boolean;
}

export interface Metrics {
  /** Latency percentiles of successful responses, in ms. */
  p50: number;
  p95: number;
  /** Successful responses per second over the window. */
  throughput: number;
  /** Share of finished requests that failed, 0 to 1. */
  errorRate: number;
  /** Mean requests in the system over the window (for Little's law). */
  inSystem: number;
  meanLatency: number;
  dbUtilisation: number;
  queueDepth: number;
  replicas: { up: boolean; routed: boolean; busy: number; queued: number }[];
}

interface Request {
  id: number;
  start: number;
  replica: number;
  write: boolean;
  dead: boolean;
}

interface Replica {
  up: boolean;
  /** The balancer still routes here until a health check fails. */
  routed: boolean;
  busy: number;
  queue: Request[];
  inFlight: Set<Request>;
  /** Bumped when the replica crashes, so work started before the crash can't free a worker after it. */
  generation: number;
}

type Event = { at: number; seq: number; run: () => void };

/** A small binary min-heap on (at, seq), so equal times run in insertion order. */
class Heap {
  private items: Event[] = [];
  get size() {
    return this.items.length;
  }
  peek(): Event | undefined {
    return this.items[0];
  }
  push(e: Event) {
    const a = this.items;
    a.push(e);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!less(a[i] as Event, a[p] as Event)) break;
      [a[i], a[p]] = [a[p] as Event, a[i] as Event];
      i = p;
    }
  }
  pop(): Event | undefined {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length && last) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const [l, r] = [i * 2 + 1, i * 2 + 2];
        let m = i;
        if (l < a.length && less(a[l] as Event, a[m] as Event)) m = l;
        if (r < a.length && less(a[r] as Event, a[m] as Event)) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m] as Event, a[i] as Event];
        i = m;
      }
    }
    return top;
  }
}
const less = (a: Event, b: Event) => a.at < b.at || (a.at === b.at && a.seq < b.seq);

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** p-th percentile (0–1) of a list, by nearest rank. */
export function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))] ?? 0;
}

export function createSim(initial: Partial<Config> = {}, seed = 1) {
  const random = mulberry32(seed);
  const exp = (mean: number) => -Math.log(1 - random()) * mean;
  const config: Config = { rps: 300, replicas: 2, cache: false, failure: 'none', ...initial };
  const events = new Heap();
  let seq = 0;
  let now = 0;
  let nextId = 0;
  let rr = 0;
  const at = (t: number, run: () => void) => events.push({ at: t, seq: seq++, run });

  const replicas: Replica[] = [];
  const resize = () => {
    while (replicas.length < LIMITS.replicas[1])
      replicas.push({ up: true, routed: true, busy: 0, queue: [], inFlight: new Set(), generation: 0 });
  };
  resize();

  let dbBusy = 0;
  const dbWaiting: (() => void)[] = [];
  let dbBusyTime = 0;
  let dbBusySince = 0;
  const jobs: number[] = [];
  let queueBusy = 0;

  const hops: Hop[] = [];
  const hop = (from: NodeId, to: NodeId, error = false) =>
    hops.push({ from, to, at: now, ...(error ? { error } : {}) });
  /** Finished requests in the window: [finishedAt, latency, ok]. */
  const done: [number, number, boolean][] = [];
  /** Time-weighted count of requests in the system, for the mean. */
  let inSystem = 0;
  let area = 0;
  let areaSince = 0;
  const changeInSystem = (d: number) => {
    area += inSystem * (now - areaSince);
    areaSince = now;
    inSystem += d;
  };
  const areaLog: [number, number, number][] = [[0, 0, 0]];

  const dbStart = (d: number) => {
    dbBusyTime += dbBusy * (now - dbBusySince);
    dbBusySince = now;
    dbBusy += d;
  };
  const dbMean = () => MODEL.dbMs * (config.failure === 'slow-db' ? MODEL.slowDbFactor : 1);

  /** Runs `then` once a database connection has served a query. */
  function database(from: NodeId, then: () => void) {
    hop(from, 'db');
    const serve = () => {
      dbStart(1);
      at(now + exp(dbMean()), () => {
        dbStart(-1);
        const next = dbWaiting.shift();
        if (next) next();
        then();
      });
    };
    if (dbBusy < MODEL.dbConnections) serve();
    else dbWaiting.push(serve);
  }

  function finish(req: Request, ok: boolean) {
    if (req.dead) return;
    req.dead = true;
    const latency = now - req.start;
    const good = ok && latency <= MODEL.timeoutMs;
    done.push([now, latency, good]);
    changeInSystem(-1);
    hop(req.replica >= 0 ? (`r${req.replica}` as NodeId) : 'lb', 'client', !good);
  }

  function release(r: number) {
    const rep = replicas[r] as Replica;
    rep.busy--;
    const next = rep.queue.shift();
    if (next) work(r, next);
  }

  function work(r: number, req: Request) {
    const rep = replicas[r] as Replica;
    const generation = rep.generation;
    const alive = () => rep.up && rep.generation === generation;
    rep.busy++;
    rep.inFlight.add(req);
    // The worker is busy until the whole request is done, even if the client
    // has already timed out; it only stops early when the replica crashes.
    const complete = () => {
      if (!alive()) return;
      rep.inFlight.delete(req);
      finish(req, true);
      release(r);
    };
    at(now + exp(MODEL.appMs), () => {
      if (!alive()) return;
      if (req.write) {
        hop(`r${r}`, 'queue');
        jobs.push(now);
        drainQueue();
        complete();
        return;
      }
      if (config.cache) {
        hop(`r${r}`, 'cache');
        at(now + exp(MODEL.cacheMs), () => {
          if (random() < MODEL.cacheHitRate) complete();
          else database('cache', complete);
        });
      } else database(`r${r}`, complete);
    });
  }

  function drainQueue() {
    while (queueBusy < MODEL.queueWorkers && jobs.length) {
      jobs.shift();
      queueBusy++;
      hop('queue', 'worker');
      database('worker', () => {
        queueBusy--;
        drainQueue();
      });
    }
  }

  function arrive() {
    const req: Request = {
      id: nextId++,
      start: now,
      replica: -1,
      write: random() < MODEL.writeShare,
      dead: false,
    };
    changeInSystem(1);
    hop('client', 'lb');
    const pool = replicas
      .slice(0, config.replicas)
      .map((rep, i) => ({ rep, i }))
      .filter((x) => x.rep.routed);
    const pick = pool.length ? pool[rr++ % pool.length] : undefined;
    if (!pick) {
      finish(req, false);
      return;
    }
    req.replica = pick.i;
    hop('lb', `r${pick.i}`);
    const rep = pick.rep;
    if (!rep.up) {
      // Connection refused: fails fast until the health check removes the replica.
      at(now + 1, () => finish(req, false));
      return;
    }
    if (rep.busy < MODEL.workers) work(pick.i, req);
    else if (rep.queue.length < MODEL.replicaQueue) rep.queue.push(req);
    else finish(req, false);
    // Timeouts: the client gives up after 1 s.
    at(req.start + MODEL.timeoutMs, () => {
      if (req.dead) return;
      const i = rep.queue.indexOf(req);
      if (i >= 0) rep.queue.splice(i, 1);
      finish(req, false);
    });
  }

  function scheduleArrival() {
    at(now + exp(1000 / config.rps), () => {
      arrive();
      scheduleArrival();
    });
  }
  scheduleArrival();

  function applyFailure() {
    const r0 = replicas[0] as Replica;
    if (config.failure === 'replica' && r0.up) {
      r0.up = false;
      // In-flight work on the crashed replica is lost.
      for (const req of r0.inFlight) finish(req, false);
      for (const req of r0.queue) finish(req, false);
      r0.inFlight.clear();
      r0.queue = [];
      r0.busy = 0;
      r0.generation++;
      const crashedAt = now;
      at(crashedAt + MODEL.healthCheckMs, () => {
        if (!r0.up) r0.routed = false;
      });
    } else if (config.failure !== 'replica' && !r0.up) {
      r0.up = true;
      r0.routed = true;
    }
  }

  return {
    get config(): Readonly<Config> {
      return config;
    },
    get now() {
      return now;
    },
    set(next: Partial<Config>) {
      Object.assign(config, next);
      config.rps = Math.min(LIMITS.rps[1], Math.max(LIMITS.rps[0], config.rps));
      config.replicas = Math.min(
        LIMITS.replicas[1],
        Math.max(LIMITS.replicas[0], Math.round(config.replicas)),
      );
      applyFailure();
    },
    /** Runs the simulation forward by `ms`. */
    advance(ms: number) {
      const end = now + ms;
      for (let e = events.peek(); e && e.at <= end; e = events.peek()) {
        events.pop();
        now = e.at;
        e.run();
      }
      now = end;
      changeInSystem(0);
      dbStart(0);
      areaLog.push([now, area, dbBusyTime]);
      while (areaLog.length > 2 && (areaLog[1]?.[0] ?? 0) <= now - MODEL.windowMs) areaLog.shift();
      while (done.length && (done[0]?.[0] ?? 0) < now - MODEL.windowMs) done.shift();
    },
    /** Packets since the last call, for the view. */
    drainHops(): Hop[] {
      return hops.splice(0);
    },
    metrics(): Metrics {
      const span = Math.min(MODEL.windowMs, now) || 1;
      const ok = done.filter((d) => d[2]);
      const latencies = done.map((d) => d[1]);
      const first = areaLog[0] ?? [0, 0, 0];
      const elapsed = Math.max(1, now - first[0]);
      return {
        // Latency percentiles are over successful responses: a rejected request
        // fails in about a millisecond and would make an overload look fast.
        p50: percentile(
          ok.map((d) => d[1]),
          0.5,
        ),
        p95: percentile(
          ok.map((d) => d[1]),
          0.95,
        ),
        throughput: (ok.length / span) * 1000,
        errorRate: done.length ? (done.length - ok.length) / done.length : 0,
        inSystem: (area - first[1]) / elapsed,
        meanLatency: latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0,
        dbUtilisation: Math.min(1, (dbBusyTime - first[2]) / elapsed / MODEL.dbConnections),
        queueDepth: jobs.length,
        replicas: replicas.slice(0, config.replicas).map((r) => ({
          up: r.up,
          routed: r.routed,
          busy: r.busy,
          queued: r.queue.length,
        })),
      };
    },
    /** Test hook: total database busy time so far (connection-milliseconds). */
    dbBusyMs() {
      dbStart(0);
      return dbBusyTime;
    },
  };
}

export type Sim = ReturnType<typeof createSim>;
