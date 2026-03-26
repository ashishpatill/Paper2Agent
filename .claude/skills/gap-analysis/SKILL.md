---
name: gap-analysis
description: Analyze coverage gaps between a paper's capabilities and extracted tools. Use after tool extraction to determine whether the implementation track is needed.
user-invocable: true
context: fork
agent: gap-analyst
---

Run gap analysis on the current workspace.

1. Read `reports/gap_analysis.json` if it exists (show existing results).
2. If it doesn't exist, inventory `src/tools/*.py` and map against paper capabilities.
3. Compute coverage score and determine track (tutorial/implementation/hybrid).
4. Report:
   - Coverage score (0.0–1.0)
   - Track decision
   - Covered vs uncovered capabilities
   - Each gap with complexity and data requirements
   - Recommended next action
