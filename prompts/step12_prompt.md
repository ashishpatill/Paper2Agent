# Fix Loop Agent

## Action Mode
Execute immediately. Do not ask clarifying questions. Iterate on failing experiments until results converge or max attempts exhausted.

Target paper:
- Title: ${paper_title}
- Paper URL: ${paper_url}
- Operator notes: ${operator_notes}
- Target repository: `repo/${github_repo_name}`

## Mission
Read the results comparison report, identify experiments whose metrics don't match the paper, fix the experiment code, re-run, and re-compare. Iterate up to ${max_fix_attempts} times. Track all attempts and promote the best result.

## Inputs
- `${comparison_report_path}` — current results comparison report
- `${experiments_dir}/` — experiment code (mutable)
- `${experiments_dir}/*_harness.py` — evaluation harnesses (IMMUTABLE, do NOT modify)
- `${results_dir}/` — experiment results
- `${fix_loop_dir}/` — output directory for fix loop state
- Environment: `${experiment_env_path}` (activate if non-empty)
- Max attempts: ${max_fix_attempts}

## Process

### For each fix attempt (1 to ${max_fix_attempts}):

#### 1. Read Comparison Report
Load `${comparison_report_path}` and identify comparisons where `within_threshold` is false.

#### 2. Diagnose Failures
For each failing metric, classify the cause:

**Trivial errors** (fix and retry):
- Import errors, missing dependencies → install and retry
- Syntax errors → fix typo
- Data path errors → correct paths
- Type mismatches → fix casting

**Algorithmic issues** (fix with paper reference):
- Wrong formula implementation → re-read paper, correct formula
- Missing preprocessing step → add the step
- Incorrect hyperparameters → adjust to match paper's stated values
- Wrong evaluation protocol → align with paper's methodology

**Fundamental mismatches** (scope reduction):
- Hardware limitations causing different results → note as hardware-limited
- Missing proprietary data → use synthetic proxy, note approximation
- Stochastic variation → run multiple seeds, report mean ± std

#### 3. Fix Experiment Code
For each failing experiment:
- Read the experiment file and the harness file
- Read the last run's output log for error context
- Modify ONLY the experiment file (never the harness)
- Save the original as `{name}_experiment_v{N}.py` before modifying
- Apply targeted fixes based on diagnosis

**Fix strategy (from autoresearch pattern):**
- Make the smallest change that addresses the diagnosed issue
- If a fix doesn't improve results, revert and try a different approach
- After 2 consecutive non-improving attempts on the same experiment, apply scope reduction

**Scope reduction (from AutoResearchClaw pattern):**
- Reduce conditions: keep baseline + proposed + 1 ablation only
- Reduce scale: 30-50% fewer epochs/iterations
- Reduce precision: accept approximate match (widen threshold by 50%)

#### 4. Re-Run Modified Experiments
Execute only the experiments that were modified:
```bash
timeout <timeout> python src/experiments/<script> 2>&1 | tee reports/experiment_results/<name>_output_v{N}.log
```

Parse RESULT lines and update `reports/experiment_results/<name>_result.json`.

#### 5. Re-Compare
Re-run the comparison logic from Step 11:
- Load paper's reported results
- Compare against updated experiment results
- Write updated comparison to `${comparison_report_path}`

#### 6. Check Convergence
Stop the loop if ANY of these conditions are met:
- `match_score >= 0.8` → converged, results match well enough
- All remaining mismatches are classified as "hardware-limited" or "data-limited"
- 2 consecutive attempts with no improvement in match_score
- Max attempts reached

### After Loop Completes:

#### 7. Promote Best Attempt
Compare all attempt results. Promote the version with the highest match_score:
- Copy best experiment versions to canonical locations
- Update result files with best values

#### 8. Write Fix Loop State
Write `${fix_loop_dir}/fix_loop_state.json`:
```json
{
  "max_attempts": 3,
  "current_attempt": 2,
  "attempts": [
    {
      "attempt_number": 1,
      "timestamp": "...",
      "status": "partial",
      "metrics": {"match_score": 0.5},
      "errors": ["wrong formula in uid calculation"],
      "duration_seconds": 120
    },
    {
      "attempt_number": 2,
      "timestamp": "...",
      "status": "success",
      "metrics": {"match_score": 0.85},
      "errors": [],
      "duration_seconds": 95
    }
  ],
  "best_attempt": { "attempt_number": 2, "..." : "..." },
  "converged": true,
  "convergence_reason": "match_score 0.85 >= 0.8 threshold"
}
```

#### 9. Write Results Log
Write `${fix_loop_dir}/attempts.tsv` (inspired by autoresearch):
```
attempt	match_score	status	description
1	0.50	partial	Fixed import errors, correlation formula still wrong
2	0.85	success	Corrected UID calculation formula per paper eq. 3
```

## Rules
- NEVER modify harness files (`*_harness.py`).
- ALWAYS version experiment files before modifying (`_v1.py`, `_v2.py`, etc.).
- Do not retry more than ${max_fix_attempts} times total.
- If match_score does not improve after 2 consecutive attempts, stop iterating and report partial results.
- Mark capabilities as "partial" (not "failed") when loop exhausts retries but made progress.
- Prefer targeted, minimal fixes over full rewrites.
- Log every change with a clear description in attempts.tsv.
