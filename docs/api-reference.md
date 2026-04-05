# Paper2Agent Studio — API Reference

> **Base URL:** `http://localhost:3000`
> **Content-Type:** `application/json` (unless otherwise noted)
> **Authentication:** None (local-first; all APIs are local-only)

---

## Table of Contents

1. [Jobs API](#1-jobs-api)
2. [Job Control API](#2-job-control-api)
3. [Job Export API](#3-job-export-api)
4. [Job Logs API](#4-job-logs-api)
5. [Job Feedback API](#5-job-feedback-api)
6. [Job Validation API](#6-job-validation-api)
7. [Settings API](#7-settings-api)
8. [Error Responses](#8-error-responses)
9. [Type Reference](#9-type-reference)

---

## 1. Jobs API

### List All Jobs

```
GET /api/jobs
```

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `limit` | number | No | 50 | Maximum number of jobs to return |
| `status` | string | No | — | Filter by job status (e.g., `completed`, `failed`) |

**Response:**

```json
{
  "jobs": [
    {
      "id": "job-abc123",
      "createdAt": "2026-04-05T00:00:00Z",
      "updatedAt": "2026-04-05T01:30:00Z",
      "status": "completed",
      "sourceType": "url",
      "paperUrl": "https://arxiv.org/abs/2401.12345",
      "repositoryUrl": "https://github.com/example/repo",
      "projectName": "my-project",
      "provider": "gemini",
      "model": "gemini-2.5-flash",
      "progressPercent": 100,
      "currentStage": "Pipeline completed.",
      "lastLogLine": "All steps completed successfully."
    }
  ],
  "total": 1
}
```

**Status Codes:**
- `200` — Success

---

### Create Job

```
POST /api/jobs
```

**Request Body:**

```json
{
  "sourceType": "url",
  "paperUrl": "https://arxiv.org/abs/2401.12345",
  "repositoryUrl": "https://github.com/example/repo",
  "projectName": "my-project",
  "notes": "Focus on the ML pipeline components."
}
```

**Body Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sourceType` | `"url"` \| `"pdf"` | Yes | How the paper was provided |
| `paperUrl` | string | Conditional | URL to the paper (required if `sourceType: "url"`) |
| `repositoryUrl` | string | No | Override for repository URL (auto-detected if omitted) |
| `projectName` | string | No | Human-readable project name |
| `notes` | string | No | Operator notes for the pipeline |

**Response:**

```json
{
  "job": {
    "id": "job-abc123",
    "status": "queued",
    "createdAt": "2026-04-05T00:00:00Z",
    "updatedAt": "2026-04-05T00:00:00Z",
    ...
  }
}
```

**Status Codes:**
- `201` — Job created and queued
- `400` — Invalid request body

**Behavior:**
- Creates a new job with status `"queued"`
- The background scheduler picks up the job automatically
- Paper analysis begins when a worker slot is available

---

### Get Job

```
GET /api/jobs/:id
```

**Response:**

```json
{
  "job": {
    "id": "job-abc123",
    "status": "completed",
    "progressPercent": 100,
    "currentStage": "Pipeline completed.",
    "analysis": {
      "title": "Attention Is All You Need",
      "summary": "The paper proposes the Transformer architecture...",
      "repositoryUrl": "https://github.com/example/transformer",
      "capabilities": ["tutorial execution", "tool extraction"],
      "reported_results": [
        { "experiment": "translation", "metric": "BLEU", "value": 28.4 }
      ],
      "skillGraph": { ... }
    },
    "pipelineProgress": {
      "steps": [
        { "stepNumber": 5, "name": "Setup env", "status": "completed" }
      ],
      "currentStep": 18,
      "totalSteps": 18
    },
    "pipelineStepOutcomes": {
      "generatedAt": "2026-04-05T01:30:00Z",
      "steps": [
        { "stepNumber": 5, "name": "Setup env", "outcome": "completed" }
      ]
    }
  }
}
```

**Status Codes:**
- `200` — Success
- `404` — Job not found

---

### Delete Job

```
DELETE /api/jobs/:id
```

**Response:**

```json
{ "deleted": true }
```

**Status Codes:**
- `200` — Job deleted
- `404` — Job not found
- `400` — Failed to delete (e.g., job is running)

---

### Retry Job

```
POST /api/jobs/:id/retry
```

**Behavior:** Creates a new job with the same parameters, resets status to `"queued"`.

**Response:**

```json
{
  "job": {
    "id": "job-new456",
    "status": "queued",
    ...
  }
}
```

**Status Codes:**
- `200` — Retry job created
- `404` — Original job not found
- `400` — Cannot retry this job (e.g., still running)

---

## 2. Job Control API

### Pause / Resume / Stop

```
POST /api/jobs/:id/control
```

**Request Body:**

```json
{
  "action": "pause"
}
```

**Actions:**

| Action | Effect |
|--------|--------|
| `pause` | Sets status to `"paused"`. Pipeline continues but UI hides it from active view. |
| `resume` | Sets status to `"running_pipeline"`. Scheduler picks it up. |
| `stop` | Sets status to `"stopped"`. Stop sentinel triggers pipeline abort. Terminal state. |

**Response:**

```json
{
  "job": {
    "id": "job-abc123",
    "status": "paused",
    ...
  }
}
```

**Status Codes:**
- `200` — Control action applied
- `404` — Job not found
- `400` — Invalid action or job cannot be controlled

---

## 3. Job Export API

### Export Job Results

```
GET /api/jobs/:id/export?format=csv
GET /api/jobs/:id/export?format=markdown
```

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `format` | `"csv"` \| `"markdown"` | No | `markdown` | Export format |

**Response:** File download

| Format | Content-Type | Filename |
|--------|-------------|----------|
| CSV | `text/csv` | `{project-slug}-results-{timestamp}.csv` |
| Markdown | `text/markdown` | `{project-slug}-report-{timestamp}.md` |

**CSV Contents:**
- Job summary (ID, status, provider, model, progress, timestamps)
- Pipeline step outcomes (step number, name, outcome, attempts, detail)
- Gap analysis (capability, complexity, data requirements)
- Results comparison (reported vs observed values, deltas)

**Markdown Contents:**
- Job summary table
- Pipeline step outcomes with emoji status indicators
- Replication outcome (track, lifecycle stage, summary)
- Experiment results (total, successful, failed)
- Fix loop status (convergence, attempts)
- Results comparison detail
- Gap analysis with coverage score
- Validation report
- Blockers and next steps

**Status Codes:**
- `200` — File generated
- `400` — Invalid format parameter
- `404` — Job not found

---

## 4. Job Logs API

### Get Job Logs

```
GET /api/jobs/:id/logs?lines=200
```

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `lines` | number | No | 200 | Number of trailing lines to return |

**Response:**

```json
{
  "lines": [
    "[2026-04-05 00:05:00] ▶️  Step 5/18: Setup Python environment - STARTING",
    "[2026-04-05 00:06:30] ✅ Step 5/18: Setup Python environment - COMPLETED",
    ...
  ],
  "total": 150
}
```

**Status Codes:**
- `200` — Logs retrieved
- `404` — Job not found or no logs available

---

## 5. Job Feedback API

### Submit Feedback

```
POST /api/jobs/:id/feedback
```

**Request Body:**

```json
{
  "message": "Try increasing the learning rate to 0.01",
  "action": "hint",
  "stepNumber": 9
}
```

**Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `message` | string | Yes | Feedback text |
| `action` | `"hint"` \| `"skip_step"` \| `"restart_step"` \| `"adjust_config"` | No | Suggested action type |
| `stepNumber` | number | No | Pipeline step this feedback targets |

**Response:**

```json
{
  "feedback": {
    "id": "feedback-xyz",
    "timestamp": "2026-04-05T01:00:00Z",
    "message": "Try increasing the learning rate to 0.01",
    "action": "hint",
    "stepNumber": 9,
    "consumed": false
  }
}
```

**Behavior:**
- Feedback is stored in the job record
- Future runs of the same job (or retry) consume feedback via `consume-feedback.ts`
- Feedback is injected as an overlay into the relevant pipeline step prompt

**Status Codes:**
- `200` — Feedback saved
- `404` — Job not found
- `400` — Invalid feedback (missing message, invalid action)

---

## 6. Job Validation API

### Validate Workspace

```
POST /api/jobs/:id/validate
```

**Behavior:** Runs workspace validation checks and returns a report.

**Response:**

```json
{
  "validation": {
    "timestamp": "2026-04-05T01:30:00Z",
    "overall": "pass",
    "checks": [
      { "name": "Workspace exists", "passed": true, "detail": "Workspace directory found" },
      { "name": "Python environment", "passed": true, "detail": "Python 3.11.5" },
      { "name": "Extracted tools", "passed": true, "detail": "3 tools found in src/tools/" },
      { "name": "Tool imports", "passed": true, "detail": "All 3 tools import successfully" },
      { "name": "MCP syntax", "passed": true, "detail": "MCP server compiles cleanly" },
      { "name": "Tests pass", "passed": true, "detail": "pytest: 12/12 passed" },
      { "name": "Experiment results", "passed": true, "detail": "Valid JSON results found" },
      { "name": "Gap analysis", "passed": true, "detail": "gap_analysis.json found" },
      { "name": "Results comparison", "passed": true, "detail": "results_comparison.json found" }
    ]
  }
}
```

**Status Codes:**
- `200` — Validation complete
- `404` — Job not found
- `400` — Workspace not available yet

---

## 7. Settings API

### Get Settings Summary

```
GET /api/settings
```

**Response:**

```json
{
  "hasGeminiKey": true,
  "hasOpenRouterKey": false,
  "geminiModel": "gemini-2.5-flash",
  "openrouterModel": "openai/gpt-5.2-mini",
  "preferredProvider": "gemini"
}
```

**Note:** Actual API keys are never returned — only boolean flags indicating presence.

---

### Update Settings

```
PUT /api/settings
```

**Request Body:**

```json
{
  "geminiApiKey": "AIza...",
  "openrouterApiKey": "sk-or-...",
  "preferredProvider": "gemini",
  "geminiModel": "gemini-2.5-flash",
  "openrouterModel": "openai/gpt-5.2-mini"
}
```

**Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `geminiApiKey` | string | No | Google Gemini API key |
| `openrouterApiKey` | string | No | OpenRouter API key |
| `preferredProvider` | `"gemini"` \| `"openrouter"` | No | Which provider to try first |
| `geminiModel` | string | No | Gemini model (default: `gemini-2.5-flash`) |
| `openrouterModel` | string | No | OpenRouter model (default: `openai/gpt-5.2-mini`) |

**Response:**

```json
{
  "saved": true,
  "summary": {
    "hasGeminiKey": true,
    "hasOpenRouterKey": true,
    "preferredProvider": "gemini"
  }
}
```

**Behavior:**
- Keys are saved to `.paper2agent/local/secrets.json` (local-only, never committed)
- Only `hasXxxKey` booleans are returned — raw keys are never sent back

**Status Codes:**
- `200` — Settings saved
- `400` — Invalid provider or malformed key

---

## 8. Error Responses

All API errors follow this format:

```json
{
  "error": "Job not found."
}
```

**Common HTTP Status Codes:**

| Code | Meaning | Typical Cause |
|------|---------|---------------|
| `200` | OK | Success |
| `201` | Created | Job created successfully |
| `400` | Bad Request | Invalid body, missing required fields, invalid enum |
| `404` | Not Found | Job ID doesn't exist |
| `500` | Internal Server Error | Unhandled exception |

---

## 9. Type Reference

### JobStatus

```typescript
type JobStatus =
  | "queued"            // Waiting in scheduler queue
  | "analyzing"         // LLM paper analysis in progress
  | "needs_repo"        // Stopped — needs repository URL
  | "running_pipeline"  // Paper2Agent.sh is executing
  | "paused"            // User-paused
  | "stopped"           // User-stopped (terminal)
  | "not_implementable" // Failed feasibility check (terminal)
  | "completed"         // Pipeline finished successfully (terminal)
  | "failed";           // Pipeline failed with diagnosis (terminal)
```

### StepStatus

```typescript
interface StepStatus {
  stepNumber: number;
  name: string;
  status: "pending" | "running" | "completed" | "skipped" | "failed";
  startedAt?: string;       // ISO timestamp
  completedAt?: string;     // ISO timestamp
  durationSeconds?: number;
  lastOutput?: string;
  error?: string;
}
```

### PipelineProgress

```typescript
interface PipelineProgress {
  steps: StepStatus[];
  currentStep?: number;
  totalSteps: number;
  stalledSince?: string;
  stallDiagnosis?: string;
}
```

### PaperAnalysis

```typescript
interface PaperAnalysis {
  title: string;
  abstract: string;
  summary: string;
  projectSlug: string;
  repositoryUrl?: string;
  confidence: "high" | "medium" | "low";
  capabilities: string[];
  reported_results: Array<{
    experiment: string;
    metric: string;
    value: number | string;
    direction?: "higher_is_better" | "lower_is_better";
    condition?: string;
  }>;
  datasets_required: Array<{
    name: string;
    source?: string;
    size_estimate?: string;
    publicly_available: boolean;
  }>;
  suggestedQuestions: string[];
  setupNotes: string[];
  skillGraph?: SkillGraph;
}
```

### ValidationReport

```typescript
interface ValidationReport {
  timestamp: string;
  overall: "pass" | "partial" | "fail";
  checks: Array<{
    name: string;
    passed: boolean;
    detail: string;
  }>;
}
```

---

## Quick Start Examples

### cURL

```bash
# Create a job
curl -X POST http://localhost:3000/api/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "sourceType": "url",
    "paperUrl": "https://arxiv.org/abs/2401.12345",
    "projectName": "my-paper"
  }'

# Get job status
curl http://localhost:3000/api/jobs/job-abc123

# Pause a job
curl -X POST http://localhost:3000/api/jobs/job-abc123/control \
  -H "Content-Type: application/json" \
  -d '{"action": "pause"}'

# Export results
curl -o report.md "http://localhost:3000/api/jobs/job-abc123/export?format=markdown"
```

### JavaScript / Fetch

```javascript
// Create a job
const response = await fetch("http://localhost:3000/api/jobs", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    sourceType: "url",
    paperUrl: "https://arxiv.org/abs/2401.12345",
    projectName: "my-paper"
  })
});
const { job } = await response.json();
console.log(`Job ${job.id} created with status: ${job.status}`);

// Poll job status
async function pollJob(jobId) {
  while (true) {
    const res = await fetch(`http://localhost:3000/api/jobs/${jobId}`);
    const { job } = await res.json();
    console.log(`Status: ${job.status}, Progress: ${job.progressPercent}%`);
    if (["completed", "failed", "stopped"].includes(job.status)) break;
    await new Promise((r) => setTimeout(r, 5000));
  }
}

// Export results
const exportRes = await fetch(
  `http://localhost:3000/api/jobs/${job.id}/export?format=markdown`
);
const blob = await exportRes.blob();
// Save or display the markdown blob
```

### Python

```python
import requests
import time

BASE_URL = "http://localhost:3000"

# Create a job
response = requests.post(f"{BASE_URL}/api/jobs", json={
    "sourceType": "url",
    "paperUrl": "https://arxiv.org/abs/2401.12345",
    "projectName": "my-paper"
})
job = response.json()["job"]
print(f"Job {job['id']} created: {job['status']}")

# Poll until complete
while job["status"] not in ("completed", "failed", "stopped"):
    time.sleep(5)
    response = requests.get(f"{BASE_URL}/api/jobs/{job['id']}")
    job = response.json()["job"]
    print(f"Status: {job['status']}, Progress: {job.get('progressPercent', 0)}%")

# Export results
export_response = requests.get(
    f"{BASE_URL}/api/jobs/{job['id']}/export?format=markdown"
)
with open("report.md", "wb") as f:
    f.write(export_response.content)
```
