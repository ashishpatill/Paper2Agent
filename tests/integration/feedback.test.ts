/**
 * Integration tests for the feedback module.
 *
 * Tests submission, consumption, and prompt injection of user feedback.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  applyFeedbackConsumption,
  formatFeedbackOverlay
} from "../../lib/server/feedback";
import type { UserFeedback } from "../../lib/server/types";

describe("feedback consumption", () => {
  it("marks unconsumed feedback as consumed", () => {
    const feedback: UserFeedback[] = [
      {
        id: "fb-1",
        timestamp: "2026-04-05T00:00:00Z",
        message: "Increase the learning rate",
        action: "hint",
        stepNumber: 9,
        consumed: false
      }
    ];

    const result = applyFeedbackConsumption(feedback, 10, "2026-04-05T01:00:00Z");

    assert.equal(result[0].consumed, true);
    assert.equal(result[0].consumedAt, "2026-04-05T01:00:00Z");
    assert.equal(result[0].consumedByStep, 10);
  });

  it("does not re-consume already consumed feedback", () => {
    const feedback: UserFeedback[] = [
      {
        id: "fb-1",
        timestamp: "2026-04-05T00:00:00Z",
        message: "First hint",
        consumed: true,
        consumedAt: "2026-04-05T00:30:00Z",
        consumedByStep: 5
      }
    ];

    const result = applyFeedbackConsumption(feedback, 10, "2026-04-05T01:00:00Z");

    // Should remain unchanged
    assert.equal(result[0].consumedAt, "2026-04-05T00:30:00Z");
    assert.equal(result[0].consumedByStep, 5);
  });

  it("handles multiple feedback entries", () => {
    const feedback: UserFeedback[] = [
      {
        id: "fb-1",
        timestamp: "2026-04-05T00:00:00Z",
        message: "First hint",
        consumed: false
      },
      {
        id: "fb-2",
        timestamp: "2026-04-05T00:05:00Z",
        message: "Second hint",
        action: "adjust_config",
        stepNumber: 8,
        consumed: false
      }
    ];

    const result = applyFeedbackConsumption(feedback, 12, "2026-04-05T01:00:00Z");

    assert.equal(result.length, 2);
    assert.ok(result.every((f) => f.consumed));
    assert.ok(result.every((f) => f.consumedAt === "2026-04-05T01:00:00Z"));
    assert.ok(result.every((f) => f.consumedByStep === 12));
  });
});

describe("feedback overlay formatting", () => {
  it("returns empty string when no consumed feedback", () => {
    const feedback: UserFeedback[] = [
      {
        id: "fb-1",
        timestamp: "2026-04-05T00:00:00Z",
        message: "Not consumed yet",
        consumed: false
      }
    ];

    const overlay = formatFeedbackOverlay(feedback, 10);
    assert.equal(overlay, "");
  });

  it("returns empty string when no feedback at all", () => {
    const overlay = formatFeedbackOverlay([], 10);
    assert.equal(overlay, "");
  });

  it("formats consumed feedback as overlay text", () => {
    const feedback: UserFeedback[] = [
      {
        id: "fb-1",
        timestamp: "2026-04-05T00:00:00Z",
        message: "Increase learning rate to 0.01",
        action: "hint",
        stepNumber: 9,
        consumed: true,
        consumedAt: "2026-04-05T00:30:00Z",
        consumedByStep: 8
      }
    ];

    const overlay = formatFeedbackOverlay(feedback, 10);

    assert.ok(overlay.includes("User feedback received during this run"));
    assert.ok(overlay.includes("Increase learning rate to 0.01"));
    assert.ok(overlay.includes("hint"));
    assert.ok(overlay.includes("requested for step 9"));
  });

  it("only includes feedback consumed for steps <= current step", () => {
    const feedback: UserFeedback[] = [
      {
        id: "fb-1",
        timestamp: "2026-04-05T00:00:00Z",
        message: "Early feedback",
        consumed: true,
        consumedByStep: 5
      },
      {
        id: "fb-2",
        timestamp: "2026-04-05T00:05:00Z",
        message: "Late feedback",
        consumed: true,
        consumedByStep: 15
      }
    ];

    // At step 10, only fb-1 should be visible
    const overlay = formatFeedbackOverlay(feedback, 10);

    assert.ok(overlay.includes("Early feedback"));
    assert.ok(!overlay.includes("Late feedback"));

    // At step 20, both should be visible
    const overlay2 = formatFeedbackOverlay(feedback, 20);
    assert.ok(overlay2.includes("Early feedback"));
    assert.ok(overlay2.includes("Late feedback"));
  });

  it("sorts feedback by timestamp", () => {
    const feedback: UserFeedback[] = [
      {
        id: "fb-2",
        timestamp: "2026-04-05T00:05:00Z",
        message: "Second",
        consumed: true,
        consumedByStep: 5
      },
      {
        id: "fb-1",
        timestamp: "2026-04-05T00:00:00Z",
        message: "First",
        consumed: true,
        consumedByStep: 5
      }
    ];

    const overlay = formatFeedbackOverlay(feedback, 10);
    const firstIdx = overlay.indexOf("First");
    const secondIdx = overlay.indexOf("Second");

    assert.ok(firstIdx < secondIdx, "First should appear before Second");
  });

  it("handles feedback without action or stepNumber", () => {
    const feedback: UserFeedback[] = [
      {
        id: "fb-1",
        timestamp: "2026-04-05T00:00:00Z",
        message: "General note",
        consumed: true,
        consumedAt: "2026-04-05T00:30:00Z",
        consumedByStep: 5
      }
    ];

    const overlay = formatFeedbackOverlay(feedback, 10);
    assert.ok(overlay.includes("General note"));
  });
});
