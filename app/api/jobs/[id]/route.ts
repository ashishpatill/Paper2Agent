import { NextResponse } from "next/server";

import { deleteJob, getJob, reconcileJob } from "@/lib/server/jobs";
import { attachWorkspaceAssessment } from "@/lib/server/workspace-assessment";

export async function GET(
  _request: Request,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  const { id } = await context.params;
  const job = await reconcileJob(id);

  if (!job) {
    return new NextResponse("Job not found.", { status: 404 });
  }

  return NextResponse.json(await attachWorkspaceAssessment(job));
}

export async function DELETE(
  _request: Request,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  const { id } = await context.params;
  try {
    const deleted = await deleteJob(id);
    if (!deleted) {
      return new NextResponse("Job not found.", { status: 404 });
    }
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return new NextResponse(
      error instanceof Error ? error.message : "Failed to delete job.",
      { status: 400 }
    );
  }
}
