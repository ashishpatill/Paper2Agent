/**
 * Langfuse tracing integration.
 *
 * Traces every LLM call, pipeline step, and self-healing attempt
 * to your Langfuse dashboard. Configured via environment variables
 * or Settings UI.
 *
 * Env vars:
 *   LANGFUSE_SECRET_KEY  — your Langfuse secret key
 *   LANGFUSE_PUBLIC_KEY  — your Langfuse public key
 *   LANGFUSE_BASE_URL    — your Langfuse host (default: https://cloud.langfuse.com)
 *   LANGFUSE_ENABLED     — set to "true" to enable tracing
 */

import { Langfuse } from "langfuse";

let _instance: Langfuse | null = null;
let _config: { secretKey: string; publicKey: string; baseUrl: string } | null = null;

export interface LangfuseConfig {
  secretKey?: string;
  publicKey?: string;
  baseUrl?: string;
}

export function isEnabled(): boolean {
  return process.env.LANGFUSE_ENABLED === "true" && !!(process.env.LANGFUSE_SECRET_KEY && process.env.LANGFUSE_PUBLIC_KEY);
}

export function configure(config: LangfuseConfig) {
  _config = {
    secretKey: config.secretKey || process.env.LANGFUSE_SECRET_KEY || "",
    publicKey: config.publicKey || process.env.LANGFUSE_PUBLIC_KEY || "",
    baseUrl: config.baseUrl || process.env.LANGFUSE_BASE_URL || "https://cloud.langfuse.com"
  };
}

export function getClient(): Langfuse | null {
  if (!isEnabled() && !_config) return null;

  if (_instance) return _instance;

  const cfg = _config || {
    secretKey: process.env.LANGFUSE_SECRET_KEY || "",
    publicKey: process.env.LANGFUSE_PUBLIC_KEY || "",
    baseUrl: process.env.LANGFUSE_BASE_URL || "https://cloud.langfuse.com"
  };

  if (!cfg.secretKey || !cfg.publicKey) return null;

  _instance = new Langfuse({
    secretKey: cfg.secretKey,
    publicKey: cfg.publicKey,
    baseUrl: cfg.baseUrl,
    flushAt: 10,
    flushInterval: 5000,
  });

  _instance.on("error", (err) => {
    console.error("[Langfuse] Error:", err);
  });

  return _instance;
}

export async function shutdown() {
  if (_instance) {
    await _instance.shutdownAsync();
    _instance = null;
  }
}

/**
 * Wrap an LLM call with a Langfuse generation trace.
 */
export async function traceGeneration(
  options: {
    traceId: string;
    traceName: string;
    model: string;
    provider: string;
    input: string | unknown[];
    output: string | null;
    usage?: { inputTokens: number; outputTokens: number; totalTokens: number };
    metadata?: Record<string, unknown>;
  }
) {
  const client = getClient();
  if (!client) return;

  // Use any to bypass strict type checking — Langfuse v3 API is flexible
  (client as any).generation({
    traceId: options.traceId,
    name: `${options.provider} - ${options.model}`,
    model: options.model,
    input: options.input,
    output: options.output,
    usage: options.usage
      ? {
          input: options.usage.inputTokens,
          output: options.usage.outputTokens,
          total: options.usage.totalTokens,
        }
      : undefined,
    metadata: {
      provider: options.provider,
      traceName: options.traceName,
      ...options.metadata,
    },
  });
}

/**
 * Create a trace for a pipeline run.
 * Returns the trace ID and a span for the current step.
 */
export function startPipelineTrace(options: {
  traceId: string;
  jobId: string;
  paperUrl?: string;
  repositoryUrl?: string;
  projectSlug?: string;
}): { traceId: string; trace: any } {
  const client = getClient();
  if (!client) return { traceId: options.traceId, trace: null as unknown as any };

  const trace = (client as any).trace({
    id: options.traceId,
    name: "paper2agent-pipeline",
    sessionId: options.jobId,
    metadata: {
      jobId: options.jobId,
      paperUrl: options.paperUrl,
      repositoryUrl: options.repositoryUrl,
      projectSlug: options.projectSlug,
    },
  });

  return { traceId: options.traceId, trace };
}

/**
 * Create a span for a pipeline step.
 */
export function startStepSpan(
  trace: any,
  options: {
    stepNumber: number;
    stepName: string;
    metadata?: Record<string, unknown>;
  }
): any {
  const span = (trace as any).span({
    name: `step-${options.stepNumber}`,
    input: { stepName: options.stepName, stepNumber: options.stepNumber },
    metadata: options.metadata,
  });

  return span;
}

/**
 * End a step span with outcome.
 */
export function endStepSpan(
  span: any,
  options: {
    status: "success" | "error" | "skipped";
    output?: Record<string, unknown>;
    error?: string;
  }
) {
  if (options.error) {
    (span as any).update({
      output: options.output,
      metadata: { error: options.error },
    });
    (span as any).end({ status: options.status === "success" ? "SUCCESS" : "ERROR" });
  } else {
    (span as any).end({ output: options.output, status: options.status === "success" ? "SUCCESS" : "ERROR" });
  }
}

/**
 * Record a self-healing attempt as an event on the trace.
 */
export function recordHealingEvent(
  trace: any,
  options: {
    stepNumber: number;
    stepName: string;
    failureCategory: string;
    solution: string;
    success: boolean;
    durationMs: number;
  }
) {
  (trace as any).event({
    name: "self-healing",
    input: {
      stepNumber: options.stepNumber,
      stepName: options.stepName,
      failureCategory: options.failureCategory,
      solution: options.solution,
    },
    output: { success: options.success, durationMs: options.durationMs },
    metadata: {
      event: "self_healing_attempt",
      success: options.success,
    },
  });
}

/**
 * Record a provider failover event.
 */
export function recordFailoverEvent(
  trace: any,
  options: {
    primaryProvider: string;
    fallbackProvider: string;
    reason: string;
  }
) {
  (trace as any).event({
    name: "provider-failover",
    input: {
      primaryProvider: options.primaryProvider,
      fallbackProvider: options.fallbackProvider,
    },
    output: { reason: options.reason },
    metadata: {
      event: "provider_failover",
    },
  });
}
