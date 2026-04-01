import { mkdir, open, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import { logsRoot, workspacesRoot } from "./fs";
import type { PipelineProgress, StepStatus } from "./types";
import { PIPELINE_STEP_DEFINITIONS } from "../pipeline-steps";

export interface PipelineProgressEvent {
  line: string;
  stepNumber?: number;
  totalSteps?: number;
  stepLabel?: string;
  phase?: "start" | "complete" | "skip" | "error";
  heartbeat?: string;
}

const STEP_NAMES = Object.fromEntries(
  PIPELINE_STEP_DEFINITIONS.map((step) => [step.stepNumber, step.name])
) as Record<number, string>;

export { PIPELINE_STEP_DEFINITIONS };

/**
 * Build a PipelineProgress snapshot from accumulated step events.
 */
export function buildPipelineProgress(
  events: { stepNumber: number; phase: string; label: string; timestamp: string }[],
  totalSteps = PIPELINE_STEP_DEFINITIONS.length
): PipelineProgress {
  const maxStepNumber = Math.max(
    totalSteps,
    ...PIPELINE_STEP_DEFINITIONS.map((step) => step.stepNumber),
    ...events.map((event) => event.stepNumber)
  );

  const steps: StepStatus[] = Array.from({ length: maxStepNumber }, (_, index) => {
    const stepNumber = index + 1;
    return {
      stepNumber,
      name: STEP_NAMES[stepNumber] || `Step ${stepNumber}`,
      status: "pending"
    };
  });

  // Apply events in order
  let currentStep: number | undefined;
  for (const event of events) {
    const idx = steps.findIndex(s => s.stepNumber === event.stepNumber);
    if (idx === -1) continue;

    const step = steps[idx];
    switch (event.phase) {
      case "start":
        step.status = "running";
        step.startedAt = event.timestamp;
        step.name = event.label || step.name;
        currentStep = event.stepNumber;
        break;
      case "complete":
        step.status = "completed";
        step.completedAt = event.timestamp;
        if (step.startedAt) {
          step.durationSeconds = (Date.parse(event.timestamp) - Date.parse(step.startedAt)) / 1000;
        }
        break;
      case "skip":
        step.status = "skipped";
        step.completedAt = event.timestamp;
        break;
      case "error":
        step.status = "failed";
        step.completedAt = event.timestamp;
        step.error = event.label;
        break;
    }
  }

  return { steps, currentStep, totalSteps };
}

/**
 * Read the last N lines of a log file.
 */
export async function tailLog(logPath: string, lines = 200): Promise<string[]> {
  try {
    const content = await readFile(logPath, "utf8");
    const allLines = content.split("\n");
    return allLines.slice(-lines).filter(l => l.trim().length > 0);
  } catch {
    return [];
  }
}

/**
 * Get log file size for polling optimization.
 */
export async function logFileSize(logPath: string): Promise<number> {
  try {
    const s = await stat(logPath);
    return s.size;
  } catch {
    return 0;
  }
}

function normalizeSlug(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function getPipelinePaths(options: { jobId: string; projectSlug: string }) {
  const safeSlug = normalizeSlug(options.projectSlug || options.jobId);
  const workspaceName = `${safeSlug}-${options.jobId}`;

  return {
    projectDir: `.paper2agent/workspaces/${workspaceName}`,
    workspacePath: path.join(workspacesRoot, workspaceName),
    logPath: path.join(logsRoot, `${options.jobId}.log`)
  };
}

async function fileExists(filePath: string) {
  try {
    await readFile(filePath, "utf8");
    return true;
  } catch {
    return false;
  }
}

async function readTextIfExists(filePath: string) {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

async function countTutorialCandidates(repoPath: string) {
  let count = 0;

  async function walk(currentPath: string, depth: number) {
    if (depth > 3) {
      return;
    }

    const entries = await readdir(currentPath, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const nextPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === ".git" || entry.name === "node_modules" || entry.name.startsWith(".")) {
          continue;
        }
        await walk(nextPath, depth + 1);
      } else if (
        /\.(ipynb|py|md|qmd|rst)$/i.test(entry.name) &&
        /tutorial|example|demo|notebook|readme/i.test(entry.name)
      ) {
        count += 1;
      }
    }
  }

  await walk(repoPath, 0);
  return count;
}

export async function diagnosePipelineFailure(options: {
  workspacePath: string;
  logPath: string;
  strict?: boolean;
}) {
  const logText = await readTextIfExists(options.logPath);
  const step1OutputPath = path.join(options.workspacePath, "claude_outputs", "step1_output.json");
  const step1Output = await readTextIfExists(step1OutputPath);

  if (/OAuth token has expired|authentication_error|Failed to authenticate/i.test(step1Output)) {
    return "Claude Code authentication expired during step 1. Re-authenticate the `claude` CLI, then retry.";
  }

  if (/authentication_error|Failed to authenticate/i.test(logText)) {
    return "Claude Code authentication failed during the Paper2Agent pipeline. Re-authenticate the `claude` CLI, then retry.";
  }

  if (/No space left on device/i.test(logText)) {
    return "The pipeline could not write the cloned repository or workspace because the drive ran out of free space. Free up disk space, then retry the job.";
  }

  if (/fatal: could not create work tree dir|fatal: could not set 'core\.repositoryformatversion'|clone failed/i.test(logText)) {
    return "The repository clone step failed before the workspace could be prepared. Check the job log for the git error, then retry.";
  }

  const repoRoot = path.join(options.workspacePath, "repo");
  const repoEntries = await readdir(repoRoot, { withFileTypes: true }).catch(() => []);
  const firstRepo = repoEntries.find((entry) => entry.isDirectory());

  if (firstRepo) {
    const repoPath = path.join(repoRoot, firstRepo.name);
    const tutorialCount = await countTutorialCandidates(repoPath);
    if (tutorialCount === 0) {
      return "The detected repository does not appear to contain runnable tutorials, notebooks, or example scripts. The pipeline will attempt tool extraction directly from the source code, but this may fail if the code is not executable in the local environment.";
    }
  }

  if (options.strict && logText.trim()) {
    const lastLines = logText.trim().split("\n").slice(-12).join(" ");
    return `Pipeline failed. Last log lines: ${lastLines}`;
  }

  if (options.strict) {
    return "Pipeline failed before producing a detailed diagnostic log.";
  }

  return undefined;
}

export async function runPipeline(options: {
  jobId: string;
  repositoryUrl: string;
  projectSlug: string;
  paperUrl?: string;
  paperTitle?: string;
  notes?: string;
  onProgress?: (event: PipelineProgressEvent) => Promise<void> | void;
}) {
  const { projectDir, workspacePath, logPath } = getPipelinePaths({
    jobId: options.jobId,
    projectSlug: options.projectSlug
  });

  await mkdir(workspacesRoot, { recursive: true });
  await mkdir(logsRoot, { recursive: true });

  const logFile = await open(logPath, "a");
  let outputBuffer = "";

  function processOutputChunk(chunk: Buffer | string) {
    const text = chunk.toString();
    void logFile.appendFile(text);

    outputBuffer += text.replace(/\r/g, "\n");
    const lines = outputBuffer.split("\n");
    outputBuffer = lines.pop() || "";

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }

      const match = line.match(
        /Step\s+(\d+)\/(\d+):\s+(.+?)\s+-\s+(STARTING|COMPLETED|SKIPPED(?:\s+\(.+?\))?|ERROR)/i
      );

      const event: PipelineProgressEvent = { line };
      if (match) {
        const phaseToken = match[4].toLowerCase();
        event.stepNumber = Number(match[1]);
        event.totalSteps = Number(match[2]);
        event.stepLabel = match[3];
        event.phase = phaseToken.startsWith("start")
          ? "start"
          : phaseToken.startsWith("complete")
            ? "complete"
            : phaseToken.startsWith("skip")
              ? "skip"
              : "error";
      }

      // Capture heartbeat lines as activity updates (↳ prefix)
      const heartbeatMatch = line.match(/↳\s+\[(\d+)s\]\s+(.*)/);
      if (heartbeatMatch) {
        event.heartbeat = heartbeatMatch[2].slice(0, 200);
      }

      void options.onProgress?.(event);
    }
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "bash",
      [
        "Paper2Agent.sh",
        "--project_dir",
        projectDir,
        "--github_url",
        options.repositoryUrl,
        "--paper_url",
        options.paperUrl || "",
        "--paper_title",
        options.paperTitle || "",
        "--notes",
        options.notes || ""
      ],
      {
        cwd: process.cwd(),
        stdio: ["ignore", "pipe", "pipe"]
      }
    );

    child.stdout.on("data", processOutputChunk);

    child.stderr.on("data", processOutputChunk);

    child.on("error", reject);
    child.on("close", (code) => {
      if (outputBuffer.trim()) {
        processOutputChunk(`${outputBuffer}\n`);
        outputBuffer = "";
      }

      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Paper2Agent.sh exited with code ${code}`));
      }
    });
  }).finally(async () => {
    await logFile.close();
  });

  return {
    logPath,
    workspacePath
  };
}
