import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { loadWorkspaceArtifacts } from "./results";
import type { ReplicationOutcomeReport, ValidationReport } from "./types";

async function pathExists(filePath: string) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonIfExists<T>(filePath: string) {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

async function countExperimentFiles(workspacePath: string) {
  const experimentsDir = path.join(workspacePath, "src", "experiments");

  async function walk(currentPath: string): Promise<number> {
    const entries = await readdir(currentPath, { withFileTypes: true }).catch(() => []);
    let count = 0;

    for (const entry of entries) {
      const nextPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        count += await walk(nextPath);
      } else if (entry.name.endsWith(".py")) {
        count += 1;
      }
    }

    return count;
  }

  if (!(await pathExists(experimentsDir))) {
    return 0;
  }

  return walk(experimentsDir);
}

function unique(items: Array<string | undefined | null>) {
  return Array.from(
    new Set(
      items
        .map((item) => item?.trim())
        .filter((item): item is string => Boolean(item))
    )
  );
}

export async function buildReplicationOutcomeReport(workspacePath: string): Promise<ReplicationOutcomeReport> {
  const reportsPath = path.join(workspacePath, "reports");
  const [artifacts, validationReport, experimentFiles] = await Promise.all([
    loadWorkspaceArtifacts(workspacePath),
    readJsonIfExists<ValidationReport>(path.join(reportsPath, "validation_report.json")),
    countExperimentFiles(workspacePath)
  ]);

  const track = artifacts.gapAnalysis?.track;
  const implementationRequired = track !== "tutorial";
  const experiments = artifacts.experimentSummary
    ? {
        summaryFound: true,
        total: artifacts.experimentSummary.total_experiments,
        successful: artifacts.experimentSummary.successful,
        partial: artifacts.experimentSummary.partial,
        failed: artifacts.experimentSummary.failed,
        crashed: artifacts.experimentSummary.crashed
      }
    : {
        summaryFound: false,
        total: artifacts.experimentResults.length,
        successful: artifacts.experimentResults.filter((result) => result.status === "success").length,
        partial: artifacts.experimentResults.filter((result) => result.status === "partial").length,
        failed: artifacts.experimentResults.filter((result) => result.status === "failed").length,
        crashed: artifacts.experimentResults.filter((result) => result.status === "crashed").length
      };

  const comparison = {
    found: Boolean(artifacts.resultsComparison),
    overallMatch: artifacts.resultsComparison?.overall_match,
    matchScore: artifacts.resultsComparison?.match_score
  };

  const fixLoop = {
    found: Boolean(artifacts.fixLoopState),
    converged: artifacts.fixLoopState?.converged,
    currentAttempt: artifacts.fixLoopState?.current_attempt,
    maxAttempts: artifacts.fixLoopState?.max_attempts
  };

  const validation = {
    found: Boolean(validationReport),
    overall: validationReport?.overall
  };

  let lifecycle: ReplicationOutcomeReport["lifecycle"] = "tutorial_only";

  if (!implementationRequired) {
    lifecycle = validation.overall === "pass" ? "replication_validated" : "tutorial_only";
  } else if (validation.overall === "pass") {
    lifecycle = "replication_validated";
  } else if (validation.overall === "partial") {
    lifecycle = "replication_partial";
  } else if (comparison.found) {
    lifecycle = "results_compared";
  } else if (experiments.total > 0 || experiments.summaryFound) {
    lifecycle = "experiments_partial";
  } else if (experimentFiles > 0) {
    lifecycle = "implementation_scaffolded";
  } else if (track === "implementation" || track === "hybrid") {
    lifecycle = "replication_blocked";
  }

  const blockers = unique([
    implementationRequired && experimentFiles === 0
      ? "No implementation experiment files have been generated yet."
      : undefined,
    implementationRequired && experiments.total === 0
      ? "No experiment run artifacts exist yet."
      : undefined,
    implementationRequired && !comparison.found
      ? "No results comparison has been generated yet."
      : undefined,
    fixLoop.found && fixLoop.converged === false
      ? `Fix loop has not converged after ${fixLoop.currentAttempt || 0}/${fixLoop.maxAttempts || 0} attempts.`
      : undefined,
    validation.overall === "fail"
      ? "Workspace validation failed."
      : undefined
  ]);

  const nextSteps = unique([
    implementationRequired && experimentFiles === 0
      ? "Generate implementation experiments from the uncovered paper capabilities."
      : undefined,
    implementationRequired && experimentFiles > 0 && experiments.total === 0
      ? "Run the generated experiment files and capture structured result artifacts."
      : undefined,
    implementationRequired && experiments.total > 0 && !comparison.found
      ? "Compare observed experiment metrics against the paper's reported results."
      : undefined,
    comparison.found && validation.overall !== "pass"
      ? "Run or re-run workspace validation after the implementation artifacts stabilize."
      : undefined,
    validation.overall === "partial"
      ? "Resolve the failing validation checks before claiming full replication."
      : undefined
  ]);

  const summary = (() => {
    switch (lifecycle) {
      case "tutorial_only":
        return implementationRequired
          ? "Implementation work is required, but no implementation artifacts exist yet."
          : "Tutorial coverage appears sufficient; no implementation-track work was required.";
      case "implementation_scaffolded":
        return "Implementation code has been scaffolded, but no experiment run artifacts have been captured yet.";
      case "experiments_partial":
        return "Experiment artifacts exist, but the run has not yet produced a comparison back to the paper.";
      case "results_compared":
        return "A results comparison exists, but the workspace still lacks a passing validation signal.";
      case "replication_partial":
        return "Replication artifacts exist and validation ran, but the workspace still has unresolved failures.";
      case "replication_validated":
        return "Implementation, comparison, and validation artifacts are all present with a passing validation result.";
      case "replication_blocked":
        return "Implementation-track work is expected, but the current artifacts do not yet show generated code or runnable experiments.";
    }
  })();

  return {
    generatedAt: new Date().toISOString(),
    track,
    lifecycle,
    summary,
    implementation: {
      required: implementationRequired,
      experimentFiles
    },
    experiments,
    comparison,
    fixLoop,
    validation,
    blockers,
    nextSteps
  };
}
