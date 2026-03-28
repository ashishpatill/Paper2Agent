/**
 * Prompt overlay generator — injects cross-run lessons into Claude prompts.
 *
 * Reads relevant entries from the evolution store for the current pipeline
 * stage and formats them as an additional prompt section that gets appended
 * to the step prompt via envsubst.
 */

import { EvolutionStore, PipelineStage, WeightedEntry } from "./evolution-store";

// ---------------------------------------------------------------------------
// Stage mapping: pipeline step number → evolution store stage
// ---------------------------------------------------------------------------

const STEP_TO_STAGE: Record<number, PipelineStage> = {
  1: "environment",
  2: "tutorial-execute",
  3: "tool-extraction",
  4: "mcp-wrap",
  5: "general",        // coverage/quality is general
  6: "general",        // benchmarks
  7: "general",        // benchmarks
  8: "gap-analysis",
  9: "paper-coder",
  10: "experiment-runner",
  11: "results-comparator",
  12: "fix-loop",
  13: "mcp-rewrap",
};

// ---------------------------------------------------------------------------
// Overlay generation
// ---------------------------------------------------------------------------

export interface OverlayOptions {
  /** Pipeline step number (1-13) */
  stepNumber: number;
  /** Maximum number of lessons to include */
  maxLessons?: number;
  /** Minimum weight threshold for inclusion */
  minWeight?: number;
  /** Filter by specific repo name */
  repoName?: string;
}

/**
 * Generate a prompt overlay section from the evolution store.
 * Returns empty string if no relevant lessons exist.
 */
export function generateOverlay(
  store: EvolutionStore,
  options: OverlayOptions
): string {
  const stage = STEP_TO_STAGE[options.stepNumber] || "general";
  const maxLessons = options.maxLessons ?? 5;
  const minWeight = options.minWeight ?? 0.05;

  // Get stage-specific lessons
  let entries = store.queryByStage(stage, maxLessons * 2);

  // If repo-specific, boost those entries
  if (options.repoName) {
    const repoEntries = store.queryByRun(undefined, options.repoName, maxLessons);
    entries = mergeAndDedup(entries, repoEntries);
  }

  // Filter by weight and limit
  entries = entries
    .filter(e => e.weight >= minWeight)
    .slice(0, maxLessons);

  if (entries.length === 0) return "";

  // Format as prompt section
  const lines = [
    "",
    "## Lessons from Previous Runs",
    "",
    "The following insights were learned from previous pipeline executions.",
    "Apply them where relevant but use your judgment — they may not all apply to this specific paper/repo.",
    "",
  ];

  for (const entry of entries) {
    const confidence = entry.weight >= 0.5 ? "high" : entry.weight >= 0.2 ? "medium" : "low";
    lines.push(`### ${categoryLabel(entry.category)} (confidence: ${confidence})`);
    lines.push(entry.lesson);
    if (entry.context) {
      lines.push("```");
      lines.push(entry.context);
      lines.push("```");
    }
    if (entry.paperSlug || entry.repoName) {
      lines.push(`_Source: ${[entry.paperSlug, entry.repoName].filter(Boolean).join(" / ")}_`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Generate the overlay and export it as an environment variable value.
 * The step runner scripts can call this via a small Node helper.
 */
export function generateOverlayForEnv(
  baseDir: string,
  stepNumber: number,
  repoName?: string
): string {
  const store = new EvolutionStore(baseDir);
  return generateOverlay(store, { stepNumber, repoName });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function categoryLabel(category: string): string {
  const labels: Record<string, string> = {
    "error-fix": "Error Fix Pattern",
    "environment": "Environment Note",
    "pattern": "Code Pattern",
    "performance": "Performance Insight",
    "data": "Data Handling",
    "prompt": "Prompt Insight",
    "workaround": "Known Workaround",
  };
  return labels[category] || category;
}

function mergeAndDedup(a: WeightedEntry[], b: WeightedEntry[]): WeightedEntry[] {
  const seen = new Set(a.map(e => e.id));
  const merged = [...a];
  for (const entry of b) {
    if (!seen.has(entry.id)) {
      merged.push(entry);
      seen.add(entry.id);
    }
  }
  return merged.sort((x, y) => y.weight - x.weight);
}
