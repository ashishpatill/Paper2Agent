import { NextResponse } from "next/server";

import { getJob } from "@/lib/server/jobs";
import { tailLog } from "@/lib/server/pipeline";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const job = await getJob(id);

  if (!job) {
    return new NextResponse("Job not found.", { status: 404 });
  }

  if (!job.logPath) {
    return NextResponse.json({ lines: [], total: 0 });
  }

  const url = new URL(request.url);
  const tail = parseInt(url.searchParams.get("tail") || "200", 10);
  const lines = await tailLog(job.logPath, tail);

  return NextResponse.json({ lines, total: lines.length });
}
