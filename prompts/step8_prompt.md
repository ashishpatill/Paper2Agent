# Gap Analysis Agent

## Action Mode
Execute this analysis immediately. Do not ask clarifying questions.

Target paper:
- Title: ${paper_title}
- Paper URL: ${paper_url}
- Operator notes: ${operator_notes}
- Target repository: `repo/${github_repo_name}`

## Mission
Compute a coverage score by comparing the paper's described capabilities against the tools successfully extracted from the repository. Determine whether to follow the tutorial track, implementation track, or hybrid approach.

## Inputs
- `reports/gap_analysis.json` — output destination
- `src/tools/` — extracted tool files from Step 3
- `repo/${github_repo_name}/` — the cloned repository source code
- Paper analysis (if available at `${paper_analysis_path}`): contains `capabilities[]`, `reported_results[]`, and `datasets_required[]`
- `reports/tutorial-scanner.json` — tutorial scan results
- `reports/executed_notebooks.json` — executed notebook results (may not exist)

## Process

### 1. Inventory Extracted Tools
Scan `src/tools/*.py` and catalog every function decorated with `@*.tool` or otherwise exported. For each tool, record:
- Function name
- What capability it implements (infer from docstring, function name, parameters)
- Source (which tutorial/file it was extracted from)

### 2. Map Paper Capabilities
Read the paper's capabilities list. For each capability:
- Check if any extracted tool covers it (partial or full)
- Check if the repo source code (`repo/${github_repo_name}/`) implements it even if no tool was extracted
- Mark as "covered", "partially_covered", or "uncovered"

### 3. Compute Coverage Score
```
coverage_score = (fully_covered + 0.5 * partially_covered) / total_capabilities
```

### 4. Determine Track
- `coverage_score > 0.7` → `"tutorial"` (existing pipeline sufficient)
- `coverage_score < 0.3` → `"implementation"` (need to implement from paper)
- `0.3 ≤ coverage_score ≤ 0.7` → `"hybrid"` (extract what exists, implement the rest)

### 5. Identify Gaps
For each uncovered or partially covered capability, produce a gap entry:
- `capability`: what needs to be implemented
- `description`: what the paper says about it
- `complexity`: estimated implementation difficulty ("low", "medium", "high")
- `requires_data`: whether it needs external datasets

## Output
Write the following JSON to `reports/gap_analysis.json`:

```json
{
  "coverage_score": 0.0,
  "track": "tutorial" | "implementation" | "hybrid",
  "covered_capabilities": ["..."],
  "uncovered_capabilities": ["..."],
  "gaps": [
    {
      "capability": "...",
      "description": "...",
      "complexity": "low" | "medium" | "high",
      "requires_data": true | false
    }
  ],
  "recommended_approach": "Human-readable summary of what needs to happen next."
}
```

## Rules
- Be conservative with coverage scoring — "partially covered" means the tool exists but doesn't fully reproduce the paper's method.
- If no tools were extracted at all, coverage_score = 0.
- If no paper analysis is available, infer capabilities from the repository README and paper title.
- Do NOT generate implementation code in this step — only analyze and report.
