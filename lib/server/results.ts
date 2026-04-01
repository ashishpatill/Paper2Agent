import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import type { FixLoopState, GapAnalysis, ResultsComparison } from "./types";

export interface ExperimentResultArtifact {
  experiment: string;
  status: "success" | "partial" | "failed" | "crashed" | string;
  timestamp?: string;
  duration_seconds?: number;
  metrics: Record<string, number | string>;
  errors?: string[];
  output_log?: string;
  result_file?: string;
}

export interface ExperimentSummaryArtifact {
  total_experiments: number;
  successful: number;
  partial: number;
  failed: number;
  crashed: number;
  experiments: Array<{
    name: string;
    status: string;
    result_file?: string;
  }>;
}

export interface WorkspaceArtifacts {
  gapAnalysis: GapAnalysis | null;
  resultsComparison: ResultsComparison | null;
  fixLoopState: FixLoopState | null;
  experimentSummary: ExperimentSummaryArtifact | null;
  experimentResults: ExperimentResultArtifact[];
}

async function readJsonIfExists<T>(filePath: string) {
  try {
    const content = await readFile(filePath, "utf8");
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

export async function loadWorkspaceArtifacts(
  workspacePath?: string | null
): Promise<WorkspaceArtifacts> {
  if (!workspacePath) {
    return {
      gapAnalysis: null,
      resultsComparison: null,
      fixLoopState: null,
      experimentSummary: null,
      experimentResults: []
    };
  }

  const reportsPath = path.join(workspacePath, "reports");
  const experimentResultsPath = path.join(reportsPath, "experiment_results");

  const [gapAnalysis, resultsComparison, fixLoopState, experimentSummary] = await Promise.all([
    readJsonIfExists<GapAnalysis>(path.join(reportsPath, "gap_analysis.json")),
    readJsonIfExists<ResultsComparison>(path.join(reportsPath, "results_comparison.json")),
    readJsonIfExists<FixLoopState>(path.join(reportsPath, "fix_loop", "fix_loop_state.json")),
    readJsonIfExists<ExperimentSummaryArtifact>(path.join(experimentResultsPath, "summary.json"))
  ]);

  let experimentResults: ExperimentResultArtifact[] = [];

  try {
    const entries = await readdir(experimentResultsPath, { withFileTypes: true });
    const resultFiles = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith("_result.json"))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));

    const loadedResults: ExperimentResultArtifact[] = [];

    for (const fileName of resultFiles) {
      const result = await readJsonIfExists<ExperimentResultArtifact>(
        path.join(experimentResultsPath, fileName)
      );

      if (!result) {
        continue;
      }

      loadedResults.push({
        ...result,
        result_file: result.result_file || fileName,
        metrics: result.metrics || {}
      });
    }

    experimentResults = loadedResults;
  } catch {
    experimentResults = [];
  }

  return {
    gapAnalysis,
    resultsComparison,
    fixLoopState,
    experimentSummary,
    experimentResults
  };
}
