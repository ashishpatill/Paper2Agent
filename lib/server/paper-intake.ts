import { readFile } from "node:fs/promises";

import * as cheerio from "cheerio";
import pdfParse from "pdf-parse";

const FETCH_TIMEOUT_MS = 25_000;
const MAX_PDF_BYTES = 30 * 1024 * 1024;

function compactText(input: string, limit = 24000) {
  return input.replace(/\s+/g, " ").trim().slice(0, limit);
}

function firstGitHubUrl(input: string) {
  const match = input.match(/https?:\/\/github\.com\/[^\s"'<>]+/i);
  return match?.[0];
}

export interface PaperSourcePayload {
  sourceKind: "url" | "pdf";
  canonicalUrl?: string;
  titleHint?: string;
  rawText: string;
  repositoryUrlHint?: string;
  discoveredLinks: string[];
}

export async function extractPaperFromPdf(filePath: string) {
  const buffer = await readFile(filePath);

  if (buffer.byteLength > MAX_PDF_BYTES) {
    throw new Error("The PDF exceeds the 30MB processing limit.");
  }

  const parsed = await pdfParse(buffer);
  const text = compactText(parsed.text);

  return {
    sourceKind: "pdf" as const,
    rawText: text,
    titleHint: text.split("\n").map((line) => line.trim()).find(Boolean),
    repositoryUrlHint: firstGitHubUrl(text),
    discoveredLinks: Array.from(text.matchAll(/https?:\/\/[^\s"'<>]+/gi)).map(
      (match) => match[0]
    )
  };
}

export async function extractPaperFromUrl(url: string): Promise<PaperSourcePayload> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  const response = await fetch(url, {
    signal: controller.signal,
    headers: {
      "User-Agent": "Paper2Agent Studio"
    }
  }).finally(() => clearTimeout(timeout));

  if (!response.ok) {
    throw new Error(`Could not fetch ${url} (${response.status}).`);
  }

  const contentLength = Number(response.headers.get("content-length") || "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_PDF_BYTES) {
    throw new Error("The remote PDF exceeds the 30MB processing limit.");
  }

  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/pdf") || url.toLowerCase().endsWith(".pdf")) {
    const buffer = Buffer.from(await response.arrayBuffer());

    if (buffer.byteLength > MAX_PDF_BYTES) {
      throw new Error("The remote PDF exceeds the 30MB processing limit.");
    }

    const parsed = await pdfParse(buffer);
    const text = compactText(parsed.text);

    return {
      sourceKind: "url",
      canonicalUrl: url,
      rawText: text,
      titleHint: text.split("\n").map((line) => line.trim()).find(Boolean),
      repositoryUrlHint: firstGitHubUrl(text),
      discoveredLinks: Array.from(text.matchAll(/https?:\/\/[^\s"'<>]+/gi)).map(
        (match) => match[0]
      )
    };
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  const title =
    $('meta[property="og:title"]').attr("content") ||
    $('meta[name="citation_title"]').attr("content") ||
    $("title").text().trim();

  const description =
    $('meta[name="description"]').attr("content") ||
    $('meta[property="og:description"]').attr("content") ||
    $('meta[name="citation_abstract"]').attr("content") ||
    "";

  const links = $("a[href]")
    .map((_, element) => $(element).attr("href"))
    .get()
    .filter((value): value is string => Boolean(value))
    .map((value) => (value.startsWith("http") ? value : new URL(value, url).toString()));

  const bodyText = compactText($("body").text());
  const repositoryUrlHint =
    firstGitHubUrl(links.join(" ")) || firstGitHubUrl(`${title} ${description} ${bodyText}`);

  return {
    sourceKind: "url",
    canonicalUrl: url,
    titleHint: title,
    rawText: compactText([title, description, bodyText].filter(Boolean).join("\n\n")),
    repositoryUrlHint,
    discoveredLinks: links.slice(0, 50)
  };
}
