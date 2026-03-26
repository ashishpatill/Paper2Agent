---
name: run-pipeline
description: Launch the full Paper2Agent pipeline for a given paper and repository. Use when the user wants to process a paper end-to-end.
user-invocable: true
argument-hint: "[github_url] [paper_url]"
---

Run the full Paper2Agent pipeline for the given paper and repository.

## Arguments
- `$0`: GitHub repository URL (required)
- `$1`: Paper URL (optional)

## Steps

1. Validate the repository URL is accessible.
2. Create a project directory name from the repo name.
3. Run the pipeline:
```bash
bash Paper2Agent.sh \
  --project_dir ".paper2agent/workspaces/$PROJECT_NAME" \
  --github_url "$0" \
  --paper_url "$1"
```
4. Monitor progress and report step completions.
5. On completion, report the workspace path and key outputs.

## If the pipeline fails
- Check `.paper2agent/logs/` for the log file.
- Look at `claude_outputs/step*_output.json` for the failing step.
- Use `/gap-analysis` to analyze what was extracted before the failure.
