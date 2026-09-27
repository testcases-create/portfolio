---
title: Cut escaped visual defects by 38% on a circuit-board line [EDIT]
slug: defect-detection
name: Defect detection
outcomeHeadline: A segmentation model for solder defects, with tracking, a registry, serving and drift monitoring
summary: I trained a segmentation model that finds solder defects on board images and shipped it with a full MLOps pipeline. Over a quarter of line data, defects that reached final test fell by 38%. [EDIT]
problem: Rule-based optical inspection missed small solder bridges and flagged so many false alarms that operators waved boards through. [EDIT]
areas: [ml]
role: ML engineer; I owned the model and the pipeline from labelling to monitoring [EDIT]
team: Me, a data engineer, and two quality engineers who reviewed labels [EDIT]
timeline: May to November 2024 [EDIT]
myScope: Labelling guidelines, training, evaluation, the registry and serving setup, and drift monitoring [EDIT]
stack: [PyTorch, MLflow, Triton, ONNX, Airflow, Grafana, Label Studio]
metrics:
  - label: Escaped defects
    value: −38% [EDIT]
    baseline: Rule-based inspection [EDIT]
    measuredBy: Defects found at final test per 10,000 boards, one quarter before and one quarter after rollout, same product mix [EDIT]
  - label: Recall on bridges
    value: 0.93 [EDIT]
    baseline: 0.71 [EDIT]
    measuredBy: Held-out set of 2,400 labelled images from three lines, stratified by defect type [EDIT]
  - label: False alarms per shift
    value: 11 [EDIT]
    baseline: 64 [EDIT]
    measuredBy: Operator overrides logged over four weeks after rollout [EDIT]
links:
  repo: https://github.com/example/defect-detection [EDIT]
  paper: https://example.com/defect-detection-writeup [EDIT]
confidential: false
featured: true
order: 3
cover:
  alt: A board image with predicted defect masks [EDIT]
  ratio: 4/3
  placeholder: A board image with predicted solder-bridge masks overlaid, one true positive and one near miss labelled [EDIT]
architecture: defect-detection
decisions:
  - question: Classification or segmentation?
    options: [Image classification per board, Object detection, Pixel segmentation]
    chose: Pixel segmentation
    tradeoff: Labels take about four times longer to draw. [EDIT]
    evidence: Segmentation found bridges under 0.2 mm that detection boxes missed; recall on small bridges was 0.93 against 0.78. [EDIT]
  - question: Where does inference run?
    options: [On the line's edge PC, In the plant data centre, In the cloud]
    chose: Plant data centre, on Triton with ONNX
    tradeoff: Depends on the plant network; the line falls back to rule-based inspection if the service is unreachable.
    evidence: p99 inference was 48 ms including transfer, inside the line's 120 ms window. [EDIT]
  - question: How do we know when the model goes stale?
    options: [Retrain on a schedule, Watch accuracy on labelled samples, Watch input and output drift]
    chose: Input and output drift, confirmed by a weekly labelled sample
    tradeoff: Drift alerts need a human to confirm before retraining.
    evidence: Drift on image brightness flagged a camera change two weeks before accuracy dropped. [EDIT]
code:
  - title: Drift check on the prediction stream
    lang: py
    code: |
      def drift_report(ref: Window, live: Window) -> list[Alert]:
          """Compare a live window of predictions with the reference window."""
          alerts = []
          # Inputs: population stability index on image brightness histograms.
          psi = population_stability(ref.brightness_hist, live.brightness_hist)
          if psi > PSI_ALERT:
              alerts.append(Alert("input_drift", value=psi, feature="brightness"))
          # Outputs: the share of boards flagged, per defect type.
          for kind in DEFECT_KINDS:
              delta = live.flag_rate(kind) - ref.flag_rate(kind)
              if abs(delta) > 3 * ref.flag_rate_std(kind):
                  alerts.append(Alert("output_drift", value=delta, feature=kind))
          return alerts
    why: Labels arrive weeks late on a production line, so waiting for accuracy to drop is too slow. Watching what goes in and what comes out catches most problems before they cost anything.
---

## Context and constraints

The line's rule-based inspection missed small solder bridges and raised about 64 false alarms a shift, so operators overrode it by habit. Any model had to fit a 120 ms budget per board, fall back safely, and be explainable to quality engineers. [EDIT]

## Architecture

Images flow from the line cameras to an ingest service and then to the inference service, which loads the current model from the MLflow registry. Predictions go back to the line and into a prediction store. A weekly Airflow job samples boards for labelling in Label Studio, and training runs log to MLflow, where a model is promoted only after it beats the current one on the held-out set. [EDIT]

## Evaluation

The held-out set has 2,400 images from three lines, stratified by defect type and labelled to written guidelines, with two quality engineers checking disagreements. [EDIT]

| Model                 | Bridge recall | Precision | p99 latency |
| --------------------- | ------------- | --------- | ----------- |
| Rule-based (baseline) | 0.71          | 0.44      | 15 ms       |
| Detection (YOLO)      | 0.78          | 0.81      | 31 ms       |
| Segmentation (U-Net)  | 0.93          | 0.86      | 48 ms       |

## Deployment and operations

Models ship as ONNX on Triton in the plant data centre, with a canary on one line for a week before full rollout. Rollback is a registry stage change. Grafana shows latency, flag rates per defect type and drift, and alerts go to the on-call ML engineer. [EDIT]

## Results

Escaped defects fell 38% over the quarter after rollout, and false alarms fell from 64 to 11 a shift, so operators stopped overriding the system. [EDIT]

## What I'd do next

Use active learning to pick which boards get labelled, and try a smaller distilled model on the edge PCs to drop the network dependency. [EDIT]
