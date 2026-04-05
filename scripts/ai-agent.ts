#!/usr/bin/env tsx
/**
 * ai-agent.ts — Provider-agnostic agentic loop using OpenAI-compatible API.
 *
 * Reads prompt from stdin, runs an agentic loop (tool calls → execute → repeat),
 * and writes JSON progress lines to stdout for the heartbeat watcher.
 *
 * Env vars:
 *   AGENT_BASE_URL  — OpenAI-compatible API base URL
 *   AGENT_API_KEY   — API key
 *   AGENT_MODEL     — Model identifier
 *   AGENT_CWD       — Working directory for bash/file tools
 */

import { execSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import OpenAI from "openai";

const BASE_URL = process.env.AGENT_BASE_URL || "https://api.openai.com/v1";
const API_KEY = process.env.AGENT_API_KEY || process.env.OPENAI_API_KEY || "";
const MODEL = process.env.AGENT_MODEL || "gpt-4o";
const CWD = process.env.AGENT_CWD || process.cwd();
const MAX_TURNS = 60;
const MAX_TOKENS_APPROX = 80_000; // trim if total message tokens exceed this
const BASH_OUTPUT_LIMIT = 8_000;

if (!API_KEY) {
  writeResult(true, "AGENT_API_KEY is not set");
  process.exit(1);
}

const client = new OpenAI({ baseURL: BASE_URL, apiKey: API_KEY });

// ─── Tool definitions ────────────────────────────────────────────────────────

const tools: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "bash",
      description: "Execute a shell command in the working directory. Returns stdout+stderr, truncated to 8000 chars.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "Shell command to run" }
        },
        required: ["command"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the contents of a file.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute or relative file path" }
        },
        required: ["path"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Write content to a file, creating parent directories as needed.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path" },
          content: { type: "string", description: "File content" }
        },
        required: ["path", "content"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_dir",
      description: "List files and directories at a path.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Directory path" }
        },
        required: ["path"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "glob_files",
      description: "Find files matching a glob pattern.",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Glob pattern relative to working dir" }
        },
        required: ["pattern"]
      }
    }
  }
];

// ─── Tool executors ──────────────────────────────────────────────────────────

function resolvePath(p: string): string {
  if (path.isAbsolute(p)) return p;
  return path.join(CWD, p);
}

function executeTool(name: string, args: Record<string, string>): string {
  try {
    switch (name) {
      case "bash": {
        const result = spawnSync("bash", ["-c", args.command], {
          cwd: CWD,
          encoding: "utf8",
          timeout: 120_000,
          maxBuffer: 10 * 1024 * 1024
        });
        const combined = (result.stdout || "") + (result.stderr || "");
        const truncated = combined.length > BASH_OUTPUT_LIMIT
          ? combined.slice(0, BASH_OUTPUT_LIMIT) + `\n...[truncated ${combined.length - BASH_OUTPUT_LIMIT} chars]`
          : combined;
        if (result.error) {
          return `ERROR: ${result.error.message}\n${truncated}`;
        }
        return truncated || "(no output)";
      }

      case "read_file": {
        const resolved = resolvePath(args.path);
        const content = readFileSync(resolved, "utf8");
        if (content.length > BASH_OUTPUT_LIMIT) {
          return content.slice(0, BASH_OUTPUT_LIMIT) + `\n...[truncated ${content.length - BASH_OUTPUT_LIMIT} chars]`;
        }
        return content;
      }

      case "write_file": {
        const resolved = resolvePath(args.path);
        mkdirSync(path.dirname(resolved), { recursive: true });
        writeFileSync(resolved, args.content, "utf8");
        return `Written: ${resolved}`;
      }

      case "list_dir": {
        const resolved = resolvePath(args.path);
        if (!existsSync(resolved)) return `Directory not found: ${resolved}`;
        const entries = readdirSync(resolved, { withFileTypes: true });
        return entries.map(e => `${e.isDirectory() ? "d" : "f"} ${e.name}`).join("\n") || "(empty)";
      }

      case "glob_files": {
        try {
          const result = spawnSync("bash", ["-c", `find . -path './.git' -prune -o -name '${args.pattern}' -print 2>/dev/null | head -100`], {
            cwd: CWD,
            encoding: "utf8",
            timeout: 30_000
          });
          return result.stdout.trim() || "(no matches)";
        } catch {
          return "(glob failed)";
        }
      }

      default:
        return `Unknown tool: ${name}`;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return `ERROR: ${msg}`;
  }
}

// ─── Progress / result output ────────────────────────────────────────────────

function writeProgress(description: string, toolName?: string) {
  const event = {
    type: "progress",
    description,
    last_tool_name: toolName || description
  };
  process.stdout.write(JSON.stringify(event) + "\n");
}

function writeResult(isError: boolean, result: string) {
  const event = {
    type: "result",
    subtype: isError ? "error" : "success",
    is_error: isError,
    result
  };
  process.stdout.write(JSON.stringify(event) + "\n");
}

// ─── Token budget helper ─────────────────────────────────────────────────────

function estimateTokens(messages: OpenAI.Chat.ChatCompletionMessageParam[]): number {
  // rough: 1 token ≈ 4 chars
  return JSON.stringify(messages).length / 4;
}

function trimMiddleToolResults(
  messages: OpenAI.Chat.ChatCompletionMessageParam[]
): OpenAI.Chat.ChatCompletionMessageParam[] {
  // Keep system message, first user message, last ~10 messages; truncate tool results in middle
  if (messages.length <= 12) return messages;

  const systemMsg = messages[0];
  const firstUser = messages[1];
  const tail = messages.slice(-10);

  const middle = messages.slice(2, -10);
  const trimmedMiddle = middle.map(m => {
    if (m.role === "tool") {
      const tm = m as OpenAI.Chat.ChatCompletionToolMessageParam;
      const content = typeof tm.content === "string" ? tm.content : "";
      if (content.length > 200) {
        return { ...tm, content: content.slice(0, 200) + "\n...[trimmed for context budget]" };
      }
    }
    return m;
  });

  return [systemMsg, firstUser, ...trimmedMiddle, ...tail];
}

// ─── Main agentic loop ───────────────────────────────────────────────────────

async function main() {
  // Read prompt from stdin
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  const lines: string[] = [];
  for await (const line of rl) {
    lines.push(line);
  }
  const prompt = lines.join("\n");

  if (!prompt.trim()) {
    writeResult(true, "No prompt received on stdin");
    process.exit(1);
  }

  const systemPrompt = `You are an expert AI coding agent. You help implement research paper pipelines.
You have access to tools: bash, read_file, write_file, list_dir, glob_files.
Your working directory is: ${CWD}
Execute tasks completely and autonomously. Do not ask for clarification.`;

  let messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: prompt }
  ];

  writeProgress("Starting agent", "init");

  let turn = 0;
  while (turn < MAX_TURNS) {
    turn++;

    // Trim context if approaching token limit
    if (estimateTokens(messages) > MAX_TOKENS_APPROX) {
      messages = trimMiddleToolResults(messages);
    }

    let response: OpenAI.Chat.ChatCompletion;
    try {
      response = await client.chat.completions.create({
        model: MODEL,
        messages,
        tools,
        tool_choice: "auto",
        max_tokens: 4096
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      writeResult(true, `API error on turn ${turn}: ${msg}`);
      process.exit(1);
    }

    const choice = response.choices[0];
    if (!choice) {
      writeResult(true, "Empty response from API");
      process.exit(1);
    }

    const message = choice.message;
    messages.push(message);

    // Check finish reason
    if (choice.finish_reason === "stop" || !message.tool_calls || message.tool_calls.length === 0) {
      // Agent is done
      const summary = message.content || "Task completed.";
      writeResult(false, summary.slice(0, 500));
      process.exit(0);
    }

    // Execute tool calls
    const toolResults: OpenAI.Chat.ChatCompletionToolMessageParam[] = [];
    for (const toolCall of message.tool_calls) {
      const toolName = toolCall.function.name;
      let args: Record<string, string> = {};
      try {
        args = JSON.parse(toolCall.function.arguments) as Record<string, string>;
      } catch {
        args = {};
      }

      writeProgress(`${toolName}: ${JSON.stringify(args).slice(0, 100)}`, toolName);

      const result = executeTool(toolName, args);
      toolResults.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: result
      });
    }

    messages.push(...toolResults);
  }

  writeResult(true, `Agent exceeded maximum turns (${MAX_TURNS})`);
  process.exit(1);
}

main().catch(err => {
  const msg = err instanceof Error ? err.message : String(err);
  writeResult(true, `Unhandled error: ${msg}`);
  process.exit(1);
});
