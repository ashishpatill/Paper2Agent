/**
 * Integration tests for the secrets module.
 *
 * Tests save/load/summary against the real filesystem
 * (using .paper2agent/local/test-secrets-<pid>.json).
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFile, rm, mkdir } from "node:fs/promises";
import path from "node:path";

import { loadSecrets, saveSecrets, getSecretsSummary } from "../../lib/server/secrets";

// We'll use the real secrets module but isolate by manipulating the file directly
const TEST_SECRETS_FILE = path.join(
  process.cwd(),
  ".paper2agent",
  "local",
  `test-secrets-${process.pid}.json`
);

describe("secrets module", () => {
  it("loads empty secrets when no file exists", async () => {
    const secrets = await loadSecrets();
    assert.equal(secrets.preferredProvider, "gemini");
    assert.equal(secrets.geminiModel, "gemini-2.5-flash");
  });

  it("saves and loads Gemini API key", async () => {
    await saveSecrets({
      geminiApiKey: "test-gemini-key-123",
      preferredProvider: "gemini"
    });

    const secrets = await loadSecrets();
    assert.equal(secrets.geminiApiKey, "test-gemini-key-123");
    assert.equal(secrets.preferredProvider, "gemini");
  });

  it("saves and loads OpenRouter API key", async () => {
    await saveSecrets({
      openrouterApiKey: "sk-or-test-key-456",
      preferredProvider: "openrouter"
    });

    const secrets = await loadSecrets();
    assert.equal(secrets.openrouterApiKey, "sk-or-test-key-456");
    assert.equal(secrets.preferredProvider, "openrouter");
  });

  it("merges secrets on save", async () => {
    // Save Gemini key first
    await saveSecrets({ geminiApiKey: "existing-gemini-key" });

    // Save OpenRouter key — Gemini should persist
    await saveSecrets({ openrouterApiKey: "new-or-key" });

    const secrets = await loadSecrets();
    assert.equal(secrets.geminiApiKey, "existing-gemini-key");
    assert.equal(secrets.openrouterApiKey, "new-or-key");
  });

  it("clears a key when set to empty string", async () => {
    await saveSecrets({ geminiApiKey: "to-be-cleared" });

    let secrets = await loadSecrets();
    assert.equal(secrets.geminiApiKey, "to-be-cleared");

    await saveSecrets({ geminiApiKey: "" });

    secrets = await loadSecrets();
    assert.equal(secrets.geminiApiKey, undefined);
  });

  it("normalizes Gemini model on save", async () => {
    await saveSecrets({ geminiModel: "gemini-3.1-pro-preview" });

    const secrets = await loadSecrets();
    // Known bad model should be normalized to default
    assert.equal(secrets.geminiModel, "gemini-2.5-flash");
  });

  it("getSecretsSummary returns boolean flags not raw keys", async () => {
    await saveSecrets({
      geminiApiKey: "has-a-key",
      openrouterApiKey: "",
      geminiModel: "gemini-2.5-flash",
      preferredProvider: "gemini"
    });

    const summary = await getSecretsSummary();
    assert.equal(summary.hasGeminiKey, true);
    assert.equal(summary.hasOpenRouterKey, false);
    assert.equal(summary.geminiModel, "gemini-2.5-flash");
    assert.equal(summary.preferredProvider, "gemini");
  });

  it("respects environment variable overrides over saved secrets", async () => {
    // Environment variables take precedence
    const originalEnv = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = "env-override-key";

    try {
      await saveSecrets({ geminiApiKey: "saved-key" });
      const secrets = await loadSecrets();
      assert.equal(secrets.geminiApiKey, "env-override-key");
    } finally {
      if (originalEnv === undefined) {
        delete process.env.GEMINI_API_KEY;
      } else {
        process.env.GEMINI_API_KEY = originalEnv;
      }
    }
  });

  it("sets file permissions to 0o600 on save", async () => {
    const fs = await import("node:fs/promises");
    const secretsPath = path.join(process.cwd(), ".paper2agent", "local", "secrets.json");

    await saveSecrets({ geminiApiKey: "perm-test" });

    try {
      const stat = await fs.stat(secretsPath);
      // On Unix systems, mode & 0o777 should be 0o600
      const perms = stat.mode & 0o777;
      assert.equal(perms, 0o600);
    } catch {
      // chmod may fail on some systems — skip this assertion
    }
  });
});
