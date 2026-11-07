# Requirements: Haunted Ink

Haunted Ink is a local ghost editorial room for English computer-science and academic papers: research notes become an editable outline, the outline is drafted one paragraph at a time, and ghost reviewers critique logic gaps and missing evidence beside the paragraph they read. It also checks that cited DOIs exist and match their entries, and revises one paragraph at a time without changing citations or adding facts. All model work goes through the locally authenticated Kiro CLI. (Scope revised 2026-11-06: R12–R15 added, R1.7 and R9 updated.)

Acceptance criteria use EARS wording. IDs (for example R3.4) are referenced by `design.md`, `tasks.md` and test names.

## Glossary
- **Manuscript**: one plain-text or Markdown document, split into blocks (headings and paragraphs) at blank lines.
- **Citation token**: an in-text citation, matched by `[@key]`, `[@key1; @key2]`, `\cite{a,b}` (also `\citep`, `\citet`), numeric `[1]`, `[2-4]`, `[1, 3]`.
- **Reference**: one bibliography entry with an optional citation key, DOI, title, authors and year.
- **Protected token**: a citation token, DOI, URL, or number in a paragraph sent for revision.
- **Verification status**: `verified`, `mismatch`, `not_found`, `uncertain`, `invalid_doi`, `no_doi`, `unchecked`, `checking`.

## R1 Manuscript
User story: As an author, I want to write or import my manuscript so I can work on it in one place.
1. The app shall provide an editable document panel for plain text and Markdown, rendered in the Times New Roman / SimSun stack.
2. When the user imports a `.md`, `.markdown` or `.txt` file of at most 200 KB of valid UTF-8, the app shall replace the manuscript after confirmation if the current manuscript is not empty.
3. If an imported file has another type, exceeds 200 KB, or is not valid UTF-8, then the app shall leave the manuscript unchanged and explain why.
4. The app shall split the manuscript into blocks at blank lines and treat lines starting with `#` as headings.
5. While the user edits, the app shall save the manuscript, references, verification results and revision history to `localStorage` within 1 second of the last change, and restore them on reload.
6. If no saved data exists, then the app shall start empty without any message. If saved data is corrupt, or from an unknown schema version, then the app shall start empty and tell the user that saved work could not be restored, without crashing.
7. When the manuscript is empty, the app shall show an empty state offering: start writing, load the example, or import a file, while the Notes, Outline and ghost reviewer areas remain visible.

## R2 Reference input
User story: As an author, I want to add my references in the formats I already have.
1. The app shall accept DOIs one per line, with or without `doi:`, `https://doi.org/` or `http://dx.doi.org/` prefixes.
2. The app shall accept BibTeX entries and read `key`, `title`, `author`, `year` and `doi` fields.
3. The app shall accept plain bibliography lines and extract a DOI when one is present.
4. The app shall normalise DOIs (trim, strip prefixes, decode percent-encoding, strip trailing punctuation and only unbalanced closing brackets, compare case-insensitively) and refuse duplicates with a message naming the existing entry.
5. If a DOI does not match `10.<4-9 digits>/<non-space suffix>`, then the app shall mark it `invalid_doi` without a network request.
6. An entry without a DOI shall show `no_doi` and shall never be shown as verified.
7. The app shall limit the ledger to 100 references and 2,000 characters per pasted entry.
8. The app shall link citation tokens in the manuscript to references by key or number and mark tokens with no matching reference as "Unlinked citation".
9. The user shall be able to edit and delete a reference; editing a DOI, title, author or year resets its status to `unchecked`.

## R3 DOI verification
User story: As an author, I want to know which DOIs are real and match my entries, and which checks could not be completed.
1. When the user checks references, the server shall query the doi.org Handle API (`https://doi.org/api/handles/<doi>`) for each DOI.
2. When the Handle API returns `responseCode` 1, the server shall request CSL-JSON metadata from `https://doi.org/<doi>` with `Accept: application/vnd.citationstyles.csl+json`.
3. When metadata is returned, the server shall compare it with the entry's title, year and first-author family name, and return `verified` if every provided field matches or `mismatch` with a per-field comparison if any differ.
4. When the Handle API returns `responseCode` 100, the server shall return `not_found`.
5. If a request times out (8 s), returns HTTP 429 or 5xx, fails at the network level, or returns an unparseable body, then the server shall return `uncertain` with the reason and shall not return `not_found`.
6. If the DOI exists but metadata cannot be retrieved, then the server shall return `uncertain` with reason "exists, metadata unavailable", and the UI shall show that the identifier exists.
7. Wherever `verified` is shown, the app shall state that it confirms the identifier and its registered metadata only, not that the source supports the claim.
8. The app shall show each status as a word plus a glyph, not colour alone, and show `checkedAt` (the time of the actual network lookup, not of a cache hit) and the provider for every completed check.
9. The server shall cache raw lookups (identifier and registered metadata) in memory by normalised DOI, never a verdict, and recompute the comparison for each entry; 24 h for definitive lookups, 5 min for `uncertain`; retry HTTP 429/503 twice before returning `uncertain`, and allow a forced re-check.
10. The server shall accept at most 50 references per request and run at most 4 outbound requests at a time.

## R4 Kiro paragraph revision
User story: As an author, I want Kiro to improve one paragraph the way I ask without touching my citations or inventing anything.
1. The user shall be able to choose a paragraph, pick a preset intent (Tighten, Clarify the argument, Formal academic tone, Grammar only) or write an intent of at most 500 characters, and submit with a button or Ctrl/Cmd+Enter.
2. The server shall reject paragraphs longer than 4,000 characters and empty intents with a clear message.
3. Before sending, the server shall replace every protected token with a numbered placeholder `⟦Cn⟧`.
4. The server shall run the local `kiro-cli` with the tool-less `haunted-ink-reviser` agent and parse the JSON object `{revised, changes, declined}` from the run's final text.
5. If the output is not valid JSON of that shape, or any placeholder is missing, duplicated or invented, then the server shall return a failed result explaining what went wrong, and the app shall not offer Apply.
6. After restoring placeholders, the server shall flag numbers, years, DOIs, URLs or citation-like text in the revision that are not in the original, and the app shall require an explicit confirmation before applying a flagged revision.
7. While a revision is queued or running, the app shall show its queue position or elapsed time and a Cancel action.
8. When the user cancels, or after 90 s, the server shall end the Kiro process and report `cancelled` or `timed_out`.
9. If `kiro-cli` is missing, not logged in, or exits with an error, then the app shall show the cause and the command that fixes it (for example `kiro-cli login`).
10. The app shall never display text that did not come from a real Kiro run in this session as a model revision.

## R5 Compare, apply, undo
User story: As an author, I want to see exactly what changed and stay in control.
1. When a revision succeeds, the app shall show the original and revised paragraph with a word-level diff, plus Kiro's `changes` and `declined` notes.
2. The app shall change the manuscript only when the user chooses Apply.
3. If the paragraph changed after the request was sent, then the app shall block Apply and offer to run the revision again.
4. After Apply, the app shall offer Undo; the history shall keep the last 20 applied revisions across reloads.
5. The user shall be able to Discard a revision without changing the manuscript.

## R6 Export
User story: As an author, I want to take my work out of the app.
1. The app shall export the manuscript as Markdown with a References section generated from the ledger.
2. The app shall export references as BibTeX and as CSL-JSON.
3. The app shall export a citation report in Markdown listing every reference's status, reason, provider, check time and the R3.7 disclaimer.
4. The app shall provide a print view (Save as PDF) of the manuscript set in Times New Roman / SimSun on white.
5. Export file names shall be derived from the manuscript title and the date, for example `my-paper-2026-11-06.md`.

## R7 Built-in example
User story: As a judge or new user, I want a realistic example that shows every state honestly.
1. The app shall include a short CS manuscript (5 to 7 paragraphs) whose citations use real references with metadata retrieved from doi.org, with the sources and retrieval date documented in the repository.
2. The example shall include at least one `verified` Crossref DOI, one `verified` DataCite DOI, one deliberate `mismatch`, one deliberate `not_found`, and one `no_doi` entry.
3. The example shall label its deliberate problems as intentional in the reference notes and the README.
4. Loading the example shall leave every reference `unchecked`; only a real doi.org check produces a status. Loading it shall require confirmation when the current manuscript is not empty.

## R8 Local runtime and security
User story: As a user, I want the app to run only on my machine and to resist hostile input.
1. The server shall bind to 127.0.0.1 only and reject requests whose `Host` is not `127.0.0.1:<port>` or `localhost:<port>`.
2. For non-GET requests, the server shall require an `Origin` equal to the app origin, `Content-Type: application/json`, and a body of at most 64 KB that passes schema validation; it shall reject `Sec-Fetch-Site: cross-site`.
3. The server shall send no CORS headers and shall send a CSP of `default-src 'self'` plus `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer`.
4. The server shall start `kiro-cli` with an argument array and `shell: false`, pass the request only on stdin, and pass a minimal environment without API keys.
5. Each Kiro run shall use a new temporary directory containing only the reviser agent config; the server shall delete the run's Kiro session and the directory when the run ends.
6. The server shall run one Kiro process at a time, queue at most 3 more, and answer `429` with a "busy" message beyond that.
7. On timeout, cancellation or server shutdown, the server shall terminate the process group and leave no child processes.
8. The reviser agent shall have no tools, no MCP servers, no resources, and a deny-all permission rule, and its prompt shall treat request content as untrusted data.
9. The app shall not call any model API other than the local `kiro-cli`. The server's outbound hosts are `doi.org` and, via its content-negotiation redirects only, the HTTPS metadata hosts `api.crossref.org`, `data.crosscite.org` and `api.datacite.org`.

## R9 Design, accessibility and states
User story: As an author working late, I want a calm, beautiful, readable desk that works with keyboard and on small screens.
1. The UI shall follow `.kiro/steering/design-language.md`: a ghost editorial room with Notes, Outline and an ivory Manuscript folio whose margin holds the ghost reviewers; references in an auxiliary drawer.
2. Supernatural motifs (ghost, ink blot, wax seal, candle) shall each be tied to an interaction (reviewers, evidence needed, resolved concerns, word progress) or a citation status, as defined in the design language.
3. Every action shall be reachable by keyboard with a visible focus indicator, and dialogs shall trap and restore focus.
4. When `prefers-reduced-motion: reduce` is set, the app shall not animate.
5. The layout shall work from 360 px wide to desktop and at 200% zoom without horizontal scrolling of the app shell. Focus rings on text fields shall stay inside the field's own box and shall not overlap any control (`tests/e2e/geometry.spec.ts`).
6. Text shall meet WCAG 2.2 AA contrast.
7. All visible copy shall be English.
8. Loading, empty and error states shall exist for the manuscript, ledger, verification and revision, each naming the next action.

## R10 Kiro development evidence
User story: As a judge, I want to see how Kiro built the project.
1. The repository shall commit `.kiro/` with this spec, always-included steering, the builder and reviser agents, and the hooks.
2. Hooks shall be standalone CLI V3 hook files that guard shell commands and writes, re-validate Kiro config after edits, brief each session from the task list, and run `npm run check` at Stop; each decision shall append a line to `.kiro/evidence/hook-events.jsonl`.
3. `npm run validate:kiro` shall validate agents with `kiro-cli agent validate` and check hooks, steering and spec files.
4. `.kiro/devlog.md` shall record every Kiro session: date, model, commands, results and deviations.

## R11 Verification
1. Unit tests shall cover DOI normalisation, BibTeX and line parsing, citation token extraction, placeholder protection and restoration, output validation, metadata matching, and storage migration.
2. Live tests (`npm run test:live`) shall call the real doi.org for the example DOIs and the real `kiro-cli` reviser, with no mocks, and shall skip with a clear message only when the network or a logged-in `kiro-cli` is unavailable.
3. Live tests shall cover a prompt-injection paragraph, cancellation without orphan processes, and the queue limit.
4. Server tests shall cover Host, Origin, Content-Type, body size and `Sec-Fetch-Site` rejections.
5. Playwright tests shall cover load example → check references → revise → apply → undo → export, keyboard-only use, a 375 px viewport and reduced motion, and save screenshots to the work directory.

## R12 Notes, outline and drafting
User story: As an author, I want to turn my research notes into an outline and draft it one paragraph at a time, without the tool inventing anything.
1. The app shall keep editable research notes (at most 20,000 characters) and an editable outline (at most 12 sections, each with heading, brief and evidence items) and save both with the manuscript.
2. The app shall offer a clearly labelled bundled starter set of notes; loading it shall require confirmation when notes exist.
3. When the user chooses Structure, the server shall run one real Kiro call on the notes and return sections validated by `validateOutline`; evidence items shall be `cited` only with keys present in the ledger or the notes, otherwise `needed`. Replacing an existing outline shall require confirmation.
4. When the user chooses Draft on one section, the server shall run one real Kiro call and return one paragraph validated by `validateDraft` (no unknown citation keys, one paragraph, at most 2,500 characters); unsupported claims shall be marked `[evidence needed: …]`.
5. A draft shall be shown as a preview and shall enter the manuscript only when the user chooses Insert, as a new paragraph after the section's previous draft or at the end; existing text shall not change. Discard shall leave the manuscript unchanged.
6. The app shall never write on keystrokes and shall never show outline or draft text that did not come from a real Kiro run in this session.
7. While Kiro CLI is missing or not logged in, Structure and Draft shall be disabled with a plain reason that names the fix; otherwise a failed run shall show the server's error and the fix command. A result that arrives after the notes or the section changed shall be flagged as out of date and shall not replace or be inserted without an explicit choice; a cancelled run shall never deliver a result.

## R13 Ghost reviewers
User story: As an author, I want sceptical reviewers to point at the exact words where my argument or evidence is weak.
1. When the user summons reviewers for one paragraph, the server shall run one real Kiro call and return at most 5 findings, each with `category` in logic, evidence or clarity, a `quote` that is an exact substring of the reviewed paragraph, a critique and advice (each at most 280 characters). Findings whose quote is not in the paragraph shall be dropped and counted. Zero findings is a valid result and shall be shown honestly.
2. Each review shall be stored against the paragraph's stable block id with the exact text reviewed. When the paragraph text differs, the review shall be shown as stale; quotes no longer present shall be labelled.
3. Each finding shall offer Resolve and Dismiss, and settled findings Reopen; the paragraph shall offer Review again.
4. Cards shall be laid out in normal flow beside their paragraph at 900 px and wider and directly below it under 900 px.
5. Ghost critique shall be visibly distinct from DOI verification and shall never be presented as a citation verdict.
6. While Kiro CLI is missing or not logged in, Summon shall be disabled with a plain reason that names the fix. The shipped app shall contain no review text. A reply in which every concern was dropped shall be shown as a failed review, not a clean one; a result for a deleted paragraph shall be discarded.

## R14 Writing candle
User story: As an author, I want to see my progress as a candle that burns down as I write.
1. The candle's wax height shall be `stub + (1 − stub) × (1 − min(1, words / goal))`, where words is the body word count (headings, citation tokens and evidence markers excluded) and goal is an editable word goal (50 to 200,000, default 1,500) saved with the manuscript.
2. The candle shall expose numeric progress to assistive technology (`role="progressbar"`, words of goal and percent) and show unlit (0 words), burning and spent (goal reached) states.
3. The candle shall not change with elapsed time, and shall not animate when reduced motion is requested.

## R15 Persistence and migration
1. The app shall save schema 3 (`Saved` in `shared/types.ts`) under `haunted-ink:v3`.
2. When only schema 2 data exists, the app shall migrate it on load keeping manuscript, references, verifications and history, and shall leave the schema 2 copy untouched.
3. Before saving over unreadable data, the app shall copy the raw text to `haunted-ink:unreadable-backup`.
