---
title: Held order p99 under 300 ms at 2,000 orders a minute [EDIT]
slug: order-fulfilment
name: Order and fulfilment
outcomeHeadline: An order and fulfilment system split into services, with end-to-end and load tests
summary: I designed and built order, inventory and fulfilment services around an event log, with an outbox for reliable publishing and contract plus end-to-end tests. A k6 load test at 2,000 orders a minute held p99 under 300 ms with no lost or duplicated orders. [EDIT]
problem: A single order service did payment, stock and shipping in one transaction, so a slow payment provider held database locks and checkout stalled at peak. [EDIT]
areas: [sde]
role: Engineer; I designed the service split and built orders and inventory [EDIT]
team: Four engineers; a teammate built fulfilment [EDIT]
timeline: 2023 [EDIT]
myScope: Service boundaries, the outbox and idempotency design, the test suite and the load tests [EDIT]
stack: [Java, Spring Boot, PostgreSQL, Kafka, Testcontainers, k6, Kubernetes]
metrics:
  - label: p99 checkout latency
    value: 280 ms [EDIT]
    baseline: 1.9 s [EDIT]
    measuredBy: k6 at 2,000 orders per minute for 30 minutes on a staging cluster sized like production [EDIT]
  - label: Lost or duplicated orders
    value: 0 [EDIT]
    measuredBy: Reconciliation of 60,000 load-test orders against payments and stock, including a broker restart mid-run [EDIT]
links:
  repo: https://github.com/example/order-fulfilment [EDIT]
confidential: false
featured: true
order: 5
cover:
  alt: Load-test dashboard at 2,000 orders a minute [EDIT]
  ratio: 16/9
  placeholder: Screenshot of the k6 dashboard at 2,000 orders a minute, p99 line highlighted [EDIT]
architecture: order-fulfilment
decisions:
  - question: How do services learn that an order was placed?
    options: [Synchronous calls, Publish to Kafka after commit, Transactional outbox]
    chose: Transactional outbox, relayed to Kafka
    tradeoff: An extra table and a relay process, and events arrive after a short delay.
    evidence: A broker restart during the load test lost no events; the earlier publish-after-commit version lost 14 in the same test. [EDIT]
  - question: What stops a retried request from charging twice?
    options: [Rely on the payment provider, Idempotency keys stored per request]
    chose: Idempotency keys, stored with the order in the same transaction
    tradeoff: Clients must send a key, and keys are kept for 7 days.
    evidence: A fault-injection test retried 5% of requests; payments matched orders exactly. [EDIT]
code:
  - title: Writing the order and its event in one transaction
    lang: java
    code: |
      @Transactional
      public Order place(PlaceOrder cmd) {
          var existing = orders.findByIdempotencyKey(cmd.idempotencyKey());
          if (existing.isPresent()) {
              return existing.get(); // a retry: same answer, no second charge
          }
          var order = Order.from(cmd);
          orders.save(order);
          // Same transaction: the event exists if and only if the order does.
          outbox.save(OutboxEvent.of("order.placed", order.id(), order.toEvent()));
          return order;
      }
    why: Writing the event to a table in the same transaction removes the gap where an order commits but its event is lost. The relay can then publish at least once, and consumers deduplicate by order id.
---

## Context and constraints

Checkout did payment, stock and shipping in one database transaction. At peak, a slow payment provider held locks long enough for checkout to stall for everyone. The fix had to keep orders exactly once and let each part scale on its own. [EDIT]

## Architecture

The API gateway sends checkout to the order service, which records the order and an outbox event in one transaction. A relay publishes events to Kafka. Payment, inventory and fulfilment services consume them, each with its own database, and publish their own results back. [EDIT]

## Evaluation

Contract tests check every event schema between services, and end-to-end tests run the whole flow on Testcontainers. The load test ran k6 at 2,000 orders a minute for 30 minutes, including a Kafka broker restart. [EDIT]

| Version                        | p99 checkout | Lost or duplicated orders |
| ------------------------------ | ------------ | ------------------------- |
| Single service (baseline)      | 1.9 s        | 0                         |
| Services, publish after commit | 260 ms       | 14 lost                   |
| Services, transactional outbox | 280 ms       | 0                         |

## Deployment and operations

Each service deploys on its own through the same pipeline, with a canary and automatic rollback on error rate. Consumer lag and outbox age have alerts, since either growing means orders are waiting. [EDIT]

## Results

p99 checkout dropped from 1.9 s to 280 ms at twice the previous peak load, with no lost or duplicated orders in reconciliation. [EDIT]

## What I'd do next

Replace the outbox poller with change data capture to cut event delay, and add chaos tests to the nightly pipeline. [EDIT]
