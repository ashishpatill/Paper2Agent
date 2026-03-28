# Paper2Agent Studio

## Quick Context
Paper2Agent is a **paper implementation engine** — it takes any ML/AI paper + its reference repo, implements the paper's findings, executes experiments, compares results to reported numbers, and iteratively fixes discrepancies. Output: validated MCP tool servers.

Two layers:
- **Web studio**: `app/`, `components/`, `lib/server/` — Next.js intake, job queue, progress UI
- **Shell pipeline**: `Paper2Agent.sh`, `scripts/`, `prompts/` — 16-step Claude Code driven pipeline

## Commands
```
npm run dev                  # Start web studio
npm run build                # Production build
npm run lint                 # ESLint
npm run job:run -- <job-id>  # Run a paper job
bash Paper2Agent.sh --project_dir <dir> --github_url <repo>
bash scripts/check-publish-safety.sh   # Pre-push audit
```

## Pipeline Steps (current)
| # | Step | Script |
|---|------|--------|
| 1-4 | Setup, clone, folders, MCP | `01_setup_project.sh` → `04_add_context7_mcp.sh` |
| 5.1 | Env + tutorial scan | `05_run_step1_setup_env.sh` |
| 5.2 | Execute tutorials | `05_run_step2_execute_tutorials.sh` |
| 5.3 | Extract tools | `05_run_step3_extract_tools.sh` |
| 5.4 | Wrap MCP server | `05_run_step4_wrap_mcp.sh` |
| 5.5 | Coverage & quality | `05_run_step5_generate_coverage.sh` |
| 5.6-7 | Benchmarks (optional) | `05_run_step6/7_*.sh` |
| 5.8 | **Gap analysis** | `05_run_step8_gap_analysis.sh` |
| 5.9 | **Paper coder** | `05_run_step9_paper_coder.sh` |
| 5.10 | **Experiment runner** | `05_run_step10_experiment_runner.sh` |
| 5.11 | **Results comparator** | `05_run_step11_results_comparator.sh` |
| 5.12 | **Fix loop** | `05_run_step12_fix_loop.sh` |
| 6 | Launch MCP server | `06_launch_mcp.sh` |

## Routing Logic
After step 3 extracts tools, step 8 computes a coverage score:
- `> 0.7` → tutorial track only (steps 9-12 skip)
- `< 0.3` → full implementation track (steps 9-12 run)
- `0.3–0.7` → hybrid (both tracks)

## Phased Delivery Roadmap

### Phase 1 — Foundation (DONE)
Web studio, job system, paper intake, pipeline orchestration, skill graph UI.

### Phase 2 — Pipeline Hardening (DONE)
Bug fixes: atomic job writes, graceful tutorial skip, rg→search_text, non-fatal pytest/pylint.

### Phase 3 — Implementation Track (DONE)
Steps 8-12: gap analysis, paper coder, experiment runner, results comparator, fix loop. Types: `ReportedResult`, `GapAnalysis`, `ExperimentAttempt`, `ResultsComparison`, `FixLoopState`.

### Phase 4 — Sandbox & Safety (DONE)
Docker sandbox for experiment isolation. Anti-fabrication registry (VerifiedRegistry). MCP re-wrap step 13. Network policies (none/setup_only/full).

### Phase 5 — Cross-Run Learning (DONE)
Evolution store with time-decay JSONL. Stage-specific prompt overlays. Cross-run skill transfer. Lesson extraction post-run, overlay injection into steps 8-12.

### Phase 6 — Data Acquisition (NEXT)
Auto-download from HuggingFace/Zenodo/UCI. Synthetic proxy dataset generation. Stratified subsampling for large corpora. Dataset caching.

### Phase 7 — Production (PLANNED)
Multi-paper job queuing. Result dashboards. API for external consumers. Deployment packaging.

## Critical Constraints
- **Never** reveal or return stored provider keys.
- Keep `.paper2agent/local/secrets.json` gitignored and server-only.
- **Never** `git add -f` ignored local/runtime files.
- Treat `.paper2agent/`, `.env.local`, `.claude/settings.local.json`, logs, uploads, generated workspaces as **local-only**.
- If asked to publish: warn about leaking job history, paper URLs, repo URLs, operator notes, logs, secrets metadata.
- If changing web intake flow: verify both paper URL and uploaded PDF source types.
- If touching worker flow: keep compatible with `tsx scripts/run-paper-job.ts <job-id>`.
- Skill graph source of truth: `lib/skills/`. Keep UI, worker, Codex skills, and Claude subagents aligned.
- Run `bash scripts/check-publish-safety.sh` before public pushes.

## Key Types
```
lib/server/types.ts    — PaperAnalysis, GapAnalysis, ExperimentAttempt, ResultsComparison, FixLoopState, JobRecord
lib/skills/catalog.ts  — SkillCatalogEntry (14 skills across 6 stages)
lib/skills/graph.ts    — buildSkillGraph() with dynamic level promotion
```

## Agent Specialists
See `.claude/agents/` for all available subagents. Key ones:
- `paper-intake-strategist` — paper → brief
- `repo-recon-specialist` — validate repo
- `gap-analyst` — coverage scoring + routing
- `paper-coder` — generate experiment code
- `experiment-runner` — sandboxed execution
- `results-comparator` — validate against paper
- `fix-loop-agent` — convergent iteration
- `skill-graph-orchestrator` — workflow routing
