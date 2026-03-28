import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { ensureAppDirectories, jobsRoot } from "./fs";
import { diagnosePipelineFailure, getPipelinePaths } from "./pipeline";
import type { JobRecord, JobStatus, ResumableJobStatus } from "./types";

export type JobControlAction = "pause" | "resume" | "stop";

const ACTIVE_JOB_STATUSES = new Set<JobStatus>(["queued", "analyzing", "running_pipeline"]);
const TERMINAL_JOB_STATUSES = new Set<JobStatus>([
  "needs_repo",
  "stopped",
  "not_implementable",
  "completed",
  "failed"
]);

function jobDirectory(jobId: string) {
  return path.join(jobsRoot, jobId);
}

function jobFile(jobId: string) {
  return path.join(jobDirectory(jobId), "job.json");
}

export async function createJob(job: JobRecord) {
  await ensureAppDirectories();
  await mkdir(jobDirectory(job.id), { recursive: true });
  await writeFile(jobFile(job.id), JSON.stringify(job, null, 2), "utf8");
  return job;
}

export async function getJob(jobId: string) {
  try {
    const content = await readFile(jobFile(jobId), "utf8");
    return JSON.parse(content) as JobRecord;
  } catch (error) {
    // If the file exists but JSON is corrupted, try to recover the first valid object
    if (error instanceof SyntaxError && error.message.includes("position")) {
      try {
        const raw = await readFile(jobFile(jobId), "utf8");
        // Find first complete JSON object by scanning for matching braces
        let depth = 0;
        let inString = false;
        let escape = false;
        for (let i = 0; i < raw.length; i++) {
          const ch = raw[i];
          if (escape) { escape = false; continue; }
          if (ch === "\\") { escape = true; continue; }
          if (ch === '"') { inString = !inString; continue; }
          if (inString) continue;
          if (ch === "{") depth++;
          if (ch === "}") { depth--; if (depth === 0) {
            const recovered = JSON.parse(raw.slice(0, i + 1)) as JobRecord;
            // Repair the file atomically
            const target = jobFile(jobId);
            const tmp = `${target}.tmp`;
            await writeFile(tmp, JSON.stringify(recovered, null, 2), "utf8");
            await rename(tmp, target);
            return recovered;
          }}
        }
      } catch { /* recovery failed, fall through */ }
    }
    return null;
  }
}

function isStaleInFlightJob(job: JobRecord) {
  if (!ACTIVE_JOB_STATUSES.has(job.status)) {
    return false;
  }

  const lastActivity = job.lastHeartbeatAt || job.updatedAt;
  const ageMs = Date.now() - Date.parse(lastActivity);
  if (!Number.isFinite(ageMs)) {
    return false;
  }

  if (job.status === "queued") {
    return ageMs > 2 * 60_000;
  }

  if (job.status === "analyzing") {
    return ageMs > 5 * 60_000;
  }

  return ageMs > 45 * 60_000;
}

export async function updateJob(jobId: string, updater: (job: JobRecord) => JobRecord) {
  const current = await getJob(jobId);

  if (!current) {
    throw new Error(`Job ${jobId} was not found.`);
  }

  const next = updater({
    ...current,
    updatedAt: new Date().toISOString()
  });

  const target = jobFile(jobId);
  const tmp = `${target}.tmp`;
  const serialized = JSON.stringify(next, null, 2);
  // Validate the serialized JSON before writing to prevent corruption
  JSON.parse(serialized);
  await writeFile(tmp, serialized, "utf8");
  await rename(tmp, target);
  return next;
}

export async function reconcileJob(jobId: string) {
  const job = await getJob(jobId);

  if (!job || !isStaleInFlightJob(job)) {
    return job;
  }

  if (job.status === "analyzing") {
    return updateJob(jobId, (current) => ({
      ...current,
      status: "failed",
      workerPid: undefined,
      resumeStatus: undefined,
      error:
        current.error ||
        "The background analysis worker stopped responding before completing the paper analysis."
    }));
  }

  const pipelinePaths = getPipelinePaths({
    jobId,
    projectSlug: job.projectName || job.analysis?.projectSlug || jobId
  });

  const diagnosis = await diagnosePipelineFailure({
    workspacePath: job.workspacePath || pipelinePaths.workspacePath,
    logPath: job.logPath || pipelinePaths.logPath,
    strict: false
  }).catch(() => undefined);

  return updateJob(jobId, (current) => ({
    ...current,
    status: "failed",
    workerPid: undefined,
    resumeStatus: undefined,
    workspacePath: current.workspacePath || pipelinePaths.workspacePath,
    logPath: current.logPath || pipelinePaths.logPath,
    error: diagnosis || "The pipeline worker stopped responding and did not complete."
  }));
}

export function isTerminalJobStatus(status: JobStatus) {
  return TERMINAL_JOB_STATUSES.has(status);
}

function signalJobProcess(pid: number, signal: NodeJS.Signals) {
  const targets = [-pid, pid];

  for (const target of targets) {
    try {
      process.kill(target, signal);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ESRCH") {
        continue;
      }

      throw error;
    }
  }

  return false;
}

function isResumableStatus(status: JobStatus): status is ResumableJobStatus {
  return ACTIVE_JOB_STATUSES.has(status);
}

export async function controlJob(jobId: string, action: JobControlAction) {
  const job = await getJob(jobId);

  if (!job) {
    throw new Error(`Job ${jobId} was not found.`);
  }

  if (isTerminalJobStatus(job.status)) {
    throw new Error("This job has already finished and can no longer be controlled.");
  }

  if (action === "pause") {
    if (!isResumableStatus(job.status) || !job.workerPid) {
      throw new Error("Only an actively running job can be paused.");
    }

    if (!signalJobProcess(job.workerPid, "SIGSTOP")) {
      throw new Error("The background worker is no longer running.");
    }

    return updateJob(jobId, (current) => ({
      ...current,
      status: "paused",
      resumeStatus: isResumableStatus(current.status) ? current.status : current.resumeStatus,
      currentStage: current.currentStage || "Paused by user.",
      error: undefined
    }));
  }

  if (action === "resume") {
    if (job.status !== "paused" || !job.workerPid) {
      throw new Error("Only a paused job can be resumed.");
    }

    if (!signalJobProcess(job.workerPid, "SIGCONT")) {
      throw new Error("The background worker is no longer running.");
    }

    return updateJob(jobId, (current) => ({
      ...current,
      status: current.resumeStatus || "running_pipeline",
      resumeStatus: undefined,
      lastHeartbeatAt: new Date().toISOString(),
      error: undefined
    }));
  }

  if (job.workerPid) {
    signalJobProcess(job.workerPid, "SIGTERM");
  }

  return updateJob(jobId, (current) => ({
    ...current,
    status: "stopped",
    workerPid: undefined,
    resumeStatus: undefined,
    currentStage: "Stopped by user.",
    error: "Stopped by user."
  }));
}

export async function listJobs(limit = 12) {
  await ensureAppDirectories();
  const entries = await readdir(jobsRoot, { withFileTypes: true });
  const jobs = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => reconcileJob(entry.name))
  );

  return jobs
    .filter((job): job is JobRecord => Boolean(job))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}
