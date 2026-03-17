#!/usr/bin/env bash
set -euo pipefail

echo "Configuring Codex and Claude Code helpers for this repo..."

if command -v codex >/dev/null 2>&1; then
  echo "Adding OpenAI developer docs MCP to Codex (if missing)..."
  codex mcp add openaiDeveloperDocs --url https://developers.openai.com/mcp || true
else
  echo "Codex CLI not found. Skipping Codex MCP setup."
fi

if command -v claude >/dev/null 2>&1; then
  echo "Adding Context7 MCP to Claude Code (if missing)..."
  claude mcp add context7 -- npx -y @upstash/context7-mcp@latest || true
  echo "Running Claude doctor..."
  claude doctor || true
else
  echo "Claude CLI not found. Skipping Claude Code setup."
fi

echo "Setup complete."
