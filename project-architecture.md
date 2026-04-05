# Paper2Agent Studio — Project Architecture

> **Last Updated:** 2026-04-05
> **Version:** 0.1.0
> **Status:** Phases 1-6 complete, Phase 7 substantially complete

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture Layers](#2-architecture-layers)
3. [Directory Structure](#3-directory-structure)
4. [Tech Stack](#4-tech-stack)
5. [Pipeline Architecture](#5-pipeline-architecture)
6. [Application Layer](#6-application-layer)
7. [Server-Side Modules](#7-server-side-modules)
8. [Skill Graph System](#8-skill-graph-system)
9. [API Endpoints](#9-api-endpoints)
10. [UI Components](#10-ui-components)
11. [Data Flow](#11-data-flow)
12. [Job Lifecycle](#12-job-lifecycle)
13. [Sandbox & Security](#13-sandbox--security)
14. [Cross-Run Learning](#14-cross-run-learning)
15. [Data Acquisition](#15-data-acquisition)
16. [Configuration & Secrets](#16-configuration--secrets)
17. [Development Workflow](#17-development-workflow)
18. [Debugging Guide](#18-debugging-guide)
19. [Known Issues & Technical Debt](#19-known-issues--technical-debt)
20. [Completed vs Remaining Features](#20-completed-vs-remaining-features)

---

## 1. Project Overview

**Paper2Agent Studio** is a local-first Next.js orchestration studio built on top of the original [jmiao24/Paper2Agent](https://github.com/jmiao24/Paper2Agent) research pipeline. It converts academic papers into functional MCP-capable agent workspaces through a dual-track pipeline (tutorial extraction + paper implementation).

### Mission

Transform academic ML/AI papers into working agent tools by:
1. Finding and executing existing tutorials in the paper's reference repository
2. Extracting reusable tools from those tutorials
3. Wrapping tools as an MCP (Model Context Protocol) server
4. When tutorials are insufficient, implementing experiments directly from the paper
5. Validating results against paper-reported metrics

### Key Design Principles

- **Local-first**: All data lives on disk under `.paper2agent/`; no cloud sync
- **Shell pipeline preserved**: `Paper2Agent.sh` remains the execution engine; the web app orchestrates, not replaces
- **Provider-agnostic**: Supports Gemini and OpenRouter; configurable via secrets
- **Immutable evaluation**: `*_harness.py` files cannot be modified during fix loops
- **Anti-fabrication**: Every reported metric must trace to an actual experiment artifact

---

## 2. Architecture Layers

```
┌────────────────────────────────────────────────────────────────────┐
│                       Next.js Studio (UI)                          │
│  ┌─────────────┐  ┌────────────────┐  ┌────────────────────────┐  │
│  │  app/        │  │  components/   │  │  lib/server/           │  │
│  │  (routes)    │  │  (27 .tsx)     │  │  (23 .ts modules)      │  │
│  └──────┬──────┘  └───────┬────────┘  └───────────┬────────────┘  │
│         └──────────────────┴───────────────────────┘               │
└──────────────────────────────┬─────────────────────────────────────┘
                               │
                    ┌──────────▼───────────┐
                    │  Background Worker    │
                    │  scripts/run-paper-   │
                    │  job.ts               │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │  lib/server/          │
                    │  pipeline.ts          │
                    │  (spawns shell)       │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │  Paper2Agent.sh       │
                    │  (18 steps total)     │
                    └──────────┬───────────┘
              ┌────────────────┼────────────────┐
              │                │                │
       ┌──────▼──────┐  ┌─────▼──────┐  ┌─────▼──────┐
       │  scripts/   │  │  agents/   │  │  tools/    │
       │  (35 files) │  │  (10 .md)  │  │  (5 .py)   │
       └─────────────┘  └────────────┘  └────────────┘
              │                │                │
       ┌──────▼──────┐  ┌─────▼──────┐  ┌─────▼──────┐
       │  prompts/   │  │ templates/ │  │  docker/   │
       │  (13 .md)   │  │  (6 files) │  │  (2 files) │
       └─────────────┘  └────────────┘  └────────────┘
```

### Two Cooperating Layers

| Layer | Components | Responsibility |
|-------|-----------|----------------|
| **Original Research Pipeline** | `Paper2Agent.sh`, `scripts/`, `tools/`, `agents/`, `prompts/`, `templates/` | Environment setup, tutorial execution, tool extraction, MCP wrapping, evaluation, implementation-track execution |
| **Application / Studio** | `app/`, `components/`, `lib/server/`, `lib/skills/`, `scripts/run-paper-job.ts` | Intake, job orchestration, provider selection, feasibility checks, queueing, progress tracking, validation, feedback, results presentation |

---

## 3. Directory Structure

```
Paper2Agent/
├── .claude/                    # Claude Code project config (agents, skills, hooks)
├── .paper2agent/               # Local runtime data (gitignored)
│   ├── jobs/                   # Job metadata (one dir per job)
│   ├── uploads/                # Uploaded PDFs
│   ├── workspaces/             # Generated agent workspaces
│   ├── local/                  # secrets.json, config
│   └── logs/                   # Pipeline execution logs
├── agents/                     # Claude Code specialist agents (10 .md files)
│   ├── tutorial-scanner.md     # Step 1: Tutorial identification
│   ├── tutorial-executor.md    # Step 2: Notebook execution
│   ├── tutorial-tool-extractor-implementor.md  # Steps 3-4: Tool extraction
│   ├── benchmark-extractor.md  # Step 5: Benchmark question extraction
│   ├── benchmark-solver.md     # Step 6: Benchmark answering
│   ├── benchmark-reviewer.md   # Step 7: Benchmark validation
│   ├── benchmark-judge.md      # Step 7: Impartial scoring
│   ├── environment-python-manager.md  # Steps 8-9: Python environment
│   └── test-verifier-improver.md      # Steps 11-12: Fix loop
├── app/                        # Next.js App Router
│   ├── api/                    # REST API routes
│   │   ├── jobs/               # Job CRUD + control
│   │   └── settings/           # Provider configuration
│   ├── jobs/                   # Jobs list page
│   ├── new/                    # New job creation
│   ├── settings/               # Settings page
│   ├── layout.tsx              # Root layout + providers
│   ├── page.tsx                # Home/dashboard
│   └── globals.css             # Tailwind styles
├── codex-skills/               # Installable OpenAI Codex skill packs
├── components/                 # React UI components (27 files)
│   ├── ui/                     # shadcn primitive components
│   ├── paper-studio.tsx        # Main studio view (899 lines)
│   ├── skill-graph-panel.tsx   # Skill DAG visualization
│   ├── pipeline-timeline.tsx   # Step progress timeline
│   ├── log-viewer.tsx          # Live log streaming
│   ├── job-actions.tsx         # Pause/resume/stop controls
│   └── ...
├── docker/                     # Sandbox runtime
│   ├── sandbox.Dockerfile      # Experiment container image
│   └── entrypoint.sh           # Container startup script
├── docs/                       # Documentation
│   └── research/
│       └── implementation-track-design.md  # Design doc for steps 8-12
├── lib/
│   ├── server/                 # Server-only modules (23 files)
│   │   ├── jobs.ts             # Job CRUD + state management
│   │   ├── job-runner.ts       # Background worker scheduler
│   │   ├── pipeline.ts         # Shell pipeline spawner
│   │   ├── llm.ts              # Paper analysis (Gemini/OpenRouter)
│   │   ├── secrets.ts          # Local secret storage
│   │   ├── sandbox.ts          # Experiment isolation
│   │   ├── verified-registry.ts  # Anti-fabrication validation
│   │   ├── evolution-store.ts  # Cross-run learning
│   │   ├── prompt-overlay.ts   # Overlay injection
│   │   ├── skill-transfer.ts   # Lesson extraction
│   │   ├── dataset-resolver.ts   # Multi-source dataset resolution
│   │   ├── dataset-downloader.ts # Cached downloads
│   │   ├── synthetic-data.ts   # Proxy data generation
│   │   ├── feedback.ts         # User feedback tracking
│   │   ├── pipeline-outcomes.ts # Step outcome reporting
│   │   ├── replication-outcome.ts # Replication reports
│   │   ├── setup-readiness.ts  # Environment readiness
│   │   ├── results.ts          # Result aggregation
│   │   ├── workspace-assessment.ts # Workspace health
│   │   ├── repository-feasibility.ts # Pre-flight checks
│   │   ├── paper-intake.ts     # Paper URL/PDF processing
│   │   ├── fs.ts               # Filesystem utilities
│   │   └── types.ts            # TypeScript type definitions
│   ├── skills/                 # Skill catalog
│   │   ├── catalog.ts          # 14 skills with metadata
│   │   └── graph.ts            # Dynamic DAG builder
│   ├── utils.ts                # Shared utilities (cn)
│   └── pipeline-steps.ts       # Step definitions (numbers ↔ names)
├── logo/                       # Branding assets
├── prompts/                    # Claude Code prompts for each step
│   ├── step1_prompt.md through step13_prompt.md
├── scripts/                    # Shell + TypeScript scripts (35 files)
│   ├── 01_setup_project.sh     # Workspace initialization
│   ├── 02_clone_repo.sh        # Git clone (3 strategies)
│   ├── 03_prepare_folders.sh   # Directory structure creation
│   ├── 04_add_context7_mcp.sh  # Context7 MCP setup
│   ├── 05_run_step*.sh         # Core pipeline step runners (13 files)
│   ├── 06_launch_mcp.sh        # MCP server launch
│   ├── pipeline_helpers.sh     # Shared shell functions
│   ├── run-paper-job.ts        # Background worker orchestrator
│   ├── validate-workspace.ts   # Post-pipeline validation
│   ├── acquire-datasets.ts     # Dataset resolution + download
│   ├── evolution-overlay.ts    # Cross-run prompt generation
│   ├── extract-lessons.ts      # Lesson extraction
│   ├── consume-feedback.ts     # Feedback → overlay conversion
│   ├── ai-agent.ts             # Provider-agnostic agentic loop
│   ├── install-codex-skills.sh # Codex skill symlinks
│   ├── setup-ai-tooling.sh     # AI tool configuration
│   └── check-publish-safety.sh # Git safety verification
├── templates/                  # Output schema templates
│   ├── experiment_template.py
│   ├── mcp_server_template.json
│   ├── report_template.md
│   ├── benchmark_template.csv
│   ├── coverage_template.json
│   └── results_template.json
├── tools/                      # Python utility scripts
│   ├── benchmark_assessor.py   # Benchmark runner
│   ├── benchmark_extractor.py  # Benchmark question extraction
│   ├── benchmark_reviewer.py   # Benchmark validation
│   ├── extract_notebook_images.py  # Image extraction from notebooks
│   └── preprocess_notebook.py  # Notebook cleaning
├── types/                      # TypeScript type definitions
├── Paper2Agent.sh              # Main pipeline entry point (orchestrator)
├── run-app.sh                  # App lifecycle script
├── package.json                # Dependencies + scripts
├── next.config.ts              # Next.js configuration
├── tsconfig.json               # TypeScript configuration
├── tailwind.config.ts          # Tailwind CSS configuration
└── AGENTS.md                   # Repository contract for coding agents
```

---

## 4. Tech Stack

### Frontend
| Technology | Version | Purpose |
|-----------|---------|---------|
| Next.js | 16.0.0 | App Router, server components, API routes |
| React | 19.2.0 | UI rendering |
| TypeScript | 5.9.2 | Type safety |
| Tailwind CSS | 4.1.13 | Styling |
| Radix UI | Various | Accessible primitive components |
| Lucide React | 0.542.0 | Icon library |
| next-themes | 0.4.6 | Dark/light mode |

### Backend
| Technology | Purpose |
|-----------|---------|
| `node:child_process` | Spawning shell pipeline subprocesses |
| `node:fs/promises` | Filesystem operations |
| `server-only` | Prevent server module import on client |
| tsx | TypeScript execution for background workers |

### AI Providers
| Provider | SDK | Models |
|----------|-----|--------|
| Google Gemini | `@google/genai` 1.22.0 | `gemini-2.5-flash` (default) |
| OpenRouter | `openai` 6.6.0 | `openai/gpt-5.2-mini` (default) |

### Utilities
| Library | Purpose |
|---------|---------|
| Zod 4.1.5 | Schema validation |
| nanoid 5.1.5 | Job ID generation |
| cheerio 1.1.2 | HTML parsing (paper URL extraction) |
| pdf-parse 1.1.1 | PDF text extraction |
| clsx + tailwind-merge | Conditional class merging |
| class-variance-authority | Component variant management |

### Runtime Requirements
- **Node.js** 20+
- **Python** 3.10+
- **Claude Code CLI** (installed + authenticated)
- **Docker** (optional, for sandbox isolation)

---

## 5. Pipeline Architecture

### 5.1 Overview

The pipeline has **18 steps total** organized into three phases:

```
Setup Phase (4 steps)          Core Pipeline (13 steps)              Launch (1 step)
┌──────────────────────┐  ┌──────────────────────────────────┐  ┌─────────────────┐
│ 1. Setup project     │  │ TUTORIAL TRACK (Steps 5-11)      │  │                 │
│ 2. Clone repo        │  │  5. Setup env & scan tutorials   │  │ 18. Launch MCP  │
│ 3. Prepare folders   │  │  6. Execute tutorial notebooks   │  │    server       │
│ 4. Add context7 MCP  │  │  7. Extract tools from tutorials │  │                 │
│                      │  │  8. Wrap tools in MCP server     │  │                 │
│                      │  │  9. Code coverage & quality      │  │                 │
│                      │  │ 10. Extract benchmark questions  │  │                 │
│                      │  │ 11. Run benchmark assessment     │  │                 │
│                      │  │                                  │  │                 │
│                      │  │ IMPLEMENTATION TRACK (Steps 12-17)│  │                 │
│                      │  │ 12. Gap analysis (coverage)      │  │                 │
│                      │  │ 13. Paper coder (implement gaps) │  │                 │
│                      │  │ 14. Experiment runner (sandbox)  │  │                 │
│                      │  │ 15. Results comparator           │  │                 │
│                      │  │ 16. Fix loop (convergence)       │  │                 │
│                      │  │ 17. MCP re-wrap (impl. tools)    │  │                 │
└──────────────────────┘  └──────────────────────────────────┘  └─────────────────┘
```

> **Note on numbering**: The `PIPELINE_STEP_DEFINITIONS` in `lib/pipeline-steps.ts` uses numbers 1-18. The internal step runners (`05_run_step*.sh`) use numbers 1-13 for the core pipeline. The mapping is:
> - Shell step N → Pipeline step N+4 (e.g., shell step 1 = pipeline step 5)

### 5.2 Dual-Track Routing

Step 12 (Gap Analysis) computes a `coverage_score = covered / total_capabilities`:

| Coverage Score | Track | Behavior |
|---------------|-------|----------|
| `> 0.7` | **Tutorial** | Steps 13-17 skip; tutorial track is sufficient |
| `< 0.3` | **Implementation** | Steps 13-17 run; paper must be implemented from scratch |
| `0.3–0.7` | **Hybrid** | Both tracks run; some tools from tutorials, some from implementation |

### 5.3 Tutorial Track (Steps 5-11)

```
Scan tutorials → Execute notebooks → Extract tools → Wrap MCP → Coverage → Benchmarks
     ↓                  ↓                  ↓              ↓           ↓          ↓
  step 5            step 6             step 7         step 8      step 9    steps 10-11
```

| Step | Name | Input | Output | Critical? |
|------|------|-------|--------|-----------|
| 5 | Setup env & scan tutorials | Cloned repo | `setup-readiness.json`, `tutorial-scanner.json` | Yes |
| 6 | Execute tutorial notebooks | `tutorial-scanner.json` | `executed_notebooks.json` | No (tolerated failure) |
| 7 | Extract tools from tutorials | `executed_notebooks.json` or repo source | `src/tools/*.py` | Yes |
| 8 | Wrap tools in MCP server | `src/tools/*.py` | `src/*_mcp.py` | Yes |
| 9 | Code coverage & quality | `src/tools/*.py` | Coverage XML/JSON/HTML, pylint scores | No (tolerated failure) |
| 10 | Extract benchmark questions | `executed_notebooks.json` | `benchmark_questions.csv` | No (tolerated failure) |
| 11 | Run benchmark assessment | `benchmark_questions.csv`, `*_mcp.py` | Benchmark scores | No (tolerated failure) |

### 5.4 Implementation Track (Steps 12-17)

```
Gap Analysis → Paper Coder → Experiment Runner → Results Comparator → Fix Loop → MCP Re-wrap
     ↑                           (sandboxed)                              │
     └────────────────── iterate (max 3 attempts) ──────────────────────┘
```

| Step | Name | Input | Output | Skip Condition |
|------|------|-------|--------|----------------|
| 12 | Gap analysis | Paper analysis + extracted tools | `gap_analysis.json` (coverage_score, track) | Never |
| 13 | Paper coder | `gap_analysis.json`, paper, datasets | `src/experiments/*.py` | Track = "tutorial" |
| 14 | Experiment runner | `src/experiments/*.py` | Experiment results | Track = "tutorial" or no experiments |
| 15 | Results comparator | Experiment results + paper-reported values | `results_comparison.json` | Track = "tutorial" or no results |
| 16 | Fix loop | `results_comparison.json` (match_score < 0.8) | `fix_loop_state.json` | Track = "tutorial" or match_score ≥ 0.8 |
| 17 | MCP re-wrap | Implementation-derived tools | Updated `*_mcp.py` | Track = "tutorial" or no experiments |

### 5.5 Step Retry & Recovery

Each core pipeline step has built-in resilience:

```bash
MAX_STEP_RETRIES=2
# Per-step timeouts (seconds):
#   Steps 1-3, 8:    600s (10 min)
#   Steps 4-7:       300s (5 min)
#   Step 9:          900s (15 min)
#   Step 10:        1200s (20 min)
#   Step 11:         300s (5 min)
#   Step 12:        1800s (30 min)
#   Step 13:         600s (10 min)
```

**Auto-fix strategies** (applied before retry):
1. **Missing Python packages**: Auto-installs the missing module via pip
2. **Permission errors**: Attempts `chmod -R u+rw` on workspace
3. **Claude auth errors**: NOT retryable — stops pipeline immediately
4. **Claude usage limits**: NOT retryable — stops with reset hint
5. **Disk full**: NOT retryable — stops immediately

**Non-critical steps** (pipeline continues on failure): Steps 6, 9, 10, 11

### 5.6 Idempotency

Every step uses a **marker file** in `$MAIN_DIR/.pipeline/`:
```
.pipeline/01_setup_done
.pipeline/02_clone_done
.pipeline/03_folders_done
.pipeline/04_context7_done
.pipeline/05_step1_done  ...  .pipeline/05_step13_done
.pipeline/06_mcp_done
```

If a marker exists, the step is skipped. This allows resuming interrupted runs.

### 5.7 Main Entry Point

`Paper2Agent.sh` accepts:

```bash
bash Paper2Agent.sh \
  --project_dir <workspace_name> \
  --github_url <repository_url> \
  [--tutorials <filter>] \
  [--api <api_key>] \
  [--paper_url <url>] \
  [--paper_title <title>] \
  [--notes <operator_notes>] \
  [--job_id <paper2agent_job_id>] \
  [--benchmark]
```

---

## 6. Application Layer

### 6.1 Next.js App Router

| Route | File | Purpose |
|-------|------|---------|
| `/` | `app/page.tsx` | Home dashboard — job list + stats |
| `/new` | `app/new/page.tsx` | New job creation form |
| `/jobs` | `app/jobs/page.tsx` | All jobs list view |
| `/jobs/[id]` | *(via paper-studio.tsx)* | Individual job detail |
| `/settings` | `app/settings/page.tsx` | Provider configuration |

### 6.2 API Routes

| Endpoint | Methods | File | Purpose |
|----------|---------|------|---------|
| `GET /api/jobs` | GET | `app/api/jobs/route.ts` | List all jobs (with pagination) |
| `POST /api/jobs` | POST | `app/api/jobs/route.ts` | Create a new job |
| `GET /api/jobs/[id]` | GET | `app/api/jobs/[id]/route.ts` | Get single job details |
| `PATCH /api/jobs/[id]` | PATCH | `app/api/jobs/[id]/route.ts` | Update job status |
| `POST /api/jobs/[id]/control` | POST | `app/api/jobs/[id]/control/route.ts` | Pause, resume, stop |
| `POST /api/jobs/[id]/retry` | POST | `app/api/jobs/[id]/retry/route.ts` | Retry failed job |
| `GET /api/jobs/[id]/logs` | GET | `app/api/jobs/[id]/logs/route.ts` | Stream log lines |
| `POST /api/jobs/[id]/feedback` | POST | `app/api/jobs/[id]/feedback/route.ts` | Submit operator feedback |
| `POST /api/jobs/[id]/validate` | POST | `app/api/jobs/[id]/validate/route.ts` | Validate workspace |
| `GET /api/settings` | GET | `app/api/settings/route.ts` | Get secrets summary |
| `PUT /api/settings` | PUT | `app/api/settings/route.ts` | Update secrets |

### 6.3 Background Worker

The background worker (`scripts/run-paper-job.ts`) is the bridge between the web app and the shell pipeline:

```typescript
npm run job:run -- <job-id>
```

**Worker lifecycle:**
1. **Validation**: Load job, verify it can continue (not stopped)
2. **Provider selection**: Load secrets, choose Gemini or OpenRouter
3. **Paper extraction**: Download from URL or read uploaded PDF
4. **Paper analysis**: Call LLM for summarization + repo inference
5. **Skill graph**: Build `SkillGraph` from analysis
6. **Persist**: Write `paper-analysis.json` + `paper-text.txt`
7. **Repository resolution**: Pick first valid HTTP URL from candidates
8. **Implementability check**: Run `assessRepositoryImplementability()` preflight
9. **Pipeline execution**: Call `runPipeline()` with `onProgress` callback
10. **Progress tracking**: Parse step events, detect stalls (>5 min), update progress %
11. **Completion**: Mark job "completed" or diagnose failure
12. **Heartbeat**: 15-second interval timer updates `lastHeartbeatAt`
13. **Stop sentinel**: If job status becomes "stopped", throws `__JOB_STOPPED__` (silent exit)

### 6.4 Job Scheduler

`lib/server/job-runner.ts` implements a bounded concurrent job scheduler:

```typescript
DEFAULT_MAX_CONCURRENT_JOBS = 1  // Configurable
```

**Scheduling mechanism:**
- File-based lock: `.paper2agent/jobs/<jobId>/.start-claim.lock`
- Scheduler runs as a promise chain (`schedulerRun`)
- Scans queued jobs, checks if a slot is available, spawns detached subprocess
- Jobs are processed in creation order (FIFO)

---

## 7. Server-Side Modules

### 7.1 Complete Module Inventory

| Module | Lines | Key Exports | Responsibility |
|--------|-------|-------------|----------------|
| `types.ts` | ~350 | All TypeScript interfaces | Single source of truth for all data types |
| `fs.ts` | ~50 | `jobsRoot`, `workspacesRoot`, `logsRoot`, `ensureAppDirectories` | Filesystem path resolution |
| `jobs.ts` | ~291 | `createJob`, `getJob`, `listAllJobs`, `updateJob`, `patchJob` | Job CRUD with atomic writes |
| `job-runner.ts` | ~165 | `spawnJobWorker`, `scheduleNextJob` | Background worker scheduling |
| `pipeline.ts` | ~250 | `runPipeline`, `diagnosePipelineFailure`, `getPipelinePaths`, `buildPipelineProgress`, `tailLog` | Shell pipeline spawner + log parser |
| `pipeline-outcomes.ts` | — | `updatePipelineStepOutcome`, `recordStepOutcome` | Per-step outcome persistence |
| `llm.ts` | ~177 | `analyzePaper`, `chooseProvider`, `normalizeGeminiModel` | Paper analysis via Gemini/OpenRouter |
| `secrets.ts` | — | `loadSecrets`, `saveSecrets`, `getSecretsSummary` | Local secret management |
| `paper-intake.ts` | — | Paper URL/PDF processing | Normalize inputs |
| `repository-feasibility.ts` | — | `assessRepositoryImplementability` | Pre-flight check |
| `sandbox.ts` | ~200 | `createSandbox`, `isDockerAvailable`, `autoSelectMode`, `ensureSandboxImage` | Experiment isolation factory |
| `verified-registry.ts` | — | Anti-fabrication validation | Metric verification |
| `evolution-store.ts` | — | Cross-run learning storage | Time-decay JSONL |
| `prompt-overlay.ts` | — | `generateOverlayForEnv` | Overlay injection |
| `skill-transfer.ts` | — | `extractLessons` | Lesson extraction from artifacts |
| `dataset-resolver.ts` | — | `resolveAllDatasets` | Multi-source resolution |
| `dataset-downloader.ts` | — | `DatasetDownloader` | Cached downloads |
| `synthetic-data.ts` | — | Synthetic proxy generation | 5 data shapes |
| `feedback.ts` | — | User feedback tracking | `submitFeedback`, `consumeFeedbackForStep` |
| `setup-readiness.ts` | — | `buildSetupReadinessReport`, `classifyStep2Execution` | Environment readiness |
| `results.ts` | — | Result aggregation | Pipeline results |
| `workspace-assessment.ts` | — | `assessWorkspace` | Workspace health check |
| `replication-outcome.ts` | — | `buildReplicationOutcomeReport` | Replication reports |

### 7.2 Key Type Definitions

```typescript
// Job statuses — the complete state machine
type JobStatus =
  | "queued"          // Waiting in scheduler queue
  | "analyzing"       // LLM paper analysis in progress
  | "needs_repo"      // Stopped — needs repository URL
  | "running_pipeline" // Paper2Agent.sh is executing
  | "paused"          // User-paused
  | "stopped"         // User-stopped (terminal)
  | "not_implementable" // Failed feasibility check (terminal)
  | "completed"       // Pipeline finished successfully (terminal)
  | "failed"          // Pipeline failed with diagnosis (terminal)

// Pipeline step statuses
type StepStatus = {
  stepNumber: number;
  name: string;
  status: "pending" | "running" | "completed" | "skipped" | "failed";
  startedAt?: string;
  completedAt?: string;
  durationSeconds?: number;
  lastOutput?: string;
  error?: string;
}

// JobRecord — the main job entity
interface JobRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: JobStatus;
  sourceType: "url" | "pdf";
  paperUrl?: string;
  uploadedPdfName?: string;
  repositoryUrl?: string;
  projectName?: string;
  notes?: string;
  provider?: Provider;
  model?: string;
  error?: string;
  workerPid?: number;
  resumeStatus?: ResumableJobStatus;
  currentStage?: string;
  lastLogLine?: string;
  progressPercent?: number;
  lastHeartbeatAt?: string;
  lastProgressAt?: string;
  logPath?: string;
  workspacePath?: string;
  analysisPath?: string;
  paperTextPath?: string;
  implementability?: ImplementabilityAssessment;
  analysis?: PaperAnalysis;
  pipelineProgress?: PipelineProgress;
  pipelineStepOutcomes?: PipelineStepOutcomesReport;
  userFeedback?: UserFeedback[];
  validationReport?: ValidationReport;
  workspaceAssessment?: WorkspaceAssessment;
}
```

### 7.3 Pipeline Progress Parsing

`pipeline.ts` parses `Paper2Agent.sh` stdout/stderr to extract step events:

```typescript
// Regex pattern for step progress lines:
//   "Step 5/18: Setup Python environment & scan tutorials - STARTING"
/Step\s+(\d+)\/(\d+):\s+(.+?)\s+-\s+(STARTING|COMPLETED|SKIPPED|ERROR)/i
```

Heartbeat lines are also captured:
```
  ↳ [15s] Claude: Reading tutorial-scanner.md
```

### 7.4 Failure Diagnosis

`diagnosePipelineFailure()` scans logs and step outputs for known failure patterns:

| Pattern | Diagnosis |
|---------|-----------|
| `OAuth token has expired` | Claude auth expired — re-authenticate |
| `authentication_error` | Claude auth failed — re-authenticate |
| `out of extra usage` | Usage limit reached — wait for reset |
| `No space left on device` | Disk full — free space |
| `fatal: could not create work tree` | Git clone failed — check repo URL |
| Zero tutorials in repo | Repo has no notebooks — extraction may fail |

---

## 8. Skill Graph System

### 8.1 Overview

The skill graph is a **directed acyclic graph (DAG)** of 14 skills across 6 stages. It lives in `lib/skills/` and is the source of truth for pipeline orchestration hints and UI visualization.

### 8.2 The 14 Skills

| # | Skill | Stage | Level | Dependencies | Codex Skill | Claude Agent |
|---|-------|-------|-------|-------------|-------------|-------------|
| 1 | **paper-intake** | discover | core | — | `paper2agent-paper-intake` | `paper-intake-strategist` |
| 2 | **repo-recon** | discover | core | paper-intake | `paper2agent-repo-recon` | `repo-recon-specialist` |
| 3 | **environment-bootstrap** | build | core | repo-recon | — | `environment-python-manager` |
| 4 | **tutorial-execution** | build | core | environment-bootstrap | — | `tutorial-executor` |
| 5 | **tool-extraction** | build | core | tutorial-execution | — | `tutorial-tool-extractor-implementor` |
| 6 | **gap-analysis** | implement | core | tool-extraction | — | — |
| 7 | **paper-coder** | implement | recommended | gap-analysis | — | — |
| 8 | **experiment-runner** | implement | recommended | paper-coder | — | — |
| 9 | **results-comparator** | implement | recommended | experiment-runner | — | — |
| 10 | **fix-loop** | implement | recommended | results-comparator | — | — |
| 11 | **mcp-packaging** | package | core | tool-extraction, fix-loop | `paper2agent-skill-graph-orchestrator` | `skill-graph-orchestrator` |
| 12 | **coverage-quality** | verify | recommended | tool-extraction | — | — |
| 13 | **benchmark-evaluation** | verify | optional | mcp-packaging | — | — |
| 14 | **workflow-orchestration** | operate | recommended | paper-intake, repo-recon, mcp-packaging, coverage-quality | `paper2agent-skill-graph-orchestrator` | `skill-graph-orchestrator` |

### 8.3 Dependency Graph

```
paper-intake → repo-recon → environment-bootstrap → tutorial-execution → tool-extraction
                                                                              ├→ gap-analysis → paper-coder → experiment-runner → results-comparator → fix-loop
                                                                              ├→ coverage-quality
                                                                              └→ mcp-packaging
benchmark-evaluation ← mcp-packaging

workflow-orchestration ← paper-intake, repo-recon, mcp-packaging, coverage-quality
```

**Key patterns:**
- **Diamond dependency**: `mcp-packaging` depends on both `tool-extraction` (tutorial track) and `fix-loop` (implementation track)
- **Fan-in orchestration**: `workflow-orchestration` depends on 4 disparate nodes

### 8.4 Dynamic Level Promotion

`buildSkillGraph()` promotes skill levels based on paper analysis:

| Condition | Promoted Skill | New Level |
|-----------|---------------|-----------|
| No repository URL | `repo-recon` | core |
| Paper mentions "benchmark"/"assessment"/"evaluation" | `benchmark-evaluation` | recommended |
| Paper mentions "test"/"validation" | `coverage-quality` | core |
| Paper has reported results | `paper-coder`, `experiment-runner`, `results-comparator`, `fix-loop` | core |
| Paper requires datasets | `paper-coder` | core |

### 8.5 Integration Points

**Built:** `scripts/run-paper-job.ts` line ~224 — after paper analysis
**Consumed:** `components/paper-studio.tsx` line ~761 — renders `SkillGraphPanel`
**Missing in UI:** `components/skill-graph-panel.tsx` line 9 — `STAGES` array omits `"implement"` stage (5 skills not displayed)

---

## 9. API Endpoints

### 9.1 Jobs API

#### `GET /api/jobs`

**Query parameters:**
- `limit` (optional, default: 50) — Number of jobs to return
- `status` (optional) — Filter by status

**Response:** `{ jobs: JobRecord[], total: number }`

#### `POST /api/jobs`

**Body:**
```json
{
  "sourceType": "url" | "pdf",
  "paperUrl": "https://arxiv.org/...",
  "repositoryUrl": "https://github.com/...",
  "projectName": "my-project",
  "notes": "Optional notes"
}
```

**Response:** `{ job: JobRecord }`

**Flow:** Creates job → status "queued" → scheduler picks it up

#### `GET /api/jobs/[id]`

**Response:** `{ job: JobRecord }`

#### `PATCH /api/jobs/[id]`

**Body:** `{ status: JobStatus }` or partial update

Used by the progress callback to update job state during pipeline execution.

#### `POST /api/jobs/[id]/control`

**Body:** `{ action: "pause" | "resume" | "stop" }`

**Behavior:**
- `pause`: Sets status to "paused"; pipeline continues but UI hides it
- `resume`: Sets status to "running_pipeline"; scheduler picks it up
- `stop`: Sets status to "stopped"; stop sentinel triggers pipeline abort

#### `POST /api/jobs/[id]/retry`

**Behavior:** Creates a new job with same parameters, resets status to "queued"

#### `GET /api/jobs/[id]/logs`

**Query parameters:**
- `lines` (optional, default: 200) — Number of lines to tail
- `follow` (optional) — SSE stream for live updates

#### `POST /api/jobs/[id]/feedback`

**Body:**
```json
{
  "message": "Try increasing the learning rate",
  "action": "hint",
  "stepNumber": 9
}
```

**Behavior:** Appends to `job.userFeedback[]`; consumed by `consume-feedback.ts` in future runs

#### `POST /api/jobs/[id]/validate`

**Behavior:** Runs `validate-workspace.ts` → returns `ValidationReport`

### 9.2 Settings API

#### `GET /api/settings`

**Response:** `{ hasGeminiKey: boolean, hasOpenRouterKey: boolean, geminiModel: string, openrouterModel: string, preferredProvider: Provider }`

#### `PUT /api/settings`

**Body:**
```json
{
  "geminiApiKey": "...",
  "openrouterApiKey": "...",
  "preferredProvider": "gemini",
  "geminiModel": "gemini-2.5-flash"
}
```

**Behavior:** Saves to `.paper2agent/local/secrets.json` (never exposed to browser after save)

---

## 10. UI Components

### 10.1 Component Inventory

| Component | Purpose | Key Features |
|-----------|---------|-------------|
| **`paper-studio.tsx`** (899 lines) | Main studio view | Job creation, status display, skill graph, progress tracking, results |
| **`skill-graph-panel.tsx`** | Skill DAG visualization | 5-column grid, level-colored cards, Codex/Claude badges |
| **`pipeline-timeline.tsx`** | Step progress timeline | Visual timeline with start/complete/skip/error states, duration display |
| **`log-viewer.tsx`** | Live log streaming | Auto-scroll, filter, SSE follow mode |
| **`job-actions.tsx`** | Job control buttons | Pause, resume, stop, retry |
| **`settings-form.tsx`** | Provider configuration | Key input, model selection, provider toggle |
| **`results-table.tsx`** | Results display | Metric values, comparison with paper, pass/fail indicators |
| **`coverage-gauge.tsx`** | Coverage score display | Visual gauge for coverage_score |
| **`fix-loop-history.tsx`** | Fix loop visualization | Attempt history, convergence status, metrics per attempt |
| **`replication-outcome-card.tsx`** | Replication report | Lifecycle stage, summary, blockers, next steps |
| **`workspace-assessment-card.tsx`** | Workspace health | Milestones, blockers, requirements |
| **`stats-cards.tsx`** | Dashboard statistics | Job counts by status |
| **`sidebar.tsx`** | Navigation sidebar | Links to pages, job list |
| **`live-jobs-refresher.tsx`** | Auto-refresh job list | Polling for job updates |
| **`retry-button.tsx`** | Job retry trigger | Creates new job with same params |
| **`theme-provider.tsx`** | Theme context | next-themes wrapper |
| **`theme-toggle.tsx`** | Dark/light mode toggle | Sun/moon icon switch |

### 10.2 shadcn UI Primitives

Located in `components/ui/`:
- `button.tsx` — Styled buttons
- `card.tsx` — Card containers
- `dialog.tsx` — Modal dialogs
- `input.tsx` — Text inputs
- `label.tsx` — Form labels
- `badge.tsx` — Status badges
- `progress.tsx` — Progress bars
- `select.tsx` — Dropdown selects
- `tabs.tsx` — Tab navigation
- `textarea.tsx` — Multi-line text inputs

### 10.3 Page Routes

| Page | Path | Key Components |
|------|------|---------------|
| **Home** | `/` | Stats cards, recent jobs, quick actions |
| **New Job** | `/new` | Paper URL/PDF upload form, repo override, notes |
| **Jobs List** | `/jobs` | Table of all jobs with status filters |
| **Job Detail** | Via paper-studio | Full job detail: timeline, logs, results, skill graph |
| **Settings** | `/settings` | Provider config, model selection, key management |

---

## 11. Data Flow

### 11.1 Job Creation Flow

```
User UI                  API Routes               Server Functions            Filesystem
   │                        │                           │                        │
   ├─ POST /api/jobs ──────►│                           │                        │
   │  {sourceType, url}     │                           │                        │
   │                        ├─ createJob() ────────────►│                        │
   │                        │                           ├─ mkdir(jobs/<id>) ────►│
   │                        │                           ├─ write job.json ──────►│
   │                        │                           │                        │
   │                        ├─ scheduleNextJob() ──────►│                        │
   │                        │                           ├─ claim lock ──────────►│
   │                        │                           ├─ spawn detached ──────►│
   │                        │                           │  process               │
   │                        │                           │                        │
   │◄─ 201 {job} ──────────┤                           │                        │
```

### 11.2 Pipeline Execution Flow

```
Background Worker          pipeline.ts              Paper2Agent.sh           Step Scripts
      │                        │                         │                      │
      ├─ runPipeline() ──────►│                         │                      │
      │                        ├─ spawn bash ──────────►│                      │
      │                        │                         ├─ for step 1..13 ────►│
      │                        │                         │                      ├─ claude CLI
      │                        │                         │                      ├─ anti-clarification guard
      │                        │                         │                      ├─ validate output
      │                        │                         │                      └─ write marker
      │                        │◄─ stderr/stdout ────────┤                      │
      │◄─ onProgress() ───────┤                         │                      │
      │   (parse step events)  │                         │                      │
      ├─ patchJob() ──────────►│                         │                      │
      │   (update status,      │                         │                      │
      │    progress %)         ├─ write job.json ──────► Filesystem             │
      │                        │                         │                      │
      │                        │              ┌──────────┼──────────┐           │
      │                        │              │          │          │           │
      │                        │         Tutorial   Implementation  MCP         │
      │                        │         Track      Track         Launch        │
```

### 11.3 Paper Analysis Flow

```
User submits paper URL/PDF
        │
        ▼
  Download paper (cheerio for HTML, pdf-parse for PDF)
        │
        ▼
  Extract text → save to `.paper2agent/jobs/<id>/paper-text.txt`
        │
        ▼
  Choose provider (Gemini or OpenRouter based on secrets)
        │
        ▼
  Call LLM with SYSTEM_PROMPT → PaperAnalysis JSON
        │
        ▼
  Build SkillGraph from analysis
        │
        ▼
  Save to `.paper2agent/jobs/<id>/paper-analysis.json`
        │
        ▼
  Repository inference → feasibility check
        │
        ▼
  If "blocked" → job status = "not_implementable"
  If "implementable" → proceed to pipeline
```

---

## 12. Job Lifecycle

### 12.1 State Machine

```
              ┌─────────┐
              │  queued  │
              └────┬────┘
                   │ scheduler picks up
                   ▼
             ┌───────────┐
             │ analyzing │◄──┐
             └─────┬─────┘   │
                   │         │ retry
      ┌────────────┼─────────┤
      │            │         │
      ▼            ▼         │
  needs_repo  running_pipeline
      │            │
      │     ┌──────┼──────────────┐
      │     │      │              │
      │     ▼      ▼              ▼
      │   paused  stopped    completed
      │     │      │            │
      │     │      │            │
      │     └──────┴────────────┤
      │                         │
      ▼                         ▼
  not_implementable          failed
```

### 12.2 Terminal States

| State | Cause | Recovery |
|-------|-------|----------|
| `stopped` | User requested stop | Retry creates new job |
| `not_implementable` | Feasibility check failed (e.g., requires massive GPU) | Override repository URL + retry |
| `completed` | Pipeline finished successfully | N/A |
| `failed` | Pipeline error after retries | Diagnose + retry |

### 12.3 Job File Structure

```
.paper2agent/jobs/<jobId>/
├── job.json                    # Main job record
├── paper-analysis.json         # LLM analysis result
├── paper-text.txt              # Extracted paper text
└── .start-claim.lock           # Scheduler lock (ephemeral)
```

---

## 13. Sandbox & Security

### 13.1 Sandbox Factory (`lib/server/sandbox.ts`)

Two modes:

| Mode | Description | Isolation Level |
|------|-------------|-----------------|
| `subprocess` (default) | Local subprocess with timeouts | Medium — shares host filesystem |
| `docker` | Docker container with resource limits | High — isolated filesystem, network policies |

**Sandbox configuration:**
```typescript
interface SandboxConfig {
  mode: "subprocess" | "docker";
  workspacePath: string;
  timeoutSeconds: number;       // Default: 1800 (30 min)
  docker?: {
    image?: string;             // Default: paper2agent-sandbox:latest
    gpuPassthrough?: boolean;   // NVIDIA GPU access
    networkPolicy?: "none" | "setup_only" | "full";
    memoryLimit?: string;       // Default: "8g"
    cpuLimit?: number;          // Default: 4
    extraMounts?: string[];     // Additional volume mounts
  };
  envPath?: string;             // Python venv to activate
}
```

**Network policies:**
| Policy | Behavior |
|--------|----------|
| `none` | Fully isolated (Docker `--network none`) |
| `setup_only` | Host network during pip install, then blocked |
| `full` | Restricted outbound access |

### 13.2 Anti-Fabrication Registry (`lib/server/verified-registry.ts`)

Every reported metric must trace to an actual experiment artifact. The registry:
- Validates that `RESULT experiment=X metric=Y value=Z` lines come from real files
- Rejects metrics without corresponding source files
- Produces `VerificationResult[]` with `verified: boolean` + `reason`

### 13.3 Publish Safety

`scripts/check-publish-safety.sh` checks:
1. No staged files in `.paper2agent/`, `.env.local`, `.claude/settings.local.json`
2. No tracked files in blocked paths

**Before any git push:**
```bash
bash scripts/check-publish-safety.sh
```

### 13.4 Secret Management

- **Storage**: `.paper2agent/local/secrets.json` (gitignored)
- **Access**: Server-only via `lib/server/secrets.ts`
- **Exposure**: Only `hasGeminiKey`/`hasOpenRouterKey` booleans sent to browser
- **Never committed**: Keys are local-only

---

## 14. Cross-Run Learning

### 14.1 Evolution Store (`lib/server/evolution-store.ts`)

A time-decay JSONL database that accumulates lessons from all pipeline runs.

**Data format:**
```jsonl
{"timestamp": "...", "repo": "...", "lesson": "...", "stage": "...", "decayFactor": 0.85}
```

**Time decay:** Older lessons have reduced weight. Recent runs influence prompts more heavily.

### 14.2 Prompt Overlays (`lib/server/prompt-overlay.ts`)

Generates context text injected into step prompts via `envsubst`:

```bash
# In pipeline_helpers.sh:
generate_overlay $SCRIPT_DIR $MAIN_DIR $STEP_NUM $REPO_NAME
# → calls evolution-overlay.ts → outputs text for envsubst
```

### 14.3 Skill Transfer (`lib/server/skill-transfer.ts`)

`extractLessons()` runs at the end of `Paper2Agent.sh`:
1. Reads workspace artifacts (gap analysis, fix loop state, results comparison)
2. Extracts transferable lessons
3. Writes to evolution store

**What gets transferred:**
- Which experiments succeeded/failed and why
- Coverage gap patterns
- Fix loop convergence insights
- Dataset resolution outcomes

---

## 15. Data Acquisition

### 15.1 Dataset Resolver (`lib/server/dataset-resolver.ts`)

Resolves datasets from multiple sources:

| Source | Priority | Examples |
|--------|----------|---------|
| HuggingFace | High | `hf://datasets/...` |
| Zenodo | High | DOI-based |
| UCI ML Repo | Medium | Traditional ML datasets |
| Kaggle | Medium | Requires API key |
| Direct URL | Fallback | Any HTTP-accessible file |
| Synthetic | Last resort | Generated proxy data |

### 15.2 Dataset Downloader (`lib/server/dataset-downloader.ts`)

Features:
- Resumable downloads (writes to temp file, renames on completion)
- Local cache (avoids re-downloading)
- Progress tracking

### 15.3 Synthetic Data Generator (`lib/server/synthetic-data.ts`)

Generates proxy data for 5 shapes:
1. Tabular classification
2. Tabular regression
3. Time series
4. Image classification
5. Text classification

**Integration:** Called from `scripts/acquire-datasets.ts` (step 9 pre-flight). If a dataset is unavailable or download fails, falls back to synthetic proxy. **The pipeline never halts due to missing data.**

---

## 16. Configuration & Secrets

### 16.1 Provider Configuration

```typescript
// Default models
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const DEFAULT_OPENROUTER_MODEL = "openai/gpt-5.2-mini";

// Known bad Gemini models (avoided automatically)
const KNOWN_BAD_GEMINI_MODELS = new Set([
  "gemini-3-flash",
  "gemini-3.0-flash",
  "gemini-3.1-flash-preview",
  "gemini-3.1-pro-preview"
]);
```

### 16.2 Provider Selection Logic

```
preferredProvider = "gemini" AND has gemini key → use Gemini
has openrouter key → use OpenRouter
has gemini key → use Gemini (fallback)
neither → error
```

### 16.3 Environment Variables

From `.env.example`:
```bash
GEMINI_API_KEY=...
OPENROUTER_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash
OPENROUTER_MODEL=openai/gpt-5.2-mini
PREFERRED_PROVIDER=gemini
```

### 16.4 Claude Code Configuration

- Project agents: `.claude/agents/`
- Project skills: `.claude/skills/`
- MCP config: `.mcp.json`
- Local settings: `.claude/settings.local.json` (gitignored)

---

## 17. Development Workflow

### 17.1 Commands

```bash
# Install dependencies
npm install

# Development server
npm run dev              # Starts Next.js on :3000

# Production build
npm run build

# Start production server
npm run start

# Lint
npm run lint

# Run a job manually
npm run job:run -- <job-id>

# Validate a workspace
npm run job:validate -- <workspace-path> [repo-name]

# Run unit tests
npm run test

# Run e2e tests
npm run test:e2e

# Shell pipeline directly
bash Paper2Agent.sh --project_dir <dir> --github_url <repo>
```

### 17.2 App Lifecycle Script

`run-app.sh` wraps common operations:
```bash
./run-app.sh install    # npm install
./run-app.sh dev        # npm run dev
./run-app.sh build      # npm run build
./run-app.sh start      # npm run start
./run-app.sh check      # npm run lint + type check
```

### 17.3 AI Tooling Setup

```bash
bash scripts/setup-ai-tooling.sh
# → Adds Context7 MCP to Claude Code
# → Adds OpenAI developer docs MCP to Codex
# → Runs claude doctor
```

### 17.4 Codex Skills Installation

```bash
bash scripts/install-codex-skills.sh
# → Symlinks codex-skills/* → $CODEX_HOME/skills/paper2agent-*
```

---

## 18. Debugging Guide

### 18.1 Common Failure Modes

#### Claude Authentication Errors

**Symptoms:**
- `OAuth token has expired` in step output
- `authentication_error` in logs
- Job stuck in "running_pipeline"

**Resolution:**
```bash
claude login    # Re-authenticate
# Then retry the job in the UI
```

#### Claude Usage Limits

**Symptoms:**
- `out of extra usage` in step output
- `usage limit reached` with reset hint

**Resolution:**
- Wait for the daily/monthly reset
- The pipeline uses Claude Code subscription, NOT OpenRouter key
- Check `claude_outputs/step*_output.json` for exact reset time

#### Repository Clone Failures

**Symptoms:**
- `fatal: could not create work tree dir`
- Job status: "failed"

**Diagnosis:**
```bash
cat .paper2agent/logs/<job-id>.log | tail -50
```

**Resolution:**
- Verify repository URL is accessible
- Check if repo is private (needs SSH key or token)
- Try manual clone to verify access

#### Step Hanging / Stalled

**Symptoms:**
- No progress for >5 minutes
- Job stuck on a step

**Diagnosis:**
```bash
# Check Claude output
cat .paper2agent/workspaces/<workspace>/claude_outputs/step<N>_output.json | tail -20

# Check log file
tail -f .paper2agent/logs/<job-id>.log
```

**Resolution:**
- Stop the job from UI
- Check if Claude is rate-limited
- Retry the job

#### Disk Space Issues

**Symptoms:**
- `No space left on device` in logs

**Resolution:**
```bash
df -h   # Check disk space
# Clean up old workspaces
rm -rf .paper2agent/workspaces/<old-workspace>
```

#### JSON Corruption in Job Files

**Symptoms:**
- `SyntaxError: Unexpected token` when loading job
- Job appears partially written

**Recovery:**
- The `getJob()` function in `jobs.ts` has a fallback that scans for the first complete JSON object
- If recovery fails, check `.paper2agent/jobs/<id>/job.json` manually

### 18.2 Log Locations

| Artifact | Path |
|----------|------|
| Pipeline logs | `.paper2agent/logs/<job-id>.log` |
| Step outputs | `.paper2agent/workspaces/<workspace>/claude_outputs/step<N>_output.json` |
| Job metadata | `.paper2agent/jobs/<job-id>/job.json` |
| Paper analysis | `.paper2agent/jobs/<job-id>/paper-analysis.json` |
| Setup readiness | `<workspace>/reports/setup-readiness.json` |
| Gap analysis | `<workspace>/reports/gap_analysis.json` |
| Results comparison | `<workspace>/reports/results_comparison.json` |
| Fix loop state | `<workspace>/reports/fix_loop_state.json` |
| Validation report | `<workspace>/reports/validation_report.json` |
| Replication outcome | `<workspace>/reports/replication-outcome.json` |
| Dataset acquisition | `<workspace>/reports/dataset-acquisition.json` |

### 18.3 Useful Diagnostic Commands

```bash
# Check job status
cat .paper2agent/jobs/<job-id>/job.json | jq '.status, .progressPercent, .lastLogLine'

# View live logs
tail -f .paper2agent/logs/<job-id>.log

# Check step outcomes
cat .paper2agent/workspaces/<workspace>/reports/replication-outcome.json | jq

# Validate workspace
npm run job:validate -- .paper2agent/workspaces/<workspace>

# Check pipeline markers
ls -la .paper2agent/workspaces/<workspace>/.pipeline/

# Check sandbox status
docker ps | grep paper2agent

# Check Claude CLI
claude doctor
```

### 18.4 Step-Specific Debugging

#### Step 1 (Env & Tutorials)
```bash
# Check tutorial scan results
cat <workspace>/reports/tutorial-scanner.json | jq
cat <workspace>/reports/setup-readiness.json | jq

# Common issue: LLM hallucinates Paper2Agent's own tutorials
# Anti-template guard searches for: AlphaPOP, score_batch, alphagenome, templates/
```

#### Step 2 (Execute Notebooks)
```bash
# Check if step should skip
cat <workspace>/reports/setup-readiness.json | jq '.tutorials'

# Exit code 10 = SKIP (no tutorials) — this is intentional
```

#### Step 8/12 (Gap Analysis)
```bash
# Check coverage score and routing decision
cat <workspace>/reports/gap_analysis.json | jq '.coverage_score, .track'

# > 0.7 → tutorial track (steps 9-12 skip)
# < 0.3 → implementation track
# 0.3-0.7 → hybrid
```

#### Step 16 (Fix Loop)
```bash
# Check convergence
cat <workspace>/reports/fix_loop_state.json | jq '.converged, .current_attempt, .best_attempt'

# Max 3 attempts; 2 consecutive non-improvements → stop
```

### 18.5 Monitoring Pipeline Health

The heartbeat monitor in `Paper2Agent.sh` prints activity every 15 seconds:

```
  ↳ [15s] Claude: Reading tutorial-scanner.md
  ↳ [30s] Claude working... (45230 bytes output)
  ↳ [45s] Still running (45230 bytes)
  ⚠️  [600s] Step has exceeded 600s — may be stuck
```

If you see the `⚠️` warning, the step has exceeded its expected timeout but is still running (timeout is a warning, not a kill).

---

## 19. Known Issues & Technical Debt

### 19.1 UI Bugs

| Issue | Location | Impact | Fix |
|-------|----------|--------|-----|
| **Missing `implement` stage** | `components/skill-graph-panel.tsx` line 9 | 5 skills not displayed in skill graph | Add `"implement"` to `STAGES` array |
| **No edge visualization** | `components/skill-graph-panel.tsx` | Dependency edges computed but not rendered | Add SVG/graphviz rendering |

### 19.2 Architecture Concerns

| Concern | Details |
|---------|---------|
| **Duplicate Codex/Claude mappings** | Both `mcp-packaging` and `workflow-orchestration` map to the same Codex skill and Claude agent |
| **Module-scoped state** | `stepEvents` array in `run-paper-job.ts` is module-scoped — accumulates across calls in same process |
| **No rate limiting** | API endpoints have no rate limiting or auth (local-first assumption) |
| **No test coverage** | Test scripts exist but no comprehensive test suite |
| **Single worker** | `DEFAULT_MAX_CONCURRENT_JOBS = 1` — no parallelism |

### 19.3 Deferred Patterns

These were explicitly deferred in the design doc:

1. **Multi-agent debate** for code generation
2. **Agentic sandbox mode** (beyond subprocess/Docker)
3. **Git-as-experiment-tracker**
4. **Sentinel watchdogs** for monitoring
5. **External API documentation** and public consumer API

### 19.4 Potential Enhancements

| Enhancement | Description |
|-------------|-------------|
| Results export | PDF/CSV report generation |
| Multi-paper comparison | Side-by-side job comparison view |
| Job scheduling priorities | Beyond FIFO — priority queue |
| Multi-provider failover | Automatic Gemini → OpenRouter fallback |
| Skill graph edge visualization | Render dependency edges visually |
| Comprehensive test suite | Unit + integration + e2e tests |

---

## 20. Completed vs Remaining Features

### 20.1 Phase Status

| Phase | Status | Features |
|-------|--------|----------|
| **Phase 1-3: Foundation** | ✅ COMPLETE | Core pipeline, tutorial track, implementation track, skill graph, coverage-based routing |
| **Phase 4: Sandbox & Safety** | ✅ COMPLETE | Docker sandbox, anti-fabrication registry, MCP re-wrap, feasibility checks, convergence guards |
| **Phase 5: Cross-Run Learning** | ✅ COMPLETE | Evolution store, prompt overlays, skill transfer, pipeline integration |
| **Phase 6: Data Acquisition** | ✅ COMPLETE | Dataset resolver, cached downloader, synthetic proxy generator, step 9 integration |
| **Phase 7: Production** | 🟡 SUBSTANTIALLY COMPLETE | Job queuing ✅, result dashboards ✅, APIs ✅; External API docs ⚠️ |

### 20.2 Feature Checklist

| Feature | Status | Notes |
|---------|--------|-------|
| Paper URL intake | ✅ | Via cheerio + pdf-parse |
| PDF upload | ✅ | Server-side extraction |
| Provider-backed analysis | ✅ | Gemini + OpenRouter |
| Repository inference | ✅ | LLM-based with manual override |
| Feasibility preflight | ✅ | GPU requirements, complexity checks |
| Queued background jobs | ✅ | Scheduler with file-based locks |
| Live logs streaming | ✅ | SSE + tail |
| Pipeline timeline | ✅ | Step-level progress |
| Stall detection | ✅ | Heartbeat monitor |
| Self-healing retry | ✅ | Max 2 retries per step, auto-fix strategies |
| Job control (pause/resume/stop) | ✅ | Via control API |
| Feedback ingestion | ✅ | Stored + consumed in future runs |
| Workspace validation | ✅ | 9-point check |
| Results dashboards | ✅ | Artifact-backed |
| Skill graph UI | ✅ (partial) | Missing `implement` stage column |
| Setup/readiness assessment | ✅ | Environment + tutorial scan |
| Replication outcome reports | ✅ | Lifecycle tracking |
| Cross-run learning | ✅ | Time-decay JSONL |
| Dataset acquisition | ✅ | Multi-source + synthetic fallback |
| Sandbox execution | ✅ | Subprocess + Docker |
| Anti-fabrication | ✅ | Metric verification |
| External API docs | ⚠️ | APIs exist, no documentation |
| Comprehensive tests | ❌ | Test infrastructure exists, no tests written |
| Multi-provider failover | ❌ | Manual provider selection only |

### 20.3 Remaining Work (Prioritized)

**High Priority:**
1. Fix `implement` stage missing from skill graph UI (1-line fix)
2. Write comprehensive test suite
3. External API documentation

**Medium Priority:**
4. Skill graph edge visualization
5. Results export (PDF/CSV)
6. Multi-provider automatic failover

**Low Priority (Deferred):**
7. Multi-agent debate for code generation
8. Git-as-experiment-tracker
9. Sentinel watchdogs
10. Agentic sandbox mode

---

## Appendix A: Git Commit History Summary

### Timeline
- **Feb 2025**: Original Paper2Agent upstream (jmiao24/Paper2Agent)
- **Nov 2025**: Benchmark improvements, code coverage/quality steps
- **Dec 2025**: Eval scale-up, benchmark extractor improvements
- **Mar 18, 2026**: Next.js studio + job system added
- **Mar 26, 2026**: Implementation track (steps 8-12), Claude Code config
- **Mar 28, 2026**: Phase 4-6 — sandbox, evolution store, data acquisition
- **Mar 29, 2026**: Phase 7 UI, feasibility checker, pipeline hardening
- **Apr 1, 2026**: Job scheduler, feedback system, pipeline injection
- **Apr 3-4, 2026**: README refresh, atomic state updates, replication reports, setup enforcement

### Total Commits: 50+

### Key Milestone Commits
| Commit | Date | Feature |
|--------|------|---------|
| `e573687` | 2026-02-10 | Upstream README updates |
| `e5ddf91` | 2026-03-18 | **Next.js studio, job API, pipeline** |
| `b4cd2d0` | 2026-03-26 | **Implementation track (steps 8-12)** |
| `86b6c5a` | 2026-03-26 | Claude Code project configuration |
| `8764053` | 2026-03-28 | Docker sandbox |
| `905bab2` | 2026-03-28 | Anti-fabrication registry |
| `079cd66` | 2026-03-28 | Evolution store |
| `6362e90` | 2026-03-28 | Dataset resolver |
| `7cbcdb1` | 2026-03-28 | Self-healing retry loop |
| `9588ea9` | 2026-03-29 | Phase 7 dashboard UI |
| `7c126de` | 2026-04-01 | Bounded job scheduler |
| `cf917f3` | 2026-04-01 | Feedback injection into prompts |
| `e2153d2` | 2026-04-04 | Artifact-backed replication views |
| `76d315f` | 2026-04-04 | Setup + replication outcome enforcement |

---

## Appendix B: Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GEMINI_API_KEY` | Yes* | — | Google AI API key |
| `OPENROUTER_API_KEY` | Yes* | — | OpenRouter API key |
| `GEMINI_MODEL` | No | `gemini-2.5-flash` | Gemini model to use |
| `OPENROUTER_MODEL` | No | `openai/gpt-5.2-mini` | OpenRouter model to use |
| `PREFERRED_PROVIDER` | No | `gemini` | Preferred AI provider |
| `CODEX_HOME` | No | `$HOME/.codex` | Codex skills directory |
| `VERBOSE` | No | `1` | Pipeline verbosity (0 or 1) |
| `PAPER2AGENT_CLI` | No | `claude` | CLI for pipeline steps |
| `PAPER2AGENT_SCRIPT_DIR` | No | Script directory | Override script root |

*At least one provider key is required.

---

## Appendix C: File Size & Complexity Metrics

| File | Lines | Complexity |
|------|-------|------------|
| `Paper2Agent.sh` | ~400 | High — main orchestrator with retry logic, heartbeat, diagnosis |
| `components/paper-studio.tsx` | 899 | High — main view with job state machine |
| `lib/server/pipeline.ts` | ~250 | Medium — shell spawner + log parser |
| `lib/server/types.ts` | ~350 | Low — type definitions only |
| `lib/server/jobs.ts` | ~291 | Medium — CRUD with atomic writes |
| `lib/server/job-runner.ts` | ~165 | Medium — scheduler with file locks |
| `lib/server/sandbox.ts` | ~200 | Medium — factory pattern |
| `lib/server/llm.ts` | ~177 | Medium — provider abstraction |

**Total TypeScript files:** ~50
**Total shell scripts:** ~20
**Total Python tools:** 5
**Total Claude agents:** 10
**Total prompts:** 13

---

## Appendix D: Security Checklist

- [x] Secrets stored locally only (`.paper2agent/local/secrets.json`)
- [x] Secrets never sent to browser (only boolean flags)
- [x] `.gitignore` covers all runtime data
- [x] Publish safety script before git push
- [x] Sandbox isolation for experiments
- [x] Anti-fabrication validation for metrics
- [x] No hardcoded API keys or vendor paths
- [x] Provider selection is configurable
- [ ] No rate limiting on API endpoints (local-first assumption)
- [ ] No authentication on API endpoints (local-first assumption)
- [ ] Network policies configurable for sandbox

---

*This document is a living architecture reference. Update it as the project evolves.*
