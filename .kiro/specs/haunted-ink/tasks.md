# Tasks: Haunted Ink

Work in order. Each task lists the requirements it satisfies and the tests that must pass before it is ticked. Record each session in `.kiro/devlog.md`. Run development sessions with the builder agent on CLI V3 so the project hooks load:

```
kiro-cli chat --v3 --agent haunted-ink-builder --trust-workspace
```

## Phase 0: Planning (this session)
- [x] T0.1 Inspect toolchain, Kiro CLI agent/hook syntax, DOI providers; write spec, steering, agents, hooks, README, LICENSE, devlog. _R10.1, R10.3, R10.4_

## Phase 1: Scaffold
- [x] T1.1 Create `package.json` (scripts: `dev`, `build`, `start`, `typecheck`, `test`, `test:live`, `test:e2e`, `validate:kiro`, `check` = typecheck + test + validate:kiro), `tsconfig.json` (`strict`, `erasableSyntaxOnly`, `verbatimModuleSyntax`, `allowImportingTsExtensions`, `noEmit`), `vite.config.ts`, `index.html`, `.gitignore`. Install `react`, `react-dom`, `diff`; dev: `vite`, `@vitejs/plugin-react`, `typescript`, `vitest`, `@playwright/test`, `@types/react`, `@types/react-dom`, `@types/node`. If TypeScript 7 breaks the build, pin TypeScript 6 and log why. _R10.3_ Tests: `npm run check` passes with one placeholder test.
- [x] T1.2 `server/index.ts` + `server/static.ts`: bind 127.0.0.1:4317, Vite middleware in dev, `dist/` in production, `GET /api/health`. _R8.1_ Tests: `tests/server/health.test.ts`.
- [x] T1.3 Confirm hooks fire in a real V3 session: `.kiro/evidence/hook-events.jsonl` gains `session-brief`, `guard-shell`, `guard-writes`, `after-write` and `stop-verify` lines. If any trigger does not fire, record the exact behaviour in the devlog and fix the hook rather than deleting it. _R10.2_

## Phase 2: Shared logic (pure, unit-tested)
- [x] T2.1 `shared/doi.ts` normalise/validate. _R2.1, R2.4, R2.5_ Tests: `unit/doi.test.ts`.
- [x] T2.2 `shared/citations.ts` token extraction and linking. _R2.8_ Tests: `unit/citations.test.ts`.
- [x] T2.3 `src/lib/bibtex.ts`, `src/lib/refparse.ts`. _R2.2, R2.3, R2.6, R2.7_ Tests: `unit/bibtex.test.ts`, `unit/refparse.test.ts`.
- [x] T2.4 `shared/match.ts` title/year/first-author comparison. _R3.3_ Tests: `unit/match.test.ts` (uses the CSL fields recorded in `src/example/SOURCES.md`).
- [x] T2.5 `shared/protect.ts` placeholders, restore, `flagNewFacts`. _R4.3, R4.5, R4.6_ Tests: `unit/protect.test.ts` (round trip, missing, duplicated, invented placeholder, new year/number/DOI flagged).
- [x] T2.6 `src/lib/manuscript.ts` block split; `src/storage.ts` with schema check. _R1.4, R1.5, R1.6_ Tests: `unit/manuscript.test.ts`, `unit/storage.test.ts`.

## Phase 3: Server
- [x] T3.1 `server/guards.ts` and JSON error responses, security headers. _R8.1, R8.2, R8.3_ Tests: `server/guards.test.ts` (bad Host, missing/foreign Origin, wrong Content-Type, 65 KB body, `Sec-Fetch-Site: cross-site`, no `Access-Control-*` headers).
- [x] T3.2 `server/doi.ts` + `POST /api/citations/verify` with cache and concurrency. _R3.1–R3.6, R3.9, R3.10, R8.9_ Tests: `live/doi.live.test.ts` (all six example expectations), `server/doi-errors.test.ts` (timeout and unreachable host give `uncertain`; base URL injectable for this test only).
- [x] T3.3 `kiro/protocol.ts` prompt builder and output validator. _R4.4, R4.5_ Tests: `unit/protocol.test.ts` (fenced JSON, prose around JSON, wrong types, oversize).
- [x] T3.4 `kiro/runner.ts`: spawn per design §6.4, stream-json parsing, error classification, session deletion, temp-dir cleanup. Try a workspace-scoped `chat.disableInheritingDefaultResources` inside the temp dir without touching global config; record the result. _R4.4, R4.9, R8.4, R8.5, R8.7_ Tests: `live/kiro.live.test.ts` (real revision of an example paragraph keeps all citations; injection paragraph is not obeyed; tool attempt creates no file; temp dir and session removed).
- [x] T3.5 `kiro/queue.ts` + `/api/revisions` routes, cancel, timeout, shutdown. _R4.7, R4.8, R8.6, R8.7_ Tests: `server/queue.test.ts` (fixture child: cancel kills group, 5th job gets 429), `live/kiro.live.test.ts` (cancel a real run, `ps` shows no remaining `kiro-cli` child of the server).

## Phase 4: Client
- [x] T4.1 Design tokens, desk layout, engravings (`Engraving.tsx`, inline SVG), typography per steering. _R9.1, R9.5, R9.6_ Tests: screenshot at 1440 px and 375 px to work dir; contrast check of token pairs in `unit/contrast.test.ts`.
- [x] T4.2 Manuscript panel: blocks, editing, import, empty state, citation overlay. _R1.1–R1.4, R1.7, R2.8_ Tests: `e2e/flow.spec.ts` (import file, empty state actions).
- [x] T4.3 Ledger and reference form, status marks, detail with disclaimer, check all / re-check, edit/delete. _R2.1–R2.9, R3.7, R3.8_ Tests: `e2e/flow.spec.ts`.
- [x] T4.4 Revision sheet: intents, submit, queue/running/cancel, error banners with fix commands. _R4.1, R4.2, R4.7–R4.10_ Tests: `e2e/flow.spec.ts` (real Kiro; marked slow).
- [x] T4.5 DiffView, Apply (stale check, flagged-facts confirmation), Discard, Undo, history. _R5.1–R5.5_ Tests: `unit/state.test.ts`, `e2e/flow.spec.ts`.
- [x] T4.6 Persistence wiring and restore-failure notice. _R1.5, R1.6_ Tests: `e2e/flow.spec.ts` (reload keeps state; corrupt storage shows notice).

## Phase 5: Example, export, polish
- [x] T5.1 `src/example/manuscript.md`, `references.ts`, `SOURCES.md` per design §8, with intentional problems labelled. _R7.1–R7.4_ Tests: `live/doi.live.test.ts`.
- [x] T5.2 `src/lib/export.ts`, Export menu, print view. _R6.1–R6.5_ Tests: `unit/export.test.ts`, `e2e/flow.spec.ts` (downloads).
- [x] T5.3 Motion and access pass: reduced motion, focus trap/restore, keyboard-only run, 360–375 px layout. _R9.2–R9.4, R9.7, R9.8_ Tests: `e2e/a11y.spec.ts`.
- [x] T5.4 Visual review from screenshots against the design language; fix spacing, hierarchy and states. Save before/after screenshots to the work dir. _R9.1, R9.2_

## Phase 6: Verification and documentation
- [x] T6.1 Full run: `npm run check`, `npm run test:live`, `npm run test:e2e`; paste the summary lines into the devlog. _R11_
- [x] T6.2 Security checklist: grep for `shell: true`, `exec(`, string-built commands, external hosts, API keys; confirm only `doi.org` and `kiro-cli`. _R8.4, R8.9_
- [x] T6.3 README: setup, honest local-only runtime notes, example's intentional problems, test commands, Kiro usage (spec, steering, agents, hooks, evidence), submission checklist with unverified items marked. _R7.3, R10_
- [ ] T6.4 (deferred by decision; the deliverable is the local app) Pending user actions (not done by Kiro): accept Xcode license so `git` works, create public GitHub repo, record demo video under 3 minutes, verify rules on the official page, submit before the deadline.

## Phase 7: Ghost editorial room (brief revised 2026-11-06)
Contracts and wiring plan: `ghost-editorial.md`.

Phase A (design and frontend, Opus 5.5):
- [x] T7.1 Reproduce the focus-ring bug (short, long, blank paragraphs, keyboard focus, 1440/1024/768/375, 200% browser zoom, 200% text zoom) and fix the editor geometry. _R9.3, R9.5_ Tests: `e2e/geometry.spec.ts`.
- [x] T7.2 Types, validators, word count and candle maths; reducer actions; schema 3 storage with non-destructive v2 migration. _R12.1, R13.1–13.2, R14.1, R15_ Tests: `unit/editorial.test.ts`, `unit/state.test.ts`, `unit/storage.test.ts`.
- [x] T7.3 New composition: study column (candle, notes, outline), ivory folio with ghost margin, References drawer, room switch, responsive bands; presentational `NotesPanel`, `OutlinePanel`, `DraftPreview`, `GhostMargin`, `GhostCard`, `GhostRoster`, `CandleGauge`; bundled starter notes; honest disabled states. _R9.1–9.8, R12.2, R12.7, R13.4–13.6, R14.2–14.3_ Tests: `e2e/room.spec.ts`, `e2e/a11y.spec.ts`, `unit/contrast.test.ts`.
- [x] T7.4 Keep existing flows working (import, DOI check, revision, apply, undo, reload, export) with references in the drawer. _R1–R6_ Tests: `e2e/flow.spec.ts` (real doi.org and real Kiro).
- [x] T7.5 Screenshots to `../../work/ghost-editorial/screens` and visual review.

Phase B (AI workflow wiring and end-to-end verification, Sonnet 5.5; done 2026-11-06):
- [x] T7.6 Tool-less `haunted-ink-editor` agent; runner parameterised by agent; validator enforces the reviser invariants on it. _R8.8, R10.3_
- [x] T7.7 Shared queue with job kinds; `POST/GET/DELETE /api/outline`, `/api/drafts`, `/api/reviews`; prompts and server validation per `ghost-editorial.md`. _R12.3–12.4, R13.1, R8.6_ Tests: `unit/tasks.test.ts`, `server/editorial.test.ts`.
- [x] T7.8 Client wiring: Structure (with replace confirmation), Draft → preview → Insert, Summon → cards; flip `EDITORIAL_WIRED`. _R12.3–12.6, R13.1–13.3_
- [x] T7.9 Real verification with the local Kiro CLI in one browser flow, `e2e/editorial.spec.ts` (it covers all three kinds, so no separate live suite), screenshots; devlog. _R11, R12, R13_
