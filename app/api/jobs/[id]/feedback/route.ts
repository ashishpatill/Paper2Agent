import { NextResponse } from "next/server";
import { nanoid } from "nanoid";

import { getJob, updateJob } from "@/lib/server/jobs";
import type { UserFeedback } from "@/lib/server/types";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const job = await getJob(id);

  if (!job) {
    return new NextResponse("Job not found.", { status: 404 });
  }

  const body = await request.json();
  const { message, action, stepNumber } = body as {
    message?: string;
    action?: UserFeedback["action"];
    stepNumber?: number;
  };

  if (!message) {
    return new NextResponse("Message is required.", { status: 400 });
  }

  const feedback: UserFeedback = {
    id: nanoid(8),
    timestamp: new Date().toISOString(),
    message,
    action: action || "hint",
    stepNumber,
    consumed: false,
  };

  const updated = await updateJob(id, (current) => ({
    ...current,
    userFeedback: [...(current.userFeedback || []), feedback],
  }));

  return NextResponse.json({
    success: true,
    feedbackCount: updated.userFeedback?.length || 0,
  });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const job = await getJob(id);

  if (!job) {
    return new NextResponse("Job not found.", { status: 404 });
  }

  return NextResponse.json({
    feedback: job.userFeedback || [],
    pending: (job.userFeedback || []).filter(f => !f.consumed).length,
  });
}
