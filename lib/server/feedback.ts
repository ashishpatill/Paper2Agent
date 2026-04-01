import { getJob, updateJob } from "./jobs";
import type { UserFeedback } from "./types";

export function applyFeedbackConsumption(
  feedback: UserFeedback[],
  displayedStepNumber: number,
  consumedAt: string
) {
  return feedback.map((entry) => {
    if (entry.consumed) {
      return entry;
    }

    return {
      ...entry,
      consumed: true,
      consumedAt,
      consumedByStep: displayedStepNumber
    };
  });
}

export function formatFeedbackOverlay(
  feedback: UserFeedback[],
  displayedStepNumber: number
) {
  const visibleFeedback = feedback
    .filter(
      (entry) =>
        entry.consumed &&
        entry.consumedByStep !== undefined &&
        entry.consumedByStep <= displayedStepNumber
    )
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  if (visibleFeedback.length === 0) {
    return "";
  }

  const lines = visibleFeedback.map((entry) => {
    const parts = [
      new Date(entry.timestamp).toISOString(),
      entry.action || "hint",
      entry.stepNumber ? `requested for step ${entry.stepNumber}` : undefined
    ].filter(Boolean);

    return `- [${parts.join(" | ")}] ${entry.message}`;
  });

  return [
    "User feedback received during this run. Honor these instructions in this and later steps unless they conflict with repository constraints:",
    ...lines
  ].join("\n");
}

export async function consumeFeedbackForStep(jobId: string, displayedStepNumber: number) {
  const job = await getJob(jobId);
  if (!job?.userFeedback || job.userFeedback.length === 0) {
    return "";
  }

  const now = new Date().toISOString();

  const updated = await updateJob(jobId, (current) => ({
    ...current,
    userFeedback: applyFeedbackConsumption(current.userFeedback || [], displayedStepNumber, now)
  }));

  return formatFeedbackOverlay(updated.userFeedback || [], displayedStepNumber);
}
