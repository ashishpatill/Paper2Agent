---
name: phase-status
description: Show the current project delivery phase status, what's been completed, and what's next. Use to understand project progress.
user-invocable: true
---

Report on the Paper2Agent phased delivery status.

## Check each phase:

### Phase 1 — Foundation
- [x] Web studio (`app/`, `components/`)
- [x] Job system (`lib/server/jobs.ts`)
- [x] Paper intake (`lib/server/paper-intake.ts`)
- [x] Pipeline orchestration (`lib/server/pipeline.ts`)
- [x] Skill graph (`lib/skills/`)

### Phase 2 — Pipeline Hardening
- [x] Atomic job writes
- [x] Graceful tutorial skip (exit code 10)
- [x] `pipeline_helpers.sh` (rg→search_text)
- [x] Non-fatal pytest/pylint failures

### Phase 3 — Implementation Track
- [x] Step 8: Gap analysis
- [x] Step 9: Paper coder
- [x] Step 10: Experiment runner
- [x] Step 11: Results comparator
- [x] Step 12: Fix loop
- [x] Types: ReportedResult, GapAnalysis, ExperimentAttempt, ResultsComparison, FixLoopState
- [x] Skill graph: 5 new "implement" stage skills

### Phase 4 — Sandbox & Safety (NEXT)
- [ ] Docker sandbox for experiment isolation
- [ ] Anti-fabrication registry (VerifiedRegistry)
- [ ] MCP re-wrap after implementation track
- [ ] Network policies for sandboxed execution

### Phase 5 — Cross-Run Learning
- [ ] Evolution store with time-decay JSONL
- [ ] Stage-specific prompt overlays
- [ ] Cross-run skill transfer

### Phase 6 — Data Acquisition
- [ ] Auto-download from HuggingFace/Zenodo
- [ ] Synthetic proxy dataset generation
- [ ] Dataset caching and subsampling

### Phase 7 — Production
- [ ] Multi-paper job queuing
- [ ] Result dashboards
- [ ] API for external consumers

Report which phase is current, what tasks remain, and suggest next actions.
