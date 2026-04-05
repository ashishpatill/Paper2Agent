import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { PipelineStepOutcome, PipelineStepOutcomesReport } from "./types";

async function readJsonIfExists<T>(filePath: string) {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

export function pipelineStepOutcomesPath(workspacePath: string) {
  return path.join(workspacePath, "reports", "pipeline-step-outcomes.json");
}

export async function updatePipelineStepOutcome(options: {
  workspacePath: string;
  stepNumber: number;
  name: string;
  outcome: PipelineStepOutcome["outcome"];
  detail?: string;
  attempts?: number;
}) {
  const reportPath = pipelineStepOutcomesPath(options.workspacePath);
  const existing =
    (await readJsonIfExists<PipelineStepOutcomesReport>(reportPath)) || {
      generatedAt: new Date().toISOString(),
      steps: []
    };

  const updatedAt = new Date().toISOString();
  const nextStep: PipelineStepOutcome = {
    stepNumber: options.stepNumber,
    name: options.name,
    outcome: options.outcome,
    detail: options.detail,
    attempts: options.attempts,
    updatedAt
  };

  const steps = existing.steps.filter((step) => step.stepNumber !== options.stepNumber);
  steps.push(nextStep);
  steps.sort((a, b) => a.stepNumber - b.stepNumber);

  const next: PipelineStepOutcomesReport = {
    generatedAt: updatedAt,
    steps
  };

  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(next, null, 2), "utf8");
  return next;
}
