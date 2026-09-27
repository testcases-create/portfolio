---
title: Raised a support agent's task success from 61% to 84% [EDIT]
slug: support-agent
name: Support agent
outcomeHeadline: A tool-using support agent with retrieval, guardrails and an evaluation harness
summary: I built an agent that resolves order and billing tickets by reading past resolutions and calling internal tools. A 400-task labelled eval set gates every change, and guardrails block any tool call the policy doesn't allow. [EDIT]
problem: Support agents spent most of their time on repetitive order and billing questions, and an earlier chatbot answered confidently but wrongly, so staff stopped trusting it. [EDIT]
areas: [llm]
role: Engineer; I built the agent loop, the retrieval pipeline and the eval harness [EDIT]
team: Two engineers and a support lead who labelled the eval set [EDIT]
timeline: September 2025 to January 2026 [EDIT]
myScope: Agent loop, tool schemas, retrieval, guardrails, the eval harness and its CI gate [EDIT]
stack: [Python, FastAPI, pgvector, OpenTelemetry, Pydantic, pytest]
metrics:
  - label: Task success
    value: 84% [EDIT]
    baseline: 61% [EDIT]
    measuredBy: 400 labelled tickets from three months of history, graded against the resolution a human agent recorded [EDIT]
  - label: p95 latency
    value: 3.2 s [EDIT]
    measuredBy: End to end, including tool calls, over two weeks of shadow traffic [EDIT]
  - label: Cost per 1,000 requests
    value: $1.90 [EDIT]
    measuredBy: Model and embedding charges over the same two weeks, divided by requests served [EDIT]
links:
  repo: https://github.com/example/support-agent [EDIT]
  demo: https://example.com/support-agent-demo [EDIT]
confidential: false
featured: true
order: 1
cover:
  alt: Agent trace view for one ticket [EDIT]
  ratio: 16/9
  placeholder: Screenshot of one ticket's trace, retrieval hits and tool calls shown as spans [EDIT]
architecture: support-agent
decisions:
  - question: How should the agent find relevant past resolutions?
    options: [Keyword search, Dense retrieval over whole tickets, Dense retrieval over resolution steps]
    chose: Dense retrieval over resolution steps, re-ranked by recency
    tradeoff: More chunks to index and a re-ranking step that adds about 120 ms. [EDIT]
    evidence: Recall at 5 on the eval set rose from 0.58 with whole tickets to 0.81 with resolution steps. [EDIT]
  - question: Where do guardrails run?
    options: [In the prompt only, After the model's answer, Before every tool call]
    chose: Before every tool call, with a typed policy per tool
    tradeoff: Every new tool needs a policy written and tested before the agent can use it.
    evidence: In 1,200 red-team prompts, no disallowed refund or account change reached a tool. [EDIT]
  - question: How do we stop regressions from reaching users?
    options: [Manual spot checks, Offline eval on release, Eval gate in CI on every change]
    chose: Eval gate in CI on every change
    tradeoff: CI takes 9 minutes longer and costs about $4 a run. [EDIT]
    evidence: The gate blocked three prompt changes that looked better in spot checks but dropped task success by 4 to 7 points. [EDIT]
code:
  - title: A typed policy checked before each tool call
    lang: py
    code: |
      class RefundPolicy(ToolPolicy):
          tool = "issue_refund"

          def check(self, call: IssueRefund, ctx: TicketContext) -> Verdict:
              if call.order_id not in ctx.customer_order_ids:
                  return Verdict.deny("order does not belong to this customer")
              if call.amount > ctx.order_total(call.order_id):
                  return Verdict.deny("refund exceeds order total")
              if call.amount > REFUND_AUTO_LIMIT:
                  return Verdict.escalate("needs human approval")
              return Verdict.allow()


      def run_tool(call: ToolCall, ctx: TicketContext) -> ToolResult:
          verdict = POLICIES[call.tool].check(call.args, ctx)
          trace.add_event("policy", verdict=verdict.kind, reason=verdict.reason)
          if verdict.kind != "allow":
              return ToolResult.blocked(verdict)
          return TOOLS[call.tool](call.args)
    why: The model never touches a tool directly. Each call is checked against the facts of this ticket, not against the model's own claims, so a persuasive prompt can't talk its way into a refund.
---

## Context and constraints

Order and billing questions made up about 60% of tickets. An earlier chatbot answered them from a static FAQ and was wrong often enough that staff turned it off. The new agent had to act only within strict limits, explain each step, and be measurably better before anyone relied on it. [EDIT]

## Architecture

A ticket arrives through the support API. The orchestrator retrieves similar past resolutions from pgvector, builds a plan with the model, and runs tools one step at a time. Every tool call passes through a typed policy first, and every step is traced with OpenTelemetry, so a reviewer can see exactly why the agent did what it did. [EDIT]

## Evaluation

The eval set has 400 tickets labelled by a support lead with the correct resolution and the tools needed. Each run grades task success, tool-call precision and policy violations. [EDIT]

| Version                         | Task success | Tool-call precision | Violations |
| ------------------------------- | ------------ | ------------------- | ---------- |
| FAQ chatbot (baseline)          | 61%          | n/a                 | n/a        |
| Agent, no retrieval             | 72%          | 0.88                | 0          |
| Agent, retrieval and re-ranking | 84%          | 0.95                | 0          |

The failures fall into three groups: missing account context (41%), ambiguous customer intent (33%) and stale help articles (26%). [EDIT]

## Deployment and operations

The agent ran in shadow mode for two weeks, drafting replies that staff approved or edited. After that it answered directly for the two ticket types with the highest success, with the rest escalated. Latency, cost per request and escalation rate are on one dashboard, with an alert on any policy denial spike. [EDIT]

## Results

Task success rose from 61% to 84% on the eval set. In production the agent now resolves 38% of order and billing tickets without a human, at $1.90 per 1,000 requests. [EDIT]

## What I'd do next

Pull account context in before planning, which addresses the largest failure group. And grade live traffic with a sample of human reviews, so the eval set keeps up with new ticket types. [EDIT]
