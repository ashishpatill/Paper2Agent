import { chmod } from "node:fs/promises";
import path from "node:path";

import { ensureAppDirectories, localRoot, readJsonFile, writeJsonFile } from "./fs";
import type { SecretsSummary, StoredSecrets } from "./types";

const secretsFile = path.join(localRoot, "secrets.json");

const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const DEFAULT_OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL || "openai/gpt-5.2-mini";

export async function loadSecrets(): Promise<StoredSecrets> {
  await ensureAppDirectories();
  const stored = await readJsonFile<StoredSecrets>(secretsFile, {});

  return {
    ...stored,
    geminiApiKey: process.env.GEMINI_API_KEY || stored.geminiApiKey,
    openrouterApiKey: process.env.OPENROUTER_API_KEY || stored.openrouterApiKey,
    geminiModel: stored.geminiModel || DEFAULT_GEMINI_MODEL,
    openrouterModel: stored.openrouterModel || DEFAULT_OPENROUTER_MODEL,
    preferredProvider: stored.preferredProvider || "gemini"
  };
}

export async function saveSecrets(nextSecrets: Partial<StoredSecrets>) {
  const current = await loadSecrets();
  const merged: StoredSecrets = {
    ...current,
    ...nextSecrets
  };

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
    preferredProvider: secrets.preferredProvider || "gemini"
  };
}
