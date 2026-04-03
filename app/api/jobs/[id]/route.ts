import { NextResponse } from "next/server";

import { getJob, reconcileJob } from "@/lib/server/jobs";
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
