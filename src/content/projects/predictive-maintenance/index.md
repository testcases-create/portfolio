---
title: Cut false maintenance alarms by 30% without missing failures [EDIT]
slug: predictive-maintenance
name: Predictive maintenance
outcomeHeadline: An applied failure-prediction model for industrial equipment, described in general terms
summary: At my current company I built a model that predicts equipment failures from sensor data for a manufacturing customer. It cut false alarms by 30% at the same recall. Details of the customer and their systems stay confidential. [EDIT]
problem: Threshold alarms on sensor readings fired so often that maintenance teams ignored them, and real failures still caused unplanned downtime. [EDIT]
areas: [ml]
role: ML engineer; I built the features, the model and its evaluation [EDIT]
team: Four people across data engineering, ML and the customer's maintenance team [EDIT]
timeline: 2025 [EDIT]
myScope: Feature engineering, model selection, the evaluation protocol and the alert policy [EDIT]
stack: [Python, LightGBM, pandas, Airflow, MLflow]
metrics:
  - label: False alarms
    value: −30% [EDIT]
    baseline: Threshold alarms [EDIT]
    measuredBy: Alarms per machine per month on a held-out six-month period, at equal recall on recorded failures [EDIT]
  - label: Recall on failures
    value: 0.87 [EDIT]
    measuredBy: Recorded failures in the held-out period caught at least 24 hours ahead [EDIT]
links: {}
confidential: true
featured: true
order: 4
cover:
  alt: Illustrative chart of alarms before and after [EDIT]
  ratio: 16/9
  placeholder: An illustrative chart (no customer data) of alarms per month before and after rollout [EDIT]
architecture: predictive-maintenance
decisions:
  - question: How do we split data for evaluation?
    options: [Random split, Split by machine, Split by time]
    chose: Split by time, with the latest six months held out
    tradeoff: Less training data from recent conditions.
    evidence: A random split overstated recall by 11 points because readings from the same failure leaked across the split. [EDIT]
  - question: What decides an alert?
    options:
      [
        A fixed probability threshold,
        A threshold per machine type,
        Cost-weighted thresholds agreed with maintenance,
      ]
    chose: Cost-weighted thresholds agreed with the maintenance team
    tradeoff: Thresholds need review when repair costs change.
    evidence: The maintenance team accepted the alert volume in a four-week pilot, the first time any alarm system passed that test. [EDIT]
code:
  - title: Time-based evaluation without leakage
    lang: py
    code: |
      def time_split(df: pd.DataFrame, holdout_months: int = 6, gap_days: int = 14):
          """Train on the past, evaluate on the future, with a gap between them.

          The gap stops features computed over rolling windows from
          seeing readings that belong to the evaluation period.
          """
          cutoff = df["ts"].max() - pd.DateOffset(months=holdout_months)
          train = df[df["ts"] < cutoff - pd.Timedelta(days=gap_days)]
          test = df[df["ts"] >= cutoff]
          assert train["ts"].max() < test["ts"].min()
          return train, test
    why: Rolling-window features quietly leak the future into training. The gap is the difference between a model that looks good offline and one that holds up after rollout.
---

## Context and constraints

This project is confidential. The customer, their equipment and their data stay private, so this page describes the approach and the measured outcome only. [EDIT]

Threshold alarms on sensor readings fired several times a week per machine, most of them false, and teams had learned to ignore them. The goal was fewer, more trusted alarms without missing real failures. [EDIT]

## Architecture

Sensor readings land in the customer's data platform. A daily Airflow job builds rolling-window features per machine, scores them with the current model from the registry, and sends alerts above a cost-weighted threshold to the maintenance team's existing ticketing tool. [EDIT]

## Evaluation

Evaluation uses a time-based split with a 14-day gap and the latest six months held out, and compares against the threshold alarms at equal recall. [EDIT]

| Approach                    | Recall (24 h ahead) | False alarms per machine-month |
| --------------------------- | ------------------- | ------------------------------ |
| Threshold alarms (baseline) | 0.87                | 4.6                            |
| Gradient-boosted model      | 0.87                | 3.2                            |

## Deployment and operations

The model runs as a daily batch job. A four-week pilot with one site's maintenance team came before the full rollout, and the alert thresholds are reviewed with them each quarter. [EDIT]

## Results

False alarms fell by 30% at the same recall, and the maintenance team now acts on the alerts. [EDIT]

## What I'd do next

Add remaining-useful-life estimates so teams can plan repairs, not only react to alerts. [EDIT]
