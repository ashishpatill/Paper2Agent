/**
 * Sandbox factory for experiment isolation.
 *
 * Two execution modes:
 * - "subprocess" (default): runs experiments in a local subprocess with timeouts
 * - "docker": runs experiments inside a Docker container with resource limits,
 *   optional GPU passthrough, and network policies
 */

import { spawn, execSync } from "child_process";
import * as path from "path";
import * as fs from "fs";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SandboxMode = "subprocess" | "docker";

export type NetworkPolicy = "none" | "setup_only" | "full";

export interface SandboxConfig {
  mode: SandboxMode;
  /** Absolute path to the project workspace on the host */
  workspacePath: string;
  /** Timeout in seconds for the entire experiment run */
  timeoutSeconds: number;
  /** Docker-specific options */
  docker?: {
    image?: string;
    gpuPassthrough?: boolean;
    networkPolicy?: NetworkPolicy;
    memoryLimit?: string; // e.g. "8g"
    cpuLimit?: number;    // number of CPUs
    /** Extra volume mounts (host:container) */
    extraMounts?: string[];
  };
  /** Python venv to activate inside the sandbox */
  envPath?: string;
}

export interface SandboxResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationSeconds: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_DOCKER_IMAGE = "paper2agent-sandbox:latest";
const DEFAULT_TIMEOUT = 1800; // 30 minutes
const DEFAULT_MEMORY_LIMIT = "8g";
const DEFAULT_CPU_LIMIT = 4;

// ---------------------------------------------------------------------------
// Sandbox factory
// ---------------------------------------------------------------------------

export function createSandbox(config: SandboxConfig): Sandbox {
  if (config.mode === "docker") {
    return new DockerSandbox(config);
  }
  return new SubprocessSandbox(config);
}

/** Check whether Docker is available on this machine */
export function isDockerAvailable(): boolean {
  try {
    execSync("docker info", { stdio: "ignore", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/** Auto-select sandbox mode: Docker if available, otherwise subprocess */
export function autoSelectMode(): SandboxMode {
  return isDockerAvailable() ? "docker" : "subprocess";
}

// ---------------------------------------------------------------------------
// Abstract base
// ---------------------------------------------------------------------------

abstract class Sandbox {
  protected config: SandboxConfig;

  constructor(config: SandboxConfig) {
    this.config = {
      ...config,
      timeoutSeconds: config.timeoutSeconds || DEFAULT_TIMEOUT,
    };
  }

  abstract run(command: string, args?: string[]): Promise<SandboxResult>;

  /** Run a Python script inside the sandbox */
  async runPython(scriptPath: string, extraArgs?: string[]): Promise<SandboxResult> {
    const activate = this.config.envPath
      ? `source ${this.config.envPath}/bin/activate && `
      : "";
    const cmd = `${activate}python3 ${scriptPath} ${(extraArgs || []).join(" ")}`;
    return this.run("bash", ["-c", cmd]);
  }
}

// ---------------------------------------------------------------------------
// Subprocess sandbox
// ---------------------------------------------------------------------------

class SubprocessSandbox extends Sandbox {
  async run(command: string, args: string[] = []): Promise<SandboxResult> {
    return new Promise((resolve) => {
      const start = Date.now();
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      let settled = false;

      const proc = spawn(command, args, {
        cwd: this.config.workspacePath,
        env: { ...process.env },
        stdio: ["ignore", "pipe", "pipe"],
        shell: true,
      });

      const timer = setTimeout(() => {
        timedOut = true;
        proc.kill("SIGTERM");
        // Force kill after 10s grace period
        setTimeout(() => {
          try { proc.kill("SIGKILL"); } catch { /* already dead */ }
        }, 10_000);
      }, this.config.timeoutSeconds * 1000);

      proc.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
      proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });

      const finish = (exitCode: number | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({
          exitCode: exitCode ?? 137,
          stdout,
          stderr,
          timedOut,
          durationSeconds: (Date.now() - start) / 1000,
        });
      };

      proc.on("close", finish);
      proc.on("error", () => finish(1));
    });
  }
}

// ---------------------------------------------------------------------------
// Docker sandbox
// ---------------------------------------------------------------------------

class DockerSandbox extends Sandbox {
  private get image(): string {
    return this.config.docker?.image || DEFAULT_DOCKER_IMAGE;
  }

  async run(command: string, args: string[] = []): Promise<SandboxResult> {
    const dockerArgs = this.buildDockerArgs(command, args);
    return new Promise((resolve) => {
      const start = Date.now();
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      let settled = false;

      const proc = spawn("docker", dockerArgs, {
        cwd: this.config.workspacePath,
        env: { ...process.env },
        stdio: ["ignore", "pipe", "pipe"],
      });

      const timer = setTimeout(() => {
        timedOut = true;
        proc.kill("SIGTERM");
        setTimeout(() => {
          try { proc.kill("SIGKILL"); } catch { /* already dead */ }
        }, 10_000);
      }, this.config.timeoutSeconds * 1000);

      proc.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
      proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });

      const finish = (exitCode: number | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({
          exitCode: exitCode ?? 137,
          stdout,
          stderr,
          timedOut,
          durationSeconds: (Date.now() - start) / 1000,
        });
      };

      proc.on("close", finish);
      proc.on("error", () => finish(1));
    });
  }

  private buildDockerArgs(command: string, args: string[]): string[] {
    const da: string[] = ["run", "--rm"];
    const docker = this.config.docker || {};

    // Resource limits
    da.push("--memory", docker.memoryLimit || DEFAULT_MEMORY_LIMIT);
    da.push("--cpus", String(docker.cpuLimit || DEFAULT_CPU_LIMIT));

    // GPU passthrough
    if (docker.gpuPassthrough) {
      da.push("--gpus", "all");
    }

    // Network policy
    const networkPolicy = docker.networkPolicy || "none";
    if (networkPolicy === "none") {
      da.push("--network", "none");
    } else if (networkPolicy === "setup_only") {
      // setup_only uses the host network during pip install, then drops it
      // This is handled by the entrypoint script in the Dockerfile
      da.push("--env", "P2A_NETWORK_POLICY=setup_only");
    }
    // "full" uses default Docker networking

    // Mount workspace
    da.push("-v", `${this.config.workspacePath}:/workspace`);
    da.push("-w", "/workspace");

    // Extra mounts
    for (const mount of docker.extraMounts || []) {
      da.push("-v", mount);
    }

    // Environment variables
    if (this.config.envPath) {
      da.push("--env", `P2A_ENV_PATH=${this.config.envPath}`);
    }

    // Image
    da.push(this.image);

    // Command
    da.push(command, ...args);

    return da;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build the sandbox Docker image if it doesn't already exist */
export async function ensureSandboxImage(
  dockerfilePath?: string
): Promise<{ built: boolean; image: string }> {
  const image = DEFAULT_DOCKER_IMAGE;

  // Check if image exists
  try {
    execSync(`docker image inspect ${image}`, { stdio: "ignore", timeout: 10_000 });
    return { built: false, image };
  } catch {
    // Image doesn't exist, build it
  }

  const dfPath = dockerfilePath || path.join(
    path.dirname(path.dirname(__dirname)),
    "docker",
    "sandbox.Dockerfile"
  );

  if (!fs.existsSync(dfPath)) {
    throw new Error(`Sandbox Dockerfile not found at ${dfPath}`);
  }

  const contextDir = path.dirname(dfPath);
  execSync(`docker build -t ${image} -f ${dfPath} ${contextDir}`, {
    stdio: "inherit",
    timeout: 600_000, // 10 min build timeout
  });

  return { built: true, image };
}
