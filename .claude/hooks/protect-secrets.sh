#!/bin/bash
# Hook: PreToolUse for Edit|Write
# Blocks edits to secrets files and .env files
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [[ -z "$FILE_PATH" ]]; then
  exit 0
fi

# Block direct edits to secrets
case "$FILE_PATH" in
  *secrets.json*|*.env.local*|*.env|*credentials*|*api_key*|*apikey*)
    echo "BLOCKED: Cannot directly edit secrets/credentials files. Use the web UI settings page or environment variables instead." >&2
    exit 2
    ;;
esac

# Block edits to settings.local.json (personal config)
case "$FILE_PATH" in
  *settings.local.json*)
    echo "BLOCKED: settings.local.json is personal configuration. Use /update-config skill instead." >&2
    exit 2
    ;;
esac

exit 0
