#!/usr/bin/env tsx
/**
 * research-agent.ts — Dynamic Tool Discovery (M2.7-Inspired)
 *
 * When the recovery agent encounters an unknown error, this agent:
 * 1. Extracts key terms from the error
 * 2. Searches for solutions via web search + GitHub + docs
 * 3. Synthesizes a context-specific fix
 * 4. Records the finding to the evolution store
 *
 * Usage: npx tsx scripts/research-agent.ts <errorText> <mainDir> <stepName>
 */

import { spawn } from "node:child_process";
import { appendFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { EvolutionStore, PipelineStage } from "../lib/server/evolution-store";

async function main() {
  const [, , errorText, mainDir, stepName] = process.argv;

  if (!errorText || !mainDir || !stepName) {
    process.stderr.write("Usage: research-agent.ts <errorText> <mainDir> <stepName>\n");
    process.exit(1);
  }

  const store = new EvolutionStore(mainDir);
  const errorSnippet = errorText.slice(0, 4000);

  process.stdout.write(`status: [Research Agent] Starting research for error...\n`);

  // Extract search terms from error
  const searchTerms = extractSearchTerms(errorSnippet);
  process.stdout.write(`status: [Research Agent] Search terms: ${searchTerms.join(", ")}\n`);

  // Build research prompt
  const researchPrompt = `You are a research engineer investigating an error in a paper replication pipeline.

## Error
\`\`\`
${errorSnippet}
\`\`\`

## Context
- Step: ${stepName}
- The pipeline attempts to replicate a research paper's experiments
- Working directory: ${mainDir}
- Key terms to search for: ${searchTerms.join(", ")}

## Your Task
Research this error and provide a fix. You have these tools:
- **bash**: Run commands, check documentation, search files
- **read_file**: Read source files, error logs, documentation
- **write_file**: Create fix scripts or notes
- **list_dir**: Explore project structure
- **glob_files**: Find relevant files by pattern

**Research Process:**
1. Search the project directory for related code/files
2. Check if there are requirements.txt, setup.py, or pyproject.toml with dependency info
3. Look for similar patterns in the repo's source files
4. Formulate a fix based on what you find

**Output a JSON object with this structure:**
\`\`\`json
{
  "findings": "What you discovered during research",
  "root_cause": "The most likely cause of the error",
  "fix_script": "bash commands to resolve it",
  "confidence": 0.8,
  "sources": ["list of files or resources consulted"]
}
\`\`\`

Do NOT ask for clarification. Research autonomously using the tools available.`;

  // Call agent with research prompt
  const result = await callAgent(researchPrompt, mainDir);

  if (!result) {
    process.stdout.write(`status: [Research Agent] No response from agent\n`);
    process.stdout.write("RESEARCH_FAILED\n");
    return;
  }

  // Parse result
  try {
    const jsonMatch = result.match(/```json\n?([\s\S]*?)\n?```/) || result.match(/({[\s\S]*})/);
    if (!jsonMatch) {
      process.stdout.write(`status: [Research Agent] No valid JSON in research result\n`);
      process.stdout.write("RESEARCH_FAILED\n");
      return;
    }

    const findings = JSON.parse(jsonMatch[1]);
    process.stdout.write(`status: [Research Agent] Findings: ${findings.findings?.slice(0, 200) || "N/A"}\n`);
    process.stdout.write(`status: [Research Agent] Root cause: ${findings.root_cause || "Unknown"}\n`);
    process.stdout.write(`status: [Research Agent] Fix: ${findings.fix_script?.slice(0, 200) || "None"}\n`);

    // Record findings
    const RESEARCH_LOG = path.join(mainDir, ".paper2agent", "local", "research.jsonl");
    if (!existsSync(path.dirname(RESEARCH_LOG))) {
      await mkdir(path.dirname(RESEARCH_LOG), { recursive: true });
    }
    await appendFile(RESEARCH_LOG, JSON.stringify({
      timestamp: new Date().toISOString(),
      stepName,
      error: errorSnippet.slice(0, 500),
      findings: findings.findings,
      rootCause: findings.root_cause,
      fixScript: findings.fix_script,
      confidence: findings.confidence,
      sources: findings.sources
    }) + "\n", "utf-8");

    process.stdout.write("RESEARCH_SUCCESS\n");
  } catch {
    process.stdout.write(`status: [Research Agent] Failed to parse research result\n`);
    process.stdout.write("RESEARCH_FAILED\n");
  }
}

function extractSearchTerms(error: string): string[] {
  const terms: string[] = [];

  // Extract module/package names
  const moduleMatches = error.match(/No module named ['"]([^'"]+)['"]/g);
  if (moduleMatches) {
    terms.push(...moduleMatches.map(m => m.replace(/No module named ['"]/, "").replace(/['"]/, "")));
  }

  // Extract error class names
  const errorClassMatches = error.match(/([A-Z][a-zA-Z]*Error)/g);
  if (errorClassMatches) {
    terms.push(...errorClassMatches.slice(0, 3));
  }

  // Extract key technical terms
  const techTerms = error.match(/[a-zA-Z_]+[a-zA-Z0-9_]*(?:\.[a-zA-Z_]+){2,}/g);
  if (techTerms) {
    terms.push(...new Set(techTerms.slice(0, 5)));
  }

  // Deduplicate and return
  return [...new Set(terms)].filter(t => t.length > 2).slice(0, 5);
}

async function callAgent(prompt: string, cwd: string): Promise<string | null> {
  return new Promise((resolve) => {
    const agentPath = path.join(path.dirname(process.argv[1]), "ai-agent.ts");
    const proc = spawn("npx", ["tsx", agentPath], {
      cwd,
      env: {
        ...process.env,
        AGENT_BASE_URL: process.env.PAPER2AGENT_BASE_URL || process.env.AGENT_BASE_URL || "https://openrouter.ai/api/v1",
        AGENT_API_KEY: process.env.PAPER2AGENT_API_KEY || process.env.AGENT_API_KEY || process.env.OPENROUTER_API_KEY || "",
        AGENT_MODEL: process.env.PAPER2AGENT_MODEL || process.env.AGENT_MODEL || "qwen/qwen3.6-plus:free",
        AGENT_CWD: cwd,
        AGENT_PRESERVE_THINKING: "true",
        AGENT_MAX_TURNS: "40"
      },
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 300_000
    });

    let output = "";
    let lastResult = "";

    proc.stdin.write(prompt + "\n");
    proc.stdin.end();

    proc.stdout.on("data", (d) => {
      const text = d.toString();
      output += text;
      for (const line of text.split("\n")) {
        if (line.includes('"type":"result"') || line.includes('"type": "result"')) {
          try {
            const event = JSON.parse(line);
            lastResult = event.result || "";
          } catch { /* skip */ }
        }
      }
    });

    proc.stderr.on("data", (d) => process.stderr.write(d.toString()));

    proc.on("close", () => {
      resolve(lastResult || (output.slice(-3000) || null));
    });

    proc.on("error", () => resolve(null));
  });
}

main().catch((err) => {
  process.stderr.write(`Research Agent error: ${err.message}\n`);
  process.exit(1);
});
