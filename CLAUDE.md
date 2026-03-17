# Claude Code Notes

Read `AGENTS.md` first for the full repo map and guardrails.

## Quick Context
- The web app lives in `app/`, `components/`, and `lib/server/`.
- The original Paper2Agent research pipeline still lives in `Paper2Agent.sh`, `scripts/`, `tools/`, `templates/`, and `prompts/`.
- Runtime artifacts go under `.paper2agent/` and are intentionally local-only.

## Common Commands
- `npm run dev`
- `npm run build`
- `npm run lint`
- `bash Paper2Agent.sh --project_dir <dir> --github_url <repo>`
- `bash scripts/setup-ai-tooling.sh`

## Important Constraints
- Never reveal or return stored provider keys.
- Keep `.paper2agent/local/secrets.json` gitignored and server-only.
- Never use `git add -f` to stage ignored local/runtime files for this repo.
- Treat `.paper2agent/`, `.env.local`, `.claude/settings.local.json`, logs, uploads, and generated workspaces as local-only by default.
- If asked to prepare the repo for publishing, warn about leaking job history, paper URLs, repo URLs, operator notes, logs, and saved secrets metadata before any git staging/push flow.
- If you change the web intake flow, verify both source types: paper URL and uploaded PDF.
- If you touch the worker flow, keep it compatible with `tsx scripts/run-paper-job.ts <job-id>`.
- The skill graph model lives in `lib/skills/`. Keep the UI, worker enrichment, Codex skills, and Claude subagents aligned with it.

## Publish Safety
- Run `bash scripts/check-publish-safety.sh` before public releases or pushes.
- Do not publish personal generated Paper2Agent workspaces unless they have been deliberately sanitized and the user asked for that.
