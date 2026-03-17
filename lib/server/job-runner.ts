import { spawn } from "node:child_process";

import { updateJob } from "./jobs";

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
