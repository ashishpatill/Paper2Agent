# Security and Local Data Handling

## Local-only data

This project intentionally keeps runtime and sensitive data out of source control.

Do not commit:

- `.env.local`
- `.paper2agent/`
- `.claude/settings.local.json`
- uploaded PDFs
- generated workspaces
- saved model keys

## Secret storage

Provider keys can be stored locally in:

- environment variables
- `.paper2agent/local/secrets.json`

They are intended to remain server-side only.

## Before publishing a fork

Review these paths and make sure they are absent from commits:

- `.paper2agent/local/`
- `.paper2agent/jobs/`
- `.paper2agent/logs/`
- `.paper2agent/uploads/`
- `.paper2agent/workspaces/`
- `.env.local`
- `.claude/settings.local.json`

## Reporting

If you discover a security issue in this fork, please avoid publishing live credentials or private runtime artifacts in a public issue.
