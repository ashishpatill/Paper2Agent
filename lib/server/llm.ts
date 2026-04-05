import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";

import type { PaperAnalysis, Provider, StoredSecrets } from "./types";

const SYSTEM_PROMPT = `You are Paper2Agent's intake analyst.
Return JSON only.
Infer the best GitHub repository URL if the paper references one.
Keep summaries concrete and implementation-oriented.
Use lowercase-hyphen project slugs.`;
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const KNOWN_BAD_GEMINI_MODELS = new Set([
  "gemini-3-flash",
  "gemini-3.0-flash",
  "gemini-3.1-flash-preview",
  "gemini-3.1-pro-preview"
]);

function extractJson(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```json\s*([\s\S]*?)```/i);
  if (fenced) {
    return fenced[1];
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");

  if (start === -1 || end === -1) {
    return trimmed;
  }

  return trimmed.slice(start, end + 1);
}

function readOpenRouterMessageContent(
  content: string | Array<{ type?: string; text?: string }> | null | undefined
) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => (typeof item?.text === "string" ? item.text : ""))
      .join("\n");
  }

  return "";
}

export function chooseProvider(secrets: StoredSecrets) {
  // If Claude is preferred for pipeline, still need an API for paper analysis
  // Fall through to available API keys
  if (secrets.preferredProvider === "gemini" && secrets.geminiApiKey) {
    return {
      provider: "gemini" as const,
      model: normalizeGeminiModel(secrets.geminiModel)
    };
  }

  if (secrets.openrouterApiKey) {
    return {
      provider: "openrouter" as const,
      model: secrets.openrouterModel || "openai/gpt-5.2-mini"
    };
  }

  if (secrets.geminiApiKey) {
    return {
      provider: "gemini" as const,
      model: normalizeGeminiModel(secrets.geminiModel)
    };
  }

  return null;
}

/**
 * Returns all available providers in priority order (preferred first, then fallback).
 * Enables automatic failover when the primary provider is unavailable or fails.
 */
export function getProviderOrder(secrets: StoredSecrets): Array<{ provider: Provider; model: string; apiKey: string }> {
  const providers: Array<{ provider: Provider; model: string; apiKey: string }> = [];
  const seen = new Set<Provider>();

  function addProvider(provider: Provider, apiKey: string | undefined, model: string | undefined) {
    if (apiKey && !seen.has(provider)) {
      seen.add(provider);
      providers.push({
        provider,
        model: provider === "gemini" ? normalizeGeminiModel(model) : (model || "openai/gpt-5.2-mini"),
        apiKey
      });
    }
  }

  // Add preferred provider first
  if (secrets.preferredProvider === "gemini") {
    addProvider("gemini", secrets.geminiApiKey, secrets.geminiModel);
  } else if (secrets.preferredProvider === "openrouter") {
    addProvider("openrouter", secrets.openrouterApiKey, secrets.openrouterModel);
  }

  // Add fallback provider
  if (secrets.preferredProvider !== "gemini") {
    addProvider("gemini", secrets.geminiApiKey, secrets.geminiModel);
  }
  if (secrets.preferredProvider !== "openrouter") {
    addProvider("openrouter", secrets.openrouterApiKey, secrets.openrouterModel);
  }

  return providers;
}

/**
 * Analyze a paper with automatic provider failover.
 * Tries the primary provider first; if it fails, falls back to the next available provider.
 */
export async function analyzePaperWithFailover(options: {
  secrets: StoredSecrets;
  sourceText: string;
  titleHint?: string;
  repositoryUrlHint?: string;
  sourceUrl?: string;
  notes?: string;
}): Promise<{ analysis: PaperAnalysis; provider: Provider; model: string; failoverUsed: boolean }> {
  const providers = getProviderOrder(options.secrets);

  if (providers.length === 0) {
    throw new Error("No AI provider configured. Set GEMINI_API_KEY or OPENROUTER_API_KEY in settings.");
  }

  const errors: Array<{ provider: Provider; error: string }> = [];

  for (let i = 0; i < providers.length; i++) {
    const p = providers[i];
    try {
      const analysis = await analyzePaper({
        provider: p.provider,
        model: p.model,
        apiKey: p.apiKey,
        sourceText: options.sourceText,
        titleHint: options.titleHint,
        repositoryUrlHint: options.repositoryUrlHint,
        sourceUrl: options.sourceUrl,
        notes: options.notes
      });

      return {
        analysis,
        provider: p.provider,
        model: p.model,
        failoverUsed: i > 0
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push({ provider: p.provider, error: message });

      // Don't retry the same provider — move to next in the failover chain
      console.warn(`[ProviderFailover] ${p.provider} failed: ${message}. Trying next provider...`);
    }
  }

  // All providers failed
  const errorDetails = errors.map((e) => `${e.provider}: ${e.error}`).join("\n");
  throw new Error(`All AI providers failed for paper analysis:\n${errorDetails}`);
}

export async function analyzePaper(options: {
  provider: Provider;
  model: string;
  apiKey: string;
  sourceText: string;
  titleHint?: string;
  repositoryUrlHint?: string;
  sourceUrl?: string;
  notes?: string;
}): Promise<PaperAnalysis> {
  const prompt = [
    "Analyze this research paper input and map it to a Paper2Agent workflow.",
    "Respond with a JSON object containing these keys only:",
    "title, abstract, summary, projectSlug, repositoryUrl, confidence, capabilities, reported_results, datasets_required, suggestedQuestions, setupNotes",
    "",
    "reported_results: Array of {experiment, metric, value, direction?, condition?} — extract every quantitative result reported in the paper (tables, figures, inline numbers). direction is 'higher_is_better' or 'lower_is_better'.",
    "datasets_required: Array of {name, source?, size_estimate?, publicly_available} — list all datasets the paper uses or requires.",
    "",
    `Title hint: ${options.titleHint || "unknown"}`,
    `Repository hint: ${options.repositoryUrlHint || "none"}`,
    `Source URL: ${options.sourceUrl || "none"}`,
    `Operator notes: ${options.notes || "none"}`,
    "",
    options.sourceText
  ].join("\n");

  let rawText = "";

  if (options.provider === "gemini") {
    const client = new GoogleGenAI({ apiKey: options.apiKey });
    const response = await generateGeminiContent(client, options.model, `${SYSTEM_PROMPT}\n\n${prompt}`);
    rawText = response.text || "";
  } else {
    const client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: "https://openrouter.ai/api/v1"
    });
    const response = await client.chat.completions.create({
      model: options.model,
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT
        },
        {
          role: "user",
          content: prompt
        }
      ]
    });
    rawText = readOpenRouterMessageContent(response.choices[0]?.message?.content);
  }

  const parsed = JSON.parse(extractJson(rawText)) as PaperAnalysis;

  return {
    ...parsed,
    repositoryUrl: parsed.repositoryUrl || options.repositoryUrlHint,
    capabilities: parsed.capabilities || [],
    reported_results: parsed.reported_results || [],
    datasets_required: parsed.datasets_required || [],
    suggestedQuestions: parsed.suggestedQuestions || [],
    setupNotes: parsed.setupNotes || []
  };
}

export function normalizeGeminiModel(model?: string) {
  const trimmed = model?.trim();
  if (!trimmed) {
    return DEFAULT_GEMINI_MODEL;
  }

  if (KNOWN_BAD_GEMINI_MODELS.has(trimmed)) {
    return DEFAULT_GEMINI_MODEL;
  }

  return trimmed;
}

async function generateGeminiContent(client: GoogleGenAI, model: string, contents: string) {
  const normalizedModel = normalizeGeminiModel(model);

  try {
    return await client.models.generateContent({
      model: normalizedModel,
      contents
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const missingModel = /not found|not supported for generatecontent/i.test(message);
    if (!missingModel || normalizedModel === DEFAULT_GEMINI_MODEL) {
      throw error;
    }

    return client.models.generateContent({
      model: DEFAULT_GEMINI_MODEL,
      contents
    });
  }
}
