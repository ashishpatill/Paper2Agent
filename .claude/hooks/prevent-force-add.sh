#!/bin/bash
# Hook: PreToolUse for Bash
# Blocks git add -f and git add --force on gitignored files
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

if [[ -z "$COMMAND" ]]; then
  exit 0
fi

# Block git add -f / git add --force
if echo "$COMMAND" | grep -qE 'git\s+add\s+(-f|--force)'; then
  echo "BLOCKED: git add -f is not allowed. This repo has files that must stay gitignored (.paper2agent/, .env.local, secrets). Use specific file paths with regular git add." >&2
  exit 2
fi

# Block git push --force to main
if echo "$COMMAND" | grep -qE 'git\s+push\s+.*--force.*\s+(main|master)'; then
  echo "BLOCKED: Force push to main/master is not allowed." >&2
  exit 2
fi

exit 0
