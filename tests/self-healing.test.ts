/**
 * Unit tests for the self-healing module.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  classifyFailure,
  generateSolutions,
  getHealingStats,
  loadHealingStore,
  recordHealingOutcome
} from "../lib/server/self-healing";
import type { HealingSolution } from "../lib/server/self-healing";

describe("failure classifier", () => {
  it("classifies missing dependency errors", () => {
    const diagnosis = classifyFailure({
      stepNumber: 3,
      stepName: "Extract tools",
      exitCode: 1,
      errorOutput: "Traceback (most recent call last):\n  File 'step3.py', line 1\n    import torch\nModuleNotFoundError: No module named 'torch'"
    });

    assert.equal(diagnosis.category, "missing_dependency");
    assert.ok(diagnosis.confidence > 0.9);
    assert.ok(diagnosis.evidence.some((e) => e.includes("torch")));
  });

  it("classifies NaN/divergence errors", () => {
    const diagnosis = classifyFailure({
      stepNumber: 10,
      stepName: "Experiment runner",
      exitCode: 1,
      errorOutput: "RuntimeError: Loss became NaN after epoch 5"
    });

    assert.equal(diagnosis.category, "runtime_error");
    assert.ok(diagnosis.confidence > 0.8);
    assert.ok(diagnosis.description.toLowerCase().includes("nan"));
  });

  it("classifies resource errors (OOM)", () => {
    const diagnosis = classifyFailure({
      stepNumber: 10,
      stepName: "Experiment runner",
      exitCode: 137,
      errorOutput: "CUDA out of memory. Tried to allocate 2.00 GiB"
    });

    assert.equal(diagnosis.category, "resource_error");
    assert.ok(diagnosis.confidence > 0.9);
  });

  it("classifies resource errors (disk full)", () => {
    const diagnosis = classifyFailure({
      stepNumber: 2,
      stepName: "Execute tutorials",
      exitCode: 1,
      errorOutput: "OSError: [Errno 28] No space left on device"
    });

    assert.equal(diagnosis.category, "resource_error");
  });

  it("classifies network errors", () => {
    const diagnosis = classifyFailure({
      stepNumber: 9,
      stepName: "Paper coder",
      exitCode: 1,
      errorOutput: "requests.exceptions.ConnectionError: HTTPSConnectionPool: Max retries exceeded"
    });

    assert.equal(diagnosis.category, "network_error");
    assert.ok(diagnosis.confidence > 0.8);
  });

  it("classifies clarification errors", () => {
    const diagnosis = classifyFailure({
      stepNumber: 3,
      stepName: "Extract tools",
      exitCode: 1,
      errorOutput: "Would you like me to extract tools in a different format?",
      stepOutputFile: "/tmp/step3_output.json"
    });

    assert.equal(diagnosis.category, "clarification_error");
  });

  it("classifies template contamination", () => {
    const diagnosis = classifyFailure({
      stepNumber: 3,
      stepName: "Extract tools",
      exitCode: 1,
      errorOutput: "ERROR - step 3 generated template/example content: alphagenome/templates/"
    });

    assert.equal(diagnosis.category, "template_contamination");
  });

  it("classifies generic non-zero exit as runtime error", () => {
    const diagnosis = classifyFailure({
      stepNumber: 5,
      stepName: "Coverage",
      exitCode: 1,
      errorOutput: "Something went wrong"
    });

    assert.equal(diagnosis.category, "runtime_error");
    assert.ok(diagnosis.confidence < 0.7);
  });
});

describe("solution generator", () => {
  it("generates install solutions for missing dependencies", () => {
    const diagnosis = classifyFailure({
      stepNumber: 3,
      stepName: "Extract tools",
      exitCode: 1,
      errorOutput: "ModuleNotFoundError: No module named 'torch'"
    });

    const solutions = generateSolutions(diagnosis);
    assert.ok(solutions.length >= 2);
    assert.ok(solutions.some((s) => s.strategy.toLowerCase().includes("torch")));
    assert.ok(solutions.some((s) => s.actions.some((a) => a.includes("pip install"))));
  });

  it("generates NaN fix solutions for runtime errors", () => {
    const diagnosis = classifyFailure({
      stepNumber: 10,
      stepName: "Experiment runner",
      exitCode: 1,
      errorOutput: "Loss became NaN"
    });

    const solutions = generateSolutions(diagnosis);
    assert.ok(solutions.some((s) => s.strategy.toLowerCase().includes("stability") || s.strategy.toLowerCase().includes("nan")));
  });

  it("generates disk cleanup solutions for resource errors", () => {
    const diagnosis = classifyFailure({
      stepNumber: 2,
      stepName: "Execute tutorials",
      exitCode: 1,
      errorOutput: "No space left on device"
    });

    const solutions = generateSolutions(diagnosis);
    assert.ok(solutions.some((s) => s.strategy.toLowerCase().includes("disk") || s.actions.some((a) => a.includes("find") || a.includes("rm"))));
  });

  it("generates retry and scope reduction for runtime failures", () => {
    const diagnosis = classifyFailure({
      stepNumber: 5,
      stepName: "Coverage",
      exitCode: 1,
      errorOutput: "Unknown error occurred"
    });

    const solutions = generateSolutions(diagnosis);
    assert.ok(solutions.length >= 2);
    // At least one solution should involve re-running or reducing scope
    assert.ok(
      solutions.some((s) =>
        s.strategy.toLowerCase().includes("re-run") ||
        s.strategy.toLowerCase().includes("scope") ||
        s.strategy.toLowerCase().includes("minimal") ||
        s.actions.some((a) => a.toLowerCase().includes("marker"))
      )
    );
  });

  it("solutions have required fields", () => {
    const diagnosis = classifyFailure({
      stepNumber: 3,
      stepName: "Extract tools",
      exitCode: 1,
      errorOutput: "ModuleNotFoundError: No module named 'pandas'"
    });

    const solutions = generateSolutions(diagnosis);
    for (const solution of solutions) {
      assert.ok(solution.id);
      assert.ok(solution.strategy.length > 0);
      assert.ok(solution.actions.length > 0);
      assert.ok(solution.expectedOutcome.length > 0);
      assert.ok(solution.source === "generated");
    }
  });
});

describe("healing store", () => {
  it("loads store successfully (may have data from other tests)", async () => {
    const store = await loadHealingStore();
    assert.ok(store instanceof Map);
    // Store may have data from previous tests — just verify it loads
    assert.ok(store.size >= 0);
  });

  it("records and retrieves healing outcomes", async () => {
    const solution: HealingSolution = {
      id: "test-sol",
      strategy: "Install missing package: pandas",
      actions: ["pip install pandas"],
      expectedOutcome: "pandas will be available",
      source: "generated"
    };

    await recordHealingOutcome("test-problem", "missing_dependency", solution, true);

    // Verify by loading store
    const store = await loadHealingStore();
    assert.ok(store.size > 0);
  });

  it("getHealingStats returns valid stats", async () => {
    const stats = await getHealingStats();

    assert.ok(typeof stats.totalAttempts === "number");
    assert.ok(typeof stats.successfulRecoveries === "number");
    assert.ok(typeof stats.overallSuccessRate === "number");
    assert.ok(Array.isArray(stats.mostCommonFailures));
    assert.ok(Array.isArray(stats.topSolutions));
  });
});
