---
name: skill-graph
description: Map the current Paper2Agent task to the project skill graph and choose the next dependency-safe specialist step.
context: fork
agent: skill-graph-orchestrator
---

Use this skill when the workflow has multiple possible next steps or when the user asks how skills help the project.

Always:
1. State the current stage: discover, build, package, verify, or operate.
2. Name the next best specialist step.
3. List satisfied dependencies and missing dependencies.
4. Say whether benchmark evaluation should stay optional, be recommended, or be core.
