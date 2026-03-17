# Publishing Safety

This repository keeps user activity and generated artifacts under local-only paths.

## Do not publish by default

Do not commit or push these paths:

- `.paper2agent/`
- `.env.local`
- `.claude/settings.local.json`
- generated workspaces
- uploaded PDFs
- job logs
- saved provider keys

These files can expose:

- paper URLs
- repository override URLs
- operator notes and instructions
- local filesystem paths
- generated outputs from private experiments
- secret storage metadata

## Rules for coding agents

- Never use `git add -f` on ignored runtime files in this repo.
- Warn before any push/release flow if local job data or generated workspaces could be exposed.
- Assume Paper2Agent outputs are private unless the user explicitly asks to publish sanitized examples.

## Recommended release flow

1. Run `bash scripts/check-publish-safety.sh`
2. Confirm `git status --short --ignored` does not show sensitive files staged for commit
3. Review diffs before any push
4. Publish only source, docs, prompts, agents, and intentionally curated examples
