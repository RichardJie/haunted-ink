# Haunted Ink

A ghost editorial room for English computer-science papers. Research notes become an editable outline, the outline is drafted one paragraph at a time, and ghost reviewers point at logic gaps and missing evidence beside the paragraph they read. A writing candle burns down as your word count approaches your goal. Haunted Ink also checks that the DOIs you cite exist and match your entries, and asks the Kiro CLI on your machine to revise one paragraph at a time without touching your citations or adding facts.

> **Status (2026-11-06, client date):** the full workflow is wired to your local Kiro CLI: notes → outline → one drafted paragraph at a time → ghost review beside the paragraph, plus the writing candle, DOI checks, revision with diff, apply, undo and exports. See `.kiro/devlog.md` and `.kiro/specs/haunted-ink/ghost-editorial.md`.

## What it does
- Keep research notes (a labelled starter set is bundled). **Structure into outline** asks Kiro once for an editable outline; evidence is marked *cited* only for keys that appear in your notes or reference ledger (a key in the notes alone is your own claim, not proof the source exists), otherwise *needed*. **Draft paragraph** turns one section into one previewed paragraph; it enters the manuscript only when you choose Insert, as a new paragraph, and existing text never changes. Unsupported claims are marked `[evidence needed: …]`, and numbers or years Kiro introduced that are not in your notes are listed for you to check. A draft containing a DOI or URL you never supplied is refused. If the notes or the section change while Kiro works, the result is flagged as out of date instead of being applied silently.
- Ghost reviewers (The Logician, The Archivist, The Copyist): **Summon reviewers** on one paragraph returns at most 5 concerns, each quoting words that exist verbatim in that paragraph; concerns whose quote is not exact are dropped and counted, and a reply where every concern was dropped is reported as a failure, not a clean review. Zero concerns is a valid answer. Cards sit beside the paragraph (below it under 900 px), can be resolved, dismissed or reopened, and go stale as soon as you edit the paragraph; Review again re-reads it. Ghost critique reads your argument and is never a citation verdict.
- A writing candle shortens with your body word count toward an editable goal.
- Write or import a plain-text or Markdown manuscript.
- Add references as DOIs, BibTeX, or bibliography lines.
- Check each DOI against doi.org and see one of: **Verified**, **Mismatch** (with the fields that differ), **Not found**, or **Uncertain** (network or provider problem), plus Invalid DOI and No DOI. Only an explicit "no such handle" answer from doi.org counts as Not found; error pages and malformed answers are Uncertain. Check times show when doi.org was actually asked, also for cached results. An unresolved citation is marked in the text as a phantom reference, next to the Not found status.
- Ask Kiro to revise a paragraph with your intent. Citations, DOIs, URLs and numbers are locked before Kiro sees the text, and any new figure in the result is flagged.
- Compare before and after, then Apply or Discard. Undo is kept across reloads.
- Export Markdown, BibTeX, CSL-JSON, a citation report, or print to PDF.

**A verified DOI only means the identifier exists and its registered metadata matches your entry. It does not mean the source supports your sentence.**

## Runs locally only
- The server listens on `127.0.0.1` only.
- Revisions use your own installed and logged-in `kiro-cli` (`kiro-cli login`). There are no API keys and no other model providers. Kiro usage counts against your Kiro plan.
- DOI checks need network access to `doi.org`. Its metadata request is redirected to the registration agency's service (`api.crossref.org`, `data.crosscite.org`, `api.datacite.org`); the server follows only those HTTPS hosts and never fetches URLs from your manuscript.
- Each revision runs in a fresh temporary directory; afterwards its Kiro session is deleted and the server confirms it is no longer listed there (a failure is logged as a cleanup warning). Known limitation: the reviser may still inherit descriptions of your global Kiro skills and steering; it has no tools, so it cannot use them.
- There is no hosted demo. Judges and users run it on their own machine.

## Requirements
- Node.js 26 or later, npm
- Kiro CLI 3.0 or later, logged in (`kiro-cli whoami`)
- Google Chrome for end-to-end tests

## Commands
```
npm install
npm run dev          # http://127.0.0.1:4317
npm run build && npm start
npm run check        # typecheck, unit tests, Kiro config validation
npm run test:live    # real doi.org and real kiro-cli, no mocks
npm run test:e2e     # Playwright in Chrome
npm run validate:kiro
```

Quick start: log in to Kiro CLI first (see Requirements), then `npm install`, `npm run build && npm start`, and open http://127.0.0.1:4317. Set `HAUNTED_INK_PORT` to use another port.

## The built-in example
A short note on sequence models citing LeCun et al. 2015, He et al. 2016, Vaswani et al. 2017 (arXiv DOI), Hochreiter and Schmidhuber 1997, and Goodfellow et al. 2016. Two problems are **intentional** so every status can be seen:
- Hochreiter and Schmidhuber is entered with year 1998; doi.org records 1997, so it shows **Mismatch**.
- "On the Persistence of Phantom Citations" is fictional, with DOI `10.1145/haunted-ink.unresolved.2026`, so it shows **Not found**.
- Goodfellow et al. has no DOI and shows **No DOI**.

Loading the example leaves every reference **Unchecked**; only a real check against doi.org produces a status. Sources and retrieval dates are in `src/example/SOURCES.md`.

## How Kiro is used
| Where | What |
|---|---|
| `.kiro/specs/haunted-ink/` | Requirements (EARS), design with traceability table, ordered tasks |
| `.kiro/steering/` | Always-included product, engineering and design-language rules |
| `.kiro/agents/haunted-ink-builder.json` | Development agent with scoped permissions |
| `.kiro/agents/haunted-ink-reviser.json` | Runtime agent: no tools, no MCP, deny-all permissions, untrusted-input prompt |
| `.kiro/agents/haunted-ink-editor.json` | Runtime agent for outline, draft and review: same tool-less invariants, three output contracts chosen by `task`; all four Kiro job kinds share one queue and run in a fresh temporary directory |
| `.kiro/hooks/` | CLI V3 hooks: guard shell and writes, re-validate Kiro config after edits, brief each session from the task list, run `npm run check` before a turn ends |
| `.kiro/evidence/hook-events.jsonl` | One line per hook decision, written by the hook scripts |
| `.kiro/devlog.md` | Session-by-session development log |

Development sessions: `kiro-cli chat --v3 --agent haunted-ink-builder --trust-workspace`.

## Kiroween 2026 submission notes
Costume Contest track, solo entrant. The following were provided by the entrant and **have not been verified** against the official rules page, which returned HTTP 403 when checked on 2026-11-06:
new project created between Oct 30 and Dec 4 2026; public GitHub repository with an open-source license and the root `.kiro` directory committed; public YouTube demo under 3 minutes; judged equally on impact, technical Kiro depth, design, innovation and presentation; deadline Dec 4 2026, 14:00 PT.

Deferred by decision (the deliverable for now is the complete local app; nothing has been published or submitted). Still to do by the entrant: verify the rules at https://kiroween.devpost.com/rules, publish the repository, record the video, submit.

## License
MIT. See `LICENSE`.
