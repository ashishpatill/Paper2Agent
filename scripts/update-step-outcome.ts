import { updatePipelineStepOutcome } from "../lib/server/pipeline-outcomes";
import type { PipelineStepOutcome } from "../lib/server/types";

async function main() {
  const [, , workspacePath, stepNumberRaw, name, outcomeRaw, detail = "", attemptsRaw = ""] = process.argv;

  if (!workspacePath || !stepNumberRaw || !name || !outcomeRaw) {
    throw new Error(
      "Usage: tsx scripts/update-step-outcome.ts <workspacePath> <stepNumber> <name> <outcome> [detail] [attempts]"
    );
  }

  const outcome = outcomeRaw as PipelineStepOutcome["outcome"];
  const stepNumber = Number.parseInt(stepNumberRaw, 10);
  const attempts = attemptsRaw ? Number.parseInt(attemptsRaw, 10) : undefined;

  await updatePipelineStepOutcome({
    workspacePath,
    stepNumber,
    name,
    outcome,
    detail: detail || undefined,
    attempts: Number.isFinite(attempts || NaN) ? attempts : undefined
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
