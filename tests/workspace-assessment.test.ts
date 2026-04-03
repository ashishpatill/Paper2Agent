import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { buildWorkspaceAssessment } from "../lib/server/workspace-assessment";
import type { JobRecord } from "../lib/server/types";

function makeJob(workspacePath: string, overrides: Partial<JobRecord> = {}): JobRecord {
  const now = "2026-04-04T10:00:00.000Z";

  return {
    id: "job-1",
    createdAt: now,
    updatedAt: now,
    status: "running_pipeline",
    sourceType: "url",
    paperUrl: "https://example.com/paper",
    repositoryUrl: "https://github.com/example/repo",
    workspacePath,
    analysis: {
      title: "Example Paper",
      abstract: "Abstract",
      summary: "Summary",
      projectSlug: "example-paper",
      confidence: "high",
      capabilities: ["classification"],
      reported_results: [{ experiment: "Table 1", metric: "accuracy", value: 0.9 }],
      datasets_required: [{ name: "DemoSet", publicly_available: true }],
      suggestedQuestions: [],
      setupNotes: ["Install the project dependencies and prepare the dataset."],
    },
    ...overrides
  };
}

test("workspace assessment reports setup-ready runs separately from implementation completeness", async () => {
  const workspacePath = await mkdtemp(path.join(os.tmpdir(), "paper2agent-assessment-"));

  try {
    await mkdir(path.join(workspacePath, ".pipeline"), { recursive: true });
    await mkdir(path.join(workspacePath, "reports"), { recursive: true });

    await Promise.all([
      writeFile(path.join(workspacePath, ".pipeline", "01_setup_done"), "", "utf8"),
      writeFile(path.join(workspacePath, ".pipeline", "02_clone_done"), "", "utf8"),
      writeFile(path.join(workspacePath, ".pipeline", "03_folders_done"), "", "utf8"),
      writeFile(path.join(workspacePath, ".pipeline", "04_context7_done"), "", "utf8"),
      writeFile(path.join(workspacePath, ".pipeline", "05_step1_done"), "", "utf8"),
      writeFile(
        path.join(workspacePath, "reports", "environment-manager_results.md"),
        [
          "# Environment Setup",
          "- **Environment Name**: demo-env",
          "- **Python Version**: 3.11.9",
          "- ✅ Environment created",
          "- ✅ Imports verified",
          "- ✅ Notebook tooling ready"
        ].join("\n"),
        "utf8"
      ),
      writeFile(
        path.join(workspacePath, "reports", "tutorial-scanner.json"),
        JSON.stringify({
          tutorials: [
            { include_in_tools: true },
            { include_in_tools: false }
          ]
        }),
        "utf8"
      )
    ]);

    const assessment = await buildWorkspaceAssessment(makeJob(workspacePath, { status: "completed" }));

    assert.equal(assessment.lifecycle, "setup_ready");
    assert.match(assessment.summary, /Initial setup artifacts exist/i);
    assert.ok(assessment.completedMilestones.includes("Environment bootstrapped"));
    assert.ok(
      assessment.remainingMilestones.includes("Generate and run implementation experiments")
    );
  } finally {
    await rm(workspacePath, { recursive: true, force: true });
  }
});

test("workspace assessment explains when a run failed after setup completed", async () => {
  const workspacePath = await mkdtemp(path.join(os.tmpdir(), "paper2agent-assessment-"));

  try {
    await mkdir(path.join(workspacePath, ".pipeline"), { recursive: true });
    await mkdir(path.join(workspacePath, "reports"), { recursive: true });

    await Promise.all([
      writeFile(path.join(workspacePath, ".pipeline", "05_step1_done"), "", "utf8"),
      writeFile(
        path.join(workspacePath, "reports", "environment-manager_results.md"),
        [
          "# Environment Setup",
          "- **Environment Name**: demo-env",
          "- **Python Version**: 3.11.9",
          "- ✅ Environment created",
          "- ✅ Imports verified",
          "- ✅ Notebook tooling ready"
        ].join("\n"),
        "utf8"
      ),
      writeFile(
        path.join(workspacePath, "reports", "tutorial-scanner.json"),
        JSON.stringify({ tutorials: [{ include_in_tools: true }] }),
        "utf8"
      )
    ]);

    const assessment = await buildWorkspaceAssessment(
      makeJob(workspacePath, {
        status: "failed",
        error: "The pipeline worker stopped responding and did not complete."
      })
    );

    assert.equal(assessment.lifecycle, "run_failed");
    assert.match(assessment.summary, /Initial setup completed/i);
    assert.ok(
      assessment.blockers.includes("The pipeline worker stopped responding and did not complete.")
    );
  } finally {
    await rm(workspacePath, { recursive: true, force: true });
  }
});
