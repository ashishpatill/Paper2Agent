import test from "node:test";
import assert from "node:assert/strict";

import { planQueuedJobStarts } from "../lib/server/job-runner";
import type { JobRecord } from "../lib/server/types";

function makeJob(overrides: Partial<JobRecord> & Pick<JobRecord, "id" | "createdAt" | "updatedAt" | "status">): JobRecord {
  return {
    id: overrides.id,
    createdAt: overrides.createdAt,
    updatedAt: overrides.updatedAt,
    status: overrides.status,
    sourceType: "url",
    currentStage: overrides.currentStage,
    workerPid: overrides.workerPid,
    lastHeartbeatAt: overrides.lastHeartbeatAt,
    lastProgressAt: overrides.lastProgressAt
  };
}

test("queue planner starts the oldest queued jobs up to capacity", () => {
  const { activeJobs, queuedJobs, jobsToStart } = planQueuedJobStarts(
    [
      makeJob({
        id: "queued-2",
        status: "queued",
        createdAt: "2026-04-01T10:02:00.000Z",
        updatedAt: "2026-04-01T10:02:00.000Z"
      }),
      makeJob({
        id: "running-1",
        status: "running_pipeline",
        createdAt: "2026-04-01T10:00:00.000Z",
        updatedAt: "2026-04-01T10:05:00.000Z",
        workerPid: 111
      }),
      makeJob({
        id: "queued-1",
        status: "queued",
        createdAt: "2026-04-01T10:01:00.000Z",
        updatedAt: "2026-04-01T10:01:00.000Z"
      })
    ],
    2
  );

  assert.deepEqual(activeJobs.map((job) => job.id), ["running-1"]);
  assert.deepEqual(queuedJobs.map((job) => job.id), ["queued-1", "queued-2"]);
  assert.deepEqual(jobsToStart.map((job) => job.id), ["queued-1"]);
});

test("queue planner treats paused jobs as occupying capacity", () => {
  const { jobsToStart } = planQueuedJobStarts(
    [
      makeJob({
        id: "paused-1",
        status: "paused",
        createdAt: "2026-04-01T10:00:00.000Z",
        updatedAt: "2026-04-01T10:10:00.000Z",
        workerPid: 222
      }),
      makeJob({
        id: "queued-1",
        status: "queued",
        createdAt: "2026-04-01T10:01:00.000Z",
        updatedAt: "2026-04-01T10:01:00.000Z"
      })
    ],
    1
  );

  assert.equal(jobsToStart.length, 0);
});
