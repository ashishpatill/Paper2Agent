import { spawn } from "node:child_process";
import { open, unlink } from "node:fs/promises";
import path from "node:path";

import { listAllJobs, isActiveWorkerJobStatus, updateJob } from "./jobs";
import { jobsRoot } from "./fs";
import type { JobRecord } from "./types";

const DEFAULT_MAX_CONCURRENT_JOBS = 1;

let schedulerRun: Promise<void> = Promise.resolve();

function startClaimPath(jobId: string) {
  return path.join(jobsRoot, jobId, ".start-claim.lock");
}

async function claimJobStart(jobId: string) {
  try {
    const handle = await open(startClaimPath(jobId), "wx");
    await handle.close();
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      return false;
    }

    throw error;
  }
}

async function releaseJobStartClaim(jobId: string) {
  try {
    await unlink(startClaimPath(jobId));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

export async function spawnJobWorker(jobId: string) {
  const child = spawn(process.execPath, ["--import", "tsx", "scripts/run-paper-job.ts", jobId], {
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore"
  });

  try {
    await new Promise<void>((resolve, reject) => {
      child.once("spawn", () => {
        void updateJob(jobId, (current) => ({
          ...current,
          workerPid: child.pid,
          lastHeartbeatAt: new Date().toISOString(),
          lastProgressAt: current.lastProgressAt || new Date().toISOString(),
          currentStage: current.currentStage || "Background worker started.",
          progressPercent: current.progressPercent ?? 12
        }));
        child.unref();
        resolve();
      });
      child.once("error", reject);
    });
  } catch (error) {
    await updateJob(jobId, (current) => ({
      ...current,
      status: "failed",
      error: error instanceof Error ? error.message : "Failed to start background worker."
    }));

    throw error;
  }
}

export function getMaxConcurrentJobs() {
  const parsed = Number.parseInt(process.env.PAPER2AGENT_MAX_CONCURRENT_JOBS || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_CONCURRENT_JOBS;
}

export function planQueuedJobStarts(jobs: JobRecord[], maxConcurrentJobs = getMaxConcurrentJobs()) {
  const activeJobs = jobs
    .filter((job) => isActiveWorkerJobStatus(job.status))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const queuedJobs = jobs
    .filter((job) => job.status === "queued" && !job.workerPid)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const availableSlots = Math.max(0, maxConcurrentJobs - activeJobs.length);

  return {
    activeJobs,
    queuedJobs,
    jobsToStart: queuedJobs.slice(0, availableSlots),
    queuedBacklog: queuedJobs.slice(availableSlots)
  };
}

async function updateQueuedBacklog(jobs: JobRecord[], jobsToStart: JobRecord[]) {
  const startingIds = new Set(jobsToStart.map((job) => job.id));

  await Promise.all(
    jobs.map(async (job, index) => {
      if (job.status !== "queued" || job.workerPid || startingIds.has(job.id)) {
        return;
      }

      const queuePosition = index + 1;
      const stage = `Queued. Waiting for an available worker slot (queue position ${queuePosition}).`;

      if (job.currentStage === stage) {
        return;
      }

      await updateJob(job.id, (current) => ({
        ...current,
        currentStage: stage,
        progressPercent: current.progressPercent ?? 8
      }));
    })
  );
}

async function runQueueScheduler() {
  const jobs = await listAllJobs();
  const { jobsToStart, queuedBacklog } = planQueuedJobStarts(jobs);

  await updateQueuedBacklog(queuedBacklog, jobsToStart);

  for (const job of jobsToStart) {
    const claimed = await claimJobStart(job.id);
    if (!claimed) {
      continue;
    }

    try {
      const latest = await updateJob(job.id, (current) => {
        if (current.status !== "queued" || current.workerPid) {
          return current;
        }

        return {
          ...current,
          currentStage: "Queued job is starting on an available worker.",
          progressPercent: Math.max(current.progressPercent ?? 12, 12),
          lastHeartbeatAt: new Date().toISOString()
        };
      });

      if (latest.status !== "queued" || latest.workerPid) {
        continue;
      }

      await spawnJobWorker(job.id);
    } finally {
      await releaseJobStartClaim(job.id);
    }
  }
}

export async function scheduleQueuedJobs() {
  schedulerRun = schedulerRun.then(runQueueScheduler, runQueueScheduler);
  return schedulerRun;
}
