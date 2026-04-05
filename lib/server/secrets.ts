import { chmod } from "node:fs/promises";
import path from "node:path";

import { ensureAppDirectories, localRoot, readJsonFile, writeJsonFile } from "./fs";
import { normalizeGeminiModel } from "./llm";
import type { SecretsSummary, StoredSecrets } from "./types";
import { configure as configureLangfuse } from "./langfuse";

const secretsFile = path.join(localRoot, "secrets.json");

const DEFAULT_GEMINI_MODEL = normalizeGeminiModel(process.env.GEMINI_MODEL);
const DEFAULT_OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL || "openai/gpt-5.2-mini";

export async function loadSecrets(): Promise<StoredSecrets> {
  await ensureAppDirectories();
  const stored = await readJsonFile<StoredSecrets>(secretsFile, {});

  const secrets = {
    ...stored,
    geminiApiKey: process.env.GEMINI_API_KEY || stored.geminiApiKey,
    openrouterApiKey: process.env.OPENROUTER_API_KEY || stored.openrouterApiKey,
    geminiModel: normalizeGeminiModel(stored.geminiModel || DEFAULT_GEMINI_MODEL),
    openrouterModel: stored.openrouterModel || DEFAULT_OPENROUTER_MODEL,
    preferredProvider: stored.preferredProvider || "gemini",
    langfuseSecretKey: process.env.LANGFUSE_SECRET_KEY || stored.langfuseSecretKey,
    langfusePublicKey: process.env.LANGFUSE_PUBLIC_KEY || stored.langfusePublicKey,
    langfuseBaseUrl: stored.langfuseBaseUrl || process.env.LANGFUSE_BASE_URL || "https://cloud.langfuse.com",
    langfuseEnabled: stored.langfuseEnabled ?? process.env.LANGFUSE_ENABLED === "true"
  };

  // Configure Langfuse if enabled
  if (secrets.langfuseEnabled && secrets.langfuseSecretKey && secrets.langfusePublicKey) {
    configureLangfuse({
      secretKey: secrets.langfuseSecretKey,
      publicKey: secrets.langfusePublicKey,
      baseUrl: secrets.langfuseBaseUrl
    });
  }

  return secrets;
}

export async function saveSecrets(nextSecrets: Partial<StoredSecrets>) {
  const current = await loadSecrets();
  const merged: StoredSecrets = {
    ...current,
    ...nextSecrets
  };

  if (nextSecrets.geminiModel !== undefined) {
    merged.geminiModel = normalizeGeminiModel(nextSecrets.geminiModel);
  }

  if (nextSecrets.geminiApiKey === "") {
    delete merged.geminiApiKey;
  }

  if (nextSecrets.openrouterApiKey === "") {
    delete merged.openrouterApiKey;
  }

  await writeJsonFile(secretsFile, merged);
  await chmod(secretsFile, 0o600).catch(() => undefined);
}

export async function getSecretsSummary(): Promise<SecretsSummary> {
  const secrets = await loadSecrets();

  return {
    hasGeminiKey: Boolean(secrets.geminiApiKey),
    hasOpenRouterKey: Boolean(secrets.openrouterApiKey),
    geminiModel: secrets.geminiModel || DEFAULT_GEMINI_MODEL,
    openrouterModel: secrets.openrouterModel || DEFAULT_OPENROUTER_MODEL,
    preferredProvider: secrets.preferredProvider || "gemini",
    hasLangfuseKey: Boolean(secrets.langfuseSecretKey && secrets.langfusePublicKey),
    langfuseEnabled: secrets.langfuseEnabled ?? false,
    langfuseBaseUrl: secrets.langfuseBaseUrl
  };
}
