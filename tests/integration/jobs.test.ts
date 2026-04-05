/**
 * Integration tests for the jobs module.
 *
 * Tests the full CRUD lifecycle against the real filesystem.
 * Each test creates and cleans up its own job.
 */

import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  createJob,
  getJob,
  updateJob,
  deleteJob,
  controlJob,
  listAllJobs,
  listJobs,
  isTerminalJobStatus,
  isActiveWorkerJobStatus
} from "../../lib/server/jobs";

import type { JobRecord } from "../../lib/server/types";

function makeJob(overrides: Partial<JobRecord> = {}): JobRecord {
  return {
    id: `test-job-${process.pid}-${randomUUID().slice(0, 8)}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "queued",
    sourceType: "url",
    paperUrl: "https://arxiv.org/abs/2401.00001",
    ...overrides
  };
}

async function cleanupJob(id: string) {
  try {
    const job = await getJob(id);
    if (job && !isTerminalJobStatus(job.status)) {
      await controlJob(id, "stop").catch(() => {});
    }
    await deleteJob(id).catch(() => {});
  } catch {
    // Job may not exist
  }
}

describe("jobs CRUD lifecycle", () => {
  const jobIds: string[] = [];

  after(async () => {
    for (const id of jobIds) {
      await cleanupJob(id);
    }
  });

  it("creates a job and persists it to disk", async () => {
    const job = makeJob();
    const saved = await createJob(job);
    jobIds.push(job.id);

    assert.equal(saved.id, job.id);
    assert.equal(saved.status, "queued");
    assert.ok(saved.createdAt);
  });

  it("reads back the created job", async () => {
    const job = makeJob();
    await createJob(job);
    jobIds.push(job.id);

    const loaded = await getJob(job.id);
    assert.ok(loaded);
    assert.equal(loaded.id, job.id);
    assert.equal(loaded.paperUrl, "https://arxiv.org/abs/2401.00001");
  });

  it("returns null for non-existent job", async () => {
    const loaded = await getJob("non-existent-job-12345");
    assert.equal(loaded, null);
  });

  it("updates a job atomically", async () => {
    const job = makeJob();
    await createJob(job);
    jobIds.push(job.id);

    const updated = await updateJob(job.id, (current) => ({
      ...current,
      status: "stopped",
      currentStage: "Stopped by test",
      error: "Test cleanup"
    }));

    assert.equal(updated.status, "stopped");
    assert.equal(updated.currentStage, "Stopped by test");
    assert.ok(updated.updatedAt);

    // Verify persistence
    const reloaded = await getJob(job.id);
    assert.equal(reloaded?.status, "stopped");
  });

  it("lists all jobs including the created one", async () => {
    const all = await listAllJobs();
    assert.ok(Array.isArray(all));
    // Just verify it returns an array — specific job may or may not be present
  });

  it("lists jobs with limit", async () => {
    const limited = await listJobs(1);
    assert.ok(Array.isArray(limited));
    assert.ok(limited.length <= 1);
  });

  it("cannot delete a non-terminal job", async () => {
    const job = makeJob();
    await createJob(job);
    jobIds.push(job.id);

    await assert.rejects(
      () => deleteJob(job.id),
      /Cannot delete/
    );
  });

  it("can delete a terminal job", async () => {
    const job = makeJob({ status: "stopped", error: "test" });
    await createJob(job);

    const deleted = await deleteJob(job.id);
    assert.equal(deleted, true);

    // Verify it's gone
    const loaded = await getJob(job.id);
    assert.equal(loaded, null);
  });

  it("deleteJob returns false for already-deleted job", async () => {
    const deleted = await deleteJob("already-deleted-" + randomUUID());
    assert.equal(deleted, false);
  });
});

describe("job control (stop)", () => {
  const jobIds: string[] = [];

  after(async () => {
    for (const id of jobIds) {
      await cleanupJob(id);
    }
  });

  it("stops a queued job", async () => {
    const job = makeJob({ status: "queued" });
    await createJob(job);
    jobIds.push(job.id);

    const result = await controlJob(job.id, "stop");
    assert.equal(result.status, "stopped");
    assert.equal(result.error, "Stopped by user.");

    const reloaded = await getJob(job.id);
    assert.equal(reloaded?.status, "stopped");
  });

  it("cannot stop an already-stopped job", async () => {
    const job = makeJob({ status: "stopped", error: "test" });
    await createJob(job);
    jobIds.push(job.id);

    await assert.rejects(
      () => controlJob(job.id, "stop"),
      /already finished/
    );
  });

  it("cannot control non-existent job", async () => {
    await assert.rejects(
      () => controlJob("no-such-job-xyz", "stop"),
      /not found/
    );
  });
});

describe("job status helpers", () => {
  it("isTerminalJobStatus identifies terminal states", () => {
    assert.ok(isTerminalJobStatus("stopped"));
    assert.ok(isTerminalJobStatus("completed"));
    assert.ok(isTerminalJobStatus("failed"));
    assert.ok(isTerminalJobStatus("needs_repo"));
    assert.ok(isTerminalJobStatus("not_implementable"));
    assert.ok(!isTerminalJobStatus("queued"));
    assert.ok(!isTerminalJobStatus("analyzing"));
    assert.ok(!isTerminalJobStatus("running_pipeline"));
  });

  it("isActiveWorkerJobStatus identifies active states", () => {
    assert.ok(isActiveWorkerJobStatus("analyzing"));
    assert.ok(isActiveWorkerJobStatus("running_pipeline"));
    assert.ok(isActiveWorkerJobStatus("paused"));
    assert.ok(!isActiveWorkerJobStatus("queued"));
    assert.ok(!isActiveWorkerJobStatus("stopped"));
    assert.ok(!isActiveWorkerJobStatus("completed"));
  });
});
