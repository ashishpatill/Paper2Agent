import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import type {
  FixLoopState,
  GapAnalysis,
  PipelineStepOutcomesReport,
  ReplicationOutcomeReport,
  ResultsComparison,
  SetupReadinessReport
} from "./types";

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

export interface DatasetAcquisitionReport {
  generatedAt: string;
  total: number;
  downloaded: number;
  synthetic: number;
  failed: number;
  downloadedDatasets: string[];
  syntheticDatasets: string[];
  failedDatasets: string[];
}

export interface WorkspaceArtifacts {
  setupReadiness: SetupReadinessReport | null;
  replicationOutcome: ReplicationOutcomeReport | null;
  pipelineStepOutcomes: PipelineStepOutcomesReport | null;
  gapAnalysis: GapAnalysis | null;
  resultsComparison: ResultsComparison | null;
  fixLoopState: FixLoopState | null;
  experimentSummary: ExperimentSummaryArtifact | null;
  experimentResults: ExperimentResultArtifact[];
  datasetAcquisition: DatasetAcquisitionReport | null;
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
      setupReadiness: null,
      replicationOutcome: null,
      pipelineStepOutcomes: null,
      gapAnalysis: null,
      resultsComparison: null,
      fixLoopState: null,
      experimentSummary: null,
      experimentResults: [],
      datasetAcquisition: null
    };
  }

  const reportsPath = path.join(workspacePath, "reports");
  const experimentResultsPath = path.join(reportsPath, "experiment_results");

  const [setupReadiness, replicationOutcome, pipelineStepOutcomes, gapAnalysis, resultsComparison, fixLoopState, experimentSummary, datasetAcquisition] = await Promise.all([
    readJsonIfExists<SetupReadinessReport>(path.join(reportsPath, "setup-readiness.json")),
    readJsonIfExists<ReplicationOutcomeReport>(path.join(reportsPath, "replication-outcome.json")),
    readJsonIfExists<PipelineStepOutcomesReport>(path.join(reportsPath, "pipeline-step-outcomes.json")),
    readJsonIfExists<GapAnalysis>(path.join(reportsPath, "gap_analysis.json")),
    readJsonIfExists<ResultsComparison>(path.join(reportsPath, "results_comparison.json")),
    readJsonIfExists<FixLoopState>(path.join(reportsPath, "fix_loop", "fix_loop_state.json")),
    readJsonIfExists<ExperimentSummaryArtifact>(path.join(experimentResultsPath, "summary.json")),
    readJsonIfExists<DatasetAcquisitionReport>(path.join(reportsPath, "dataset-acquisition.json"))
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
    setupReadiness,
    replicationOutcome,
    pipelineStepOutcomes,
    gapAnalysis,
    resultsComparison,
    fixLoopState,
    experimentSummary,
    experimentResults,
    datasetAcquisition
  };
}
