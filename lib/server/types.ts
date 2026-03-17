export type Provider = "gemini" | "openrouter";
export type SkillStage = "discover" | "build" | "package" | "verify" | "operate";
export type SkillLevel = "core" | "recommended" | "optional";

export type JobStatus =
  | "queued"
  | "analyzing"
  | "needs_repo"
  | "running_pipeline"
  | "paused"
  | "stopped"
  | "not_implementable"
  | "completed"
  | "failed";

export type ResumableJobStatus = "queued" | "analyzing" | "running_pipeline";

export interface StoredSecrets {
  geminiApiKey?: string;
  openrouterApiKey?: string;
  geminiModel?: string;
  openrouterModel?: string;
  preferredProvider?: Provider;
}

export interface SecretsSummary {
  hasGeminiKey: boolean;
  hasOpenRouterKey: boolean;
  geminiModel: string;
  openrouterModel: string;
  preferredProvider: Provider;
}

export interface PaperAnalysis {
  title: string;
  abstract: string;
  summary: string;
  projectSlug: string;
  repositoryUrl?: string;
  confidence: "high" | "medium" | "low";
  capabilities: string[];
  suggestedQuestions: string[];
  setupNotes: string[];
  skillGraph?: SkillGraph;
}

export interface ImplementabilityAssessment {
  verdict: "implementable" | "risky" | "blocked";
  summary: string;
  reasons: string[];
  evidence: string[];
  checkedAt: string;
}

export interface SkillGraphNode {
  id: string;
  title: string;
  stage: SkillStage;
  level: SkillLevel;
  summary: string;
  reason: string;
  codexSkill?: string;
  claudeAgent?: string;
}

export interface SkillGraphEdge {
  from: string;
  to: string;
}

export interface SkillGraph {
  nodes: SkillGraphNode[];
  edges: SkillGraphEdge[];
  recommendedCodexSkills: string[];
  recommendedClaudeAgents: string[];
}

export interface JobRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: JobStatus;
  sourceType: "url" | "pdf";
  paperUrl?: string;
  uploadedPdfName?: string;
  repositoryUrl?: string;
  projectName?: string;
  notes?: string;
  provider?: Provider;
  model?: string;
  error?: string;
  workerPid?: number;
  resumeStatus?: ResumableJobStatus;
  currentStage?: string;
  lastLogLine?: string;
  progressPercent?: number;
  lastHeartbeatAt?: string;
  lastProgressAt?: string;
  logPath?: string;
  workspacePath?: string;
  analysisPath?: string;
  paperTextPath?: string;
  implementability?: ImplementabilityAssessment;
  analysis?: PaperAnalysis;
}
