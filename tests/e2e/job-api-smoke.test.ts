/**
 * E2E smoke test — requires the web studio to be running on localhost:3000.
 * Run with: node --import tsx --test tests/e2e/job-api-smoke.test.ts
 *
 * Tests the job API lifecycle:
 *   POST /api/jobs → job is queued
 *   GET  /api/jobs → job appears in list
 *   GET  /api/jobs/:id → job record is well-formed
 *   POST /api/jobs/:id/control (stop) → job is stopped
 */

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

const BASE = process.env.PAPER2AGENT_URL || "http://localhost:3000";
const TEST_PAPER_URL = "https://arxiv.org/abs/1706.03762"; // Attention Is All You Need

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status} from ${url}: ${text}`);
  }
  return res.json();
}

let jobId: string;

describe("job API smoke test", { timeout: 30_000 }, () => {
  before(async () => {
    // Verify server is reachable
    try {
      await fetch(`${BASE}/api/jobs`);
    } catch {
      throw new Error(
        `Cannot reach ${BASE}. Start the studio with 'npm run dev' before running e2e tests.`
      );
    }
  });

  it("creates a new job via POST /api/jobs", async () => {
    const body = await fetchJson(`${BASE}/api/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paperUrl: TEST_PAPER_URL }),
    });
    assert.ok(body.id, "response should have an id");
    assert.equal(body.status, "queued", "new job should be queued");
    assert.equal(body.paperUrl, TEST_PAPER_URL);
    jobId = body.id;
  });

  it("job appears in GET /api/jobs list", async () => {
    const list = await fetchJson(`${BASE}/api/jobs`);
    assert.ok(Array.isArray(list), "should return an array");
    const found = list.find((j: { id: string }) => j.id === jobId);
    assert.ok(found, `job ${jobId} should appear in list`);
  });

  it("GET /api/jobs/:id returns a well-formed job record", async () => {
    const job = await fetchJson(`${BASE}/api/jobs/${jobId}`);
    assert.equal(job.id, jobId);
    assert.ok(job.createdAt, "should have createdAt");
    assert.ok(job.updatedAt, "should have updatedAt");
    assert.ok(["queued", "analyzing", "running_pipeline"].includes(job.status), "should be in an active state");
  });

  it("stops the job via POST /api/jobs/:id/control", async () => {
    const result = await fetchJson(`${BASE}/api/jobs/${jobId}/control`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "stop" }),
    });
    assert.ok(result, "stop should return a response");

    // Poll until stopped (up to 10s)
    let stopped = false;
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const job = await fetchJson(`${BASE}/api/jobs/${jobId}`);
      if (job.status === "stopped") { stopped = true; break; }
    }
    assert.ok(stopped, "job should reach stopped status within 10s");
  });

  it("stopped job can be retried via POST /api/jobs/:id/retry", async () => {
    const newJob = await fetchJson(`${BASE}/api/jobs/${jobId}/retry`, { method: "POST" });
    assert.ok(newJob.id, "retry should return a new job id");
    assert.notEqual(newJob.id, jobId, "retry should create a new job");
    assert.equal(newJob.status, "queued");

    // Clean up the retried job too
    await fetch(`${BASE}/api/jobs/${newJob.id}/control`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "stop" }),
    });
  });
});
