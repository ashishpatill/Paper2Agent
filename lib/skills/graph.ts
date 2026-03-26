import type { PaperAnalysis, SkillGraph, SkillGraphNode, SkillLevel } from "../server/types";

import { defaultSkillLevels, skillCatalog } from "./catalog";

function normalizeText(values: string[]) {
  return values.join(" ").toLowerCase();
}

function levelReason(id: string, analysis: PaperAnalysis, hasRepositoryUrl: boolean): string {
  const capabilityText = normalizeText(analysis.capabilities);
  const hasResults = analysis.reported_results && analysis.reported_results.length > 0;

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
    case "gap-analysis":
      return "Gap analysis routes the pipeline between tutorial extraction and paper implementation tracks.";
    case "paper-coder":
      return hasResults
        ? "The paper reports specific experimental results that need implementation to reproduce."
        : "Generates experiment code for capabilities not covered by tutorials.";
    case "experiment-runner":
      return "Executes generated experiment code safely with structured metric capture.";
    case "results-comparator":
      return hasResults
        ? "The paper has reported results that need validation against implementation outputs."
        : "Compares experiment outputs to expected behavior when reported results are available.";
    case "fix-loop":
      return "Iteratively refines implementation when results diverge from the paper's findings.";
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
  const hasResults = analysis.reported_results && analysis.reported_results.length > 0;
  const hasDatasets = analysis.datasets_required && analysis.datasets_required.length > 0;

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

  // Promote implementation track skills when the paper has reported results or datasets
  if (hasResults && ["paper-coder", "experiment-runner", "results-comparator", "fix-loop"].includes(id)) {
    return "core";
  }

  if (hasDatasets && id === "paper-coder") {
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
    reported_results: [],
    datasets_required: [],
    suggestedQuestions: [],
    setupNotes: []
  };

  return buildSkillGraph({
    analysis: fallbackAnalysis,
    hasRepositoryUrl: false
  });
}
