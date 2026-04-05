/**
 * Unit tests for pipeline-outcomes — read/write of the outcomes report file.
 * Run with: node --import tsx --test tests/unit/pipeline-outcomes.test.ts
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { updatePipelineStepOutcome, pipelineStepOutcomesPath } from "../../lib/server/pipeline-outcomes";

let tmpDir: string;

before(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), "p2a-test-"));
});

after(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("updatePipelineStepOutcome", () => {
  it("creates the report file on first write", async () => {
    const report = await updatePipelineStepOutcome({
      workspacePath: tmpDir,
      stepNumber: 1,
      name: "Setup",
      outcome: "completed",
    });
    assert.equal(report.steps.length, 1);
    assert.equal(report.steps[0].stepNumber, 1);
    assert.equal(report.steps[0].outcome, "completed");
  });

  it("appends a second step without overwriting the first", async () => {
    await updatePipelineStepOutcome({
      workspacePath: tmpDir,
      stepNumber: 2,
      name: "Clone",
      outcome: "skipped",
      detail: "Already exists",
    });

    // Re-read the file directly
    const { readFile } = await import("node:fs/promises");
    const raw = JSON.parse(await readFile(pipelineStepOutcomesPath(tmpDir), "utf8"));
    assert.equal(raw.steps.length, 2);
    assert.equal(raw.steps[1].outcome, "skipped");
    assert.equal(raw.steps[1].detail, "Already exists");
  });

  it("updates an existing step rather than duplicating it", async () => {
    await updatePipelineStepOutcome({
      workspacePath: tmpDir,
      stepNumber: 1,
      name: "Setup",
      outcome: "failed_tolerated",
      detail: "Partial failure",
      attempts: 3,
    });

    const { readFile } = await import("node:fs/promises");
    const raw = JSON.parse(await readFile(pipelineStepOutcomesPath(tmpDir), "utf8"));
    const step1 = raw.steps.filter((s: { stepNumber: number }) => s.stepNumber === 1);
    assert.equal(step1.length, 1, "should not duplicate step 1");
    assert.equal(step1[0].outcome, "failed_tolerated");
    assert.equal(step1[0].attempts, 3);
  });

  it("keeps steps sorted by stepNumber", async () => {
    // Write out-of-order
    await updatePipelineStepOutcome({
      workspacePath: tmpDir,
      stepNumber: 10,
      name: "Experiment runner",
      outcome: "completed",
    });

    const { readFile } = await import("node:fs/promises");
    const raw = JSON.parse(await readFile(pipelineStepOutcomesPath(tmpDir), "utf8"));
    const numbers = raw.steps.map((s: { stepNumber: number }) => s.stepNumber);
    assert.deepEqual(numbers, [...numbers].sort((a, b) => a - b));
  });
});
