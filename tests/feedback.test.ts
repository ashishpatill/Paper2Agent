import test from "node:test";
import assert from "node:assert/strict";

import { applyFeedbackConsumption, formatFeedbackOverlay } from "../lib/server/feedback";
import type { UserFeedback } from "../lib/server/types";

const sampleFeedback: UserFeedback[] = [
  {
    id: "fb-1",
    timestamp: "2026-04-01T10:00:00.000Z",
    message: "Prefer the synthetic proxy dataset if the paper dataset is unavailable.",
    action: "adjust_config",
    consumed: false
  },
  {
    id: "fb-2",
    timestamp: "2026-04-01T10:05:00.000Z",
    message: "Skip optional benchmark extraction if it blocks implementation work.",
    action: "skip_step",
    stepNumber: 10,
    consumed: true,
    consumedAt: "2026-04-01T10:06:00.000Z",
    consumedByStep: 12
  }
];

test("feedback consumption marks pending items with the step that picked them up", () => {
  const consumed = applyFeedbackConsumption(
    sampleFeedback,
    14,
    "2026-04-01T10:10:00.000Z"
  );

  assert.equal(consumed[0]?.consumed, true);
  assert.equal(consumed[0]?.consumedByStep, 14);
  assert.equal(consumed[0]?.consumedAt, "2026-04-01T10:10:00.000Z");
  assert.equal(consumed[1]?.consumedByStep, 12);
});

test("feedback overlay includes instructions consumed in or before the current step", () => {
  const overlay = formatFeedbackOverlay(
    applyFeedbackConsumption(sampleFeedback, 14, "2026-04-01T10:10:00.000Z"),
    14
  );

  assert.match(overlay, /User feedback received during this run/);
  assert.match(overlay, /synthetic proxy dataset/);
  assert.match(overlay, /Skip optional benchmark extraction/);
});
