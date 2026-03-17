# Paper2Agent Studio

## Mission
This repository now has two layers:

1. The original `Paper2Agent.sh` + `scripts/` + `tools/` research-agent pipeline.
2. A new local-first Next.js studio that accepts a paper URL or PDF and orchestrates paper analysis plus pipeline execution.

## Repo Map
- `app/`: Next.js App Router UI and API routes.
- `components/`: shadcn-style UI components and studio client components.
- `lib/server/`: server-only filesystem, secrets, LLM, intake, and job orchestration helpers.
- `scripts/run-paper-job.ts`: background worker that analyzes the paper and triggers `Paper2Agent.sh`.
- `.paper2agent/`: local runtime data for jobs, uploads, logs, secrets, and generated workspaces. This directory is intentionally gitignored.
- `scripts/`, `tools/`, `templates/`, `prompts/`, `agents/`: the original Paper2Agent pipeline. Preserve these unless the task explicitly needs pipeline changes.

## Commands
- `npm install`
- `npm run dev`
- `npm run build`
- `npm run lint`
- `bash Paper2Agent.sh --project_dir <dir> --github_url <repo>`
- `npm run job:run -- <job-id>`
- `bash scripts/install-codex-skills.sh`
- `bash scripts/setup-ai-tooling.sh`

## Guardrails
- Keep secrets server-side only. Use `.paper2agent/local/secrets.json` or environment variables. Never expose raw keys to the browser.
- Do not commit `.env.local`, `.paper2agent/local/`, generated workspaces, or uploads.
- Never use `git add -f` to stage ignored local/runtime files from this repo.
- Treat `.paper2agent/`, `.env.local`, `.claude/settings.local.json`, generated workspaces, uploaded PDFs, logs, and saved secrets as local-only data unless the user explicitly asks to publish sanitized examples.
- If a user asks to publish or push the repo, warn them that staging local job history or generated agent outputs can expose paper URLs, repo URLs, notes, logs, and local secrets metadata.
- Prefer TypeScript for new app/backend code and keep imports relative inside `lib/server/` so the background worker runs under `tsx`.
- Preserve the original shell pipeline semantics. The web app should orchestrate the pipeline, not replace it.
- When adding new AI-provider features, keep provider selection configurable and avoid hardcoding a single vendor path.
- Treat `lib/skills/` as the source of truth for the Paper2Agent skill graph that powers the UI and assistant orchestration hints.

## Publish Safety
- Before any public push or release, run `bash scripts/check-publish-safety.sh`.
- If ignored runtime files were force-added or tracked previously, remove them from the index before pushing.
- Prefer publishing source, prompts, agents, and docs. Do not publish personal Paper2Agent runs by default.

## Codex + Claude Code
- Codex should treat this `AGENTS.md` as the repo contract.
- Claude Code should use `CLAUDE.md` for quick project memory and `.mcp.json` for project MCP servers.
- Project-local Claude specialists live in `.claude/agents/`; project-local Codex skill packs live in `codex-skills/` and can be installed into `$CODEX_HOME/skills` with `scripts/install-codex-skills.sh`.
- Use official docs/tools first for OpenAI and Anthropic questions. Prefer MCP-backed docs over stale memory when available.
