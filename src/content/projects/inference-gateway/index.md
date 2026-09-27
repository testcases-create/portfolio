---
title: Cut inference p95 latency from 820 ms to 190 ms [EDIT]
slug: inference-gateway
name: Inference gateway
outcomeHeadline: An inference gateway that batches, caches and rate-limits model traffic
summary: I built the gateway in front of our model servers. Dynamic batching and a response cache cut p95 latency by 77% at the same traffic and hardware, and per-tenant rate limits stopped one noisy client from starving the rest. [EDIT]
problem: Every product team called the model servers directly. Tail latency spiked under load, GPUs sat half idle, and one tenant's batch jobs could stall everyone else. [EDIT]
areas: [sde, ml]
role: Lead engineer; I designed and wrote the gateway [EDIT]
team: Three engineers; I owned batching, caching and the load tests [EDIT]
timeline: March to June 2025 [EDIT]
myScope: Design, the batching scheduler, the cache, load tests and the rollout plan [EDIT]
stack: [Go, gRPC, Redis, Triton, Kubernetes, Prometheus, k6]
metrics:
  - label: p95 latency
    value: 190 ms [EDIT]
    baseline: 820 ms [EDIT]
    measuredBy: k6 at 500 requests per second for 10 minutes, same hardware and payload mix as the baseline [EDIT]
  - label: Throughput per GPU
    value: 4.3× [EDIT]
    measuredBy: Requests per second at the p95 target on one A10G, compared with unbatched serving [EDIT]
  - label: Cache hit rate
    value: 31% [EDIT]
    measuredBy: Seven days of production traffic after rollout, exact-match cache on normalised prompts [EDIT]
links:
  repo: https://github.com/example/inference-gateway [EDIT]
confidential: false
featured: true
order: 6
cover:
  alt: Latency dashboard across the rollout week [EDIT]
  ratio: 16/9
  placeholder: Screenshot of the latency dashboard across the rollout week, p95 line highlighted [EDIT]
architecture: inference-gateway
decisions:
  - question: Where should requests be batched?
    options: [In each model server, In the gateway, In the client SDK]
    chose: In the gateway
    tradeoff: One more network hop and a batching window of up to 8 ms, in exchange for batches that span every client. [EDIT]
    evidence: Average batch size rose from 1.6 to 11.2 requests in the load test, which is where the throughput gain came from. [EDIT]
  - question: How should the cache decide two prompts are the same?
    options: [Exact match on the raw prompt, Exact match on a normalised prompt, Semantic similarity]
    chose: Exact match on a normalised prompt
    tradeoff: Misses paraphrases that a semantic cache would catch, but never serves an answer to a different question.
    evidence: A replay of one day of traffic showed semantic matching at 0.95 similarity would have returned a wrong answer for 2.1% of hits. [EDIT]
  - question: How do tenants share capacity fairly?
    options: [Global rate limit, Per-tenant token buckets, Priority queues per tenant]
    chose: Per-tenant token buckets in Redis
    tradeoff: A burst from one tenant is rejected with 429 instead of queued, so clients need retries with backoff.
    evidence: In a replay of the incident that prompted the project, the other tenants' p95 stayed within 5% of normal. [EDIT]
code:
  - title: The batching loop
    lang: go
    code: |
      // Collect requests until the batch is full or the window closes,
      // whichever comes first. The window bounds the latency we add.
      func (b *Batcher) run(ctx context.Context) {
          for {
              batch := make([]*Request, 0, b.maxBatch)
              first, ok := <-b.queue
              if !ok {
                  return
              }
              batch = append(batch, first)
              deadline := time.NewTimer(b.window)
          fill:
              for len(batch) < b.maxBatch {
                  select {
                  case r := <-b.queue:
                      batch = append(batch, r)
                  case <-deadline.C:
                      break fill
                  }
              }
              deadline.Stop()
              go b.dispatch(ctx, batch)
          }
      }
    why: The timer starts when the first request arrives, not on a fixed tick, so a quiet period adds no latency and a busy one fills batches. That one choice is most of the throughput gain.
---

## Context and constraints

Four product teams called our Triton model servers directly. Under load, p95 latency climbed past 800 ms, yet GPU utilisation stayed below 40%, because each request ran on its own. One tenant's nightly batch jobs had already caused an incident for everyone else. [EDIT]

The constraints: no changes to the model servers, a latency budget of 250 ms at p95, and a rollout that any team could revert on its own. [EDIT]

## Architecture

Clients call the gateway over gRPC. The gateway checks the tenant's token bucket in Redis, then looks for a cached response under a normalised prompt key. On a miss, the request joins the batcher for its model, which sends a batch to Triton when it is full or when its 8 ms window closes. Responses fan back out to their callers and are written to the cache. [EDIT]

## Evaluation

I load-tested with k6 against a staging cluster on the same hardware as production, replaying the production payload mix. [EDIT]

| Configuration               | p95 latency | Requests per second per GPU |
| --------------------------- | ----------- | --------------------------- |
| Direct to Triton (baseline) | 820 ms      | 38                          |
| Gateway, batching only      | 240 ms      | 151                         |
| Gateway, batching and cache | 190 ms      | 163                         |

These figures are from 10-minute runs at 500 requests per second. [EDIT]

## Deployment and operations

The gateway runs as a Kubernetes deployment with three replicas behind the internal load balancer. Teams moved over one at a time by switching an endpoint flag, which also served as the rollback. Prometheus alerts on p95 latency, batch fill and 429 rate per tenant. [EDIT]

## Results

p95 latency fell from 820 ms to 190 ms and throughput per GPU rose 4.3 times, so we returned two of six GPUs to the pool. No tenant has starved another since rollout. [EDIT]

## What I'd do next

Make the batching window adaptive, shrinking it when the queue is short. And measure a semantic cache again on a narrower set of prompts where a near match is safe. [EDIT]
