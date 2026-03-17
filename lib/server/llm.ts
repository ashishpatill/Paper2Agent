import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";

import type { PaperAnalysis, Provider, StoredSecrets } from "./types";

const SYSTEM_PROMPT = `You are Paper2Agent's intake analyst.
Return JSON only.
Infer the best GitHub repository URL if the paper references one.
Keep summaries concrete and implementation-oriented.
Use lowercase-hyphen project slugs.`;

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
  if (secrets.preferredProvider === "gemini" && secrets.geminiApiKey) {
    return {
      provider: "gemini" as const,
      model: secrets.geminiModel || "gemini-2.5-flash"
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
      model: secrets.geminiModel || "gemini-2.5-flash"
    };
  }

  return null;
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
    "title, abstract, summary, projectSlug, repositoryUrl, confidence, capabilities, suggestedQuestions, setupNotes",
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
    const response = await client.models.generateContent({
      model: options.model,
      contents: `${SYSTEM_PROMPT}\n\n${prompt}`
    });
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
    suggestedQuestions: parsed.suggestedQuestions || [],
    setupNotes: parsed.setupNotes || []
  };
}
