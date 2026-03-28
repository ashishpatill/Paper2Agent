# Paper2Agent Studio

## Mission
This repository has two layers:

1. The original `Paper2Agent.sh` + `scripts/` + `tools/` research-agent pipeline.
2. A local-first Next.js studio that accepts a paper URL or PDF and orchestrates paper analysis plus pipeline execution.

The pipeline has two tracks that route automatically based on coverage score:
- **Tutorial track** (steps 1-7): extract tools from existing tutorials
- **Implementation track** (steps 8-12): generate, execute, and validate experiments from the paper itself

## Repo Map

### Web Application Layer
- `app/`: Next.js App Router UI and API routes
- `components/`: shadcn-style UI components and studio client components
- `lib/server/`: server-only filesystem, secrets, LLM, intake, and job orchestration helpers
- `lib/skills/`: skill catalog (14 skills, 6 stages) and graph logic
- `scripts/run-paper-job.ts`: background worker that analyzes the paper and triggers `Paper2Agent.sh`

### Pipeline Layer
- `Paper2Agent.sh`: main orchestration script (16 steps)
- `scripts/05_run_step*.sh`: individual step runner scripts
- `scripts/pipeline_helpers.sh`: shared CLI resolution (`require_cli`, `search_text`, `resolve_cli`)
- `prompts/step*.md`: Claude Code agent prompts for each step
- `tools/`, `templates/`, `agents/`: original Paper2Agent pipeline assets

### Runtime (Local Only)
- `.paper2agent/`: local runtime data for jobs, uploads, logs, secrets, and generated workspaces (gitignored)

## Pipeline Architecture

### Tutorial Track (Steps 1-7)
```
Scan tutorials → Execute notebooks → Extract tools → Wrap MCP → Coverage → Benchmarks
```

### Implementation Track (Steps 8-13)
```
Gap Analysis → Paper Coder → Experiment Runner → Results Comparator → Fix Loop → MCP Re-wrap
     ↑                          (sandboxed)                              │
     └────────────────── iterate (max 3 attempts) ──────────────────────┘
```

### Routing
Step 8 computes `coverage_score = covered / total_capabilities`:
- `> 0.7` → tutorial track sufficient, steps 9-12 skip
- `< 0.3` → implementation track, steps 9-12 run
- `0.3–0.7` → hybrid, both tracks run

### Key Design Patterns
- **Immutable evaluation harness**: `*_harness.py` files cannot be modified during fix loops
- **Structured metric protocol**: experiments output `RESULT experiment=X metric=Y value=Z`
- **Hardware-aware code generation**: GPU/MPS/CPU detection injected into prompts
- **Versioned rollback**: experiment files saved as `_v1.py`, `_v2.py` before modification
- **Convergence guards**: max 3 attempts, 2 consecutive non-improvements → stop
- **Scope reduction**: reduce conditions/epochs rather than fail completely
- **Sandbox isolation**: experiments run in Docker (if available) or subprocess with resource limits and network policies
- **Anti-fabrication registry**: every reported metric must trace to an actual experiment artifact

## Phased Delivery

### Phase 1-3: COMPLETE
Foundation, pipeline hardening, implementation track (steps 8-12).

### Phase 4: Sandbox & Safety (COMPLETE)
- Docker sandbox for experiment isolation (`lib/server/sandbox.ts`, `docker/`)
- Anti-fabrication registry for result validation (`lib/server/verified-registry.ts`)
- MCP re-wrap after implementation track (step 13)
- Network policies for sandboxed execution (none/setup_only/full)

### Phase 5: Cross-Run Learning
- Evolution store with time-decay
- Stage-specific prompt overlays
- Cross-run skill transfer

### Phase 6: Data Acquisition
- Auto-download from HuggingFace/Zenodo
- Synthetic proxy dataset generation
- Dataset caching and subsampling

### Phase 7: Production
- Multi-paper job queuing
- Result dashboards
- API for external consumers

## Commands
```
npm install
npm run dev
npm run build
npm run lint
bash Paper2Agent.sh --project_dir <dir> --github_url <repo>
npm run job:run -- <job-id>
bash scripts/install-codex-skills.sh
bash scripts/setup-ai-tooling.sh
bash scripts/check-publish-safety.sh
```

## Guardrails
- Keep secrets server-side only. Use `.paper2agent/local/secrets.json` or environment variables. Never expose raw keys to the browser.
- Do not commit `.env.local`, `.paper2agent/local/`, generated workspaces, or uploads.
- Never use `git add -f` to stage ignored local/runtime files from this repo.
- Treat `.paper2agent/`, `.env.local`, `.claude/settings.local.json`, generated workspaces, uploaded PDFs, logs, and saved secrets as local-only data unless the user explicitly asks to publish sanitized examples.
- If a user asks to publish or push the repo, warn them that staging local job history or generated agent outputs can expose paper URLs, repo URLs, notes, logs, and local secrets metadata.
- Prefer TypeScript for new app/backend code and keep imports relative inside `lib/server/` so the background worker runs under `tsx`.
- Preserve the original shell pipeline semantics. The web app should orchestrate the pipeline, not replace it.
- When adding new AI-provider features, keep provider selection configurable and avoid hardcoding a single vendor path.
- Treat `lib/skills/` as the source of truth for the Paper2Agent skill graph that powers the UI and assistant orchestration hints.

## Publish Safety
- Before any public push or release, run `bash scripts/check-publish-safety.sh`.
- If ignored runtime files were force-added or tracked previously, remove them from the index before pushing.
- Prefer publishing source, prompts, agents, and docs. Do not publish personal Paper2Agent runs by default.

## Claude Code Integration
- Codex should treat this `AGENTS.md` as the repo contract.
- Claude Code should use `CLAUDE.md` for quick project memory and `.mcp.json` for project MCP servers.
- Project-local Claude specialists live in `.claude/agents/`.
- Project-local skills live in `.claude/skills/`.
- Use official docs/tools first for OpenAI and Anthropic questions.
