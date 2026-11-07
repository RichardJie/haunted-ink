# Design: Haunted Ink

## 1. Architecture

```
Browser (React 19 + TS)                    Node 26 server (node:http, 127.0.0.1:4317)
┌─────────────────────────────┐  same-    ┌──────────────────────────────────────────┐
│ Desk: Manuscript · Ledger · │  origin   │ guards.ts   Host/Origin/CT/size/Sec-Fetch │
│ Revision sheet · Export     │──JSON────▶│ routes.ts   /api/health /api/citations/*  │
│ state: useReducer + storage │           │             /api/revisions[/:id]          │
│ localStorage (schema v1)    │◀──────────│ doi.ts      doi.org Handle API + CSL-JSON │──▶ doi.org
└─────────────────────────────┘           │ kiro/queue.ts   1 running + 3 queued      │
                                          │ kiro/runner.ts  spawn kiro-cli (no shell) │──▶ local kiro-cli
                                          │ kiro/protocol.ts placeholders + validation│    (own auth)
                                          │ static.ts / Vite middleware (dev)         │
                                          └──────────────────────────────────────────┘
```

Chosen because it is the smallest stack that gives a polished UI and safe process control: one origin (no CORS), one process, three runtime dependencies (`react`, `react-dom`, `diff`). Node 26 type stripping runs the server TypeScript without a build step. Rejected: Express (unneeded), Electron (heavier, not required), calling DOI providers from the browser (spreads network policy across two places and makes caching per tab).

## 2. Directory layout

```
haunted-ink/
  index.html  vite.config.ts  tsconfig.json  package.json  LICENSE  README.md
  shared/   types.ts  doi.ts  citations.ts  protect.ts  match.ts      (pure, tested)
  server/   index.ts  guards.ts  routes.ts  doi.ts  static.ts
            kiro/runner.ts  kiro/queue.ts  kiro/protocol.ts
  src/      main.tsx  App.tsx  state.ts  storage.ts  api.ts
            lib/ manuscript.ts  bibtex.ts  refparse.ts  export.ts  diff.ts
            components/ Desk.tsx  Manuscript.tsx  Ledger.tsx  ReferenceForm.tsx
                        StatusMark.tsx  RevisionSheet.tsx  DiffView.tsx
                        ExportMenu.tsx  EmptyState.tsx  Engraving.tsx  Dialog.tsx
            example/ manuscript.md  references.ts  SOURCES.md
            styles/ tokens.css  desk.css  manuscript.css  print.css
  tests/    unit/*.test.ts  server/*.test.ts  live/*.live.test.ts  e2e/*.spec.ts
  scripts/  validate-kiro-config.mjs  hooks/*.mjs
  .kiro/    specs/ steering/ agents/ hooks/ evidence/ devlog.md
```

## 3. Data model (`shared/types.ts`)

```ts
type Status = 'unchecked'|'checking'|'verified'|'mismatch'|'not_found'|'uncertain'|'invalid_doi'|'no_doi';
interface Reference { id: string; key?: string; number?: number; doi?: string; title?: string;
  authors?: string[]; year?: number; raw: string; note?: string; source: 'doi'|'bibtex'|'line'|'example' }
interface FieldCheck { field: 'title'|'year'|'firstAuthor'; claimed: string; registered: string; match: boolean }
interface Verification { status: Status; reason?: string; provider?: 'doi.org'; agency?: string;
  checkedAt?: string; registered?: { title?: string; authors?: string[]; year?: number; container?: string; url?: string };
  fields?: FieldCheck[] }
interface Block { id: string; text: string }  // heading = text starting with '#'
interface AppliedRevision { id: string; undone?: boolean; blockId: string; before: string; after: string; intent: string; appliedAt: string }
interface Saved { schema: 2; title?: string; blocks: Block[]; references: Reference[];
  verifications: Record<string, Verification>; history: AppliedRevision[] }  // Block { id; text }; AppliedRevision { id; blockId; before; after; intent; appliedAt; undone? }
```

Block IDs are stable random ids assigned when a block is created (typing, import, split) and never recomputed from text, so duplicate paragraphs, edits, Undo and reload cannot confuse them. A pending revision stores `baseText`; Apply requires the block with that id to still hold exactly `baseText` (R5.3). Undo targets the block id and warns if the paragraph was edited since.

## 4. Reference parsing (R2)
- `shared/doi.ts`: `normalizeDoi(input)` strips `doi:`, `https?://(dx.)?doi.org/`, percent-decodes, trims trailing `.,;:!?'"` and a trailing closing bracket only when it has no opener inside the DOI (so `10.1016/S0006-3495(76)85000-1` is kept intact); `doiKey` lowercases for comparison. Valid if `/^10\.\d{4,9}\/\S+$/`.
- `src/lib/bibtex.ts`: small tokenizer for `@type{key, field = {..} | ".." | number}` with nested braces; max 2,000 chars per entry; authors split on ` and `; `{}` and common LaTeX accents removed.
- `src/lib/refparse.ts`: chooses parser per pasted block: BibTeX if it starts with `@`, DOI-list if every line is a DOI, otherwise bibliography lines (DOI extracted with the same regex; year by `\b(19|20)\d{2}\b`; title left empty unless quoted).
- Citation tokens (`shared/citations.ts`): regexes from the glossary. Keys link to `Reference.key`; numerals link to `Reference.number` (ledger order when absent).

## 5. DOI verification (R3)

`POST /api/citations/verify` body `{ references: [{ id, doi, title?, year?, firstAuthor? }], force?: boolean }` (≤ 50). Response `{ results: Record<id, Verification> }`.

Outbound hosts: `doi.org` for the Handle API and content negotiation. Content negotiation answers with a redirect to the registration agency's metadata service (observed 2026-11-06: Crossref DOIs to `api.crossref.org`, DataCite DOIs to `data.crosscite.org`). Redirects are followed manually, over HTTPS only, at most 4 hops, and only to `api.crossref.org`, `data.crosscite.org` and `api.datacite.org`. Manuscript text and URLs are never fetched.

Per DOI (`server/doi.ts`, concurrency 4, `AbortSignal.timeout(8000)`, `User-Agent: HauntedInk/0.1 (local; +repo URL)`):
1. `GET https://doi.org/api/handles/{doi}?type=URL`
   - `responseCode: 1` → exists; `100` → `not_found`; anything else, 429, 5xx, network error, bad JSON → `uncertain` with reason.
2. If exists: `GET https://doi.org/{doi}` with `Accept: application/vnd.citationstyles.csl+json`, redirects followed. Failure → `uncertain`, reason `exists, metadata unavailable`, `registered.url` from step 1.
3. Compare (`shared/match.ts`) only the fields the entry provides:
   - title: NFKD, remove diacritics/punctuation/LaTeX braces, lowercase, collapse spaces; match if equal or token Dice ≥ 0.9.
   - year: match if equal to any of `issued`, `published-print`, `published-online` years.
   - firstAuthor: folded family name equals CSL `author[0].family` (or `literal`).
   - All provided fields match → `verified`; any mismatch → `mismatch` with `fields`. No fields provided → `verified` with reason "identifier exists; no fields to compare".
   - Only a JSON object with `responseCode: 100` is `not_found`. HTML error pages (even HTTP 404), `null`, arrays, missing or unknown codes are `uncertain`.
   - CSL-JSON is trusted only if it is an object whose known fields have the right types and that has a title, author or year (`parseCsl`); otherwise the result is `uncertain`, "exists, metadata unavailable".
4. Cache the **raw lookup** (handle result plus CSL-JSON) by normalised DOI, with the time it was fetched; `checkedAt` is that fetch time, so a cache hit keeps the original time and a forced re-check updates it: 24 h when definitive, 5 min for `uncertain`. The comparison against each entry's title, year and author is recomputed on every request, so a wrong title after a correct title for the same DOI is a `mismatch`. HTTP 429 and 503 are retried up to twice (Retry-After, capped at 4 s) before `uncertain`. `force` bypasses the cache.

Verified probe on 2026-11-06 (local work log `03-doi-probe.log`, outside the repo; summarised in `.kiro/devlog.md`): the five example DOIs returned `responseCode` 1 with CSL titles as in §8; `10.1145/haunted-ink.unresolved.2026` returned `responseCode` 100 and HTTP 404 for CSL.

## 6. Kiro revision (R4, R8)

### 6.1 API
- `POST /api/revisions` `{ blockId, heading?, paragraph, intent }` → `202 { id, position }` or `429 { error: 'busy' }`.
- `GET /api/revisions/:id` → `{ state: 'queued'|'running'|'succeeded'|'failed'|'cancelled'|'timed_out', position?, elapsedMs, result?, error? }`. The client polls every 750 ms.
- `DELETE /api/revisions/:id` → cancels (queued: removed; running: process group killed).
- `GET /api/health` → `{ kiro: 'ready'|'missing'|'logged_out'|'unknown', version? }` from `kiro-cli --version` and `kiro-cli whoami` (spawned without shell, cached 60 s).
- Jobs are kept in memory for 10 minutes after finishing.

### 6.2 Protection (`shared/protect.ts`)
Order: URLs, DOIs, citation tokens, then numbers (`\d+(?:[.,]\d+)*%?`). Each match becomes `⟦Cn⟧` in left-to-right order; the map is kept server-side. After the run: every placeholder must occur exactly once and no other `⟦…⟧` may appear (R4.5); then restore. Then `flagNewFacts(original, revised)` lists numbers, years, DOIs, URLs and citation-like strings present only in the revision (R4.6).

### 6.3 Prompt (stdin, built in `kiro/protocol.ts`)
```
<<<HAUNTED_INK_REQUEST
{"intent": "...", "heading": "...", "paragraph": "...⟦C1⟧...", "placeholders": ["⟦C1⟧", ...]}
HAUNTED_INK_REQUEST>>>
```
JSON-encoded with `JSON.stringify`, so user text cannot close the delimiter (the `>>>` sentinel is also escaped as `\u003e\u003e\u003e`). The reviser system prompt (`.kiro/agents/haunted-ink-reviser.json`) defines the output contract and treats the block as untrusted data.

### 6.4 Process (`kiro/runner.ts`)
```
spawn('kiro-cli', ['chat','--v3','--no-interactive','--agent','haunted-ink-reviser',
       '--trust-tools=','--output-format','stream-json'],
      { cwd: tmp, shell: false, detached: true, stdio: ['pipe','pipe','pipe'],
        env: { PATH, HOME, USER, LANG, TMPDIR, HAUNTED_INK_RUN: '1' } })
```
- `tmp = mkdtemp(os.tmpdir()/haunted-ink-run-)` containing only `.kiro/agents/haunted-ink-reviser.json` copied from the repo at startup (validated: tools empty).
- stdout parsed line by line as JSON while streaming; the first `data.sessionId` (sent early in `sessionUpdate` events) is captured immediately, so a cancelled or failed run still knows its session; keep `runFinished.data` (`status`, `finalText`); ignore other events; cap stdout at 2 MB and stderr at 64 KB (tail only, used for error classification: "not logged in", "command not found", model errors).
- Timeout 90 s; cancel or shutdown: `process.kill(-pid, 'SIGTERM')`, then `SIGKILL` after 3 s. On `SIGINT`/`SIGTERM` of the server, all jobs are cancelled before exit.
- Cleanup: `kiro-cli chat --delete-session <sessionId>` in `tmp`, then `kiro-cli chat --v3 --list-sessions --format json` in the same `tmp` to confirm that id is no longer listed (only ids are read; other directories' sessions are never touched). Each step has a 10 s timeout and is never fatal; an unconfirmed deletion is logged as a one-line cleanup warning. Then `rm -r tmp`.
- `finalText`: take the first balanced top-level JSON object; validate `revised: string (≤ 6,000)`, `changes: string[] (≤ 5)`, `declined: string[] (≤ 3)`.

Probes on 2026-11-06 (local work logs `02-runtime-probe.log` and `04-reviser-live-probe.log`, summarised in `.kiro/devlog.md`): local Google login, no `KIRO_API_KEY`; a tool-less agent answered in about 7 to 13 s; asked to read a file and run `touch`, it reported no tools and created nothing; the reviser kept both placeholders and declined an injected instruction to add a citation and a figure.

Known limitation: custom agents inherit global default resources (skills and steering under `~/.kiro`) unless `chat.disableInheritingDefaultResources` is set. The reviser has no tools, so it cannot load them. The runner writes a workspace-scoped `.kiro/settings/cli.json` with that setting into the temporary directory (global config is untouched), but whether the CLI honours it there is unverified. The reviser may therefore still see descriptions of the user's global skills and steering in its context; it cannot act on them.

### 6.5 Queue (`kiro/queue.ts`)
FIFO, one running, at most 3 waiting. Position is reported. A queued job cancelled before start never spawns.

## 7. Server guards (`server/guards.ts`, R8.1 to R8.3)
Order per request: Host allowlist → for non-GET: `Sec-Fetch-Site` not `cross-site`, `Origin` exact match, `Content-Type` starts with `application/json` → body read with 64 KB cap → JSON parse → hand-written schema check. Errors are JSON `{ error, message }` with 400/403/413/415. All responses add CSP `default-src 'self'; img-src 'self' data:; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`, `nosniff`, `no-referrer`. In dev the Vite HMR websocket is allowed by relaxing CSP `connect-src` to `'self' ws://127.0.0.1:*` only when `NODE_ENV !== 'production'`.

## 8. Built-in example (R7)
Manuscript: "Remembering Long Contexts: A Short Note on Sequence Models" (about 6 paragraphs, Markdown, `[@key]` citations).

| key | entry | DOI | expected |
|---|---|---|---|
| lecun2015 | LeCun, Bengio, Hinton. Deep learning. Nature, 2015 | 10.1038/nature14539 | verified (Crossref) |
| he2016 | He, Zhang, Ren, Sun. Deep Residual Learning for Image Recognition. CVPR 2016 | 10.1109/CVPR.2016.90 | verified (Crossref) |
| vaswani2017 | Vaswani et al. Attention Is All You Need. arXiv, 2017 | 10.48550/arXiv.1706.03762 | verified (DataCite) |
| hochreiter1997 | Hochreiter, Schmidhuber. Long Short-Term Memory. Neural Computation. **Year entered as 1998 on purpose** | 10.1162/neco.1997.9.8.1735 | mismatch (year 1997) |
| goodfellow2016 | Goodfellow, Bengio, Courville. Deep Learning. MIT Press, 2016 | none | no_doi |
| phantom2026 | **Fictional, intentional**: "On the Persistence of Phantom Citations" | 10.1145/haunted-ink.unresolved.2026 | not_found |

`src/example/SOURCES.md` records each DOI, the doi.org metadata fields used, and the retrieval date. The live test re-checks these expectations.

## 9. UI structure (R1, R5, R9)
- **Header**: engraved wordmark "Haunted Ink", manuscript title, Kiro status (from `/api/health`), Import, Example, Export.
- **Manuscript (parchment)**: block list; each paragraph is a `textarea`-backed editable block that auto-grows, with citation tokens shown in an overlay layer carrying status underlines. A paragraph's margin shows "Revise with Kiro". Headings render in small caps.
- **Ledger (right margin, dark)**: "Check all", a summary line of plain status counts (no score), and per-row "Re-check"; each row marks the margin rule by status (solid verified, double mismatch, dashed not found / uncertain); rows show key, short entry, `StatusMark` (glyph + word), a "phantom reference" caption beside Not found, an "Intentional example problem" tag on deliberate example errors (routine example notes are in Details), and expandable detail (registered metadata, field comparison, reason, checkedAt, disclaimer). Add-references form with a single paste box and auto-detected format.
- **Revision sheet**: intent presets and free text, Submit, live state (queued #n / running 12 s / Cancel), then DiffView (inline word diff: removals struck in ink-red, insertions in wet-ink tone), changes and declined lists, flagged-facts warning, Apply / Discard / Run again.
- **Undo**: a toast-free inline bar under the applied paragraph ("Revision applied · Undo"), plus a History list in the Export menu area.
- **States**: empty desk (engraving + three actions), ledger empty, checking (per-row progress), Kiro missing/logged out banner with exact command, network uncertainty note, storage-restore failure notice.

State: one `useReducer` store in `state.ts`; `storage.ts` serialises `Saved` with a 600 ms debounce and validates on load (R1.5, R1.6).

## 10. Export (R6)
`src/lib/export.ts`: `toMarkdown(manuscript, refs)` appends `## References` (ordered by first citation, author-year text plus `https://doi.org/<doi>`); `toBibtex(refs)`; `toCslJson(refs, verifications)` (registered metadata preferred for verified entries; user entries otherwise; no status fields inside CSL); `toCitationReport(refs, verifications)`. Downloads via `Blob` and `URL.createObjectURL`. Print view uses `print.css` (white, Times New Roman / SimSun, 12 pt, 1.5 spacing).

## 11. Testing strategy (R11)
| Layer | Tool | Notes |
|---|---|---|
| unit | Vitest, node env | pure functions in `shared/` and `src/lib/` |
| server | Vitest + real `node:http` server on an ephemeral loopback port | guards, routes, queue with a stub executable `tests/fixtures/slow-child.mjs` used only to test process-group killing (not a model response) |
| live | Vitest, `npm run test:live` | real doi.org and real `kiro-cli`; skip only when `/api/health` shows kiro missing/logged out or doi.org unreachable, and print why |
| e2e | Playwright, `channel: 'chrome'` | against `npm run build && npm start`; screenshots to `$HAUNTED_INK_WORK_DIR/screens` |

## 12. Traceability

| Requirement | Implementation | Tests |
|---|---|---|
| R1.1–1.4 | `Manuscript.tsx`, `lib/manuscript.ts`, import in `App.tsx` | `unit/manuscript.test.ts`, `e2e/flow.spec.ts` |
| R1.5–1.7 | `storage.ts`, `state.ts`, `EmptyState.tsx` | `unit/storage.test.ts`, `e2e/flow.spec.ts` (reload) |
| R2.1–2.7 | `shared/doi.ts`, `lib/bibtex.ts`, `lib/refparse.ts`, `ReferenceForm.tsx` | `unit/doi.test.ts`, `unit/bibtex.test.ts`, `unit/refparse.test.ts` |
| R2.8–2.9 | `shared/citations.ts`, `Ledger.tsx`, `state.ts` | `unit/citations.test.ts`, `e2e/flow.spec.ts` |
| R3.1–3.6, 3.9–3.10 | `server/doi.ts`, `shared/match.ts` | `unit/match.test.ts`, `live/doi.live.test.ts`, `server/doi-errors.test.ts` (unroutable host / timeout produce `uncertain`) |
| R3.7–3.8 | `StatusMark.tsx`, `Ledger.tsx` | `e2e/flow.spec.ts` (disclaimer text, glyph + word) |
| R4.1–4.2 | `RevisionSheet.tsx`, `routes.ts` | `server/routes.test.ts`, `e2e/flow.spec.ts` |
| R4.3, 4.5–4.6 | `shared/protect.ts`, `kiro/protocol.ts` | `unit/protect.test.ts`, `unit/protocol.test.ts` |
| R4.4, 4.7–4.10 | `kiro/runner.ts`, `kiro/queue.ts`, `api.ts` | `live/kiro.live.test.ts`, `server/queue.test.ts` |
| R5.1–5.5 | `DiffView.tsx`, `lib/diff.ts`, `state.ts` | `unit/state.test.ts`, `e2e/flow.spec.ts` |
| R6.1–6.5 | `lib/export.ts`, `ExportMenu.tsx`, `print.css` | `unit/export.test.ts`, `e2e/flow.spec.ts` (download) |
| R7.1–7.4 | `src/example/*` | `live/doi.live.test.ts` (expected statuses), `e2e/flow.spec.ts` |
| R8.1–8.3 | `server/guards.ts`, `server/index.ts` | `server/guards.test.ts` |
| R8.4–8.7 | `kiro/runner.ts`, `kiro/queue.ts` | `live/kiro.live.test.ts` (cancel, no orphans via `ps -g`), `server/queue.test.ts` |
| R8.8 | `.kiro/agents/haunted-ink-reviser.json` | `npm run validate:kiro`, `live/kiro.live.test.ts` (tool attempt creates no file) |
| R8.9 | `server/doi.ts` host constant, CSP | `server/guards.test.ts`, code review checklist in T9 |
| R9.1–9.8 | `styles/*`, components | `e2e/a11y.spec.ts` (keyboard, 375 px, reduced motion), screenshots review |
| R10.1–10.4 | `.kiro/*`, `scripts/*` | `npm run validate:kiro`, `.kiro/evidence/hook-events.jsonl` |
| R11 | `tests/*` | `npm run check`, `npm run test:live`, `npm run test:e2e` |
| R9.5 (geometry) | `styles/manuscript.css` `.field`, `.block-tools` | `e2e/geometry.spec.ts` |
| R12 | `StudyPanels.tsx`, `state.ts`, `shared/editorial.ts` (`validateOutline`, `validateDraft`); routes in Phase B | `unit/editorial.test.ts`, `unit/state.test.ts`, `e2e/room.spec.ts`; Phase B: `live/editorial.live.test.ts`, `e2e/editorial.spec.ts` |
| R13 | `GhostMargin.tsx`, `Manuscript.tsx`, `shared/editorial.ts` (`validateReview`, `isReviewStale`); route in Phase B | `unit/editorial.test.ts`, `e2e/room.spec.ts` (layout with a labelled test fixture); Phase B live/e2e |
| R14 | `CandleGauge.tsx`, `candleProgress` | `unit/editorial.test.ts`, `e2e/room.spec.ts` |
| R15 | `storage.ts` | `unit/storage.test.ts`, `e2e/room.spec.ts` (schema 2 upgrade) |

## 13. Ghost editorial room (added 2026-11-06)

Contracts, routes, prompts and the Phase B wiring plan are in `ghost-editorial.md` in this folder; that file is authoritative for R12–R15. Summary of what Phase A built:

- **Composition** (`App.tsx`, `styles/desk.css`, `styles/manuscript.css`): masthead → study column (`CandleGauge`, `NotesPanel`, `OutlinePanel`) → page. The page is one CSS grid (`.manuscript`): column 1 is the ivory folio, column 2 the ghost margin. Each block row (`.folio-row`, `display: contents`) places its `.block` and its `GhostMargin` on the same grid row via `--row`, so cards stay beside their paragraph in normal flow. The `GhostRoster` spans the head row and any leading heading rows. Under 900 px the grid becomes block flow (cards below the paragraph) and a sticky room switch shows one room at a time. References open in a `Dialog` drawer.
- **Editor geometry**: `.field` is the reserved editor area (mirror + transparent textarea at identical padding); the textarea focus ring uses `outline-offset: -2px`; `.block-tools` is a separate, always-present 40 px row. Cause of the reported bug: the old ring used `outline-offset: 8px` on a borderless textarea, extending 10 px past the field onto the 6 px-away tool row.
- **Candle** (`shared/editorial.ts` `candleProgress`, `CandleGauge.tsx`): wax body is a `scaleY(wax)` rect anchored at the dish; flame, wick and cap translate down by `(1 − wax) × H`. Transitions only on change; none under reduced motion.
- **State and storage**: reducer actions and schema 3 migration as listed in `ghost-editorial.md`.

### 13.1 Editorial jobs (wired 2026-11-06)
One queue serves four job kinds (`revision`, `structure`, `draft`, `review`): one Kiro process at a time, three waiting, 90 s timeout, process-group cancel. Revisions run on `haunted-ink-reviser`, the other three on `haunted-ink-editor` (both tool-less, validated by `npm run validate:kiro`). Each kind has its own route (`/api/revisions|outline|drafts|reviews`, `POST`, `GET /:id`, `DELETE /:id`) and a job is visible only through its own route. Output checks live in `server/kiro/tasks.ts`; a cancelled job never reports a result, even if the process finished first. The client keeps a snapshot per request (notes and outline for Structure; heading, brief, evidence and notes for Draft; paragraph text for Review) and compares it when the answer arrives.
