import type { PaperAnalysis, SkillGraph, SkillGraphNode, SkillLevel } from "../server/types";

import { defaultSkillLevels, skillCatalog } from "./catalog";

function normalizeText(values: string[]) {
  return values.join(" ").toLowerCase();
}

function levelReason(id: string, analysis: PaperAnalysis, hasRepositoryUrl: boolean): string {
  const capabilityText = normalizeText(analysis.capabilities);

  switch (id) {
    case "paper-intake":
      return "Every paper submission starts by converting messy source material into structured agent context.";
    case "repo-recon":
      return hasRepositoryUrl
        ? "A repository is already known, so recon can validate tutorials and repo boundaries."
        : "No repository is guaranteed yet, so recon is critical before running the pipeline.";
    case "environment-bootstrap":
      return "The pipeline depends on a reproducible Python environment before tutorial execution can begin.";
    case "tutorial-execution":
      return "Paper2Agent builds from runnable examples, so tutorial execution stays on the critical path.";
    case "tool-extraction":
      return "Reusable agent tools are the main artifact this product produces.";
    case "mcp-packaging":
      return "Packaging extracted tools as MCP is what makes them portable to Codex and Claude Code.";
    case "benchmark-evaluation":
      return capabilityText.includes("benchmark") || capabilityText.includes("evaluation")
        ? "The paper appears evaluation-heavy, so benchmark assessment is worth promoting."
        : "Useful once the core flow is stable, but not mandatory for every paper.";
    case "coverage-quality":
      return "Generated tools benefit from automated checks before users trust them.";
    case "workflow-orchestration":
      return "A skill graph helps users and agents understand which specialist should act next.";
    default:
      return "Supports the overall paper-to-agent workflow.";
  }
}

function chooseLevel(id: string, analysis: PaperAnalysis, hasRepositoryUrl: boolean): SkillLevel {
  const baseLevel = defaultSkillLevels[id] ?? "optional";
  const capabilityText = normalizeText(analysis.capabilities);

  if (id === "repo-recon" && !hasRepositoryUrl) {
    return "core";
  }

  if (
    id === "benchmark-evaluation" &&
    (capabilityText.includes("benchmark") ||
      capabilityText.includes("assessment") ||
      capabilityText.includes("evaluation"))
  ) {
    return "recommended";
  }

  if (
    id === "coverage-quality" &&
    (capabilityText.includes("test") || capabilityText.includes("validation"))
  ) {
    return "core";
  }

  return baseLevel;
}

export function buildSkillGraph(options: {
  analysis: PaperAnalysis;
  hasRepositoryUrl: boolean;
}): SkillGraph {
  const nodes: SkillGraphNode[] = skillCatalog.map((entry) => {
    const level = chooseLevel(entry.id, options.analysis, options.hasRepositoryUrl);

    return {
      id: entry.id,
      title: entry.title,
      stage: entry.stage,
      level,
      summary: entry.summary,
      reason: levelReason(entry.id, options.analysis, options.hasRepositoryUrl),
      codexSkill: entry.codexSkill,
      claudeAgent: entry.claudeAgent
    };
  });

  const edges = skillCatalog.flatMap((entry) =>
    entry.dependencies.map((dependency) => ({
      from: dependency,
      to: entry.id
    }))
  );

  const recommendedCodexSkills = nodes
    .filter((node) => node.level !== "optional" && node.codexSkill)
    .map((node) => node.codexSkill as string);

  const recommendedClaudeAgents = nodes
    .filter((node) => node.level !== "optional" && node.claudeAgent)
    .map((node) => node.claudeAgent as string);

  return {
    nodes,
    edges,
    recommendedCodexSkills: Array.from(new Set(recommendedCodexSkills)),
    recommendedClaudeAgents: Array.from(new Set(recommendedClaudeAgents))
  };
}

export function buildDefaultSkillGraph() {
  const fallbackAnalysis: PaperAnalysis = {
    title: "Paper2Agent workflow",
    abstract: "",
    summary: "The base workflow for turning a paper into a portable agent.",
    projectSlug: "paper2agent-workflow",
    confidence: "high",
    capabilities: ["tutorial execution", "tool extraction", "mcp packaging", "validation"],
    suggestedQuestions: [],
    setupNotes: []
  };

  return buildSkillGraph({
    analysis: fallbackAnalysis,
    hasRepositoryUrl: false
  });
}
