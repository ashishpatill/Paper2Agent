import test from "node:test";
import assert from "node:assert/strict";

import { buildSkillGraph, buildDefaultSkillGraph } from "../lib/skills/graph";
import type { PaperAnalysis } from "../lib/server/types";

// ---------------------------------------------------------------------------
// Skill Graph Tests
// ---------------------------------------------------------------------------

function createMinimalAnalysis(overrides?: Partial<PaperAnalysis>): PaperAnalysis {
  return {
    title: "Test Paper",
    abstract: "A test paper for skill graph validation.",
    summary: "Test summary",
    projectSlug: "test-paper",
    repositoryUrl: "https://github.com/example/repo",
    confidence: "high",
    capabilities: ["tutorial execution", "tool extraction"],
    reported_results: [],
    datasets_required: [],
    suggestedQuestions: [],
    setupNotes: [],
    ...overrides
  };
}

test("buildSkillGraph returns all 14 skills", () => {
  const analysis = createMinimalAnalysis();
  const graph = buildSkillGraph({ analysis, hasRepositoryUrl: true });

  assert.equal(graph.nodes.length, 14);
});

test("buildSkillGraph produces edges from dependencies", () => {
  const analysis = createMinimalAnalysis();
  const graph = buildSkillGraph({ analysis, hasRepositoryUrl: true });

  // paper-intake → repo-recon is a known edge
  const hasIntakeEdge = graph.edges.some(
    (e) => e.from === "paper-intake" && e.to === "repo-recon"
  );
  assert.ok(hasIntakeEdge, "Should have edge from paper-intake to repo-recon");
});

test("buildSkillGraph sets repo-recon to core when no repository URL", () => {
  const analysis = createMinimalAnalysis({ repositoryUrl: undefined });
  const graph = buildSkillGraph({ analysis, hasRepositoryUrl: false });

  const repoRecon = graph.nodes.find((n) => n.id === "repo-recon");
  assert.ok(repoRecon, "repo-recon should exist");
  assert.equal(repoRecon?.level, "core");
});

test("buildSkillGraph promotes implementation skills when paper has results", () => {
  const analysis = createMinimalAnalysis({
    reported_results: [
      { experiment: "exp1", metric: "accuracy", value: 0.92 }
    ]
  });
  const graph = buildSkillGraph({ analysis, hasRepositoryUrl: true });

  const paperCoder = graph.nodes.find((n) => n.id === "paper-coder");
  const experimentRunner = graph.nodes.find((n) => n.id === "experiment-runner");

  assert.equal(paperCoder?.level, "core", "paper-coder should be promoted to core");
  assert.equal(experimentRunner?.level, "core", "experiment-runner should be promoted to core");
});

test("buildSkillGraph promotes benchmark-evaluation when paper mentions benchmark", () => {
  const analysis = createMinimalAnalysis({
    capabilities: ["tutorial execution", "benchmark evaluation"]
  });
  const graph = buildSkillGraph({ analysis, hasRepositoryUrl: true });

  const benchmarkEval = graph.nodes.find((n) => n.id === "benchmark-evaluation");
  assert.equal(benchmarkEval?.level, "recommended");
});

test("buildSkillGraph promotes coverage-quality when paper mentions test", () => {
  const analysis = createMinimalAnalysis({
    capabilities: ["tutorial execution", "test validation"]
  });
  const graph = buildSkillGraph({ analysis, hasRepositoryUrl: true });

  const coverageQuality = graph.nodes.find((n) => n.id === "coverage-quality");
  assert.equal(coverageQuality?.level, "core");
});

test("buildSkillGraph promotes paper-coder when datasets required", () => {
  const analysis = createMinimalAnalysis({
    datasets_required: [
      { name: "imagenet", publicly_available: true }
    ]
  });
  const graph = buildSkillGraph({ analysis, hasRepositoryUrl: true });

  const paperCoder = graph.nodes.find((n) => n.id === "paper-coder");
  assert.equal(paperCoder?.level, "core", "paper-coder should be core when datasets needed");
});

test("buildSkillGraph deduplicates recommended Codex skills", () => {
  const analysis = createMinimalAnalysis();
  const graph = buildSkillGraph({ analysis, hasRepositoryUrl: true });

  const skills = graph.recommendedCodexSkills;
  const unique = new Set(skills);

  assert.equal(skills.length, unique.size, "Codex skills should be deduplicated");
});

test("buildSkillGraph deduplicates recommended Claude agents", () => {
  const analysis = createMinimalAnalysis();
  const graph = buildSkillGraph({ analysis, hasRepositoryUrl: true });

  const agents = graph.recommendedClaudeAgents;
  const unique = new Set(agents);

  assert.equal(agents.length, unique.size, "Claude agents should be deduplicated");
});

test("buildSkillGraph provides reason for each skill level", () => {
  const analysis = createMinimalAnalysis();
  const graph = buildSkillGraph({ analysis, hasRepositoryUrl: true });

  for (const node of graph.nodes) {
    assert.ok(
      node.reason.length > 0,
      `Skill ${node.id} should have a reason for its level`
    );
  }
});

test("buildDefaultSkillGraph returns a valid graph", () => {
  const graph = buildDefaultSkillGraph();

  assert.ok(graph.nodes.length > 0, "Should have nodes");
  assert.ok(graph.edges.length > 0, "Should have edges");
  assert.ok(graph.recommendedCodexSkills.length > 0, "Should have recommended Codex skills");
  assert.ok(graph.recommendedClaudeAgents.length > 0, "Should have recommended Claude agents");
});

test("buildSkillGraph skills have correct stage assignments", () => {
  const analysis = createMinimalAnalysis();
  const graph = buildSkillGraph({ analysis, hasRepositoryUrl: true });

  const discover = graph.nodes.filter((n) => n.stage === "discover");
  const build = graph.nodes.filter((n) => n.stage === "build");
  const implement = graph.nodes.filter((n) => n.stage === "implement");
  const package_ = graph.nodes.filter((n) => n.stage === "package");
  const verify = graph.nodes.filter((n) => n.stage === "verify");
  const operate = graph.nodes.filter((n) => n.stage === "operate");

  assert.equal(discover.length, 2, "Discover should have 2 skills");
  assert.equal(build.length, 3, "Build should have 3 skills");
  assert.equal(implement.length, 5, "Implement should have 5 skills");
  assert.equal(package_.length, 1, "Package should have 1 skill");
  assert.equal(verify.length, 2, "Verify should have 2 skills");
  assert.equal(operate.length, 1, "Operate should have 1 skill");
});
