import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { buildReplicationOutcomeReport } from "../lib/server/replication-outcome";

test("replication outcome report captures comparison and validation state", async () => {
  const workspacePath = await mkdtemp(path.join(os.tmpdir(), "paper2agent-replication-outcome-"));

  try {
    const reportsPath = path.join(workspacePath, "reports");
    const experimentResultsPath = path.join(reportsPath, "experiment_results");
    const fixLoopPath = path.join(reportsPath, "fix_loop");
    const experimentsPath = path.join(workspacePath, "src", "experiments");

    await mkdir(experimentResultsPath, { recursive: true });
    await mkdir(fixLoopPath, { recursive: true });
    await mkdir(experimentsPath, { recursive: true });

    await Promise.all([
      writeFile(path.join(experimentsPath, "baseline.py"), "print('baseline')\n", "utf8"),
      writeFile(
        path.join(reportsPath, "gap_analysis.json"),
        JSON.stringify({
          coverage_score: 0.45,
          track: "hybrid",
          covered_capabilities: ["tokenization"],
          uncovered_capabilities: ["training"],
          gaps: [],
          recommended_approach: "Hybrid approach."
        }),
        "utf8"
      ),
      writeFile(
        path.join(experimentResultsPath, "summary.json"),
        JSON.stringify({
          total_experiments: 2,
          successful: 1,
          partial: 1,
          failed: 0,
          crashed: 0,
          experiments: []
        }),
        "utf8"
      ),
      writeFile(
        path.join(reportsPath, "results_comparison.json"),
        JSON.stringify({
          overall_match: "approximate",
          match_score: 0.67,
          comparisons: [],
          summary: "Close enough."
        }),
        "utf8"
      ),
      writeFile(
        path.join(fixLoopPath, "fix_loop_state.json"),
        JSON.stringify({
          max_attempts: 3,
          current_attempt: 2,
          attempts: [],
          converged: false
        }),
        "utf8"
      ),
      writeFile(
        path.join(reportsPath, "validation_report.json"),
        JSON.stringify({
          timestamp: "2026-04-04T12:00:00.000Z",
          overall: "partial",
          checks: []
        }),
        "utf8"
      )
    ]);

    const report = await buildReplicationOutcomeReport(workspacePath);

    assert.equal(report.lifecycle, "replication_partial");
    assert.equal(report.track, "hybrid");
    assert.equal(report.implementation.experimentFiles, 1);
    assert.equal(report.experiments.total, 2);
    assert.equal(report.comparison.found, true);
    assert.equal(report.validation.overall, "partial");
    assert.ok(report.nextSteps.includes("Resolve the failing validation checks before claiming full replication."));
  } finally {
    await rm(workspacePath, { recursive: true, force: true });
  }
});
