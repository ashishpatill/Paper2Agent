/**
 * Cross-run skill transfer — lesson extraction from pipeline runs.
 *
 * After a pipeline run completes, this module scans the run's artifacts
 * (logs, results, fix-loop state) and extracts transferable lessons
 * into the evolution store. On future runs, the prompt overlay system
 * surfaces these lessons as context.
 *
 * Inspired by AutoResearchClaw's MetaClaw pattern.
 */

import * as fs from "fs";
import * as path from "path";
import { EvolutionStore, LessonCategory, PipelineStage } from "./evolution-store";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RunContext {
  /** Absolute path to the project workspace */
  workspacePath: string;
  /** Paper slug / project name */
  paperSlug?: string;
  /** Repository name */
  repoName?: string;
}

export interface ExtractionResult {
  lessonsExtracted: number;
  categories: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Lesson extraction
// ---------------------------------------------------------------------------

/**
 * Extract lessons from a completed pipeline run and store them
 * in the evolution store for future runs.
 */
export function extractLessons(
  store: EvolutionStore,
  run: RunContext
): ExtractionResult {
  const result: ExtractionResult = { lessonsExtracted: 0, categories: {} };

  const extractors = [
    extractFixLoopLessons,
    extractExperimentLessons,
    extractEnvironmentLessons,
    extractGapAnalysisLessons,
  ];

  for (const extractor of extractors) {
    const count = extractor(store, run);
    result.lessonsExtracted += count;
  }

  // Count by category
  const recent = store.readAll().slice(-result.lessonsExtracted);
  for (const entry of recent) {
    result.categories[entry.category] = (result.categories[entry.category] || 0) + 1;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Individual extractors
// ---------------------------------------------------------------------------

function extractFixLoopLessons(store: EvolutionStore, run: RunContext): number {
  let count = 0;
  const fixLoopDir = path.join(run.workspacePath, "reports", "fix_loop");
  const statePath = path.join(fixLoopDir, "fix_loop_state.json");

  if (!fs.existsSync(statePath)) return 0;

  try {
    const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));

    // Extract convergence lesson
    if (state.converged) {
      store.append({
        stage: "fix-loop",
        category: "pattern",
        paperSlug: run.paperSlug,
        repoName: run.repoName,
        lesson: `Converged after ${state.current_attempt} attempt(s): ${state.convergence_reason || "unknown reason"}`,
        tags: ["convergence", "fix-loop"],
      });
      count++;
    } else if (state.current_attempt >= state.max_attempts) {
      store.append({
        stage: "fix-loop",
        category: "pattern",
        paperSlug: run.paperSlug,
        repoName: run.repoName,
        lesson: `Failed to converge after ${state.max_attempts} attempts. Consider scope reduction earlier or adjusting thresholds.`,
        tags: ["divergence", "fix-loop", "scope-reduction"],
      });
      count++;
    }

    // Extract per-attempt error patterns
    if (Array.isArray(state.attempts)) {
      for (const attempt of state.attempts) {
        if (attempt.errors && attempt.errors.length > 0) {
          for (const error of attempt.errors) {
            if (isTransferableError(error)) {
              store.append({
                stage: "fix-loop",
                category: "error-fix",
                paperSlug: run.paperSlug,
                repoName: run.repoName,
                lesson: `Fix loop encountered: ${error}`,
                context: `Attempt ${attempt.attempt_number}, status: ${attempt.status}`,
                tags: extractErrorTags(error),
              });
              count++;
            }
          }
        }
      }
    }
  } catch { /* skip malformed state */ }

  return count;
}

function extractExperimentLessons(store: EvolutionStore, run: RunContext): number {
  let count = 0;
  const resultsDir = path.join(run.workspacePath, "reports", "experiment_results");

  if (!fs.existsSync(resultsDir)) return 0;

  const summaryPath = path.join(resultsDir, "summary.json");
  if (!fs.existsSync(summaryPath)) return 0;

  try {
    const summary = JSON.parse(fs.readFileSync(summaryPath, "utf-8"));

    // Record overall success rate
    if (summary.total_experiments > 0) {
      const successRate = (summary.successful || 0) / summary.total_experiments;
      if (successRate < 0.5) {
        store.append({
          stage: "experiment-runner",
          category: "pattern",
          paperSlug: run.paperSlug,
          repoName: run.repoName,
          lesson: `Low experiment success rate (${Math.round(successRate * 100)}%). ${summary.crashed || 0} crashed, ${summary.failed || 0} failed out of ${summary.total_experiments} total.`,
          tags: ["success-rate", "experiment-runner"],
        });
        count++;
      }
    }

    // Extract crash patterns from individual result files
    if (Array.isArray(summary.experiments)) {
      for (const exp of summary.experiments) {
        if (exp.status === "crashed" && exp.result_file) {
          const resultPath = path.join(resultsDir, exp.result_file);
          if (fs.existsSync(resultPath)) {
            try {
              const result = JSON.parse(fs.readFileSync(resultPath, "utf-8"));
              if (result.errors && result.errors.length > 0) {
                const errorSummary = result.errors[0];
                if (isTransferableError(errorSummary)) {
                  store.append({
                    stage: "experiment-runner",
                    category: "error-fix",
                    paperSlug: run.paperSlug,
                    repoName: run.repoName,
                    lesson: `Experiment "${exp.name}" crashed: ${errorSummary}`,
                    tags: extractErrorTags(errorSummary),
                  });
                  count++;
                }
              }
            } catch { /* skip */ }
          }
        }
      }
    }
  } catch { /* skip */ }

  return count;
}

function extractEnvironmentLessons(store: EvolutionStore, run: RunContext): number {
  let count = 0;

  // Scan step output logs for environment-related patterns
  const claudeOutputs = path.join(run.workspacePath, "claude_outputs");
  if (!fs.existsSync(claudeOutputs)) return 0;

  // Check step 1 output for environment issues
  const step1Out = path.join(claudeOutputs, "step1_output.json");
  if (fs.existsSync(step1Out)) {
    try {
      const content = fs.readFileSync(step1Out, "utf-8");

      // Look for pip install failures
      const pipFailMatch = content.match(/pip install.*failed|ERROR:.*pip|No matching distribution/i);
      if (pipFailMatch) {
        store.append({
          stage: "environment",
          category: "environment",
          paperSlug: run.paperSlug,
          repoName: run.repoName,
          lesson: `Package installation issue detected during environment setup.`,
          context: pipFailMatch[0].substring(0, 200),
          tags: ["pip", "install", "environment"],
        });
        count++;
      }
    } catch { /* skip */ }
  }

  return count;
}

function extractGapAnalysisLessons(store: EvolutionStore, run: RunContext): number {
  let count = 0;
  const gapReport = path.join(run.workspacePath, "reports", "gap_analysis.json");

  if (!fs.existsSync(gapReport)) return 0;

  try {
    const gap = JSON.parse(fs.readFileSync(gapReport, "utf-8"));

    // Record the track decision for future reference
    if (gap.track && gap.coverage_score !== undefined) {
      store.append({
        stage: "gap-analysis",
        category: "pattern",
        paperSlug: run.paperSlug,
        repoName: run.repoName,
        lesson: `Coverage score ${gap.coverage_score.toFixed(2)} → routed to "${gap.track}" track. ${(gap.uncovered_capabilities || []).length} uncovered capabilities.`,
        tags: ["coverage", "routing", gap.track],
      });
      count++;
    }

    // Record high-complexity gaps
    if (Array.isArray(gap.gaps)) {
      const highComplexity = gap.gaps.filter((g: { complexity: string }) => g.complexity === "high");
      if (highComplexity.length > 0) {
        store.append({
          stage: "gap-analysis",
          category: "pattern",
          paperSlug: run.paperSlug,
          repoName: run.repoName,
          lesson: `${highComplexity.length} high-complexity gap(s) identified: ${highComplexity.map((g: { capability: string }) => g.capability).join(", ")}`,
          tags: ["high-complexity", "gap-analysis"],
        });
        count++;
      }
    }
  } catch { /* skip */ }

  return count;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Determine if an error message contains transferable knowledge */
function isTransferableError(error: string): boolean {
  // Skip overly specific errors (file paths, line numbers change between runs)
  if (error.length > 500) return false;
  if (error.length < 10) return false;

  // Keep errors about known package/import/config issues
  const transferablePatterns = [
    /ModuleNotFoundError/i,
    /ImportError/i,
    /CUDA|GPU|MPS/i,
    /MemoryError|OOM/i,
    /timeout/i,
    /version.*mismatch/i,
    /permission denied/i,
    /file not found/i,
    /connection.*refused/i,
    /rate.?limit/i,
  ];

  return transferablePatterns.some(p => p.test(error));
}

/** Extract searchable tags from an error message */
function extractErrorTags(error: string): string[] {
  const tags: string[] = ["error"];
  const lower = error.toLowerCase();

  if (lower.includes("import") || lower.includes("module")) tags.push("import");
  if (lower.includes("cuda") || lower.includes("gpu")) tags.push("gpu");
  if (lower.includes("mps")) tags.push("mps");
  if (lower.includes("memory") || lower.includes("oom")) tags.push("memory");
  if (lower.includes("timeout")) tags.push("timeout");
  if (lower.includes("pip") || lower.includes("install")) tags.push("pip");
  if (lower.includes("permission")) tags.push("permission");

  return tags;
}
