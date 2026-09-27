---
title: Cut inference p95 latency from 820 ms to 190 ms [EDIT]
slug: inference-gateway
outcomeHeadline: An inference gateway that batches, caches and rate-limits model traffic [EDIT]
summary: I built the gateway that sits in front of our model servers. Dynamic batching and a response cache cut p95 latency by 77% at the same traffic and hardware, and per-tenant rate limits stopped one noisy client from starving the rest. [EDIT]
areas: [sde, ml]
role: Lead engineer; I designed and wrote the gateway [EDIT]
team: Three engineers; I owned batching and caching [EDIT]
timeline: March to June 2025 [EDIT]
myScope: Design, the batching scheduler, the cache, load tests and rollout [EDIT]
stack: [Go, gRPC, Redis, Triton, Kubernetes, Prometheus, k6]
metrics:
  - label: p95 latency
    value: 190 ms [EDIT]
    baseline: 820 ms [EDIT]
    measuredBy: k6 at 500 requests per second for 10 minutes, same hardware and payload mix as the baseline [EDIT]
  - label: Throughput per GPU
    value: 4.3× [EDIT]
    measuredBy: Requests per second at the p95 target, one A10G, compared with unbatched serving [EDIT]
links:
  repo: https://github.com/example/inference-gateway [EDIT]
confidential: false
featured: true
order: 6
cover:
  alt: Grafana panel of p95 latency before and after the gateway rollout [EDIT]
  ratio: 16/9
  placeholder: Screenshot of the latency dashboard across the rollout week, p95 line highlighted [EDIT]
architecture: inference-gateway
decisions:
  - question: Where should requests be batched? [EDIT]
    options: [In each model server, In the gateway, In the client SDK]
    chose: In the gateway [EDIT]
    tradeoff: One more hop and a batching window of up to 8 ms, in exchange for batches that span every client [EDIT]
    evidence: Batch fill rose from 1.6 to 11.2 requests in the load test [EDIT]
---

## Context and constraints

The full write-up arrives in Phase 3. [EDIT]
