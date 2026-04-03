import test from "node:test";
import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import path from "node:path";

import { createJob, getJob, updateJob } from "../lib/server/jobs";
import { jobsRoot } from "../lib/server/fs";
import type { JobRecord } from "../lib/server/types";

function makeJob(id: string): JobRecord {
  const now = new Date().toISOString();

  return {
    id,
    createdAt: now,
    updatedAt: now,
    status: "queued",
    sourceType: "url",
    paperUrl: "https://example.com/paper",
    currentStage: "queued",
    progressPercent: 0
  };
}

test("job updates remain atomic under concurrent writes", async () => {
  const jobId = `atomic-update-${Date.now()}`;

  await createJob(makeJob(jobId));

  try {
    await Promise.all(
      Array.from({ length: 40 }, (_, index) =>
        updateJob(jobId, (current) => ({
          ...current,
          currentStage: `stage-${index}`,
          progressPercent: index
        }))
      )
    );

    const updated = await getJob(jobId);

    assert.ok(updated);
    assert.match(updated.currentStage || "", /^stage-\d+$/);
    assert.equal(typeof updated.progressPercent, "number");
  } finally {
    await rm(path.join(jobsRoot, jobId), { recursive: true, force: true });
  }
});
