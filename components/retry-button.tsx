"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RefreshCcw } from "lucide-react";

import type { JobRecord, JobStatus } from "@/lib/server/types";
import { Button } from "@/components/ui/button";

const RETRYABLE: JobStatus[] = ["failed", "needs_repo", "completed", "stopped", "not_implementable"];

export function RetryButton({ job }: { job: Pick<JobRecord, "id" | "status"> }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!RETRYABLE.includes(job.status)) return null;

  async function handleRetry() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/jobs/${job.id}/retry`, { method: "POST" });
      if (!res.ok) {
        setError(await res.text());
        return;
      }
      const newJob = (await res.json()) as JobRecord;
      router.push(`/jobs/${newJob.id}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant="outline" onClick={handleRetry} disabled={loading}>
        <RefreshCcw className={loading ? "animate-spin" : ""} />
        Retry
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
