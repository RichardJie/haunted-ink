---
inclusion: always
---

# Design language: a ghost editorial room

## Composition
- Three rooms read left to right: **I Notes, II Outline** (the study column, with the writing candle at its head) and **III Manuscript** (an ivory folio). The folio's right margin belongs to the ghost reviewers. References are auxiliary: a drawer opened from the masthead.
- Paragraph and ghost notes share one grid row in normal flow. Cards sit beside their paragraph on wide screens and directly below it under 900 px. No absolute overlays for content.
- 900–1279 px: the study becomes a band above the page (candle | notes | outline). Under 900 px: a sticky room switch (Notes / Outline / Manuscript), one room at a time, candle always visible.
- No dashboard tiles, stat grids, emoji as design or icon-button clutter. Per-item housekeeping controls appear on hover or focus; on touch they are always shown.
- Measure: manuscript at 1.125 rem Times, 1.6 line height, roughly 64–74 characters per line.

## Colour tokens (`src/styles/tokens.css`)
- Night ink surfaces: `--night #0e0d11`, `--night-2 #16141b`, `--night-3 #1f1c25`, rules `--rule #322d39`, text `--bone #ebe4d6`, `--dust #b5ad9f`.
- Aged ivory only where text is read and written: `--ivory #f1e9d8`, `--ivory-2`, `--ivory-edge`; `--ink`, `--ink-muted`, `--wet-ink` (pending text).
- Candlelit brass: `--brass`, `--brass-lit` (primary actions, focus on dark, numerals, the candle).
- Spectral cool for reviewer presences: `--spectral`, `--spectral-ink` (on ivory).
- `--ink-red` / `--ink-red-lit`: evidence concerns, evidence needed, and DOI Not found/Mismatch. Amber: Uncertain. Verdigris: Verified.
- Ghost categories: logic = spectral, evidence = ink red, clarity = brass. Each is also named in words (The Logician / Logic, The Archivist / Evidence, The Copyist / Clarity). Colour never carries meaning alone.
- All token text pairs meet WCAG AA (`tests/unit/contrast.test.ts`).

## Type
- Manuscript, notes, quotes, export and print: `"Times New Roman", Times, "SimSun", "Songti SC", serif`.
- Room and section labels: the Times stack in small caps, letter-spaced, with brass roman numerals.
- Controls and labels: `"Avenir Next", "Helvetica Neue", "PingFang SC", system-ui, sans-serif`, sized in rem so text zoom works. System fonts only.

## Motifs, each tied to an interaction
- **Ghost** (line-art hood with hollow eyes): reviewer presence, the Summon action, the reading state (slow drift).
- **Ink blot**: evidence needed, evidence concerns.
- **Wax seal**: a resolved concern.
- **Candle**: the functional word-count gauge; flame sways gently while burning, gone when unlit, smoke when the goal is reached.
- Cards materialise (short fade and slide); a dashed tether points toward their paragraph. Stale cards turn dashed and dim.
- DOI cues remain: phantom-reference underline for Not found, double impression for Mismatch, dashed amber for Uncertain.
- Forbidden: pumpkins, bats, cartoon ghosts, particles, flicker, cursor trails, neon glow.

## Interaction and access
- Editor geometry: each paragraph has a reserved editor area (`.field`) and a separate reserved control row (`.block-tools`, always 40 px high). Focus rings on text fields are drawn inside their own box (`outline-offset: -2px`), so they never cover controls. Covered by `tests/e2e/geometry.spec.ts`.
- Every action works by keyboard with a visible focus ring (`--brass-lit` on night, `--ink` on ivory). Ctrl/Cmd+Enter submits a revision; Escape closes sheets, dialogs and the References drawer. Dialogs trap and restore focus. Focused fields are not hidden under the sticky room switch.
- `prefers-reduced-motion: reduce` removes all animation and transitions.
- Layout works at 1440, 1024, 768, 375 px and 200% zoom without horizontal scrolling. Touch targets at least 40 px.
- Empty, loading, disabled and error states are designed, in plain English, and say what to do next.
