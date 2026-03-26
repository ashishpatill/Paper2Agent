import test from "node:test";
import assert from "node:assert/strict";

import { chooseProvider, normalizeGeminiModel } from "../lib/server/llm";

test("normalizeGeminiModel falls back for known broken aliases", () => {
  assert.equal(normalizeGeminiModel("gemini-3.1-flash-preview"), "gemini-2.5-flash");
  assert.equal(normalizeGeminiModel("gemini-3-flash"), "gemini-2.5-flash");
  assert.equal(normalizeGeminiModel("gemini-3.0-flash"), "gemini-2.5-flash");
});

test("normalizeGeminiModel preserves supported-looking explicit values", () => {
  assert.equal(normalizeGeminiModel("gemini-2.5-pro"), "gemini-2.5-pro");
  assert.equal(normalizeGeminiModel(" custom-model "), "custom-model");
});

test("chooseProvider normalizes a saved Gemini model before use", () => {
  const chosen = chooseProvider({
    preferredProvider: "gemini",
    geminiApiKey: "test-key",
    geminiModel: "gemini-3.1-pro-preview"
  });

  assert.deepEqual(chosen, {
    provider: "gemini",
    model: "gemini-2.5-flash"
  });
});
