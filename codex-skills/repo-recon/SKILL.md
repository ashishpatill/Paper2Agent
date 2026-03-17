---
name: "paper2agent-repo-recon"
description: "Use when a paper points to one or more candidate repositories and you need to confirm the correct repo, tutorials, install surface, or example notebooks before running the Paper2Agent pipeline."
---

# Repo Recon

## Use this skill when
- The repository is missing or ambiguous.
- Multiple repositories appear related to the same paper.
- The project needs evidence that tutorials and install paths actually exist.

## Workflow
1. Confirm the repository that best matches the paper.
2. Identify tutorial notebooks, example scripts, and setup instructions.
3. Note API key requirements, heavyweight dependencies, or risks that could block execution.
4. Return a concrete recommendation: proceed, ask for clarification, or stop.

## Priorities
- Prefer primary evidence from the repository itself.
- Treat missing tutorial or setup evidence as a real blocker, not a detail to skip.
