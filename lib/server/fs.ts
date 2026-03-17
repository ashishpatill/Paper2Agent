import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
export const appDataRoot = path.join(root, ".paper2agent");
export const localRoot = path.join(appDataRoot, "local");
export const jobsRoot = path.join(appDataRoot, "jobs");
export const uploadsRoot = path.join(appDataRoot, "uploads");
export const workspacesRoot = path.join(appDataRoot, "workspaces");
export const logsRoot = path.join(appDataRoot, "logs");

export async function ensureAppDirectories() {
  await Promise.all([
    mkdir(appDataRoot, { recursive: true }),
    mkdir(localRoot, { recursive: true }),
    mkdir(jobsRoot, { recursive: true }),
    mkdir(uploadsRoot, { recursive: true }),
    mkdir(workspacesRoot, { recursive: true }),
    mkdir(logsRoot, { recursive: true })
  ]);
}

export async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const content = await readFile(filePath, "utf8");
    return JSON.parse(content) as T;
  } catch {
    return fallback;
  }
}

export async function writeJsonFile(filePath: string, value: unknown) {
  const directory = path.dirname(filePath);
  await mkdir(directory, { recursive: true });
  await writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}
