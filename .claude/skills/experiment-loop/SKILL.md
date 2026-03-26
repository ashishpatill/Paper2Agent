---
name: experiment-loop
description: Run the implement-execute-compare-fix loop for uncovered paper capabilities. Use after gap analysis identifies implementation gaps.
user-invocable: true
argument-hint: "[max-attempts]"
---

Run the paper implementation experiment loop.

## Prerequisites
- `reports/gap_analysis.json` must exist with `track` = "implementation" or "hybrid"
- `src/experiments/` should contain generated experiment code (or this will trigger paper-coder first)

## Loop
```
Paper Coder → Experiment Runner → Results Comparator → Fix Loop
     ↑                                                      │
     └──────────── iterate (max $0 or 3 attempts) ─────────┘
```

## Steps
1. Check gap analysis report for track decision.
2. If no experiment code exists, invoke the `paper-coder` agent to generate it.
3. Invoke the `experiment-runner` agent to execute experiments.
4. Invoke the `results-comparator` agent to compare against paper's reported results.
5. If match_score < 0.8, invoke the `fix-loop-agent` to iterate.
6. Report final state: converged/partial/failed, best match score, attempt count.
