---
inclusion: always
---

# Engineering rules

## Stack
- Node 26 (type stripping runs `server/*.ts` directly), npm.
- Client: React 19 + TypeScript + Vite 8. Runtime dependencies: `react`, `react-dom`, `diff`. Nothing else without a recorded reason in `.kiro/devlog.md`.
- Server: `node:http` only, single process. In dev it mounts Vite in middleware mode; in production it serves `dist/`. One origin: `http://127.0.0.1:4317` (override with `HAUNTED_INK_PORT`).
- Shared code in `shared/` is imported by client and server. Use erasable TypeScript only (no enums, namespaces, or parameter properties) and explicit `.ts` import extensions.
- Tests: Vitest (unit and live), Playwright with the installed Google Chrome (`channel: 'chrome'`).

## Commands
- `npm run dev`, `npm run build`, `npm start`
- `npm run check`: typecheck, unit tests, Kiro config validation. The Stop hook runs this.
- `npm run test:live`: real kiro-cli and doi.org calls. Never mocked. Requires a logged-in kiro-cli.
- `npm run test:e2e`: Playwright against a built app.
- `npm run validate:kiro`

## Runtime Kiro calls
- Spawn `kiro-cli` with an argument array, `shell: false`, `detached: true`, prompt on stdin only:
  `chat --v3 --no-interactive --agent haunted-ink-reviser --trust-tools= --output-format stream-json`
- Working directory: a fresh `mkdtemp` directory holding only `.kiro/agents/haunted-ink-reviser.json`. Delete the Kiro session (`kiro-cli chat --delete-session <id>`, same cwd) and the directory afterwards.
- One run at a time, queue of 3, 90 s timeout, cancel kills the process group (SIGTERM, then SIGKILL after 3 s).
- Never pass `KIRO_API_KEY` or any API key. Pass a minimal environment.

## Security
- Bind `127.0.0.1` only. Check `Host`. For non-GET requests require `Origin` equal to the app origin and `Content-Type: application/json`. Reject `Sec-Fetch-Site: cross-site`. No CORS headers. Body limit 64 KB.
- Send a strict CSP (`default-src 'self'`) and `X-Content-Type-Options: nosniff`. No external fonts, scripts or images.
- Outbound network from the server: `doi.org`, plus HTTPS redirects from its content negotiation to `api.crossref.org`, `data.crosscite.org` and `api.datacite.org` only. Timeouts on every request.

## Working agreements
- Follow `.kiro/specs/haunted-ink/tasks.md` in order. Each task names its requirement IDs and tests; tick it only after those tests pass.
- Append a dated entry to `.kiro/devlog.md` each session: model, commands, results, deviations.
- Screenshots and bulky logs go to `../../work/` (or `HAUNTED_INK_WORK_DIR`), not into the repo.
- Hooks in `.kiro/hooks/` guard shell and writes. Do not bypass or weaken them. If one blocks a legitimate action, record why in the devlog and ask the user.
