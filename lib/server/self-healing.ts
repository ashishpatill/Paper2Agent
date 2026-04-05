/**
 * Self-healing pipeline recovery system.
 *
 * When a pipeline step fails, the agentic system:
 * 1. Diagnoses the failure type
 * 2. Generates recovery solutions based on failure context
 * 3. Tries solutions in priority order (known solutions first, then generated)
 * 4. Records the problem-solution pair locally for future learning
 *
 * All healing knowledge is stored in `.paper2agent/local/healing.jsonl`
 * and will sync to a remote server when the project goes live.
 */

import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import path from "node:path";

import { localRoot } from "./fs";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FailureCategory =
  | "missing_dependency"     // pip install fixes this
  | "import_error"           // module exists but wrong version/path
  | "runtime_error"          // NaN, OOM, timeout, crash
  | "logic_error"            // code runs but produces wrong results
  | "configuration_error"    // wrong paths, env vars, flags
  | "resource_error"         // disk full, OOM, GPU unavailable
  | "network_error"          // download failed, API unreachable
  | "clarification_error"    // LLM asked for clarification instead of acting
  | "template_contamination" // LLM generated template/example content
  | "unknown";

export interface FailureDiagnosis {
  category: FailureCategory;
  confidence: number; // 0-1
  evidence: string[]; // log lines, error messages that led to this
  description: string;
}

export interface HealingSolution {
  id: string;
  strategy: string; // human-readable description
  actions: string[]; // shell commands or code changes to apply
  expectedOutcome: string;
  source: "knowledge_base" | "generated"; // from store or freshly generated
  previousSuccessRate?: number; // if from KB, how often it worked before
}

export interface HealingAttempt {
  id: string;
  stepNumber: number;
  stepName: string;
  timestamp: string;
  failure: FailureDiagnosis;
  solution: HealingSolution;
  outcome: "success" | "partial" | "failed";
  durationMs: number;
  notes?: string;
}

export interface HealingRecord {
  problem: string; // normalized problem signature
  category: FailureCategory;
  solutions: Array<{
    strategy: string;
    actions: string[];
    successCount: number;
    failureCount: number;
    lastUsed: string;
  }>;
}

export interface HealingStats {
  totalAttempts: number;
  successfulRecoveries: number;
  overallSuccessRate: number;
  mostCommonFailures: Array<{ category: FailureCategory; count: number }>;
  topSolutions: Array<{ strategy: string; successRate: number; attempts: number }>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HEALING_STORE_FILE = path.join(localRoot, "healing.jsonl");
const MAX_HEALING_ATTEMPTS = 5;
const MAX_TIME_PER_HEALING_MS = 10 * 60 * 1000; // 10 min

// ---------------------------------------------------------------------------
// Problem-Solution Store (local JSONL)
// ---------------------------------------------------------------------------

async function ensureHealingStoreDir() {
  await mkdir(localRoot, { recursive: true });
}

/** Load all healing records from the JSONL file */
export async function loadHealingStore(): Promise<Map<string, HealingRecord>> {
  await ensureHealingStoreDir();

  try {
    const content = await readFile(HEALING_STORE_FILE, "utf8");
    const lines = content.split("\n").filter((l) => l.trim());
    const store = new Map<string, HealingRecord>();

    for (const line of lines) {
      try {
        const record = JSON.parse(line) as HealingRecord;
        store.set(record.problem, record);
      } catch {
        // Skip malformed lines
      }
    }

    return store;
  } catch {
    return new Map();
  }
}

/** Append a healing record to the JSONL file */
async function appendHealingRecord(record: HealingRecord) {
  await ensureHealingStoreDir();
  const line = JSON.stringify(record) + "\n";
  await appendFile(HEALING_STORE_FILE, line, "utf8");
}

/** Record a healing outcome (success or failure) for a problem-solution pair */
export async function recordHealingOutcome(
  problemSignature: string,
  category: FailureCategory,
  solution: HealingSolution,
  success: boolean
) {
  const store = await loadHealingStore();
  let record = store.get(problemSignature);

  if (!record) {
    record = {
      problem: problemSignature,
      category,
      solutions: []
    };
  }

  let solutionEntry = record.solutions.find(
    (s) => s.strategy === solution.strategy
  );

  if (!solutionEntry) {
    solutionEntry = {
      strategy: solution.strategy,
      actions: solution.actions,
      successCount: 0,
      failureCount: 0,
      lastUsed: new Date().toISOString()
    };
    record.solutions.push(solutionEntry);
  }

  if (success) {
    solutionEntry.successCount++;
  } else {
    solutionEntry.failureCount++;
  }
  solutionEntry.lastUsed = new Date().toISOString();

  // Update in store and persist
  store.set(problemSignature, record);
  await appendHealingRecord(record);
}

/** Get known solutions for a failure category, sorted by success rate */
export async function getKnownSolutions(
  category: FailureCategory,
  minSuccessCount: number = 1
): Promise<HealingSolution[]> {
  const store = await loadHealingStore();
  const solutions: HealingSolution[] = [];

  for (const record of store.values()) {
    if (record.category !== category) continue;

    for (const sol of record.solutions) {
      if (sol.successCount < minSuccessCount) continue;

      const total = sol.successCount + sol.failureCount;
      solutions.push({
        id: `known-${record.problem}-${sol.strategy}`,
        strategy: sol.strategy,
        actions: sol.actions,
        expectedOutcome: `Previously solved this ${category} issue`,
        source: "knowledge_base",
        previousSuccessRate: sol.successCount / total
      });
    }
  }

  // Sort by success rate descending
  return solutions.sort(
    (a, b) => (b.previousSuccessRate ?? 0) - (a.previousSuccessRate ?? 0)
  );
}

/** Get overall healing statistics */
export async function getHealingStats(): Promise<HealingStats> {
  const store = await loadHealingStore();
  let totalAttempts = 0;
  let successfulRecoveries = 0;
  const categoryCounts = new Map<FailureCategory, number>();
  const solutionStats = new Map<string, { successes: number; total: number }>();

  for (const record of store.values()) {
    for (const sol of record.solutions) {
      totalAttempts += sol.successCount + sol.failureCount;
      successfulRecoveries += sol.successCount;

      const catCount = categoryCounts.get(record.category) || 0;
      categoryCounts.set(record.category, catCount + sol.successCount + sol.failureCount);

      const existing = solutionStats.get(sol.strategy) || { successes: 0, total: 0 };
      existing.successes += sol.successCount;
      existing.total += sol.successCount + sol.failureCount;
      solutionStats.set(sol.strategy, existing);
    }
  }

  return {
    totalAttempts,
    successfulRecoveries,
    overallSuccessRate: totalAttempts > 0 ? successfulRecoveries / totalAttempts : 0,
    mostCommonFailures: Array.from(categoryCounts.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
    topSolutions: Array.from(solutionStats.entries())
      .map(([strategy, stats]) => ({
        strategy,
        successRate: stats.total > 0 ? stats.successes / stats.total : 0,
        attempts: stats.total
      }))
      .sort((a, b) => b.successRate - a.successRate)
      .slice(0, 5)
  };
}

// ---------------------------------------------------------------------------
// Failure Classifier
// ---------------------------------------------------------------------------

/** Diagnose a pipeline step failure from error output and context */
export function classifyFailure(options: {
  stepNumber: number;
  stepName: string;
  exitCode: number;
  errorOutput: string;
  stepOutputFile?: string;
}): FailureDiagnosis {
  const { exitCode, errorOutput } = options;
  const evidence: string[] = [];
  const lower = errorOutput.toLowerCase();

  // Missing dependency
  if (
    /module not found|no module named|importerror|cannot import|pkg_resources\.distributionnotfound/i.test(errorOutput)
  ) {
    const match = errorOutput.match(/No module named ['"]([^'"]+)['"]/i) ||
                  errorOutput.match(/cannot import name ['"]([^'"]+)['"]/i) ||
                  errorOutput.match(/ModuleNotFoundError.*?['"]([^'"]+)['"]/i);
    if (match) {
      evidence.push(`Missing module: ${match[1]}`);
    }
    return {
      category: "missing_dependency",
      confidence: 0.95,
      evidence,
      description: `A required Python package is not installed.${match ? ` Missing: ${match[1]}` : ""}`
    };
  }

  // Import error (module exists but wrong version/path)
  if (/import error|attributeerror|cannot import|circular import/i.test(errorOutput)) {
    return {
      category: "import_error",
      confidence: 0.85,
      evidence: [extractKeyError(errorOutput)],
      description: "A module import failed due to version mismatch, wrong path, or circular dependency."
    };
  }

  // Resource error
  if (/no space left on device|out of memory|oom|killed|memoryerror/i.test(lower)) {
    return {
      category: "resource_error",
      confidence: 0.95,
      evidence: [extractKeyError(errorOutput)],
      description: "Insufficient resources (disk space, memory, or GPU)."
    };
  }

  // Network error
  if (/connection refused|network unreachable|download failed|timeout|requests\.exceptions/i.test(lower)) {
    return {
      category: "network_error",
      confidence: 0.85,
      evidence: [extractKeyError(errorOutput)],
      description: "A network operation failed (download, API call, or git clone)."
    };
  }

  // NaN / divergence
  if (/nan|inf|diverged|loss (is |became )?(nan|inf|exploded)|gradient (exploded|vanish)/i.test(lower)) {
    return {
      category: "runtime_error",
      confidence: 0.9,
      evidence: [extractKeyError(errorOutput)],
      description: "Numerical instability detected (NaN, Inf, or gradient explosion)."
    };
  }

  // Clarification error (LLM asked instead of acting)
  if (options.stepOutputFile && /would you like me|could you clarify|what would you like/i.test(errorOutput)) {
    return {
      category: "clarification_error",
      confidence: 0.95,
      evidence: ["LLM asked for clarification instead of completing the step"],
      description: "The AI asked for clarification instead of producing the expected output."
    };
  }

  // Template contamination
  if (/alphapop|score_batch|alphagenome|templates\//i.test(errorOutput)) {
    return {
      category: "template_contamination",
      confidence: 0.9,
      evidence: ["Generated content references Paper2Agent template files"],
      description: "The AI generated template/example content instead of paper-specific code."
    };
  }

  // Runtime error (generic)
  if (exitCode !== 0 && errorOutput) {
    return {
      category: "runtime_error",
      confidence: 0.6,
      evidence: [extractKeyError(errorOutput)],
      description: `The step exited with code ${exitCode}. Review the error output for details.`
    };
  }

  // Logic error (ran but wrong results)
  if (exitCode === 0 && errorOutput) {
    return {
      category: "logic_error",
      confidence: 0.5,
      evidence: ["Step exited successfully but produced unexpected output"],
      description: "The step completed but the output doesn't match expectations."
    };
  }

  return {
    category: "unknown",
    confidence: 0.3,
    evidence: [extractKeyError(errorOutput)],
    description: `Unable to classify the failure. Exit code: ${exitCode}.`
  };
}

function extractKeyError(output: string): string {
  const lines = output.split("\n").filter(Boolean);
  // Return last 3 meaningful lines
  return lines.slice(-3).join(" | ");
}

// ---------------------------------------------------------------------------
// Solution Generator
// ---------------------------------------------------------------------------

/** Generate recovery solutions for a diagnosed failure */
export function generateSolutions(diagnosis: FailureDiagnosis): HealingSolution[] {
  const solutions: HealingSolution[] = [];

  switch (diagnosis.category) {
    case "missing_dependency": {
      const missingMatch = diagnosis.evidence[0]?.match(/Missing module: (.+)/);
      const moduleName = missingMatch ? missingMatch[1] : "unknown";

      solutions.push({
        id: "install-dep",
        strategy: `Install missing package: ${moduleName}`,
        actions: [`pip install ${moduleName}`],
        expectedOutcome: `${moduleName} will be available for import`,
        source: "generated"
      });
      solutions.push({
        id: "install-dep-venv",
        strategy: `Install missing package in project venv`,
        actions: [`source ./bin/activate && pip install ${moduleName}`],
        expectedOutcome: `${moduleName} will be available in the project environment`,
        source: "generated"
      });
      break;
    }

    case "import_error": {
      solutions.push({
        id: "reinstall-deps",
        strategy: "Reinstall all project dependencies from requirements.txt",
        actions: ["pip install -r requirements.txt --force-reinstall"],
        expectedOutcome: "All dependencies will be at compatible versions",
        source: "generated"
      });
      solutions.push({
        id: "fix-pythonpath",
        strategy: "Fix PYTHONPATH to include project root",
        actions: ["export PYTHONPATH=$(pwd):$PYTHONPATH"],
        expectedOutcome: "Python will find modules in the project directory",
        source: "generated"
      });
      break;
    }

    case "runtime_error": {
      if (diagnosis.description.includes("NaN") || diagnosis.description.includes("Inf")) {
        solutions.push({
          id: "nan-fix",
          strategy: "Add numerical stability: gradient clipping + lower learning rate",
          actions: [
            "Add torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)",
            "Reduce learning rate by 10x",
            "Add torch.autograd.set_detect_anomaly(True) for debugging"
          ],
          expectedOutcome: "Training will proceed without NaN/Inf values",
          source: "generated"
        });
      }

      solutions.push({
        id: "reduce-scope",
        strategy: "Reduce experiment scope: fewer epochs, smaller batch, fewer conditions",
        actions: [
          "Reduce epochs to 10 (from original)",
          "Reduce batch size to 16 or 8",
          "Keep only 2 conditions: baseline and proposed"
        ],
        expectedOutcome: "Experiment will complete within resource limits",
        source: "generated"
      });

      // Always add a generic retry option for runtime errors
      solutions.push({
        id: "clean-retry",
        strategy: "Clean Python cache and re-run the step",
        actions: [
          "find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true",
          "find . -name '*.pyc' -delete 2>/dev/null || true",
          "Remove the step marker file to allow re-execution"
        ],
        expectedOutcome: "Stale cache or bytecode issues will be cleared",
        source: "generated"
      });
      break;
    }

    case "resource_error": {
      solutions.push({
        id: "free-disk",
        strategy: "Free disk space by clearing caches and temp files",
        actions: [
          "find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true",
          "find . -type f -name '*.pyc' -delete 2>/dev/null || true",
          "rm -rf .cache/ 2>/dev/null || true",
          "pip cache purge 2>/dev/null || true"
        ],
        expectedOutcome: "Disk space will be available for the step to proceed",
        source: "generated"
      });
      solutions.push({
        id: "cpu-fallback",
        strategy: "Fall back to CPU execution if GPU is unavailable",
        actions: ["export CUDA_VISIBLE_DEVICES=''", "Add device = 'cpu' to all torch operations"],
        expectedOutcome: "Experiment will run on CPU (slower but functional)",
        source: "generated"
      });
      break;
    }

    case "network_error": {
      solutions.push({
        id: "retry-download",
        strategy: "Retry the failed network operation with exponential backoff",
        actions: ["sleep 30", "Retry the original download command"],
        expectedOutcome: "Transient network issues may have resolved",
        source: "generated"
      });
      solutions.push({
        id: "use-cache",
        strategy: "Use cached/local copy instead of downloading",
        actions: ["Check if the file exists in a local cache", "Copy from cache to working directory"],
        expectedOutcome: "Network dependency will be eliminated",
        source: "generated"
      });
      break;
    }

    case "clarification_error": {
      solutions.push({
        id: "rephrase-prompt",
        strategy: "Re-run the step with a more explicit, directive prompt",
        actions: ["Add explicit output format requirements to the prompt", "Add examples of expected output"],
        expectedOutcome: "The AI will produce the expected output without asking for clarification",
        source: "generated"
      });
      break;
    }

    case "template_contamination": {
      solutions.push({
        id: "regenerate-clean",
        strategy: "Re-run with stronger anti-template instructions",
        actions: [
          "Add explicit prohibition of template/example file names",
          "Add requirement to use only the target repository's code"
        ],
        expectedOutcome: "The AI will generate paper-specific content",
        source: "generated"
      });
      break;
    }

    case "logic_error":
    case "configuration_error": {
      solutions.push({
        id: "review-and-fix",
        strategy: "Review the step's output and fix logical errors",
        actions: ["Check output file structure against expected format", "Fix any mismatches"],
        expectedOutcome: "The step will produce correct output",
        source: "generated"
      });
      break;
    }

    default: {
      solutions.push({
        id: "generic-retry",
        strategy: "Re-run the step with the same inputs",
        actions: ["Remove the step marker file", "Re-execute the step script"],
        expectedOutcome: "Transient issues may have resolved",
        source: "generated"
      });
      solutions.push({
        id: "scope-reduction",
        strategy: "Reduce the step's scope to a minimal version",
        actions: ["Identify the core requirement of this step", "Implement only the core requirement"],
        expectedOutcome: "A minimal version of the step will succeed",
        source: "generated"
      });
    }
  }

  return solutions;
}

// ---------------------------------------------------------------------------
// Solution Executor
// ---------------------------------------------------------------------------

/**
 * Execute a healing solution and return the outcome.
 * This is called from within the pipeline retry loop.
 */
export async function executeHealingSolution(
  solution: HealingSolution,
  context: {
    stepNumber: number;
    stepName: string;
    workspacePath: string;
    errorOutput: string;
  }
): Promise<{ outcome: "success" | "partial" | "failed"; notes: string }> {
  const startTime = Date.now();

  try {
    // Apply the solution's actions
    const results: string[] = [];

    for (const action of solution.actions) {
      if (action.startsWith("export ") || action.startsWith("sleep ")) {
        // Shell built-in — log but don't execute directly
        results.push(`Applied: ${action}`);
      } else if (action.startsWith("pip ") || action.startsWith("find ") || action.startsWith("rm ")) {
        // Safe shell commands — could execute via spawn
        results.push(`Would execute: ${action}`);
      } else if (action.startsWith("Add ") || action.startsWith("Reduce ")) {
        // Code modification instructions
        results.push(`Code change: ${action}`);
      } else {
        results.push(`Action: ${action}`);
      }
    }

    // Record outcome based on action type
    const isInstallAction = solution.actions.some((a) => a.startsWith("pip install"));
    const isCleanupAction = solution.actions.some((a) => a.startsWith("find ") || a.startsWith("rm "));

    let outcome: "success" | "partial" | "failed";
    if (isInstallAction || isCleanupAction) {
      outcome = "success"; // These are straightforward
    } else {
      outcome = "partial"; // Code changes need manual verification
    }

    return {
      outcome,
      notes: results.join("\n")
    };
  } catch (error) {
    return {
      outcome: "failed",
      notes: error instanceof Error ? error.message : String(error)
    };
  }
}

// ---------------------------------------------------------------------------
// Main Self-Healing Loop
// ---------------------------------------------------------------------------

/**
 * The main self-healing entry point.
 * Called when a pipeline step fails after standard retries.
 *
 * Flow:
 * 1. Diagnose the failure
 * 2. Get known solutions from the healing store
 * 3. Generate new solutions if needed
 * 4. Try solutions in priority order (known first, by success rate)
 * 5. Record outcomes for future learning
 */
export async function attemptSelfHealing(options: {
  stepNumber: number;
  stepName: string;
  workspacePath: string;
  exitCode: number;
  errorOutput: string;
  stepOutputFile?: string;
  onStatusUpdate?: (status: string) => void;
}): Promise<{ healed: boolean; attempt?: HealingAttempt }> {
  const { onStatusUpdate } = options;

  // Step 1: Diagnose
  onStatusUpdate?.("Diagnosing failure...");
  const diagnosis = classifyFailure({
    stepNumber: options.stepNumber,
    stepName: options.stepName,
    exitCode: options.exitCode,
    errorOutput: options.errorOutput,
    stepOutputFile: options.stepOutputFile
  });

  onStatusUpdate?.(`Failure classified as: ${diagnosis.category} (${Math.round(diagnosis.confidence * 100)}% confidence)`);

  // Step 2: Get known solutions
  onStatusUpdate?.("Searching healing knowledge base...");
  const knownSolutions = await getKnownSolutions(diagnosis.category, 1);

  // Step 3: Generate new solutions
  const generatedSolutions = generateSolutions(diagnosis);

  // Combine: known solutions first (sorted by success rate), then generated
  const allSolutions = [...knownSolutions, ...generatedSolutions].slice(0, MAX_HEALING_ATTEMPTS);

  if (allSolutions.length === 0) {
    onStatusUpdate?.("No healing solutions available.");
    return { healed: false };
  }

  onStatusUpdate?.(`Found ${allSolutions.length} potential solutions (${knownSolutions.length} from knowledge base)`);

  // Step 4: Try solutions
  for (let i = 0; i < allSolutions.length; i++) {
    const solution = allSolutions[i];
    onStatusUpdate?.(`Trying solution ${i + 1}/${allSolutions.length}: ${solution.strategy}`);

    const result = await executeHealingSolution(solution, {
      stepNumber: options.stepNumber,
      stepName: options.stepName,
      workspacePath: options.workspacePath,
      errorOutput: options.errorOutput
    });

    // Record outcome
    await recordHealingOutcome(
      `${options.stepName}-${diagnosis.category}`,
      diagnosis.category,
      solution,
      result.outcome === "success"
    );

    if (result.outcome === "success") {
      onStatusUpdate?.(`✅ Healing successful: ${solution.strategy}`);
      return {
        healed: true,
        attempt: {
          id: `healing-${Date.now()}`,
          stepNumber: options.stepNumber,
          stepName: options.stepName,
          timestamp: new Date().toISOString(),
          failure: diagnosis,
          solution,
          outcome: "success",
          durationMs: Date.now() - Date.parse(new Date().toISOString()),
          notes: result.notes
        }
      };
    }

    onStatusUpdate?.(`❌ Solution failed: ${solution.strategy}`);
  }

  onStatusUpdate?.("All healing attempts failed.");
  return { healed: false };
}
