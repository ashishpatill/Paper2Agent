<p align="center">
  <img src="./logo/paper2agent_logo.png" alt="Paper2Agent logo" width="600" />
</p>

# Paper2Agent Studio

Paper2Agent Studio is a major local-first extension of the original
[jmiao24/Paper2Agent](https://github.com/jmiao24/Paper2Agent).

It keeps the original paper-to-agent idea and the shell-driven research pipeline,
but adds a full application layer around it: paper intake, provider-backed
analysis, job orchestration, progress tracking, implementation routing, safer
runtime handling, results dashboards, queueing, and feedback-aware operation.

This is still a fork. It is also now meaningfully more than a forked README or
UI wrapper.

## Attribution

This project is built on top of the original
[Paper2Agent](https://github.com/jmiao24/Paper2Agent) by Jiacheng Miao and
contributors.

- Upstream repository: [jmiao24/Paper2Agent](https://github.com/jmiao24/Paper2Agent)
- Upstream author: Jiacheng Miao
- Upstream license: MIT

The upstream repository established the core concept and the original
Claude Code driven shell pipeline. This fork preserves that work, retains the
MIT license, and keeps the original prompts, tools, agents, and pipeline
structure as first-class assets.

What this fork adds is a substantial productization and systems layer around
that foundation.

## Why This Fork Is Significant

This repository is no longer just "Paper2Agent with a web page."

Compared with upstream, this fork now includes:

- A local-first Next.js studio for submitting papers, configuring providers,
  watching jobs, viewing logs, and inspecting results.
- A persistent job system with background workers, queueing, retry, pause,
  resume, stop, validation, and feedback-aware handoff.
- A two-track execution model:
  tutorial extraction when repository coverage is high, and direct paper
  implementation when coverage is low.
- An implementation track that can generate experiments, run them, compare
  results to the paper, iterate through a fix loop, and re-wrap tools into MCP.
- Safety and realism features such as feasibility screening, sandbox-oriented
  execution, anti-fabrication result validation, and publish-safety guardrails.
- Cross-run learning and prompt overlays so prior runs can improve future ones.
- Dataset acquisition and synthetic proxy generation for papers that depend on
  external or unavailable data.

In practice, that means this repo is now closer to a paper implementation
workbench and orchestration studio than a single research script pipeline.

## What Stays From Upstream

This fork deliberately keeps the original Paper2Agent execution model intact.

- `Paper2Agent.sh` remains the main pipeline entrypoint.
- The original `scripts/`, `tools/`, `agents/`, `prompts/`, and `templates/`
  directories remain central to generation and evaluation.
- Claude Code remains a primary execution runtime for the heavy implementation
  steps.
- The final artifact is still a generated MCP-capable workspace for the target
  repository.

## What This Fork Adds

### 1. Local-first Studio

Built with Next.js, TypeScript, and shadcn-style components.

- Paste a paper URL or upload a PDF
- Configure provider keys locally
- Create and retry jobs from the browser
- Inspect job details, logs, progress, and results in one place

### 2. Persistent Job Orchestration

The repository now has a real app-layer runtime, not just a shell invocation.

- Job records persist under `.paper2agent/jobs/`
- Uploaded PDFs, logs, workspaces, and paper-analysis artifacts are tracked per job
- Background workers run jobs outside the request lifecycle
- Local queueing prevents unbounded worker spawning
- Jobs support pause, resume, stop, retry, validation, and feedback submission

### 3. Progress-aware Pipeline Control

The shell pipeline is still the engine, but it is now wrapped with a richer
controller.

- Step parsing from shell output
- Timeline and live log views
- Stall detection and heartbeat tracking
- Better failure diagnosis for auth, clone, disk, tutorial, and pipeline issues
- Results and validation surfaces in the UI

### 4. Paper Intake and Repository Inference

Before the original pipeline runs, the app analyzes the paper itself.

- Accepts both URL and PDF sources
- Extracts paper text server-side
- Uses Gemini or OpenRouter for paper summarization and repository inference
- Persists paper-analysis artifacts for later review

### 5. Two-track Routing

This fork adds automatic routing based on repository coverage.

- **Tutorial track**: when extracted repository/tutorial tools already cover the paper well
- **Implementation track**: when the paper requires direct experiment generation
- **Hybrid track**: when both extraction and implementation are needed

Routing is driven by a computed `coverage_score`.

### 6. Paper Implementation Track

This is one of the biggest functional additions over upstream.

The implementation track introduces steps for:

- gap analysis
- paper coder generation
- experiment execution
- results comparison
- fix-loop iteration
- MCP re-wrap for implementation-derived tools

This turns the repo from "extract tools from tutorials" into "attempt to
implement and validate paper findings directly."

### 7. Safer and More Realistic Execution

- Early feasibility checks for obviously non-local repos
- Sandbox-aware experiment execution paths
- Anti-fabrication result validation helpers
- Structured metric protocol for experiments
- Immutable evaluation harnesses in the fix loop
- Scope reduction rules instead of brittle all-or-nothing failure behavior

### 8. Cross-run Learning

This fork adds memory between runs.

- Evolution store with time-decay JSONL
- Prompt overlays for later runs
- Skill transfer from prior experiments, gap analyses, and fix loops

### 9. Data Acquisition

- Dataset resolution across HuggingFace, Zenodo, UCI, Kaggle, and direct URLs
- Cached downloading
- Synthetic proxy generation for unavailable datasets
- Integration into implementation pre-flight flow

### 10. Open-source and Local-runtime Hygiene

- Runtime data isolated under `.paper2agent/`
- safer gitignore defaults for secrets, uploads, logs, and workspaces
- local-only secret storage
- publish-safety checks before public pushes

## Architecture

This repository now has two cooperating layers.

### 1. Original Research Pipeline Layer

- `Paper2Agent.sh`
- `scripts/`
- `tools/`
- `agents/`
- `prompts/`
- `templates/`

This layer performs environment setup, tutorial execution, tool extraction,
MCP wrapping, evaluation, and implementation-track execution.

### 2. Application / Studio Layer

- `app/`
- `components/`
- `lib/server/`
- `lib/skills/`
- `scripts/run-paper-job.ts`

This layer performs intake, job orchestration, provider selection, feasibility
checks, queueing, progress tracking, validation, feedback handling, and results
presentation.

## Current Runtime Capabilities

Today this fork supports:

- paper URL or PDF submission
- provider-backed paper analysis
- repository inference or manual override
- feasibility preflight
- queued background job execution
- live logs and pipeline timeline
- results dashboards backed by workspace artifacts
- workspace validation
- user feedback ingestion into later pipeline steps

## Repository Map

- `app/`: Next.js App Router pages and API routes
- `components/`: studio UI and shared components
- `lib/server/`: jobs, queueing, pipeline, secrets, intake, datasets, validation
- `lib/skills/`: skill catalog and graph logic
- `codex-skills/`: installable Codex skill packs
- `.claude/agents/`: Claude Code specialists for this repo
- `Paper2Agent.sh`: original shell pipeline entrypoint
- `scripts/`: shell pipeline steps plus app helper scripts

## Quick Start

### Requirements

- Node.js 20+
- npm
- Python 3.10+
- `claude` CLI installed and authenticated

### Install

```bash
npm install
```

### Run the app

```bash
./run-app.sh dev
```

Then open [http://localhost:3000](http://localhost:3000).

### Alternative commands

```bash
./run-app.sh install
./run-app.sh build
./run-app.sh start
./run-app.sh check
```

## Model and Key Configuration

This fork currently supports:

- Gemini
- OpenRouter

Keys can be provided in either of these ways:

1. Through the web UI
   - Saved locally to `.paper2agent/local/secrets.json`
   - Never sent back to the browser after save

2. Through environment variables
   - Use `.env.example` as a template

Neither `.env.local` nor `.paper2agent/` is committed.

## End-to-end Workflow

1. Open the studio UI.
2. Paste a paper URL or upload a PDF.
3. Optionally set a repository override, project name, and notes.
4. Save provider keys locally.
5. Start a job.
6. The app analyzes the paper and infers or accepts the target repository.
7. The app runs a local feasibility preflight.
8. The scheduler assigns the job to an available worker.
9. `Paper2Agent.sh` runs the tutorial and/or implementation track.
10. The UI shows logs, timeline, results, validation, and artifact-backed status.

## Output

A successful run produces a workspace like:

```text
.paper2agent/workspaces/<project>-<job-id>/
├── src/
│   ├── <repo_name>_mcp.py
│   ├── tools/
│   └── experiments/
├── tests/
├── reports/
├── repo/
├── claude_outputs/
└── <repo_name>-env/
```

You will also see:

- job metadata in `.paper2agent/jobs/<job-id>/job.json`
- logs in `.paper2agent/logs/<job-id>.log`
- uploaded PDFs in `.paper2agent/uploads/<job-id>/`

## Safety Notes

This repo is prepared for public use with the assumption that the following
remain local-only:

- `.paper2agent/`
- `.env.local`
- `.claude/settings.local.json`
- generated workspaces
- uploaded PDFs
- saved provider keys

If you fork or contribute, do not commit those files.

Before any public push or release, run:

```bash
bash scripts/check-publish-safety.sh
```

## Developer Notes

Useful commands:

```bash
npm run dev
npm run build
npm run lint
npm run job:run -- <job-id>
npm run job:validate -- <workspace-path> [repo-name]
bash scripts/install-codex-skills.sh
bash scripts/setup-ai-tooling.sh
bash scripts/check-publish-safety.sh
```

Project guidance for coding agents:

- [AGENTS.md](./AGENTS.md)
- [CLAUDE.md](./CLAUDE.md)

## License

This repository remains licensed under the MIT License.
See [LICENSE](./LICENSE).
