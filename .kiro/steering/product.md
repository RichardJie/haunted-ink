---
inclusion: always
---

# Haunted Ink: product rules

Haunted Ink is a local ghost editorial room for English computer-science and academic papers. Entry: Kiroween 2026, Costume Contest track, solo entrant.

**The paper editor is the substance; haunting is how one interacts with it.** (Brief revised by the entrant on 2026-11-06; it supersedes the earlier DOI-first scope.)

## The experience
1. **Notes.** Write or load research notes (persistent, editable). A clearly labelled starter set is bundled.
2. **Outline.** One explicit, real Kiro call structures the notes into an editable outline: sections with a heading, a brief, and evidence marked *cited* (a real key) or *needed*. Authors can also add and edit sections by hand.
3. **Draft.** A separate explicit action drafts ONE selected outline section into one paragraph. The draft is previewed and only enters the manuscript when the author chooses Insert, as a new paragraph; existing text is never changed.
4. **Ghost review.** For a selected paragraph, a real Kiro call returns at most 5 concerns, each with an exact quote from that paragraph, a category (logic, evidence, clarity), a critique and advice. Cards are pinned beside the paragraph (below it on narrow screens), go stale after edits, and can be resolved, dismissed, reopened or reviewed again. Zero concerns is a valid answer.
5. **Writing candle.** Wax shortens as body word count approaches an editable, saved word goal. Never driven by time or a made-up score.
6. Keep: import, references (DOI, BibTeX, lines) checked against doi.org in an auxiliary References panel, paragraph revision with diff, Apply/Discard/Undo, exports.

## Honesty rules (non-negotiable)
- Never ship canned, mocked, precomputed or fabricated model output (outline, draft, review or revision). Controls that are not wired yet are disabled and say so. If kiro-cli is unavailable, show an actionable error.
- No automatic writing on keystrokes. No invented sources, results, numbers or citation keys; unsupported claims are marked `[evidence needed: …]`.
- Ghost critique is a reading of the argument. It is separate from DOI checks and never presented as a citation verdict.
- A verified DOI means the identifier exists and its registered metadata matches the entry, never that the source supports the sentence. Say so wherever Verified appears. Network or provider failure is Uncertain, never Not found.
- Built-in example metadata must be real and sourced; intentional problems are labelled as intentional.
- Saved work survives upgrades: migrate storage forward, never reset it.
- Runtime is local-only: a locally installed, logged-in kiro-cli and network access to doi.org.

## Out of scope
Accounts, payments, collaboration, cloud sync, analytics, model choice beyond Kiro models, other AI providers, unrelated bonus features. All visible copy is English.

## Submission facts
User-provided, not yet verified against the official rules page (it returned HTTP 403 on 2026-11-06): new project created Oct 30 to Dec 4 2026; public GitHub repo with an open-source license and committed root `.kiro`; public YouTube demo under 3 minutes; judged equally on impact, technical Kiro depth, design, innovation and presentation; deadline Dec 4 2026 14:00 PT. Do not state these as verified.
