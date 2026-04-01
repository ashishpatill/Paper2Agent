import test from "node:test";
import assert from "node:assert/strict";

import { buildPipelineProgress, PIPELINE_STEP_DEFINITIONS } from "../lib/server/pipeline";

test("pipeline progress initializes the full shell workflow", () => {
  const progress = buildPipelineProgress([]);

  assert.equal(progress.steps.length, PIPELINE_STEP_DEFINITIONS.length);
  assert.equal(progress.totalSteps, PIPELINE_STEP_DEFINITIONS.length);
  assert.equal(progress.steps[0]?.name, "Setup project environment");
  assert.equal(progress.steps.at(-1)?.name, "Launch MCP server");
});

test("pipeline progress tracks late-stage implementation and launch steps", () => {
  const progress = buildPipelineProgress([
    {
      stepNumber: 17,
      phase: "complete",
      label: "MCP re-wrap (implementation tools)",
      timestamp: "2026-04-01T10:00:00.000Z"
    },
    {
      stepNumber: 18,
      phase: "start",
      label: "Launch MCP server",
      timestamp: "2026-04-01T10:05:00.000Z"
    }
  ]);

  assert.equal(progress.steps[16]?.status, "completed");
  assert.equal(progress.steps[17]?.status, "running");
  assert.equal(progress.currentStep, 18);
});
