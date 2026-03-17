---
name: "paper2agent-skill-graph-orchestrator"
description: "Use when you need to map a Paper2Agent request onto the project skill graph, choose the next specialist, or explain how discovery, extraction, packaging, and validation depend on one another."
---

# Skill Graph Orchestrator

## Use this skill when
- The workflow has multiple valid next steps.
- A user asks which skills matter for a given paper.
- The repo needs a dependency-aware plan instead of a flat checklist.

## Workflow
1. Start from the current stage: discover, build, package, verify, or operate.
2. Name the next best specialist capability.
3. Check whether repository confirmation, environment setup, tutorial execution, extraction, packaging, and verification prerequisites are satisfied.
4. Promote optional skills only when the paper or user goal makes them worthwhile.

## Default path
`paper intake -> repo recon -> environment bootstrap -> tutorial execution -> tool extraction -> MCP packaging -> coverage/benchmark verification -> workflow orchestration`
