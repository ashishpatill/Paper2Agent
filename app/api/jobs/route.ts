import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { nanoid } from "nanoid";
import { NextResponse } from "next/server";

import { createJob, getJob, listJobs } from "@/lib/server/jobs";
import { ensureAppDirectories, uploadsRoot } from "@/lib/server/fs";
import { scheduleQueuedJobs } from "@/lib/server/job-runner";
import type { JobRecord } from "@/lib/server/types";

const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;

export async function GET() {
  return NextResponse.json(await listJobs());
}

export async function POST(request: Request) {
  await ensureAppDirectories();
  const formData = await request.formData();
  const sourceType = formData.get("sourceType");

  if (sourceType !== "url" && sourceType !== "pdf") {
    return new NextResponse("Invalid source type.", { status: 400 });
  }

  const id = nanoid(10);
  const now = new Date().toISOString();
  const job: JobRecord = {
    id,
    createdAt: now,
    updatedAt: now,
    status: "queued",
    currentStage: "Queued. Waiting for an available worker slot.",
    progressPercent: 12,
    lastHeartbeatAt: now,
    lastProgressAt: now,
    sourceType,
    paperUrl: typeof formData.get("paperUrl") === "string" ? String(formData.get("paperUrl")) : undefined,
    repositoryUrl:
      typeof formData.get("repositoryUrl") === "string"
        ? String(formData.get("repositoryUrl")).trim() || undefined
        : undefined,
    projectName:
      typeof formData.get("projectName") === "string"
        ? String(formData.get("projectName")).trim() || undefined
        : undefined,
    notes:
      typeof formData.get("notes") === "string"
        ? String(formData.get("notes")).trim() || undefined
        : undefined
  };

  if (sourceType === "url" && !job.paperUrl) {
    return new NextResponse("A paper URL is required.", { status: 400 });
  }

  if (sourceType === "pdf") {
    const file = formData.get("paperPdf");
    if (!(file instanceof File)) {
      return new NextResponse("A paper PDF is required.", { status: 400 });
    }

    if (file.size <= 0) {
      return new NextResponse("The uploaded PDF is empty.", { status: 400 });
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return new NextResponse("The uploaded PDF exceeds the 30MB limit.", { status: 413 });
    }

    const uploadDir = path.join(uploadsRoot, id);
    await mkdir(uploadDir, { recursive: true });
    const uploadPath = path.join(uploadDir, file.name);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(uploadPath, buffer);
    job.uploadedPdfName = file.name;
  }

  await createJob(job);

  try {
    await scheduleQueuedJobs();
  } catch (error) {
    return new NextResponse(
      error instanceof Error ? error.message : "Failed to start background worker.",
      { status: 500 }
    );
  }

  return NextResponse.json((await getJob(id)) || job, { status: 201 });
}
