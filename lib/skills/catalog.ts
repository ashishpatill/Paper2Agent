import type { SkillLevel, SkillStage } from "../server/types";

export interface SkillCatalogEntry {
  id: string;
  title: string;
  stage: SkillStage;
  summary: string;
  benefit: string;
  tools: string[];
  codexSkill?: string;
  claudeAgent?: string;
  dependencies: string[];
}

export const skillCatalog: SkillCatalogEntry[] = [
  {
    id: "paper-intake",
    title: "Paper intake",
    stage: "discover",
    summary: "Normalize URLs or PDFs into a structured paper brief with capabilities and likely next steps.",
    benefit: "Cuts the time needed to turn raw paper text into an implementation plan.",
    tools: ["Google Gemini API", "OpenRouter API", "pdf-parse", "cheerio"],
    codexSkill: "paper2agent-paper-intake",
    claudeAgent: "paper-intake-strategist",
    dependencies: []
  },
  {
    id: "repo-recon",
    title: "Repository recon",
    stage: "discover",
    summary: "Find or confirm the repository, tutorials, examples, and install surfaces connected to the paper.",
    benefit: "Prevents long pipeline runs against the wrong repo or the wrong tutorial set.",
    tools: ["GitHub URLs", "paper hints", "README scanning"],
    codexSkill: "paper2agent-repo-recon",
    claudeAgent: "repo-recon-specialist",
    dependencies: ["paper-intake"]
  },
  {
    id: "environment-bootstrap",
    title: "Environment bootstrap",
    stage: "build",
    summary: "Create a reproducible runtime that can execute tutorials and extracted tools reliably.",
    benefit: "Reduces environment drift and makes agent creation reproducible.",
    tools: ["uv or venv", "fastmcp", "pytest", "notebook runtime"],
    claudeAgent: "environment-python-manager",
    dependencies: ["repo-recon"]
  },
  {
    id: "tutorial-execution",
    title: "Tutorial execution",
    stage: "build",
    summary: "Locate runnable tutorials and execute them to capture trustworthy intermediate artifacts.",
    benefit: "Anchors extracted tools to examples that actually run.",
    tools: ["tutorial scanner", "tutorial executor", "notebooks"],
    claudeAgent: "tutorial-executor",
    dependencies: ["environment-bootstrap"]
  },
  {
    id: "tool-extraction",
    title: "Tool extraction",
    stage: "build",
    summary: "Convert tutorial sections into reusable data-facing tools rather than one-off notebook code.",
    benefit: "Turns paper implementations into agent-callable functions with clearer boundaries.",
    tools: ["tutorial tool extractor", "tests", "src/tools"],
    claudeAgent: "tutorial-tool-extractor-implementor",
    dependencies: ["tutorial-execution"]
  },
  {
    id: "mcp-packaging",
    title: "MCP packaging",
    stage: "package",
    summary: "Wrap extracted tools as an MCP server that Codex and Claude Code can consume.",
    benefit: "Makes the generated agent portable across coding assistants and tool-aware runtimes.",
    tools: ["FastMCP", "Claude Code MCP", "Codex MCP"],
    codexSkill: "paper2agent-skill-graph-orchestrator",
    claudeAgent: "skill-graph-orchestrator",
    dependencies: ["tool-extraction"]
  },
  {
    id: "benchmark-evaluation",
    title: "Benchmark evaluation",
    stage: "verify",
    summary: "Generate benchmark questions and score the resulting agent against expected outputs.",
    benefit: "Adds confidence that the created agent does more than just compile.",
    tools: ["benchmark extractor", "benchmark assessor", "judge prompts"],
    dependencies: ["mcp-packaging"]
  },
  {
    id: "coverage-quality",
    title: "Coverage and quality",
    stage: "verify",
    summary: "Run tests, coverage, and lint-style checks over the generated tools and tests.",
    benefit: "Surfaces fragile extractions before they become long-lived agent behaviors.",
    tools: ["pytest", "coverage", "pylint", "black", "isort"],
    dependencies: ["tool-extraction"]
  },
  {
    id: "workflow-orchestration",
    title: "Workflow orchestration",
    stage: "operate",
    summary: "Coordinate which specialist skill to invoke next and explain the dependency chain to users.",
    benefit: "Keeps the experience understandable as the project grows beyond a single pipeline script.",
    tools: ["job queue", "skill graph", "subagents"],
    codexSkill: "paper2agent-skill-graph-orchestrator",
    claudeAgent: "skill-graph-orchestrator",
    dependencies: ["paper-intake", "repo-recon", "mcp-packaging", "coverage-quality"]
  }
];

export const defaultSkillLevels: Record<string, SkillLevel> = {
  "paper-intake": "core",
  "repo-recon": "core",
  "environment-bootstrap": "core",
  "tutorial-execution": "core",
  "tool-extraction": "core",
  "mcp-packaging": "core",
  "coverage-quality": "recommended",
  "benchmark-evaluation": "optional",
  "workflow-orchestration": "recommended"
};
