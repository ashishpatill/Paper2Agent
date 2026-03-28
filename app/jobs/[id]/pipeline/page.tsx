import { notFound } from "next/navigation";

import { getJob } from "@/lib/server/jobs";
import { PipelineTimeline } from "@/components/pipeline-timeline";
import { LogViewer } from "@/components/log-viewer";

export default async function PipelinePage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) notFound();

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight">
          Pipeline
        </h1>
        <p className="text-sm text-muted-foreground">
          {job.analysis?.title || job.projectName || job.id}
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <PipelineTimeline job={job} />
        <LogViewer jobId={job.id} initialLogPath={job.logPath} />
      </div>
    </div>
  );
}
