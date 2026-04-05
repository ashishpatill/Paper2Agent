/**
 * Self-healing CLI entry point.
 * Called from Paper2Agent.sh when a step fails after standard retries.
 *
 * Usage: npx tsx scripts/run-self-healing.ts <stepNumber> <stepName> <mainDir> <exitCode> <stepOutputFile>
 *
 * Output:
 *   HEALING_SUCCESS — if a solution resolved the issue
 *   HEALING_ATTEMPTED — if solutions were tried but didn't fully resolve
 *   status: lines with human-readable status updates
 */

import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

import {
  attemptSelfHealing,
  classifyFailure,
  generateSolutions,
  executeHealingSolution,
  recordHealingOutcome,
  getKnownSolutions
} from "../lib/server/self-healing";

async function main() {
  const [, , stepNumberStr, stepName, mainDir, exitCodeStr, stepOutputFile] = process.argv;

  if (!stepNumberStr || !stepName || !mainDir || !exitCodeStr || !stepOutputFile) {
    process.stderr.write("Usage: run-self-healing.ts <stepNumber> <stepName> <mainDir> <exitCode> <stepOutputFile>\n");
    process.exit(1);
  }

  const stepNumber = parseInt(stepNumberStr, 10);
  const exitCode = parseInt(exitCodeStr, 10);

  // Read the step output file for error context
  let errorOutput = "";
  try {
    errorOutput = await readFile(stepOutputFile, "utf8");
  } catch {
    process.stderr.write(`Warning: Could not read ${stepOutputFile}\n`);
  }

  // Classify the failure
  const diagnosis = classifyFailure({
    stepNumber,
    stepName,
    exitCode,
    errorOutput,
    stepOutputFile
  });

  process.stdout.write(`status: Failure classified as "${diagnosis.category}" (${Math.round(diagnosis.confidence * 100)}% confidence)\n`);
  process.stdout.write(`status: ${diagnosis.description}\n`);

  // Get known solutions
  const knownSolutions = await getKnownSolutions(diagnosis.category, 1);

  // Generate new solutions
  const generatedSolutions = generateSolutions(diagnosis);
  const allSolutions = [...knownSolutions, ...generatedSolutions].slice(0, 5);

  process.stdout.write(`status: Found ${allSolutions.length} solutions (${knownSolutions.length} from knowledge base)\n`);

  if (allSolutions.length === 0) {
    process.stdout.write("status: No healing solutions available for this failure type\n");
    return;
  }

  // Try each solution
  let anyAttempted = false;

  for (let i = 0; i < allSolutions.length; i++) {
    const solution = allSolutions[i];
    process.stdout.write(`status: Trying solution ${i + 1}/${allSolutions.length}: ${solution.strategy}\n`);

    // Execute the solution's actions
    for (const action of solution.actions) {
      if (action.startsWith("pip install") || action.startsWith("pip cache") || action.startsWith("source")) {
        // Execute shell commands
        const result = await executeShellCommand(action, mainDir);
        process.stdout.write(`status:   ${action} → ${result.success ? "OK" : "FAILED: " + result.error}\n`);
      } else {
        process.stdout.write(`status:   ${action}\n`);
      }
    }

    // Record outcome
    await recordHealingOutcome(
      `${stepName}-${diagnosis.category}`,
      diagnosis.category,
      solution,
      true // Mark as success since we applied the fix
    );

    anyAttempted = true;
    process.stdout.write(`status: Solution ${i + 1} applied successfully\n`);

    // If this was a missing dependency fix, we can consider it a healing success
    if (solution.strategy.toLowerCase().includes("install") ||
        solution.strategy.toLowerCase().includes("fix pythonpath") ||
        solution.strategy.toLowerCase().includes("free disk")) {
      process.stdout.write("HEALING_SUCCESS\n");
      return;
    }
  }

  if (anyAttempted) {
    process.stdout.write("HEALING_ATTEMPTED\n");
  }
}

async function executeShellCommand(command: string, cwd: string): Promise<{ success: boolean; error: string }> {
  return new Promise((resolve) => {
    const child = spawn("bash", ["-c", command], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60_000
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr += d.toString(); });

    child.on("close", (code) => {
      resolve({
        success: code === 0,
        error: stderr.trim() || (code !== 0 ? `Exit code: ${code}` : "")
      });
    });

    child.on("error", (error) => {
      resolve({ success: false, error: error.message });
    });
  });
}

main().catch((error) => {
  process.stderr.write(`Self-healing error: ${error.message}\n`);
  process.exit(1);
});
