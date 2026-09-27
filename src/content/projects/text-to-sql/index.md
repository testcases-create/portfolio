---
title: Answered 78% of analysts' questions correctly, up from 52% [EDIT]
slug: text-to-sql
name: Text-to-SQL
outcomeHeadline: Text-to-SQL for the analytics warehouse, evaluated on 650 labelled questions
summary: I built a text-to-SQL service that retrieves only the relevant schema, validates every query before it runs, and executes read-only. Execution accuracy on a labelled set of 650 real questions rose from 52% to 78%. [EDIT]
problem: Analysts waited days for data team help with routine questions, and a prototype that sent the whole schema to a model produced SQL that ran but answered the wrong question. [EDIT]
areas: [llm]
role: Engineer; I built the service and the evaluation [EDIT]
team: Me and one analyst who labelled questions [EDIT]
timeline: February to April 2026 [EDIT]
myScope: Schema retrieval, query validation, the evaluation set and harness, and the Slack interface [EDIT]
stack: [Python, sqlglot, PostgreSQL, BigQuery, FastAPI, pytest]
metrics:
  - label: Execution accuracy
    value: 78% [EDIT]
    baseline: 52% [EDIT]
    measuredBy: 650 labelled questions from analysts' Slack history; a query counts only if its result set matches the reference query's [EDIT]
  - label: Queries rejected before running
    value: 100% of writes [EDIT]
    measuredBy: sqlglot parse check on every generated query, over 3,000 queries in the first month [EDIT]
links:
  repo: https://github.com/example/text-to-sql [EDIT]
confidential: false
featured: true
order: 2
cover:
  alt: A question answered in Slack with its SQL [EDIT]
  ratio: 16/9
  placeholder: Screenshot of a Slack question, the generated SQL and the result table [EDIT]
architecture: text-to-sql
decisions:
  - question: How much of the schema does the model see?
    options:
      [The whole schema, Tables picked by keyword, Tables picked by embedding similarity plus join paths]
    chose: Tables picked by embedding similarity, plus the join paths between them
    tradeoff: A question needing an unusual table can miss it, so the service shows which tables it used.
    evidence: Accuracy rose from 52% with the whole schema to 71% with retrieved tables, and prompts shrank by 85%. [EDIT]
  - question: How do we judge a query correct?
    options: [String match with the reference SQL, Model-graded, Result sets match]
    chose: Result sets match, order-insensitive unless the question asks for an order
    tradeoff: Needs a warehouse snapshot for evaluation runs.
    evidence: String match scored equivalent queries as wrong 23% of the time. [EDIT]
code:
  - title: Validate before execute
    lang: py
    code: |
      def validate(sql: str, allowed: set[str]) -> str:
          """Parse the query, refuse anything but a single SELECT on allowed tables."""
          try:
              statements = sqlglot.parse(sql, read="bigquery")
          except sqlglot.errors.ParseError as err:
              raise Rejected(f"not valid SQL: {err}")
          if len(statements) != 1 or not isinstance(statements[0], exp.Select):
              raise Rejected("only a single SELECT is allowed")
          tables = {t.name for t in statements[0].find_all(exp.Table)}
          if unknown := tables - allowed:
              raise Rejected(f"tables outside the retrieved schema: {sorted(unknown)}")
          # Bound the cost of any one question.
          return statements[0].limit(10_000).sql(dialect="bigquery")
    why: Safety comes from parsing the query, not from the prompt. The service also runs as a read-only role, so this check limits cost and keeps queries inside the tables it said it would use.
---

## Context and constraints

Analysts asked the data team 40 to 60 routine questions a week. A prototype that sent the whole schema to a model produced queries that usually ran but often answered a different question. Any new tool had to be read-only, cheap to run, and honest about uncertainty. [EDIT]

## Architecture

A question arrives from Slack. The service embeds it, retrieves the most relevant tables and the join paths between them, and asks the model for one query. sqlglot parses the query and rejects anything outside a single SELECT on the retrieved tables. The query runs on a read-only warehouse role, and the answer comes back with its SQL and the tables used. [EDIT]

## Evaluation

The labelled set has 650 questions from two years of Slack history, each with a reference query written by an analyst. Evaluation runs against a fixed warehouse snapshot. [EDIT]

| Version                               | Execution accuracy |
| ------------------------------------- | ------------------ |
| Whole schema in the prompt (baseline) | 52%                |
| Retrieved tables                      | 71%                |
| Retrieved tables and join paths       | 78%                |

Most remaining errors are date boundary mistakes (38%) and wrong grain, such as daily instead of weekly (29%). [EDIT]

## Deployment and operations

The service runs on Cloud Run with a per-user daily cost cap. Every question, query and result size is logged, and analysts can mark an answer wrong in Slack, which adds it to a review queue for the eval set. [EDIT]

## Results

Execution accuracy went from 52% to 78%. The data team's routine request volume fell by about half in the first two months. [EDIT]

## What I'd do next

Add explicit date-range handling, the largest error group, and show a confidence signal based on retrieval agreement. [EDIT]
