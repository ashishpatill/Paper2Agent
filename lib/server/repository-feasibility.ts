import * as cheerio from "cheerio";

import type { ImplementabilityAssessment, PaperAnalysis } from "./types";

const FETCH_TIMEOUT_MS = 15_000;
const MAX_CONTEXT_CHARS = 60_000;

function compactText(input: string) {
  return input.replace(/\s+/g, " ").trim().slice(0, MAX_CONTEXT_CHARS);
}

function extractGitHubRepoParts(repositoryUrl: string) {
  const match = repositoryUrl.match(/github\.com\/([^/]+)\/([^/#?]+)/i);
  if (!match) {
    return null;
  }

  return {
    owner: match[1],
    repo: match[2].replace(/\.git$/i, "")
  };
}

async function fetchText(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Paper2Agent Studio"
      },
      cache: "no-store"
    });

    if (!response.ok) {
      return "";
    }

    return await response.text();
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchRepositoryContext(repositoryUrl: string) {
  const parts = extractGitHubRepoParts(repositoryUrl);
  const html = await fetchText(repositoryUrl);
  const pageText = html ? compactText(cheerio.load(html)("body").text()) : "";

  if (!parts) {
    return pageText;
  }

  const readmeCandidates = [
    `https://raw.githubusercontent.com/${parts.owner}/${parts.repo}/refs/heads/main/README.md`,
    `https://raw.githubusercontent.com/${parts.owner}/${parts.repo}/refs/heads/master/README.md`
  ];

  for (const candidate of readmeCandidates) {
    const readmeText = compactText(await fetchText(candidate));
    if (readmeText) {
      return compactText(`${pageText}\n\n${readmeText}`);
    }
  }

  return pageText;
}

function collectEvidence(haystack: string, patterns: RegExp[]) {
  const matches = patterns
    .flatMap((pattern) => Array.from(haystack.matchAll(pattern)).map((match) => match[0]))
    .filter(Boolean);

  return Array.from(new Set(matches)).slice(0, 6);
}

export async function assessRepositoryImplementability(options: {
  repositoryUrl: string;
  analysis: PaperAnalysis;
  notes?: string;
}) {
  const repoContext = await fetchRepositoryContext(options.repositoryUrl);
  const combinedContext = compactText(
    [
      options.analysis.title,
      options.analysis.abstract,
      options.analysis.summary,
      options.analysis.setupNotes.join(" "),
      options.notes || "",
      repoContext
    ]
      .filter(Boolean)
      .join("\n\n")
      .toLowerCase()
  );

  const blockedPatterns = [
    /\b(?:8|16|32|64)\s*[x×]\s*(?:h100|a100|b200|mi300|tpu ?v?4|tpu ?v?5)\b/gi,
    /\b(?:\d{3,4}\s*gb|\d+(?:\.\d+)?\s*tb)\s+(?:gpu|vram|memory|ram)\b/gi,
    /\b(?:tpu pod|multi-node cluster|supercomputer|infiniband|kubernetes cluster|slurm cluster)\b/gi,
    /\b(?:closed-source|proprietary|not open[- ]sourced|weights (?:are )?not available|private preview|waitlist|hosted-only|api-only)\b/gi
  ];
  const riskyPatterns = [
    /\b(?:4\s*[x×]\s*(?:h100|a100|b200|mi300)|80gb h100|80gb a100)\b/gi,
    /\b(?:pipeline parallel|tensor parallel|model parallel|fsdp|deepspeed|megatron|ray cluster|distributed training|multi-gpu)\b/gi,
    /\b(?:requires? .* cluster|full reproduction requires|training cluster|production inference service)\b/gi
  ];

  const blockedEvidence = collectEvidence(combinedContext, blockedPatterns);
  const riskyEvidence = collectEvidence(combinedContext, riskyPatterns);

  if (blockedEvidence.length > 0) {
    const reasons = [
      "The repo or paper explicitly points to hardware or infrastructure far beyond a normal local workstation.",
      "This job is likely to fail locally even if the code is cloned successfully."
    ];

    return {
      verdict: "blocked",
      summary:
        "This repository appears to require specialized hardware, cluster infrastructure, or unavailable hosted components, so Paper2Agent should stop before local execution.",
      reasons,
      evidence: blockedEvidence,
      checkedAt: new Date().toISOString()
    } satisfies ImplementabilityAssessment;
  }

  if (riskyEvidence.length > 0) {
    return {
      verdict: "risky",
      summary:
        "This repository may need distributed or high-memory infrastructure. Paper2Agent can still try, but local implementation may be partial or fail.",
      reasons: [
        "The repo mentions distributed training or large accelerator requirements.",
        "You may get code scaffolding and reports, but not full local reproduction."
      ],
      evidence: riskyEvidence,
      checkedAt: new Date().toISOString()
    } satisfies ImplementabilityAssessment;
  }

  return {
    verdict: "implementable",
    summary:
      "No strong early signal suggests the repository is impossible to attempt on a local workstation.",
    reasons: [
      "The repo did not advertise clearly out-of-scope hardware or hosted-only requirements in the sampled paper and repository context."
    ],
    evidence: [],
    checkedAt: new Date().toISOString()
  } satisfies ImplementabilityAssessment;
}
