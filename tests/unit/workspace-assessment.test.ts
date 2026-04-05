/**
 * Unit tests for workspace-assessment — lifecycle determination and milestone building.
 * Run with: node --import tsx --test tests/unit/workspace-assessment.test.ts
 */

// NOTE: We test the internal helper logic by importing the module and probing
// through buildWorkspaceAssessment with a real temp workspace. The private
// functions (determineLifecycle, buildMilestones) are exercised indirectly.

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildWorkspaceAssessment } from "../../lib/server/workspace-assessment";
import type { JobRecord } from "../../lib/server/types";

let tmpDir: string;

function baseJob(overrides: Partial<JobRecord> = {}): JobRecord {
  return {
    id: "test-job",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "completed",
    sourceType: "url",
    paperUrl: "https://example.com/paper.pdf",
    ...overrides,
  };
}

before(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), "p2a-ws-test-"));
});

after(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("buildWorkspaceAssessment", () => {
  it("returns paper_only lifecycle when job has no analysis", async () => {
    const job = baseJob({ workspacePath: tmpDir });
    const assessment = await buildWorkspaceAssessment(job);
    assert.equal(assessment.lifecycle, "paper_only");
  });

  it("returns repo_required lifecycle when analysis exists but no repositoryUrl", async () => {
    const job = baseJob({
      workspacePath: tmpDir,
      analysis: {
        title: "Test Paper",
        abstract: "Abstract",
        summary: "Summary",
        projectSlug: "test-paper",
        confidence: "high",
        capabilities: ["train", "inference"],
        reported_results: [],
        datasets_required: [],
        suggestedQuestions: [],
        setupNotes: [],
      },
    });
    const assessment = await buildWorkspaceAssessment(job);
    assert.equal(assessment.lifecycle, "repo_required");
  });

  it("includes 'Repository identified' milestone when repositoryUrl is set", async () => {
    const job = baseJob({
      workspacePath: tmpDir,
      repositoryUrl: "https://github.com/example/repo",
      analysis: {
        title: "Test Paper",
        abstract: "Abstract",
        summary: "Summary",
        projectSlug: "test-paper",
        confidence: "high",
        capabilities: ["train"],
        reported_results: [],
        datasets_required: [],
        suggestedQuestions: [],
        setupNotes: [],
      },
    });
    const assessment = await buildWorkspaceAssessment(job);
    assert.ok(assessment.completedMilestones.includes("Repository identified"));
  });

  it("returns run_failed lifecycle for failed jobs", async () => {
    const job = baseJob({
      status: "failed",
      error: "Out of memory",
      workspacePath: tmpDir,
    });
    const assessment = await buildWorkspaceAssessment(job);
    assert.equal(assessment.lifecycle, "run_failed");
    assert.ok(assessment.blockers.includes("Out of memory"));
  });

  it("loads setup readiness from reports/setup-readiness.json if present", async () => {
    const reportsDir = path.join(tmpDir, "reports");
    await mkdir(reportsDir, { recursive: true });
    const setupReport = {
      generatedAt: new Date().toISOString(),
      repository: { name: "test", path: tmpDir, mainCodePaths: [], notebookPaths: [] },
      environment: {
        reportFound: true,
        ready: true,
        environmentName: "test-env",
        pythonVersion: "3.11",
        installationMethod: "uv",
        packageCount: 42,
        installCommands: [],
        validationChecksPassed: 3,
        validationChecksTotal: 3,
      },
      tutorials: {
        scanFound: true,
        includeListFound: true,
        success: true,
        totalScanned: 5,
        includedInTools: 3,
        runnableCandidates: 4,
        includedPaths: [],
      },
      blockers: [],
      requirements: [],
      nextSteps: [],
    };
    await writeFile(path.join(reportsDir, "setup-readiness.json"), JSON.stringify(setupReport), "utf8");

    const job = baseJob({ workspacePath: tmpDir });
    const assessment = await buildWorkspaceAssessment(job);

    assert.equal(assessment.setup.environmentReady, true);
    assert.equal(assessment.setup.environmentName, "test-env");
    assert.equal(assessment.setup.pythonVersion, "3.11");
    assert.equal(assessment.setup.tutorialCandidates, 5);
    assert.equal(assessment.setup.reusableTutorials, 3);
  });
});
