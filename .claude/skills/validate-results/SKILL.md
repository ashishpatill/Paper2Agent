---
name: validate-results
description: Compare experiment results against the paper's reported findings. Use to check reproduction fidelity without running the full fix loop.
user-invocable: true
context: fork
agent: results-comparator
---

Validate experiment results against the paper's reported findings.

1. Load `reports/experiment_results/summary.json` and individual result files.
2. Load the paper's `reported_results[]` from the paper analysis.
3. Match and compare each metric with direction-aware thresholds.
4. Report:
   - Overall match: strong/approximate/weak/mismatch
   - Match score (0.0–1.0)
   - Per-metric comparison table
   - Which metrics are within threshold
   - Which metrics need improvement
   - Recommended next action (continue, fix loop, or accept)
