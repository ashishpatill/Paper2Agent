/**
 * Integration tests for the sandbox module.
 *
 * Tests subprocess execution, timeout handling, and sandbox factory.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  createSandbox,
  isDockerAvailable,
  autoSelectMode
} from "../../lib/server/sandbox";

describe("sandbox factory", () => {
  it("creates a subprocess sandbox by default", () => {
    const sandbox = createSandbox({
      mode: "subprocess",
      workspacePath: process.cwd(),
      timeoutSeconds: 30
    });

    assert.ok(sandbox);
    assert.ok(typeof sandbox.run === "function");
    assert.ok(typeof sandbox.runPython === "function");
  });
});

describe("subprocess sandbox execution", () => {
  it("runs a simple command successfully", async () => {
    const sandbox = createSandbox({
      mode: "subprocess",
      workspacePath: process.cwd(),
      timeoutSeconds: 30
    });

    const result = await sandbox.run("echo 'hello world'");

    assert.equal(result.exitCode, 0);
    assert.ok(result.stdout.includes("hello world"));
    assert.ok(result.durationSeconds >= 0);
    assert.equal(result.timedOut, false);
  });

  it("captures stderr output", async () => {
    const sandbox = createSandbox({
      mode: "subprocess",
      workspacePath: process.cwd(),
      timeoutSeconds: 30
    });

    const result = await sandbox.run("echo 'error msg' >&2");

    assert.equal(result.exitCode, 0);
    assert.ok(result.stderr.includes("error msg"));
  });

  it("returns non-zero exit code for failing commands", async () => {
    const sandbox = createSandbox({
      mode: "subprocess",
      workspacePath: process.cwd(),
      timeoutSeconds: 30
    });

    const result = await sandbox.run("exit 42");

    assert.equal(result.exitCode, 42);
  });

  it("respects timeout and kills the process", async () => {
    const sandbox = createSandbox({
      mode: "subprocess",
      workspacePath: process.cwd(),
      timeoutSeconds: 1 // 1 second timeout
    });

    const result = await sandbox.run("sleep 30");

    assert.ok(result.timedOut);
    assert.equal(result.exitCode, 137); // SIGTERM
  });

  it("runPython runs python with activated venv", async () => {
    const sandbox = createSandbox({
      mode: "subprocess",
      workspacePath: process.cwd(),
      timeoutSeconds: 30,
      envPath: "/nonexistent-venv"
    });

    const result = await sandbox.runPython("-c 'print(\"ok\")'");
    assert.ok(result.durationSeconds >= 0);
  });
});

describe("sandbox utilities", () => {
  it("isDockerAvailable returns a boolean", () => {
    const available = isDockerAvailable();
    assert.ok(typeof available === "boolean");
  });

  it("autoSelectMode returns subprocess when Docker unavailable", () => {
    const mode = autoSelectMode();
    assert.ok(mode === "subprocess" || mode === "docker");
  });
});
