# Phase 8: Auto Mode, Self-Adapting Loop & Lite Implementation

> **Status:** Design — Phase 8 proposal
> **Inspired by:** [aiming-lab/AutoResearchClaw](https://github.com/aiming-lab/AutoResearchClaw)
> **Date:** 2026-04-05

---

## 1. Problem Statement

Current Paper2Agent implementation track (steps 9-13) follows a **linear pipeline**:
paper coder → experiment runner → results comparator → fix loop (max 3 attempts).

**Limitations:**
1. **No auto-mode experimentation** — the pipeline runs once; when something breaks or produces weak results, it fails rather than adapting.
2. **Single-agent bottleneck** — one Claude Code session handles each step. No parallel exploration of alternatives.
3. **No scope awareness** — the pipeline attempts full paper implementation without checking if the user actually wants a proof-of-concept.
4. **No graceful degradation** — when the fix loop can't converge, the pipeline stops rather than pivoting to a simpler approach.
5. **No mode selection** — user intent (light PoC vs. full replication) is not captured upfront.

---

## 2. Design Principles

### 2.1 Lite-First Implementation (Default)

When the user submits a paper, Paper2Agent should:

1. **Analyze scope** — estimate implementation complexity from the paper:
   - Number of experiments reported
   - Dataset requirements (public? synthetic-able?)
   - Compute requirements (GPU hours, model sizes, memory)
   - Number of novel components vs. standard techniques

2. **Propose a lite plan** — identify the **minimum viable experiment** (MVE) that proves the core idea:
   - 1-2 essential conditions instead of full ablation study
   - 30-50% reduced epochs/seeds
   - Synthetic data if real data is unavailable
   - CPU/MPS-friendly configurations

3. **Present the plan to the user** — before running:
   - What the lite version covers
   - What's beyond scope (full-scale training, multi-GPU, proprietary data)
   - Recommended next steps if lite succeeds

4. **Default to lite** — unless the user explicitly says "implement as-is" or "full replication."

### 2.2 Deep Mode (Explicit Opt-In)

When the user explicitly requests full implementation:

1. **Warn about scope** — surface estimated time, compute requirements, data dependencies
2. **Still attempt lite first** — prove the pipeline works on a small scale before committing resources
3. **Scale up progressively** — lite → medium → full, with checkpoints at each stage

### 2.3 Self-Adapting Execution Loop

Inspired by AutoResearchClaw's 3-tier loop:

```
Tier 1: Initial Execution
  Code Gen → Run → Classify (completed/partial/failed)

Tier 2: Iterative Refinement (max 5 iterations)
  Analyze → Diagnose → Repair → Re-run → Compare

Tier 3: Decision Branching (max 2 pivots)
  PROCEED  → results are sufficient
  REFINE   → tweak parameters, go to Tier 2
  PIVOT    → new hypothesis, go back to paper coder (simplified)
```

### 2.4 Parallel Agent Brainstorming

When a step is stuck (2+ retry failures, no convergence, or NaN/divergence):

1. **Spawn 2-3 parallel agents** with the same problem but different constraints:
   - Agent A: scope-reduction approach (simplify the experiment)
   - Agent B: alternative-approach approach (different method to achieve the same goal)
   - Agent C: minimal-proof approach (prove just the core claim)

2. **Collect proposals** — each agent produces a plan with estimated cost/complexity

3. **Select the best plan** — based on:
   - Likelihood of success (has this approach worked in prior runs?)
   - Resource cost (compute, time, data availability)
   - Alignment with user intent (lite vs. deep)

4. **Execute the selected plan** — if it also fails, escalate to human or stop gracefully.

---

## 3. Implementation Plan

### 3.1 New Step: Pre-Flight Scope Analysis (Step 9a)

**Insert between gap analysis (step 8/12) and paper coder (step 9/13).**

**Input:** gap_analysis.json, paper_analysis.json, hardware profile
**Output:** implementation_plan.json

```json
{
  "mode": "lite" | "deep",
  "userRequestedMode": "lite" | "deep" | null,
  "complexityEstimate": {
    "totalExperiments": 5,
    "requiredDatasets": ["imagenet"],
    "estimatedGpuHours": 48,
    "estimatedRunTimeMinutes": 180,
    "riskFactors": ["large model VRAM", "proprietary data"]
  },
  "litePlan": {
    "description": "Proof-of-concept: 2 conditions, 10 epochs, synthetic data",
    "coveredClaims": ["main result direction", "method comparison"],
    "excludedClaims": ["full ablation study", "cross-dataset generalization"],
    "estimatedTimeMinutes": 30,
    "estimatedComputeCost": "CPU/MPS only"
  },
  "recommendation": "Start with lite mode. Full replication requires 4x V100 GPUs and ImageNet access."
}
```

**User interaction:**
- If `userRequestedMode` is null (no explicit instruction), present the lite plan and default to it.
- If `userRequestedMode` is "deep", warn about risks but proceed.

### 3.2 Enhanced Fix Loop → Self-Adapting Loop (Step 12/16)

Current fix loop: single Claude session, max 3 attempts, convergence guards.

**Proposed self-adapting loop:**

```bash
# Pseudocode for enhanced fix loop
MAX_ITERATIONS=5
MAX_PIVOTS=2
MIN_COMPLETION_RATE=0.5

iteration=0
pivot_count=0
best_score=0
consecutive_non_improving=0

while iteration < MAX_ITERATIONS; do
  # Run experiment
  result = run_experiment(current_code)
  score = compare_to_paper(result)

  if score >= MATCH_THRESHOLD:
    echo "✅ Converged at iteration $iteration (score: $score)"
    break

  if score <= best_score:
    consecutive_non_improving++
    if consecutive_non_improving >= 2:
      # Decision branching
      if pivot_count < MAX_PIVOTS:
        echo "🔄 Pivoting to new approach (pivot $pivot_count/$MAX_PIVOTS)"
        current_code = generate_alternative_approach(paper, gap_analysis)
        pivot_count++
        consecutive_non_improving = 0
      else
        # Scope reduction as last resort
        echo "⚠️  All pivots exhausted — reducing scope"
        current_code = reduce_scope(current_code)
        consecutive_non_improving = 0
      fi
    fi
  else
    best_score = score
    consecutive_non_improving = 0
  fi

  # Diagnose failure type
  diagnosis = diagnose_failure(result)
  case $diagnosis in
    missing_deps)
      install_deps && continue
      ;;
    nan_or_divergence)
      # NaN sentinel — reduce learning rate, add gradient clipping
      current_code = apply_nan_fix(current_code)
      continue
      ;;
    timeout)
      # Scope reduction
      current_code = reduce_epochs(current_code, 0.5)
      continue
      ;;
    *)
      # Parallel brainstorming
      if iteration >= 2; then
        echo "🧠 Spawning parallel agents to brainstorm solutions..."
        plans = spawn_parallel_agents(current_code, result, paper, 3)
        current_code = select_best_plan(plans)
      else
        current_code = generate_repair(current_code, diagnosis)
      fi
      continue
      ;;
  esac

  iteration++
done
```

### 3.3 Parallel Agent Spawning

**Implementation approach (local-first, no external orchestration):**

```typescript
// Parallel agent execution using detached subprocesses
async function spawnParallelAgents(
  problem: string,
  context: AgentContext,
  count: number = 3
): Promise<AgentProposal[]> {
  const strategies = [
    { name: 'scope-reduction', prompt: 'Simplify this experiment while preserving the core claim...' },
    { name: 'alternative-approach', prompt: 'Find a different method to achieve the same result...' },
    { name: 'minimal-proof', prompt: 'Prove only the most essential claim with minimal resources...' },
  ];

  const agents = strategies.slice(0, count).map((strategy, i) => {
    return spawnAgent({
      strategy: strategy.name,
      prompt: combinePrompts(strategy.prompt, problem, context),
      timeout: 300_000, // 5 min per agent
    });
  });

  // Wait for all agents (with overall timeout)
  const proposals = await Promise.allSettled(
    agents.map(a => a.withTimeout(600_000)) // 10 min total
  );

  return proposals
    .filter(p => p.status === 'fulfilled')
    .map(p => p.value)
    .sort((a, b) => scoreProposal(b) - scoreProposal(a));
}
```

### 3.4 Future CLI Integration (Phase 9+)

Paper2Agent's role in the deeper implementation pipeline:

```
┌─────────────────────┐
│  Paper2Agent Studio │  ← Phase 1-8 (current)
│                     │     • Paper intake & analysis
│  Phase 1-8:         │     • Lite implementation (PoC)
│  • Intake           │     • Self-adapting loop
│  • Lite PoC         │     • Results comparison
│  • Self-adapting    │     • Export & validation
│  • Results          │
└──────────┬──────────┘
           │ handoff (if user wants deeper impl)
           ▼
┌─────────────────────┐
│  Deep Orchestration │  ← Phase 9+ (future CLI project)
│  CLI                │     • Full-scale experiment execution
│                     │     • Multi-GPU distributed training
│  Phase 9+:          │     • Real dataset acquisition
│  • Full replication │     • Conference-ready outputs
│  • Multi-GPU        │     • Paper drafting
│  • Production       │     • Citation verification
└─────────────────────┘
```

**Handoff protocol:**
1. Paper2Agent exports `implementation_plan.json` + `lite_results.json`
2. User runs the deep CLI with `--import-from paper2agent <path>`
3. Deep CLI picks up from the lite results and scales up

**This keeps Paper2Agent focused on what it does well:**
- Local-first, fast iteration
- Proof-of-concept validation
- Result comparison against paper claims
- MCP packaging of working tools

**And defers heavy lifting to the specialized CLI:**
- Multi-GPU orchestration
- Full paper writing
- Conference formatting
- Citation verification

---

## 4. Updated Pipeline Steps

### 4.1 New Step Numbering

```
Setup (1-4): unchanged
Tutorial Track (5-11): unchanged

Implementation Track (renumbered for clarity):
  12. Gap Analysis (coverage scoring) — unchanged
  13. Pre-Flight Scope Analysis (NEW) — estimates complexity, proposes lite plan
  14. Paper Coder — generates lite experiment code (or full if explicitly requested)
  15. Experiment Runner — sandboxed execution with auto-repair
  16. Results Comparator — compares to paper claims
  17. Self-Adapting Fix Loop — enhanced with parallel brainstorming & pivoting
  18. MCP Re-Wrap — includes implementation-derived tools
```

### 4.2 User Intent Detection

The paper analysis step already captures `notes` from the user. We extend it:

```typescript
interface ImplementationIntent {
  mode: "lite" | "deep";
  userSpecified: boolean; // true if user explicitly said "as-is" or "full"
  constraints?: string[]; // e.g., "CPU only", "no GPU", "quick PoC"
}
```

**Detection from user input:**
- "implement as-is", "full replication", "exact reproduction" → `mode: "deep"`
- "quick test", "PoC", "proof of concept", "minimal" → `mode: "lite"`
- No mention → default to `lite` with recommendation

---

## 5. Patterns Adopted from AutoResearchClaw

| Pattern | Source | Paper2Agent Adaptation |
|---------|--------|----------------------|
| **3-tier execution loop** | Stages 10-15 | Lite → Refine (5 iter) → Pivot (2 max) |
| **Parallel agent brainstorming** | `use_sessions_spawn` | Detached subprocesses with different strategies |
| **NaN/Inf sentinel** | `detect_nan_divergence()` | Early detection + auto-repair (reduce LR, clip gradients) |
| **Scope reduction** | Condition count cut | Auto-reduce epochs/seeds/conditions on timeout |
| **Versioned rollback** | `stage-14_v1/`, `stage-14_v2/` | Experiment files saved as `_v1.py`, `_v2.py` |
| **Decision branching** | PROCEED/REFINE/PIVOT | Same routing logic in fix loop |
| **Hardware-aware adaptation** | `hardware.py` tier detection | Already implemented, extended to lite planning |
| **Anti-fabrication registry** | Ground-truth enforcement | Already implemented |
| **Repair cycle limits** | `max_cycles: 3`, `min_completion_rate: 50%` | Same guards in self-adapting loop |
| **Degenerate cycle detection** | Metric saturation guard | Stop if metrics saturate (near 0 or 1) |

---

## 6. Implementation Order

### Phase 8a: Lite-First Implementation (Priority 1)
- [ ] Add `ImplementationIntent` type and detection logic
- [ ] Create Step 13: Pre-Flight Scope Analysis
- [ ] Modify Step 14 (Paper Coder) to respect lite/deep mode
- [ ] Update settings UI to allow mode selection per job
- [ ] Update paper intake to capture user intent from notes

### Phase 8b: Self-Adapting Loop (Priority 2)
- [ ] Extend Step 17 (Fix Loop) with 3-tier execution
- [ ] Add NaN/Inf sentinel detection
- [ ] Add scope reduction logic (epochs, conditions, seeds)
- [ ] Add versioned rollback for experiment files
- [ ] Add degenerate cycle detection (metric saturation)

### Phase 8c: Parallel Agent Brainstorming (Priority 3)
- [ ] Implement `spawnParallelAgents()` using detached subprocesses
- [ ] Create 3 strategy prompts (scope-reduction, alternative, minimal)
- [ ] Add proposal scoring and selection logic
- [ ] Integrate into Step 17 as fallback when fix loop stalls

### Phase 9+: Deep CLI Integration (Future)
- [ ] Define handoff protocol (implementation_plan.json format)
- [ ] Build export format compatible with deep CLI's import format
- [ ] Add "Continue in Deep CLI" button to results dashboard
- [ ] Document the two-project workflow

---

## 7. Configuration

New fields in job configuration:

```json
{
  "implementationMode": "lite",
  "litePlan": {
    "maxExperiments": 2,
    "maxEpochs": 10,
    "maxConditions": 3,
    "allowSyntheticData": true,
    "requireGpu": false
  },
  "deepPlan": {
    "maxExperiments": null,
    "maxEpochs": null,
    "maxConditions": null,
    "allowSyntheticData": false,
    "requireGpu": true
  },
  "selfAdaptingLoop": {
    "maxIterations": 5,
    "maxPivots": 2,
    "maxParallelAgents": 3,
    "parallelAgentTimeoutSeconds": 300,
    "minCompletionRate": 0.5,
    "matchThreshold": 0.8
  }
}
```

---

## 8. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Parallel agents consume too many credits | Cap at 3 agents with 5-min timeout each |
| Lite mode produces results too different from paper | Clearly label lite vs deep results; show gap |
| Self-adapting loop runs too long | Wall-clock budget (2x single-run estimate) |
| Pivoting changes the research question | Constrain pivots to method changes, not hypothesis changes |
| Deep CLI integration requires coordination | Define stable handoff protocol early; version it |

---

## 9. Success Criteria

1. **Default lite mode** completes in < 45 minutes on CPU/MPS hardware
2. **Self-adapting loop** converges in ≥ 60% of cases where the original fix loop failed
3. **Parallel brainstorming** is triggered only when needed (≥ 2 retry failures), not for every step
4. **User intent** is correctly detected in ≥ 80% of cases from natural language notes
5. **Handoff to deep CLI** works with zero manual configuration
