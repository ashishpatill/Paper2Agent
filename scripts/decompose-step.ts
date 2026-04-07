#!/usr/bin/env tsx
/**
 * decompose-step.ts — M2.7-Inspired Step Decomposition Engine
 *
 * When a step fails after Tier 1 (pattern fixes) and Tier 2 (recovery agent),
 * this engine decomposes the step into smaller, focused sub-steps.
 *
 * Example: Step 3 (tool extraction) decomposes into:
 *   3a: Scan and list all notebooks/source files
 *   3b: Extract tools from notebook 1
 *   3c: Extract tools from notebook 2
 *   3d: Test all extracted tools
 *
 * Each sub-step uses a minimal focused prompt → fewer tokens → no rate limits.
 *
 * Usage: npx tsx scripts/decompose-step.ts <stepNumber> <stepName> <mainDir> <scriptDir>
 */

import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { EvolutionStore, PipelineStage } from "../lib/server/evolution-store";

// Step decomposition templates
const DECOMPOSITION_TEMPLATES: Record<number, {
  name: string;
  stage: PipelineStage;
  subSteps: Array<{
    id: string;
    prompt: string;
    validate: (mainDir: string) => Promise<boolean>;
  }>;
}> = {
  3: {
    name: "Tool Extraction",
    stage: "tool-extraction",
    subSteps: [
      {
        id: "3a-scan",
        prompt: `Scan the working directory and identify all source materials for tool extraction.
List all:
- Executed notebooks in notebooks/ directory
- Python source files in repo/ directory
- Any reports/executed_notebooks.json

Output a JSON list of files to process:
{"files": [{"path": "...", "type": "notebook|python", "name": "..."}]}`,
        validate: async (mainDir: string) => {
          const hasNotebooks = existsSync(path.join(mainDir, "notebooks"));
          const hasRepo = existsSync(path.join(mainDir, "repo"));
          return hasNotebooks || hasRepo;
        }
      },
      {
        id: "3b-extract",
        prompt: `Extract reusable Python functions from the source materials in this workspace.

Working directory: {mainDir}
Source files: {source_files}

Rules:
1. Extract functions that are meaningful and reusable
2. Wrap each with @<name>_mcp.tool decorator
3. Do NOT add parameters not in the original source
4. Do NOT use template/example file names (AlphaPOP, alphagenome, etc.)
5. Preserve exact data structures from the source

Output: src/tools/<source_name>.py`,
        validate: async (mainDir: string) => {
          const toolsDir = path.join(mainDir, "src", "tools");
          if (!existsSync(toolsDir)) return false;
          const { execSync } = await import("node:child_process");
          try {
            const result = execSync(`find "${toolsDir}" -maxdepth 1 -name "*.py" -type f 2>/dev/null | head -5`, { encoding: "utf8" });
            return result.trim().length > 0;
          } catch { return false; }
        }
      },
      {
        id: "3c-tests",
        prompt: `Create test files for the tools in src/tools/.

Working directory: {mainDir}

For each tool file in src/tools/:
1. Read the tool file and identify decorated functions
2. Create a test file in tests/code/<tool_name>/
3. Use pytest and the {repo_name}-env environment
4. Test each function with realistic inputs

Do NOT use template or example test data. Use actual data from the notebooks/repo.`,
        validate: async (mainDir: string) => {
          const testsDir = path.join(mainDir, "tests", "code");
          if (!existsSync(testsDir)) return false;
          const { execSync } = await import("node:child_process");
          try {
            const result = execSync(`find "${testsDir}" -name "*_test.py" -type f 2>/dev/null | head -5`, { encoding: "utf8" });
            return result.trim().length > 0;
          } catch { return false; }
        }
      }
    ]
  },
  5: {
    name: "Coverage Generation",
    stage: "environment",
    subSteps: [
      {
        id: "5a-inventory",
        prompt: `List all tool files in src/tools/ and all test files in tests/code/.
Output JSON: {"tools": [...], "tests": [...]}`,
        validate: async (mainDir: string) => {
          return existsSync(path.join(mainDir, "src", "tools"));
        }
      },
      {
        id: "5b-analyze",
        prompt: `Analyze the tools in src/tools/ and determine:
1. What functionality each tool provides
2. What the paper's key capabilities are
3. What is covered by tools vs what is missing

Output: reports/coverage-analysis.json with coverage_score (0-1), covered_capabilities, uncovered_capabilities`,
        validate: async (mainDir: string) => {
          return existsSync(path.join(mainDir, "reports", "coverage-analysis.json"));
        }
      }
    ]
  },
  8: {
    name: "Gap Analysis",
    stage: "gap-analysis",
    subSteps: [
      {
        id: "8a-capabilities",
        prompt: `Read the paper analysis and tools inventory. List ALL capabilities the paper claims:
- Experiments
- Metrics
- Datasets
- Models
- Results

Output JSON: {"capabilities": [{"name": "...", "type": "...", "description": "..."}]}`,
        validate: async () => true
      },
      {
        id: "8b-coverage",
        prompt: `For each capability, determine if existing tools cover it.
Output: reports/gap_analysis.json with coverage_score, track, covered/uncovered capabilities.`,
        validate: async (mainDir: string) => {
          return existsSync(path.join(mainDir, "reports", "gap-analysis.json"));
        }
      }
    ]
  }
};

async function main() {
  const [, , stepNumStr, stepName, mainDir, scriptDir] = process.argv;

  if (!stepNumStr || !stepName || !mainDir) {
    process.stderr.write("Usage: decompose-step.ts <stepNumber> <stepName> <mainDir> [scriptDir]\n");
    process.exit(1);
  }

  const stepNumber = parseInt(stepNumStr, 10);
  const store = new EvolutionStore(mainDir);
  const template = DECOMPOSITION_TEMPLATES[stepNumber];

  if (!template) {
    process.stdout.write(`status: [Decompose] No decomposition template for step ${stepNumber}\n`);
    process.stdout.write("DECOMPOSE_NOT_APPLICABLE\n");
    return;
  }

  process.stdout.write(`status: [Decompose] Decomposing step ${stepNumber} (${template.name}) into ${template.subSteps.length} sub-steps\n`);

  const stage = template.stage;
  let allSubStepsPassed = true;
  const artifacts: string[] = [];
  const errors: string[] = [];

  // Gather context for prompt variable substitution
  const context = await gatherContext(mainDir, stepNumber);

  for (const subStep of template.subSteps) {
    process.stdout.write(`status: [Decompose] Running sub-step ${subStep.id}...\n`);

    // Substitute context variables in prompt
    let prompt = subStep.prompt;
    prompt = prompt.replace(/\{mainDir\}/g, mainDir);
    prompt = prompt.replace(/\{source_files\}/g, context.sourceFiles.join(", "));
    prompt = prompt.replace(/\{repo_name\}/g, context.repoName || "repo");

    // Run the sub-step via ai-agent.ts
    const result = await runSubStep(prompt, mainDir, scriptDir || mainDir);

    if (!result) {
      process.stdout.write(`status: [Decompose] Sub-step ${subStep.id} FAILED\n`);
      errors.push(`Sub-step ${subStep.id} failed`);
      allSubStepsPassed = false;
      break;
    }

    // Validate the sub-step produced expected output
    const isValid = await subStep.validate(mainDir);
    if (!isValid) {
      process.stdout.write(`status: [Decompose] Sub-step ${subStep.id} validation FAILED\n`);
      errors.push(`Sub-step ${subStep.id} validation failed`);
      allSubStepsPassed = false;
      break;
    }

    process.stdout.write(`status: [Decompose] Sub-step ${subStep.id} PASSED\n`);
  }

  // Record outcome
  if (allSubStepsPassed) {
    process.stdout.write(`status: [Decompose] ✅ All sub-steps passed for step ${stepNumber}\n`);

    // Record as successful strategy
    store.recordStrategy({
      signature: `${stepName}-decomposed`,
      stage,
      strategy: `Decomposed step ${stepNumber} into ${template.subSteps.length} sub-steps`,
      actions: template.subSteps.map(s => s.id),
      contexts: [mainDir.split("/").slice(-3).join("/")]
    });

    process.stdout.write("DECOMPOSE_SUCCESS\n");
  } else {
    process.stdout.write(`status: [Decompose] ❌ Decomposition failed: ${errors.join("; ")}\n`);
    store.recordStrategyFailure(`${stepName}-decompose-failed`, stage);
    process.stdout.write("DECOMPOSE_FAILED\n");
  }
}

interface StepContext {
  sourceFiles: string[];
  repoName: string | null;
  tools: string[];
}

async function gatherContext(mainDir: string, stepNumber: number): Promise<StepContext> {
  const context: StepContext = { sourceFiles: [], repoName: null, tools: [] };

  try {
    const { execSync } = await import("node:child_process");

    // Find source files
    if (existsSync(path.join(mainDir, "notebooks"))) {
      const nbResult = execSync(`find "${mainDir}/notebooks" -name "*.ipynb" -type f 2>/dev/null | head -20`, { encoding: "utf8" });
      context.sourceFiles.push(...nbResult.trim().split("\n").filter(Boolean));
    }

    if (existsSync(path.join(mainDir, "repo"))) {
      const repoResult = execSync(`find "${mainDir}/repo" -name "*.py" -type f 2>/dev/null | head -20`, { encoding: "utf8" });
      context.sourceFiles.push(...repoResult.trim().split("\n").filter(Boolean));
    }

    // Extract repo name
    const repoDir = path.join(mainDir, "repo");
    if (existsSync(repoDir)) {
      const entries = execSync(`ls "${repoDir}" 2>/dev/null`, { encoding: "utf8" });
      const repos = entries.trim().split("\n").filter(Boolean);
      if (repos.length > 0) context.repoName = repos[0];
    }

    // Find existing tools
    const toolsDir = path.join(mainDir, "src", "tools");
    if (existsSync(toolsDir)) {
      const toolsResult = execSync(`find "${toolsDir}" -name "*.py" -type f 2>/dev/null | head -20`, { encoding: "utf8" });
      context.tools.push(...toolsResult.trim().split("\n").filter(Boolean));
    }
  } catch {
    // Best effort — context is optional
  }

  return context;
}

async function runSubStep(prompt: string, mainDir: string, cwd: string): Promise<string | null> {
  return new Promise((resolve) => {
    const agentPath = path.join(path.dirname(process.argv[1]), "ai-agent.ts");
    const proc = spawn("npx", ["tsx", agentPath], {
      cwd,
      env: {
        ...process.env,
        AGENT_BASE_URL: process.env.PAPER2AGENT_BASE_URL || process.env.AGENT_BASE_URL || "https://openrouter.ai/api/v1",
        AGENT_API_KEY: process.env.PAPER2AGENT_API_KEY || process.env.AGENT_API_KEY || process.env.OPENROUTER_API_KEY || "",
        AGENT_MODEL: process.env.PAPER2AGENT_MODEL || process.env.AGENT_MODEL || "qwen/qwen3.6-plus:free",
        AGENT_CWD: mainDir,
        AGENT_PRESERVE_THINKING: "true",
        AGENT_MAX_TURNS: "50"
      },
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 600_000 // 10 min for sub-step
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

    proc.stderr.on("data", (d) => process.stdout.write(`status:   [sub-step] ${d.toString().trim()}\n`));

    proc.on("close", () => resolve(lastResult || output.slice(-3000) || null));
    proc.on("error", () => resolve(null));
  });
}

main().catch((err) => {
  process.stderr.write(`Decompose error: ${err.message}\n`);
  process.exit(1);
});
