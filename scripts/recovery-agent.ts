#!/usr/bin/env tsx
/**
 * recovery-agent.ts — M2.7-Inspired Tier 2 Recovery Agent
 *
 * When a pipeline step fails after Tier 1 pattern matching, this agent:
 * 1. Reads the full error output and step context
 * 2. Diagnoses the root cause using Qwen's reasoning
 * 3. Generates and executes a fix script
 * 4. Validates the fix by re-running the step
 * 5. Records the lesson to the evolution store
 *
 * Run → Evaluate → Learn → Evolve cycle (up to 3 iterations)
 *
 * Usage: npx tsx scripts/recovery-agent.ts <stepNumber> <stepName> <mainDir> <exitCode> <stepOutputFile>
 */

import { spawn } from "node:child_process";
import { readFile, writeFile, appendFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { EvolutionStore, PipelineStage } from "../lib/server/evolution-store";

// Map step numbers to pipeline stages
const STEP_TO_STAGE: Record<number, PipelineStage> = {
  1: "environment", 2: "tutorial-scan", 3: "tool-extraction",
  4: "mcp-wrap", 5: "environment", 6: "tutorial-execute",
  7: "gap-analysis", 8: "gap-analysis", 9: "paper-coder",
  10: "experiment-runner", 11: "results-comparator",
  12: "fix-loop", 13: "mcp-rewrap"
};

async function main() {
  const [, , stepNumStr, stepName, mainDir, exitCodeStr, stepOutputFile] = process.argv;

  if (!stepNumStr || !stepName || !mainDir || !exitCodeStr || !stepOutputFile) {
    process.stderr.write("Usage: recovery-agent.ts <stepNumber> <stepName> <mainDir> <exitCode> <stepOutputFile>\n");
    process.exit(1);
  }

  const stepNumber = parseInt(stepNumStr, 10);
  const exitCode = parseInt(exitCodeStr, 10);
  const stage = STEP_TO_STAGE[stepNumber] || "general";
  const store = new EvolutionStore(mainDir);

  // Read error output
  let errorOutput = "";
  try {
    errorOutput = await readFile(stepOutputFile, "utf8");
  } catch {
    process.stderr.write(`Warning: Could not read ${stepOutputFile}\n`);
  }

  // Get any known strategies for this stage
  const knownStrategies = store.getStrategiesForStage(stage, 3);
  const strategyContext = knownStrategies.length > 0
    ? `\nPreviously successful strategies for this stage:\n${knownStrategies.map(s =>
        `- "${s.strategy}" (success: ${s.successCount}, failures: ${s.failureCount}): ${s.actions.join("; ")}`
      ).join("\n")}`
    : "";

  // Get lessons for this step
  const lessons = store.getLessonsForStep(stepName, stage, 3);
  const lessonContext = lessons.length > 0
    ? `\nLessons learned from previous runs:\n${lessons.map(l =>
        `- ${l.lesson} (weight: ${l.weight.toFixed(2)})`
      ).join("\n")}`
    : "";

  // Run the recovery cycle (up to 3 iterations)
  const MAX_CYCLES = 3;
  let currentError = errorOutput;

  for (let cycle = 1; cycle <= MAX_CYCLES; cycle++) {
    process.stdout.write(`status: [Recovery Agent] Cycle ${cycle}/${MAX_CYCLES} — diagnosing...\n`);

    // Build the recovery prompt
    const recoveryPrompt = `You are an expert debugging engineer fixing a failed pipeline step.

## Failed Step
- Step: ${stepNumber} — ${stepName}
- Stage: ${stage}
- Exit Code: ${exitCode}
- Working Directory: ${mainDir}

## Error Output
\`\`\`
${currentError.slice(0, 12000)}
\`\`\`
${strategyContext}
${lessonContext}

## Your Task
1. **Analyze** the error output and identify the root cause
2. **Generate** a bash fix script that resolves the issue
3. **The fix script must be executable** — use only safe commands (pip install, mkdir, chmod, etc.)
4. **Output ONLY a JSON object** with this exact structure:

\`\`\`json
{
  "root_cause": "Brief description of what went wrong",
  "confidence": 0.9,
  "fix_script": "bash commands to fix the issue (one per line, or &&-chained)",
  "validation_command": "bash command to verify the fix worked",
  "prevention": "How to prevent this in future runs"
}
\`\`\`

**Rules:**
- Do NOT ask for clarification
- Do NOT suggest manual intervention
- The fix_script must be directly executable via \`bash -c\`
- Keep the fix minimal and targeted
- If the error is a rate limit or API issue, suggest a backoff or alternative
- If the error is a missing file, suggest creating it or finding an alternative path`;

    // Call Qwen via ai-agent.ts
    const fixResult = await callAgent(recoveryPrompt, mainDir);

    if (!fixResult) {
      process.stdout.write(`status: [Recovery Agent] Cycle ${cycle} — agent failed to respond\n`);
      store.recordStrategyFailure(`${stepName}-agent-no-response`, stage);
      continue;
    }

    // Parse the fix
    let fix: { root_cause: string; confidence: number; fix_script: string; validation_command: string; prevention: string };
    try {
      // Extract JSON from agent response (may have markdown fences)
      const jsonMatch = fixResult.match(/```json\n?([\s\S]*?)\n?```/) || fixResult.match(/({[\s\S]*})/);
      if (!jsonMatch) {
        process.stdout.write(`status: [Recovery Agent] Cycle ${cycle} — no valid JSON in response\n`);
        continue;
      }
      fix = JSON.parse(jsonMatch[1]);
    } catch {
      process.stdout.write(`status: [Recovery Agent] Cycle ${cycle} — failed to parse fix JSON\n`);
      continue;
    }

    process.stdout.write(`status: [Recovery Agent] Root cause: ${fix.root_cause}\n`);
    process.stdout.write(`status: [Recovery Agent] Confidence: ${fix.confidence}\n`);
    process.stdout.write(`status: [Recovery Agent] Fix: ${fix.fix_script.slice(0, 200)}\n`);

    // Execute the fix
    process.stdout.write(`status: [Recovery Agent] Applying fix...\n`);
    const fixSuccess = await executeFix(fix.fix_script, mainDir);

    if (!fixSuccess) {
      process.stdout.write(`status: [Recovery Agent] Fix application failed\n`);
      store.recordStrategyFailure(`${stepName}-${fix.root_cause.slice(0, 30)}`, stage);
      // Try to get new error output for next cycle
      try {
        currentError = await readFile(stepOutputFile, "utf8");
      } catch { /* keep previous */ }
      continue;
    }

    // Validate
    if (fix.validation_command) {
      process.stdout.write(`status: [Recovery Agent] Validating fix...\n`);
      const validationSuccess = await executeFix(fix.validation_command, mainDir);
      if (!validationSuccess) {
        process.stdout.write(`status: [Recovery Agent] Validation failed\n`);
        store.recordStrategyFailure(`${stepName}-validation-failed`, stage);
        try {
          currentError = await readFile(stepOutputFile, "utf8");
        } catch { /* keep previous */ }
        continue;
      }
    }

    // SUCCESS — record the strategy
    const problemSignature = `${stepName}-${extractErrorType(currentError)}`;
    store.recordStrategy({
      signature: problemSignature,
      stage,
      strategy: fix.root_cause,
      actions: fix.fix_script.split("\n").filter(Boolean),
      contexts: [mainDir.split("/").slice(-3).join("/")]
    });

    // Record the lesson
    store.append({
      stage,
      category: "error-fix",
      lesson: `${stepName}: ${fix.root_cause} → ${fix.fix_script.split("\n")[0]}`,
      context: fix.prevention,
      tags: [stepName.toLowerCase().replace(/\s+/g, "-"), "recovery", "fixed"],
    });

    process.stdout.write(`status: [Recovery Agent] ✅ Fix applied and validated successfully\n`);
    process.stdout.write("RECOVERY_SUCCESS\n");
    return;
  }

  // All cycles exhausted
  process.stdout.write(`status: [Recovery Agent] All ${MAX_CYCLES} recovery cycles exhausted\n`);
  process.stdout.write("RECOVERY_FAILED\n");
}

/** Call the AI agent with a recovery prompt */
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
        AGENT_MAX_TURNS: "30" // Shorter for focused recovery
      },
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 300_000 // 5 min max
    });

    let output = "";
    let lastResult = "";

    proc.stdin.write(prompt + "\n");
    proc.stdin.end();

    proc.stdout.on("data", (d) => {
      const text = d.toString();
      output += text;
      // Capture result lines
      for (const line of text.split("\n")) {
        if (line.includes('"type":"result"') || line.includes('"type": "result"')) {
          try {
            const event = JSON.parse(line);
            lastResult = event.result || "";
          } catch { /* skip */ }
        }
      }
    });

    proc.stderr.on("data", (d) => {
      process.stderr.write(d.toString());
    });

    proc.on("close", () => {
      // Try to extract the final result from agent output
      if (lastResult) {
        resolve(lastResult);
      } else {
        // Fallback: look for JSON result in full output
        const resultMatch = output.match(/"result"\s*:\s*"([^"]*)"/);
        resolve(resultMatch ? resultMatch[1] : (output.slice(-2000) || null));
      }
    });

    proc.on("error", () => {
      resolve(null);
    });
  });
}

/** Execute a bash fix script */
async function executeFix(script: string, cwd: string): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn("bash", ["-c", script], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 120_000
    });

    proc.stdout.on("data", (d) => process.stdout.write(`status:   [fix] ${d.toString().trim()}\n`));
    proc.stderr.on("data", (d) => process.stderr.write(`status:   [fix err] ${d.toString().trim()}\n`));
    proc.on("close", (code) => resolve(code === 0));
    proc.on("error", () => resolve(false));
  });
}

/** Extract error type from output for problem signature */
function extractErrorType(output: string): string {
  if (/ModuleNotFoundError|No module named/i.test(output)) return "MissingDependency";
  if (/ImportError|cannot import/i.test(output)) return "ImportError";
  if (/No space left|out of memory|OOM/i.test(output)) return "ResourceExhausted";
  if (/Connection refused|network unreachable|timeout/i.test(output)) return "NetworkError";
  if (/NaN|Inf|diverged/i.test(output)) return "NumericalInstability";
  if (/Permission denied/i.test(output)) return "PermissionError";
  if (/out of extra usage|out_of_credits|usage limit/i.test(output)) return "RateLimit";
  return "Unknown";
}

main().catch((err) => {
  process.stderr.write(`Recovery Agent error: ${err.message}\n`);
  process.exit(1);
});
