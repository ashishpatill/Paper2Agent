import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { nanoid } from "nanoid";
import { NextResponse } from "next/server";

import { ensureAppDirectories, uploadsRoot } from "@/lib/server/fs";
import { createJob, getJob } from "@/lib/server/jobs";
import { scheduleQueuedJobs } from "@/lib/server/job-runner";
import type { JobRecord } from "@/lib/server/types";

export async function POST(
  _request: Request,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  await ensureAppDirectories();

  const { id: sourceJobId } = await context.params;
  const sourceJob = await getJob(sourceJobId);

  if (!sourceJob) {
    return new NextResponse("Job not found.", { status: 404 });
  }

  const id = nanoid(10);
  const now = new Date().toISOString();
  const retryJob: JobRecord = {
    id,
    createdAt: now,
    updatedAt: now,
    status: "queued",
    currentStage: "Queued. Waiting for an available worker slot.",
    progressPercent: 12,
    lastHeartbeatAt: now,
    lastProgressAt: now,
    sourceType: sourceJob.sourceType,
    paperUrl: sourceJob.paperUrl,
    repositoryUrl: sourceJob.repositoryUrl,
    projectName: sourceJob.projectName,
    notes: sourceJob.notes,
    uploadedPdfName: sourceJob.uploadedPdfName
  };

  if (sourceJob.sourceType === "pdf" && sourceJob.uploadedPdfName) {
    const fromDir = path.join(uploadsRoot, sourceJob.id);
    const toDir = path.join(uploadsRoot, id);
    await mkdir(toDir, { recursive: true });
    await copyFile(
      path.join(fromDir, sourceJob.uploadedPdfName),
      path.join(toDir, sourceJob.uploadedPdfName)
    );
  }

  await createJob(retryJob);

  try {
    await scheduleQueuedJobs();
  } catch (error) {
    return new NextResponse(
      error instanceof Error ? error.message : "Failed to start background worker.",
      { status: 500 }
    );
  }

  return NextResponse.json((await getJob(id)) || retryJob, { status: 201 });
}
