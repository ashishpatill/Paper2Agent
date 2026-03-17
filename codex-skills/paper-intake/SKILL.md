---
name: "paper2agent-paper-intake"
description: "Use when a task involves turning a paper URL or PDF into an implementation-ready Paper2Agent brief, extracting likely repository hints, summarizing capabilities, or deciding what the paper-to-agent workflow should do first."
---

# Paper Intake

## Use this skill when
- A user gives a paper URL or PDF.
- The workflow needs a concise paper brief before touching the repo.
- Repository hints exist in the paper but are not yet trustworthy.

## Workflow
1. Extract the paper title, abstract-level summary, and concrete implementation clues.
2. Capture likely GitHub repositories, datasets, demos, and tutorial references.
3. Distill the paper into Paper2Agent-friendly capabilities and suggested user questions.
4. If the repository is uncertain, hand off to `paper2agent-repo-recon`.

## Output shape
- `title`
- `summary`
- `repository candidates`
- `capabilities`
- `recommended next skill`
