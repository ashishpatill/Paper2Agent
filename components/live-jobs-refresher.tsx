"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Invisible component that refreshes the page every `intervalMs` while
 * any job is in an active state. Drop it anywhere in the server-rendered
 * jobs list to get live-ish stage updates without a full client rewrite.
 */
export function LiveJobsRefresher({
  hasActiveJobs,
  intervalMs = 8000
}: {
  hasActiveJobs: boolean;
  intervalMs?: number;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!hasActiveJobs) return;
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [hasActiveJobs, intervalMs, router]);

  return null;
}
