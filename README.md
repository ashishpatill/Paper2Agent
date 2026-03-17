<p align="center">
  <img src="./logo/paper2agent_logo.png" alt="Paper2Agent logo" width="600" />
</p>

# Paper2Agent Studio

An open-source fork of [jmiao24/Paper2Agent](https://github.com/jmiao24/Paper2Agent) that keeps the original Claude Code driven paper-to-agent pipeline, and adds a local-first web studio, job orchestration layer, skill graph system, and safer open-source packaging.

## Attribution

This project is built on top of the original [Paper2Agent](https://github.com/jmiao24/Paper2Agent) by Jiacheng Miao and contributors.

- Upstream repository: [jmiao24/Paper2Agent](https://github.com/jmiao24/Paper2Agent)
- Upstream author: Jiacheng Miao
- Upstream license: MIT

This fork retains the upstream MIT license and preserves the original shell pipeline, prompts, agents, and tooling model, while extending the project with a productized local UI and orchestration experience.

## What This Fork Adds

This fork substantially extends the original repository in the following areas.

### 1. Local-first web studio

Built with Next.js, TypeScript, and shadcn-style UI components.

- Paste a paper URL or upload a PDF.
- Save model keys locally without committing them.
- Create jobs from the browser instead of manually driving the shell flow.
- See recent jobs, persistent inputs, workspace paths, and pipeline state in one place.

### 2. Background job system

The repo now includes a real server-side job layer for paper intake and orchestration.

- Job records persist under `.paper2agent/jobs/`.
- Uploaded PDFs, analysis output, logs, and workspaces are tracked per job.
- The UI polls job state and shows progress, current stage, and diagnostics.
- Retry is supported from the browser.

### 3. Progress-aware pipeline orchestration

The original `Paper2Agent.sh` pipeline is still the execution engine, but this fork wraps it with a richer controller.

- Live pipeline stage parsing from shell output.
- Stalled-job detection in the UI.
- Pause, resume, and stop controls for active jobs.
- Better failure diagnosis for auth, clone, disk, tutorial, and pipeline issues.

### 4. Paper intake with provider-backed analysis

Before launching the original pipeline, the app analyzes the submitted paper.

- Accepts either URL or PDF input.
- Extracts paper text server-side.
- Uses Gemini or OpenRouter for paper summarization and repo inference.
- Persists analysis artifacts for each job.

### 5. Skill graph system for Codex and Claude Code

This fork models the workflow as reusable skills instead of a flat pipeline.

- A typed skill catalog and dependency graph drive the UI.
- Codex skill packs live in `codex-skills/`.
- Claude specialists live in `.claude/agents/`.
- The UI shows which capabilities are core, recommended, or optional for a paper.

### 6. Open-source hygiene and safer local runtime behavior

- Runtime data is isolated under `.paper2agent/` and gitignored.
- `.env.local`, local Claude settings, uploads, logs, workspaces, and saved secrets are excluded from source control.
- PDF intake has size and timeout guardrails.
- The pipeline no longer over-reports success for skipped benchmark steps or swallowed coverage failures.

### 7. Local feasibility preflight

This fork adds an early implementability check before launching the full pipeline.

- Detects obvious out-of-scope repos that require large GPU clusters, TPU pods, hosted-only services, or unavailable proprietary components.
- Marks those jobs as `not_implementable` early instead of wasting a full local run.
- Allows risky but still plausible repos to continue with warnings.

## What Stays From Upstream

This fork deliberately keeps the original Paper2Agent execution model intact.

- `Paper2Agent.sh` remains the main pipeline entrypoint.
- The original `scripts/`, `tools/`, `agents/`, `prompts/`, and `templates/` directories remain central to agent generation.
- Claude Code is still the main coding/orchestration runtime for the heavy implementation steps.
- The final output is still a generated MCP-capable agent workspace built from the target repository.

## Architecture

There are now two layers in this repository:

1. The original research pipeline
   - `Paper2Agent.sh`
   - `scripts/`
   - `tools/`
   - `agents/`
   - `prompts/`
   - `templates/`

2. The new application layer
   - `app/`
   - `components/`
   - `lib/server/`
   - `lib/skills/`
   - `scripts/run-paper-job.ts`

The application layer performs paper intake, repo inference, safety checks, job orchestration, and UI state management. The original pipeline layer performs environment setup, tutorial execution, tool extraction, MCP wrapping, and evaluation.

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

## Model and key configuration

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

## Claude Code requirement

The web app uses Gemini/OpenRouter for paper analysis, but the original Paper2Agent implementation pipeline still relies on the `claude` CLI for tutorial execution, extraction, and orchestration.

That means a successful end-to-end run requires:

- provider keys for the intake layer
- a valid `claude` CLI login for the implementation layer

## Typical workflow

1. Open the studio UI.
2. Paste a paper URL or upload a PDF.
3. Optionally set a repository override, project name, and notes.
4. Save provider keys locally.
5. Start a job.
6. The app analyzes the paper, infers or uses the repo, runs feasibility checks, and then launches `Paper2Agent.sh`.
7. If successful, the generated workspace appears under `.paper2agent/workspaces/<job>/`.

## Output

A successful run produces a workspace like:

```text
.paper2agent/workspaces/<project>-<job-id>/
├── src/
│   ├── <repo_name>_mcp.py
│   └── tools/
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

## Repository map

- `app/`: Next.js App Router pages and API routes
- `components/`: studio UI and shared components
- `lib/server/`: jobs, pipeline, secrets, intake, and diagnostics
- `lib/skills/`: skill catalog and graph logic
- `codex-skills/`: installable Codex skill packs
- `.claude/agents/`: Claude Code specialists for this repo
- `.claude/commands/`: project commands for Claude Code
- `Paper2Agent.sh`: original shell pipeline entrypoint
- `scripts/`: shell pipeline steps plus app helper scripts

## Open-source safety notes

This repo is prepared for public use with the assumption that the following remain local-only:

- `.paper2agent/`
- `.env.local`
- `.claude/settings.local.json`
- generated workspaces
- uploaded PDFs
- saved provider keys

If you fork or contribute, do not commit those files.

## Developer notes

Useful commands:

```bash
npm run dev
npm run build
npm run lint
npm run job:run -- <job-id>
bash scripts/install-codex-skills.sh
bash scripts/setup-ai-tooling.sh
```

Project guidance for coding agents:

- [AGENTS.md](./AGENTS.md)
- [CLAUDE.md](./CLAUDE.md)

## License

This repository remains licensed under the MIT License. See [LICENSE](./LICENSE).
