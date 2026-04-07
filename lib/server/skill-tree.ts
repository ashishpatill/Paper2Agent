/**
 * skill-tree.ts — Hierarchical Skill Tree (M2.7-Inspired)
 *
 * Organizes pipeline capabilities hierarchically rather than flat.
 * Each node tracks: success rate, avg tokens, common failures, best prompts.
 *
 * Before each step, generates a skill overlay — injects lessons learned
 * from past runs of this step.
 *
 * Auto-promotes successful patterns, demotes failing ones.
 */

import { EvolutionStore, PipelineStage, WeightedEntry } from "./evolution-store";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SkillNode {
  id: string;               // e.g. "tool-extraction"
  name: string;
  stage: PipelineStage;
  parent: string | null;    // parent skill id
  children: string[];       // child skill ids
  stats: {
    runs: number;
    successes: number;
    failures: number;
    avgAttempts: number;
    avgTokensUsed: number;
  };
  commonFailures: Record<string, number>; // failure type → count
  bestStrategies: string[];  // strategy signatures that worked best
  promptHints: string[];     // tips to inject into prompts
  lastUpdated: string;
}

// ---------------------------------------------------------------------------
// Skill Tree Definition
// ---------------------------------------------------------------------------

const SKILL_TREE_DEF: Omit<SkillNode, "stats" | "commonFailures" | "bestStrategies" | "promptHints" | "lastUpdated">[] = [
  // Intake phase
  { id: "intake", name: "Paper Intake", stage: "general", parent: null, children: ["repo-recon", "environment"] },
  { id: "repo-recon", name: "Repository Recon", stage: "environment", parent: "intake", children: [] },
  { id: "environment", name: "Environment Setup", stage: "environment", parent: "intake", children: [] },

  // Tutorial track
  { id: "tutorial-track", name: "Tutorial Track", stage: "general", parent: null, children: ["tutorial-scan", "tutorial-execute", "tool-extraction"] },
  { id: "tutorial-scan", name: "Tutorial Scan", stage: "tutorial-scan", parent: "tutorial-track", children: [] },
  { id: "tutorial-execute", name: "Tutorial Execution", stage: "tutorial-execute", parent: "tutorial-track", children: [] },
  { id: "tool-extraction", name: "Tool Extraction", stage: "tool-extraction", parent: "tutorial-track", children: ["mcp-wrap"] },
  { id: "mcp-wrap", name: "MCP Wrapping", stage: "mcp-wrap", parent: "tutorial-track", children: [] },

  // Implementation track
  { id: "impl-track", name: "Implementation Track", stage: "general", parent: null, children: ["gap-analysis", "paper-coder", "experiment-runner"] },
  { id: "gap-analysis", name: "Gap Analysis", stage: "gap-analysis", parent: "impl-track", children: [] },
  { id: "paper-coder", name: "Paper Coder", stage: "paper-coder", parent: "impl-track", children: [] },
  { id: "experiment-runner", name: "Experiment Runner", stage: "experiment-runner", parent: "impl-track", children: ["results-comparator", "fix-loop"] },
  { id: "results-comparator", name: "Results Comparator", stage: "results-comparator", parent: "impl-track", children: [] },
  { id: "fix-loop", name: "Fix Loop", stage: "fix-loop", parent: "impl-track", children: [] },
];

// ---------------------------------------------------------------------------
// Skill Tree Manager
// ---------------------------------------------------------------------------

export class SkillTree {
  private nodes: Map<string, SkillNode>;
  private store: EvolutionStore;

  constructor(store: EvolutionStore) {
    this.store = store;
    this.nodes = new Map();

    for (const def of SKILL_TREE_DEF) {
      this.nodes.set(def.id, this.createNode(def));
    }
  }

  private createNode(def: Omit<SkillNode, "stats" | "commonFailures" | "bestStrategies" | "promptHints" | "lastUpdated">): SkillNode {
    return {
      ...def,
      stats: { runs: 0, successes: 0, failures: 0, avgAttempts: 0, avgTokensUsed: 0 },
      commonFailures: {},
      bestStrategies: [],
      promptHints: [],
      lastUpdated: new Date().toISOString()
    };
  }

  /** Get a skill node by id */
  getNode(id: string): SkillNode | null {
    return this.nodes.get(id) || null;
  }

  /** Get all nodes */
  getAllNodes(): SkillNode[] {
    return Array.from(this.nodes.values());
  }

  /** Record a step outcome and update the skill tree */
  recordOutcome(stage: PipelineStage, success: boolean, attempts: number, tokensUsed?: number): void {
    // Find the matching node
    for (const node of this.nodes.values()) {
      if (node.stage === stage) {
        node.stats.runs++;
        if (success) node.stats.successes++;
        else node.stats.failures++;
        // Running average for attempts
        node.stats.avgAttempts = (node.stats.avgAttempts * (node.stats.runs - 1) + attempts) / node.stats.runs;
        if (tokensUsed) {
          node.stats.avgTokensUsed = (node.stats.avgTokensUsed * (node.stats.runs - 1) + tokensUsed) / node.stats.runs;
        }
        node.lastUpdated = new Date().toISOString();
        this.nodes.set(node.id, node);
        break;
      }
    }
  }

  /** Record a failure type for a stage */
  recordFailure(stage: PipelineStage, failureType: string): void {
    for (const node of this.nodes.values()) {
      if (node.stage === stage) {
        node.commonFailures[failureType] = (node.commonFailures[failureType] || 0) + 1;
        this.nodes.set(node.id, node);
        break;
      }
    }
  }

  /** Promote a successful strategy to the skill tree */
  promoteStrategy(stage: PipelineStage, strategySignature: string): void {
    for (const node of this.nodes.values()) {
      if (node.stage === stage && !node.bestStrategies.includes(strategySignature)) {
        node.bestStrategies.push(strategySignature);
        // Keep only top 5
        if (node.bestStrategies.length > 5) node.bestStrategies = node.bestStrategies.slice(0, 5);
        this.nodes.set(node.id, node);
        break;
      }
    }
  }

  /** Generate a prompt overlay for a step — lessons to inject before execution */
  generateOverlay(stepName: string, stage: PipelineStage): string {
    const node = Array.from(this.nodes.values()).find(n => n.stage === stage);
    if (!node || node.stats.runs === 0) return "";

    const hints: string[] = [];

    // Add prompt hints from past runs
    if (node.promptHints.length > 0) {
      hints.push(
        `## Lessons from Previous Runs\n`,
        `Based on ${node.stats.runs} previous run(s) (${node.stats.successes} successful):`,
        ...node.promptHints.map(h => `- ${h}`),
        ""
      );
    }

    // Add common failure warnings
    const topFailures = Object.entries(node.commonFailures)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    if (topFailures.length > 0) {
      hints.push(
        `## Common Pitfalls to Avoid`,
        ...topFailures.map(([type, count]) => `- "${type}" has caused ${count} failure(s) in past runs`),
        ""
      );
    }

    // Add best strategies
    if (node.bestStrategies.length > 0) {
      hints.push(
        `## Proven Strategies`,
        `These approaches have worked before:`,
        ...node.bestStrategies.map(s => `- Strategy: ${s}`),
        ""
      );
    }

    // Add general stats
    const successRate = node.stats.runs > 0 ? ((node.stats.successes / node.stats.runs) * 100).toFixed(0) : "N/A";
    hints.push(
      `## Historical Performance`,
      `- Runs: ${node.stats.runs} | Success rate: ${successRate}% | Avg attempts: ${node.stats.avgAttempts.toFixed(1)}`,
      ""
    );

    return hints.join("\n");
  }

  /** Get the full tree as a renderable structure */
  renderTree(): string {
    const lines: string[] = ["Skill Tree:", ""];

    const renderNode = (id: string, depth: number) => {
      const node = this.nodes.get(id);
      if (!node) return;

      const indent = "  ".repeat(depth);
      const rate = node.stats.runs > 0
        ? `${Math.round((node.stats.successes / node.stats.runs) * 100)}%`
        : "—";
      lines.push(`${indent}${node.name} [${node.stage}] — ${rate} success (${node.stats.runs} runs)`);

      for (const childId of node.children) {
        renderNode(childId, depth + 1);
      }
    };

    // Render roots (nodes with no parent)
    for (const node of this.nodes.values()) {
      if (node.parent === null) {
        renderNode(node.id, 0);
      }
    }

    return lines.join("\n");
  }
}

/** Generate a skill overlay for a given step (called from pipeline_helpers.sh) */
export function generateSkillOverlayForStep(stepName: string, stage: PipelineStage): string {
  // This is called from generate_overlay in pipeline_helpers.sh
  // Returns a text overlay that gets injected via environment variable
  const node = SKILL_TREE_DEF.find(n => n.stage === stage);
  if (!node) return "";
  return `[Skill overlay for ${stepName}: ${node.name}]`;
}
