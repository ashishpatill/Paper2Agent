# Experiment Runner Agent

## Action Mode
Execute immediately. Do not ask clarifying questions. Run all experiments and capture results.

Target paper:
- Title: ${paper_title}
- Paper URL: ${paper_url}
- Operator notes: ${operator_notes}
- Target repository: `repo/${github_repo_name}`

## Mission
Execute each experiment defined in `src/experiments/manifest.json`, capture structured metric output, and store results in `reports/experiment_results/`.

## Inputs
- `src/experiments/manifest.json` — experiment definitions
- `src/experiments/*.py` — experiment scripts and harnesses
- Environment: `${experiment_env_path}` (activate if non-empty)
- Results destination: `${results_dir}`
- Sandbox mode: `${sandbox_mode}` (subprocess or docker)
- Sandbox network policy: `${sandbox_network}` (none/setup_only/full)
- Sandbox timeout: `${sandbox_timeout}` seconds
- Sandbox memory limit: `${sandbox_memory}`
- Sandbox GPU passthrough: `${sandbox_gpu}`

## Process

### 1. Load Manifest
Read `src/experiments/manifest.json` to get the list of experiments.

### 2. Environment Setup
If `${experiment_env_path}` is non-empty:
```bash
source ${experiment_env_path}/bin/activate
```
Install any missing dependencies that experiments import.

### 3. Execute Each Experiment
For each experiment in the manifest:

**a. Pre-flight check:**
- Verify the script file exists
- Check if it requires GPU and whether GPU is available
- Set timeout from manifest (default: 1800 seconds)

**b. Run experiment (sandbox-aware):**

If `${sandbox_mode}` is `docker`:
```bash
docker run --rm --network ${sandbox_network} --memory ${sandbox_memory} \
  ${sandbox_gpu:+--gpus all} \
  -v $(pwd):/workspace -w /workspace \
  paper2agent-sandbox:latest \
  timeout ${sandbox_timeout} python src/experiments/<script> 2>&1 | tee reports/experiment_results/<name>_output.log
```

If `${sandbox_mode}` is `subprocess` (fallback):
```bash
cd <workspace_dir>
timeout ${sandbox_timeout} python src/experiments/<script> 2>&1 | tee reports/experiment_results/<name>_output.log
```

**c. Parse RESULT lines:**
Extract all lines matching: `RESULT experiment=<name> metric=<metric> value=<value> condition=<condition>`

**d. Parse ERROR lines:**
Extract all lines matching: `ERROR experiment=<name> type=<type> message=<message>`

**e. Classify outcome:**
- `"success"` — script exited 0, at least one RESULT line found
- `"partial"` — script timed out but produced some RESULT lines before timeout
- `"crashed"` — script exited non-zero with ERROR lines
- `"failed"` — script exited non-zero with no useful output

**f. Graduated recovery for crashes:**
If an experiment crashes:
1. Read the last 50 lines of output for the stack trace
2. If it's a trivial error (ImportError, ModuleNotFoundError, SyntaxError, typo):
   - Attempt to fix: install missing package, fix import, correct syntax
   - Re-run once
3. If it's a fundamental error (OOM, data not found, algorithm divergence):
   - Log as "crashed" and move on
   - Do NOT retry

### 4. Write Per-Experiment Results
For each experiment, write `reports/experiment_results/<name>_result.json`:
```json
{
  "experiment": "<name>",
  "status": "success" | "partial" | "failed" | "crashed",
  "timestamp": "<ISO timestamp>",
  "duration_seconds": 123,
  "metrics": {
    "metric_name": value,
    "metric_name_2": value
  },
  "errors": ["error message if any"],
  "output_log": "<name>_output.log"
}
```

### 5. Write Summary
Write `reports/experiment_results/summary.json`:
```json
{
  "total_experiments": 5,
  "successful": 3,
  "partial": 1,
  "failed": 0,
  "crashed": 1,
  "experiments": [
    {"name": "...", "status": "...", "result_file": "..."}
  ]
}
```

## Rules
- NEVER modify experiment harness files (`*_harness.py`) — they are the immutable evaluation reference.
- Capture ALL stdout/stderr to log files for debugging.
- Respect timeout limits — kill processes that exceed them.
- If ALL experiments crash on the same dependency, install it once and retry all.
- Do not fabricate metrics — only report what the experiment actually output.
- If no experiments can run at all (e.g., all require GPU on a CPU machine), report this clearly in the summary and exit gracefully.
