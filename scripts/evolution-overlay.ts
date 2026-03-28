/**
 * CLI helper to generate prompt overlays from the evolution store.
 * Called by step runner scripts via: npx tsx scripts/evolution-overlay.ts <baseDir> <stepNumber> [repoName]
 * Outputs the overlay text to stdout for envsubst injection.
 */

import { generateOverlayForEnv } from "../lib/server/prompt-overlay";

const [,, baseDir, stepStr, repoName] = process.argv;

if (!baseDir || !stepStr) {
  process.stderr.write("Usage: evolution-overlay.ts <baseDir> <stepNumber> [repoName]\n");
  process.exit(1);
}

const stepNumber = parseInt(stepStr, 10);
if (isNaN(stepNumber) || stepNumber < 1 || stepNumber > 13) {
  process.stderr.write(`Invalid step number: ${stepStr}\n`);
  process.exit(1);
}

const overlay = generateOverlayForEnv(baseDir, stepNumber, repoName || undefined);
process.stdout.write(overlay);
