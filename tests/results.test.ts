import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { loadWorkspaceArtifacts } from "../lib/server/results";

test("workspace artifact loader reads pipeline result files", async () => {
  const workspacePath = await mkdtemp(path.join(os.tmpdir(), "paper2agent-results-"));

  try {
    const reportsPath = path.join(workspacePath, "reports");
    const experimentResultsPath = path.join(reportsPath, "experiment_results");
    const fixLoopPath = path.join(reportsPath, "fix_loop");

    await mkdir(experimentResultsPath, { recursive: true });
    await mkdir(fixLoopPath, { recursive: true });

    await writeFile(
      path.join(reportsPath, "setup-readiness.json"),
      JSON.stringify({
        generatedAt: "2026-04-01T09:00:00.000Z",
        repository: {
          name: "demo-repo",
          path: "repo/demo-repo",
          mainCodePaths: ["repo/demo-repo/src"],
          notebookPaths: ["notebooks/demo.ipynb"]
        },
        environment: {
          reportFound: true,
          ready: true,
          environmentName: "demo-env",
          pythonVersion: "3.11.9",
          environmentLocation: "/tmp/demo-env",
          installationMethod: "uv",
          packageCount: 12,
          activationCommand: "source demo-env/bin/activate",
          installCommands: ["uv venv --python 3.11 demo-env"],
          validationChecksPassed: 4,
          validationChecksTotal: 4
        },
        tutorials: {
          scanFound: true,
          includeListFound: true,
          success: true,
          successReason: "ok",
          totalScanned: 2,
          includedInTools: 1,
          runnableCandidates: 1,
          includedPaths: ["repo/demo-repo/notebooks/demo.ipynb"]
        },
        blockers: [],
        requirements: ["source demo-env/bin/activate"],
        nextSteps: ["Run tutorial notebooks"]
      }),
      "utf8"
    );

    await writeFile(
      path.join(reportsPath, "replication-outcome.json"),
      JSON.stringify({
        generatedAt: "2026-04-01T09:30:00.000Z",
        track: "hybrid",
        lifecycle: "results_compared",
        summary: "A results comparison exists, but validation has not passed yet.",
        implementation: {
          required: true,
          experimentFiles: 2
        },
        experiments: {
          summaryFound: true,
          total: 2,
          successful: 1,
          partial: 1,
          failed: 0,
          crashed: 0
        },
        comparison: {
          found: true,
          overallMatch: "approximate",
          matchScore: 0.67
        },
        fixLoop: {
          found: true,
          converged: false,
          currentAttempt: 2,
          maxAttempts: 3
        },
        validation: {
          found: false
        },
        blockers: ["Validation has not run yet."],
        nextSteps: ["Run workspace validation."]
      }),
      "utf8"
    );

    await writeFile(
      path.join(reportsPath, "pipeline-step-outcomes.json"),
      JSON.stringify({
        generatedAt: "2026-04-01T09:30:00.000Z",
        steps: [
          {
            stepNumber: 5,
            name: "Setup Python environment & scan tutorials",
            outcome: "completed",
            updatedAt: "2026-04-01T09:05:00.000Z"
          },
          {
            stepNumber: 6,
            name: "Execute tutorial notebooks",
            outcome: "skipped",
            detail: "No runnable tutorials were selected.",
            updatedAt: "2026-04-01T09:06:00.000Z"
          }
        ]
      }),
      "utf8"
    );

    await writeFile(
      path.join(reportsPath, "gap_analysis.json"),
      JSON.stringify({
        coverage_score: 0.5,
        track: "hybrid",
        covered_capabilities: ["tokenization"],
        uncovered_capabilities: ["training"],
        gaps: [],
        recommended_approach: "Combine tutorial extraction with focused implementation."
      }),
      "utf8"
    );

    await writeFile(
      path.join(reportsPath, "results_comparison.json"),
      JSON.stringify({
        overall_match: "approximate",
        match_score: 0.67,
        comparisons: [
          {
            reported: { experiment: "Table 1", metric: "accuracy", value: 92.1 },
            observed: { value: 90.4 },
            delta: -1.7,
            within_threshold: true,
            notes: "Within tolerance."
          }
        ],
        summary: "Main metric is close to the paper."
      }),
      "utf8"
    );

    await writeFile(
      path.join(fixLoopPath, "fix_loop_state.json"),
      JSON.stringify({
        max_attempts: 3,
        current_attempt: 2,
        attempts: [
          {
            attempt_number: 1,
            timestamp: "2026-04-01T09:00:00.000Z",
            status: "partial",
            metrics: { match_score: 0.5 }
          }
        ],
        best_attempt: {
          attempt_number: 2,
          timestamp: "2026-04-01T09:20:00.000Z",
          status: "success",
          metrics: { match_score: 0.67 }
        },
        converged: false
      }),
      "utf8"
    );

    await writeFile(
      path.join(experimentResultsPath, "summary.json"),
      JSON.stringify({
        total_experiments: 2,
        successful: 1,
        partial: 1,
        failed: 0,
        crashed: 0,
        experiments: [
          { name: "baseline", status: "success", result_file: "baseline_result.json" }
        ]
      }),
      "utf8"
    );

    await writeFile(
      path.join(experimentResultsPath, "baseline_result.json"),
      JSON.stringify({
        experiment: "baseline",
        status: "success",
        timestamp: "2026-04-01T09:10:00.000Z",
        duration_seconds: 42,
        metrics: {
          accuracy: 90.4
        },
        errors: [],
        output_log: "baseline_output.log"
      }),
      "utf8"
    );

    const artifacts = await loadWorkspaceArtifacts(workspacePath);

    assert.equal(artifacts.setupReadiness?.environment.ready, true);
    assert.equal(artifacts.replicationOutcome?.lifecycle, "results_compared");
    assert.equal(artifacts.replicationOutcome?.comparison.matchScore, 0.67);
    assert.equal(artifacts.pipelineStepOutcomes?.steps.length, 2);
    assert.equal(artifacts.pipelineStepOutcomes?.steps[1]?.outcome, "skipped");
    assert.equal(artifacts.setupReadiness?.tutorials.includedInTools, 1);
    assert.equal(artifacts.gapAnalysis?.track, "hybrid");
    assert.equal(artifacts.resultsComparison?.overall_match, "approximate");
    assert.equal(artifacts.fixLoopState?.current_attempt, 2);
    assert.equal(artifacts.experimentSummary?.total_experiments, 2);
    assert.equal(artifacts.experimentResults.length, 1);
    assert.equal(artifacts.experimentResults[0]?.experiment, "baseline");
    assert.equal(artifacts.experimentResults[0]?.metrics.accuracy, 90.4);
  } finally {
    await rm(workspacePath, { recursive: true, force: true });
  }
});
