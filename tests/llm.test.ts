import test from "node:test";
import assert from "node:assert/strict";

import { chooseProvider, getProviderOrder, normalizeGeminiModel } from "../lib/server/llm";

test("normalizeGeminiModel falls back for known broken aliases", () => {
  assert.equal(normalizeGeminiModel("gemini-3.1-flash-preview"), "gemini-2.5-flash");
  assert.equal(normalizeGeminiModel("gemini-3-flash"), "gemini-2.5-flash");
  assert.equal(normalizeGeminiModel("gemini-3.0-flash"), "gemini-2.5-flash");
});

test("normalizeGeminiModel preserves supported-looking explicit values", () => {
  assert.equal(normalizeGeminiModel("gemini-2.5-pro"), "gemini-2.5-pro");
  assert.equal(normalizeGeminiModel(" custom-model "), "custom-model");
});

test("normalizeGeminiModel returns default for empty input", () => {
  assert.equal(normalizeGeminiModel(""), "gemini-2.5-flash");
  assert.equal(normalizeGeminiModel(undefined), "gemini-2.5-flash");
  assert.equal(normalizeGeminiModel("   "), "gemini-2.5-flash");
});

test("chooseProvider prefers Gemini when configured as preferred", () => {
  const chosen = chooseProvider({
    preferredProvider: "gemini",
    geminiApiKey: "test-key",
    geminiModel: "gemini-2.5-flash"
  });

  assert.deepEqual(chosen, {
    provider: "gemini",
    model: "gemini-2.5-flash"
  });
});

test("chooseProvider falls back to OpenRouter when Gemini key missing", () => {
  const chosen = chooseProvider({
    preferredProvider: "gemini",
    openrouterApiKey: "or-key",
    openrouterModel: "anthropic/claude-sonnet-4-20250514"
  });

  assert.deepEqual(chosen, {
    provider: "openrouter",
    model: "anthropic/claude-sonnet-4-20250514"
  });
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

test("chooseProvider returns OpenRouter when preferred", () => {
  const chosen = chooseProvider({
    preferredProvider: "openrouter",
    openrouterApiKey: "or-key",
    openrouterModel: "openai/gpt-4o"
  });

  assert.deepEqual(chosen, {
    provider: "openrouter",
    model: "openai/gpt-4o"
  });
});

test("chooseProvider returns null when no keys available", () => {
  const chosen = chooseProvider({
    preferredProvider: "gemini"
  });

  assert.equal(chosen, null);
});

// getProviderOrder tests (failover chain)
test("getProviderOrder returns both providers when both keys available", () => {
  const providers = getProviderOrder({
    preferredProvider: "gemini",
    geminiApiKey: "gemini-key",
    geminiModel: "gemini-2.5-flash",
    openrouterApiKey: "or-key",
    openrouterModel: "openai/gpt-4o"
  });

  assert.equal(providers.length, 2);
  assert.equal(providers[0].provider, "gemini");
  assert.equal(providers[1].provider, "openrouter");
});

test("getProviderOrder returns OpenRouter first when preferred", () => {
  const providers = getProviderOrder({
    preferredProvider: "openrouter",
    geminiApiKey: "gemini-key",
    openrouterApiKey: "or-key"
  });

  assert.equal(providers.length, 2);
  assert.equal(providers[0].provider, "openrouter");
  assert.equal(providers[1].provider, "gemini");
});

test("getProviderOrder returns only available providers", () => {
  const providers = getProviderOrder({
    preferredProvider: "gemini",
    openrouterApiKey: "or-key"
  });

  assert.equal(providers.length, 1);
  assert.equal(providers[0].provider, "openrouter");
});

test("getProviderOrder deduplicates when same provider is preferred and only option", () => {
  const providers = getProviderOrder({
    preferredProvider: "gemini",
    geminiApiKey: "gemini-key"
  });

  assert.equal(providers.length, 1);
  assert.equal(providers[0].provider, "gemini");
  assert.equal(providers[0].apiKey, "gemini-key");
});

test("getProviderOrder returns empty array when no keys available", () => {
  const providers = getProviderOrder({
    preferredProvider: "gemini"
  });

  assert.equal(providers.length, 0);
});

