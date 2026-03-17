import { NextResponse } from "next/server";

import { controlJob, type JobControlAction } from "@/lib/server/jobs";

export async function POST(
  request: Request,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { action?: JobControlAction } | null;

  if (!body?.action || !["pause", "resume", "stop"].includes(body.action)) {
    return new NextResponse("Invalid job control action.", { status: 400 });
  }

  try {
    const job = await controlJob(id, body.action);
    return NextResponse.json(job);
  } catch (error) {
    return new NextResponse(
      error instanceof Error ? error.message : "Failed to control the job.",
      { status: 409 }
    );
  }
}
