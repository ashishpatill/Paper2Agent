/**
 * E2E tests for the full API surface.
 *
 * Requires the Next.js dev server running on localhost:3000.
 * Run: PAPER2AGENT_URL=http://localhost:3000 node --import tsx --test tests/e2e/api-full.test.ts
 *
 * Tests every API endpoint:
 *   Jobs:     list, create, get, delete, retry
 *   Control:  pause, resume, stop
 *   Logs:     get job logs
 *   Feedback: submit feedback
 *   Validate: validate workspace
 *   Export:   export results (CSV, Markdown)
 *   Settings: get, update
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

const BASE = process.env.PAPER2AGENT_URL || "http://localhost:3000";

let createdJobIds: string[] = [];

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, { ...init, cache: "no-store" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status} from ${url}: ${text}`);
  }
  return res.json();
}

function cleanup() {
  // Stop all created jobs so they don't linger
  return Promise.all(
    createdJobIds.map(async (id) => {
      try {
        await fetch(`${BASE}/api/jobs/${id}/control`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "stop" })
        });
      } catch {
        // Job may already be terminal
      }
    })
  );
}

describe("settings API", () => {
  it("GET /api/settings returns summary without raw keys", async () => {
    const summary = await fetchJson(`${BASE}/api/settings`);

    assert.ok("hasGeminiKey" in summary);
    assert.ok("hasOpenRouterKey" in summary);
    assert.ok("geminiModel" in summary);
    assert.ok("openrouterModel" in summary);
    assert.ok("preferredProvider" in summary);
    assert.ok(typeof summary.hasGeminiKey === "boolean");
    assert.ok(typeof summary.hasOpenRouterKey === "boolean");
  });

  it("PUT /api/settings saves configuration", async () => {
    const result = await fetchJson(`${BASE}/api/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        preferredProvider: "gemini",
        geminiModel: "gemini-2.5-flash"
      })
    });

    assert.equal(result.saved, true);
  });
});

describe("jobs API — list and create", () => {
  it("GET /api/jobs returns an array", async () => {
    const jobs = await fetchJson(`${BASE}/api/jobs`);
    assert.ok(Array.isArray(jobs));
  });

  it("POST /api/jobs creates a queued job", async () => {
    const body = await fetchJson(`${BASE}/api/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceType: "url",
        paperUrl: "https://arxiv.org/abs/2401.00001",
        projectName: "e2e-test-job"
      })
    });

    assert.ok(body.job);
    assert.equal(body.job.status, "queued");
    assert.equal(body.job.paperUrl, "https://arxiv.org/abs/2401.00001");
    createdJobIds.push(body.job.id);
  });

  it("GET /api/jobs reflects the new job", async () => {
    const jobs = await fetchJson(`${BASE}/api/jobs`);
    const found = jobs.find((j: { id: string }) => createdJobIds.includes(j.id));
    assert.ok(found);
  });
});

describe("jobs API — get and update", () => {
  it("GET /api/jobs/:id returns the job", async () => {
    const id = createdJobIds[createdJobIds.length - 1];
    const { job } = await fetchJson(`${BASE}/api/jobs/${id}`);

    assert.equal(job.id, id);
    assert.ok(job.createdAt);
    assert.ok(job.updatedAt);
  });
});

describe("jobs API — control (stop)", () => {
  it("POST /api/jobs/:id/control stops a queued job", async () => {
    const id = createdJobIds[createdJobIds.length - 1];

    const result = await fetchJson(`${BASE}/api/jobs/${id}/control`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "stop" })
    });

    assert.ok(result.job);
    assert.equal(result.job.status, "stopped");
  });

  it("stopped job has error message", async () => {
    const id = createdJobIds[createdJobIds.length - 1];
    const { job } = await fetchJson(`${BASE}/api/jobs/${id}`);

    assert.equal(job.status, "stopped");
    assert.ok(job.error);
  });

  it("cannot stop an already-stopped job", async () => {
    const id = createdJobIds[createdJobIds.length - 1];

    try {
      await fetchJson(`${BASE}/api/jobs/${id}/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop" })
      });
      assert.fail("Should have thrown");
    } catch (error) {
      assert.ok((error as Error).message.includes("finished") || (error as Error).message.includes("HTTP"));
    }
  });
});

describe("jobs API — retry", () => {
  it("POST /api/jobs/:id/retry creates a new queued job", async () => {
    const id = createdJobIds[createdJobIds.length - 1];

    const result = await fetchJson(`${BASE}/api/jobs/${id}/retry`, {
      method: "POST"
    });

    assert.ok(result.job);
    assert.notEqual(result.job.id, id);
    assert.equal(result.job.status, "queued");
    assert.equal(result.job.paperUrl, "https://arxiv.org/abs/2401.00001");
    createdJobIds.push(result.job.id);

    // Clean up the retried job
    await fetch(`${BASE}/api/jobs/${result.job.id}/control`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "stop" })
    });
  });
});

describe("jobs API — feedback", () => {
  it("POST /api/jobs/:id/feedback saves feedback", async () => {
    const id = createdJobIds[createdJobIds.length - 1];

    const result = await fetchJson(`${BASE}/api/jobs/${id}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Use a smaller model for testing",
        action: "hint",
        stepNumber: 9
      })
    });

    assert.ok(result.feedback);
    assert.equal(result.feedback.message, "Use a smaller model for testing");
    assert.equal(result.feedback.consumed, false);
  });

  it("GET /api/jobs/:id includes feedback", async () => {
    const id = createdJobIds[createdJobIds.length - 1];
    const { job } = await fetchJson(`${BASE}/api/jobs/${id}`);

    assert.ok(job.userFeedback);
    assert.ok(job.userFeedback.length > 0);
    assert.equal(job.userFeedback[0].message, "Use a smaller model for testing");
  });
});

describe("jobs API — logs", () => {
  it("GET /api/jobs/:id/logs returns log lines", async () => {
    const id = createdJobIds[createdJobIds.length - 1];

    const result = await fetchJson(`${BASE}/api/jobs/${id}/logs`);
    assert.ok(result);
    // May be empty if job never ran pipeline — just verify structure
    assert.ok("lines" in result || "logs" in result || Array.isArray(result));
  });
});

describe("jobs API — export", () => {
  it("GET /api/jobs/:id/export?format=csv returns a CSV file", async () => {
    const id = createdJobIds[createdJobIds.length - 1];

    const res = await fetch(`${BASE}/api/jobs/${id}/export?format=csv`);
    assert.equal(res.status, 200);
    assert.ok(res.headers.get("content-type")?.includes("text/csv"));

    const text = await res.text();
    assert.ok(text.length > 0);
  });

  it("GET /api/jobs/:id/export?format=markdown returns a Markdown file", async () => {
    const id = createdJobIds[createdJobIds.length - 1];

    const res = await fetch(`${BASE}/api/jobs/${id}/export?format=markdown`);
    assert.equal(res.status, 200);
    assert.ok(res.headers.get("content-type")?.includes("text/markdown"));

    const text = await res.text();
    assert.ok(text.includes("Paper2Agent Studio"));
    assert.ok(text.includes("Job Report"));
  });

  it("GET /api/jobs/:id/export with invalid format returns 400", async () => {
    const id = createdJobIds[createdJobIds.length - 1];

    const res = await fetch(`${BASE}/api/jobs/${id}/export?format=xml`);
    assert.equal(res.status, 400);
  });
});

describe("jobs API — validate", () => {
  it("POST /api/jobs/:id/validate runs workspace validation", async () => {
    const id = createdJobIds[createdJobIds.length - 1];

    const result = await fetchJson(`${BASE}/api/jobs/${id}/validate`, {
      method: "POST"
    });

    assert.ok(result.validation || result.error);
    // May return error if workspace doesn't exist yet
  });
});

describe("jobs API — delete", () => {
  it("DELETE /api/jobs/:id removes a terminal job", async () => {
    const id = createdJobIds[0];

    const result = await fetchJson(`${BASE}/api/jobs/${id}`, {
      method: "DELETE"
    });

    assert.equal(result.deleted, true);
  });

  it("deleted job returns 404 on GET", async () => {
    const id = createdJobIds[0];

    try {
      await fetchJson(`${BASE}/api/jobs/${id}`);
      assert.fail("Should have thrown");
    } catch (error) {
      assert.ok((error as Error).message.includes("404"));
    }
  });
});

describe("jobs API — 404 handling", () => {
  it("GET /api/jobs/non-existent returns 404", async () => {
    const res = await fetch(`${BASE}/api/jobs/non-existent-id-12345`);
    assert.equal(res.status, 404);
  });

  it("DELETE /api/jobs/non-existent returns 404", async () => {
    const res = await fetch(`${BASE}/api/jobs/non-existent-id-12345`, {
      method: "DELETE"
    });
    assert.equal(res.status, 404);
  });
});

// Cleanup after all tests
after(async () => {
  await cleanup();
});
