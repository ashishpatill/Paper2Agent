export type Provider = "gemini" | "openrouter";
export type SkillStage = "discover" | "build" | "implement" | "package" | "verify" | "operate";
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

export interface ReportedResult {
  experiment: string;
  metric: string;
  value: number | string;
  direction?: "higher_is_better" | "lower_is_better";
  condition?: string;
}

export interface DatasetRequirement {
  name: string;
  source?: string;
  size_estimate?: string;
  publicly_available: boolean;
}

export interface PaperAnalysis {
  title: string;
  abstract: string;
  summary: string;
  projectSlug: string;
  repositoryUrl?: string;
  confidence: "high" | "medium" | "low";
  capabilities: string[];
  reported_results: ReportedResult[];
  datasets_required: DatasetRequirement[];
  suggestedQuestions: string[];
  setupNotes: string[];
  skillGraph?: SkillGraph;
}

export interface GapAnalysis {
  coverage_score: number;
  track: "tutorial" | "implementation" | "hybrid";
  covered_capabilities: string[];
  uncovered_capabilities: string[];
  gaps: Array<{
    capability: string;
    description: string;
    complexity: "low" | "medium" | "high";
    requires_data: boolean;
  }>;
  recommended_approach: string;
}

export interface ExperimentAttempt {
  attempt_number: number;
  timestamp: string;
  status: "success" | "partial" | "failed" | "crashed";
  metrics: Record<string, number | string>;
  errors?: string[];
  duration_seconds?: number;
}

export interface ResultsComparison {
  overall_match: "strong" | "approximate" | "weak" | "mismatch";
  match_score: number;
  comparisons: Array<{
    reported: ReportedResult;
    observed: { value: number | string } | null;
    delta?: number;
    within_threshold: boolean;
    notes: string;
  }>;
  summary: string;
}

export interface FixLoopState {
  max_attempts: number;
  current_attempt: number;
  attempts: ExperimentAttempt[];
  best_attempt?: ExperimentAttempt;
  converged: boolean;
  convergence_reason?: string;
}

export type SandboxMode = "subprocess" | "docker";
export type NetworkPolicy = "none" | "setup_only" | "full";

export interface SandboxConfig {
  mode: SandboxMode;
  workspacePath: string;
  timeoutSeconds: number;
  docker?: {
    image?: string;
    gpuPassthrough?: boolean;
    networkPolicy?: NetworkPolicy;
    memoryLimit?: string;
    cpuLimit?: number;
    extraMounts?: string[];
  };
  envPath?: string;
}

export interface VerificationResult {
  metric: string;
  claimedValue: number;
  verified: boolean;
  source?: string;
  reason: string;
}

export interface StepStatus {
  stepNumber: number;
  name: string;
  status: "pending" | "running" | "completed" | "skipped" | "failed";
  startedAt?: string;
  completedAt?: string;
  durationSeconds?: number;
  lastOutput?: string;
  error?: string;
}

export interface PipelineProgress {
  steps: StepStatus[];
  currentStep?: number;
  totalSteps: number;
  stalledSince?: string;
  stallDiagnosis?: string;
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
  pipelineProgress?: PipelineProgress;
  userFeedback?: UserFeedback[];
  validationReport?: ValidationReport;
  workspaceAssessment?: WorkspaceAssessment;
}

export interface UserFeedback {
  id: string;
  timestamp: string;
  message: string;
  action?: "hint" | "skip_step" | "restart_step" | "adjust_config";
  stepNumber?: number;
  consumed: boolean;
  consumedAt?: string;
  consumedByStep?: number;
}

export interface ValidationReport {
  timestamp: string;
  overall: "pass" | "partial" | "fail";
  checks: ValidationCheck[];
}

export interface ValidationCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface SetupReadiness {
  environmentReportFound: boolean;
  tutorialScanFound: boolean;
  environmentReady: boolean;
  tutorialCandidates: number;
  reusableTutorials: number;
  environmentName?: string;
  pythonVersion?: string;
}

export interface SetupReadinessReport {
  generatedAt: string;
  repository: {
    name: string;
    path: string;
    mainCodePaths: string[];
    notebookPaths: string[];
  };
  environment: {
    reportFound: boolean;
    ready: boolean;
    environmentName?: string;
    pythonVersion?: string;
    environmentLocation?: string;
    installationMethod?: string;
    packageCount?: number;
    activationCommand?: string;
    installCommands: string[];
    validationChecksPassed: number;
    validationChecksTotal: number;
  };
  tutorials: {
    scanFound: boolean;
    includeListFound: boolean;
    success: boolean;
    successReason?: string;
    filterApplied?: string;
    totalScanned: number;
    includedInTools: number;
    runnableCandidates: number;
    includedPaths: string[];
  };
  blockers: string[];
  requirements: string[];
  nextSteps: string[];
}

export interface ReplicationOutcomeReport {
  generatedAt: string;
  track?: "tutorial" | "implementation" | "hybrid";
  lifecycle:
    | "tutorial_only"
    | "implementation_scaffolded"
    | "experiments_partial"
    | "results_compared"
    | "replication_partial"
    | "replication_validated"
    | "replication_blocked";
  summary: string;
  implementation: {
    required: boolean;
    experimentFiles: number;
  };
  experiments: {
    summaryFound: boolean;
    total: number;
    successful: number;
    partial: number;
    failed: number;
    crashed: number;
  };
  comparison: {
    found: boolean;
    overallMatch?: "strong" | "approximate" | "weak" | "mismatch";
    matchScore?: number;
  };
  fixLoop: {
    found: boolean;
    converged?: boolean;
    currentAttempt?: number;
    maxAttempts?: number;
  };
  validation: {
    found: boolean;
    overall?: "pass" | "partial" | "fail";
  };
  blockers: string[];
  nextSteps: string[];
}

export interface WorkspaceAssessment {
  lifecycle:
    | "paper_only"
    | "repo_required"
    | "workspace_prepared"
    | "setup_ready"
    | "tutorial_track_ready"
    | "implementation_in_progress"
    | "results_ready"
    | "validated_partial"
    | "validated_full"
    | "run_failed";
  summary: string;
  completedMilestones: string[];
  remainingMilestones: string[];
  blockers: string[];
  requirements: string[];
  setup: SetupReadiness;
}
