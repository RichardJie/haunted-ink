import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { isValidDoi, normalizeDoi } from '../shared/doi.ts';
import type { Reference, Verification } from '../shared/types.ts';
import { cancelJob as cancelServerJob, cancelRevision, getHealth, getJob, getRevision, submitJob, submitRevision, verifyDois, type ApiError, type HealthInfo, type JobBodies, type JobResults } from './api.ts';
import type { JobKind } from '../shared/types.ts';
import { ConfirmDialog, Dialog } from './components/Dialog.tsx';
import { EmptyState } from './components/EmptyState.tsx';
import { CandleGauge } from './components/CandleGauge.tsx';
import { Ghost } from './components/Engraving.tsx';
import type { GhostAccess } from './components/GhostMargin.tsx';
import { NotesPanel, OutlinePanel } from './components/StudyPanels.tsx';
import { ExportMenu } from './components/ExportMenu.tsx';
import { Ledger } from './components/Ledger.tsx';
import { Manuscript } from './components/Manuscript.tsx';
import { RevisionSheet } from './components/RevisionSheet.tsx';
import exampleMd from './example/manuscript.md?raw';
import starterNotes from './example/notes.md?raw';
import { bodyWords, candleProgress, textHash } from '../shared/editorial.ts';
import { statusOf } from './components/Ledger.tsx';
import { EXAMPLE_REFERENCES } from './example/references.ts';
import { formatReference, orderedReferences } from './lib/export.ts';
import { headingFor, readImport, splitIntoBlocks, titleOf } from './lib/manuscript.ts';
import { parseReferences } from './lib/refparse.ts';
import { uid } from './lib/uid.ts';
import { checkUndo, draftInsertIndex, draftSnapshot, emptyState, fingerprint, fromSaved, prepareApply, reducer, toSaved, type DraftPreviewState, type KiroTask } from './state.ts';
import { loadSaved, writeSaved } from './storage.ts';

/**
 * Controls stay usable unless the local Kiro CLI is known to be missing or logged out; in that case the
 * reason names the command that fixes it. Any other failure is reported by the server when a job runs.
 */
function access(health: HealthInfo | null): GhostAccess {
  if (health?.kiro === 'missing') return { available: false, reason: 'Kiro CLI was not found. Install it (https://kiro.dev/cli), then run kiro-cli login.' };
  if (health?.kiro === 'logged_out') return { available: false, reason: 'Kiro CLI is not logged in. Run kiro-cli login in a terminal, then return to this window.' };
  return { available: true };
}

/** One running editorial job (outline, draft or review): cancelling it makes any late answer inert. */
interface Ctl { cancelled: boolean; kind: JobKind; jobId?: string; clear: () => void }

type Room = 'notes' | 'outline' | 'manuscript';

type Confirm = { title: string; message: string; confirmLabel: string; run: () => void };

function init() {
  const { saved, notice } = loadSaved(window.localStorage);
  return saved || notice ? fromSaved(saved, notice) : emptyState();
}

const chunk = <T,>(a: T[], n: number): T[][] => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

export function App() {
  const [state, dispatch] = useReducer(reducer, undefined, init);
  const stateRef = useRef(state);
  stateRef.current = state;
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [checking, setChecking] = useState(0);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [focusId, setFocusId] = useState<string | undefined>();
  const [settleId, setSettleId] = useState<string | undefined>();
  const [flash, setFlash] = useState<string | null>(null);
  const [refsOpen, setRefsOpen] = useState(false);
  const [room, setRoom] = useState<Room>('manuscript');
  // Transient state of the editorial Kiro calls; filled only by polling real jobs.
  const [structureTask, setStructureTask] = useState<KiroTask | undefined>();
  const [ghostTasks, setGhostTasks] = useState<Record<string, KiroTask>>({});
  const active = useRef(new Map<string, Ctl>());
  const revCancelled = useRef<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftPreviewState>>({});
  const fileInput = useRef<HTMLInputElement>(null);
  const poll = useRef<string | null>(null);

  // ---- persistence (R1.5) ----
  useEffect(() => {
    const t = setTimeout(() => writeSaved(window.localStorage, toSaved(state)), 600);
    return () => clearTimeout(t);
  }, [state.blocks, state.references, state.verifications, state.history, state.title, state.notes, state.outline, state.reviews, state.wordGoal]);
  useEffect(() => {
    const flush = () => writeSaved(window.localStorage, toSaved(stateRef.current));
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, []);

  // ---- Kiro health ----
  const refreshHealth = useCallback(() => { getHealth().then(setHealth).catch(() => setHealth({ kiro: 'unknown', detail: 'The local server did not answer.' })); }, []);
  useEffect(() => { refreshHealth(); window.addEventListener('focus', refreshHealth); return () => window.removeEventListener('focus', refreshHealth); }, [refreshHealth]);

  useEffect(() => { if (!flash) return; const t = setTimeout(() => setFlash(null), 7000); return () => clearTimeout(t); }, [flash]);
  useEffect(() => { if (!settleId) return; const t = setTimeout(() => setSettleId(undefined), 900); return () => clearTimeout(t); }, [settleId]);

  // ---- manuscript ----
  const nonEmpty = state.blocks.some((b) => b.text.trim());
  const withConfirm = (title: string, message: string, confirmLabel: string, run: () => void) => (nonEmpty ? setConfirm({ title, message, confirmLabel, run }) : run());

  const loadExample = () => withConfirm('Replace the manuscript?', 'Loading the example replaces the current manuscript and reference ledger. Your notes and outline are kept. Export first if you want to keep the manuscript.', 'Load the example', () => {
    dispatch({ type: 'replace_manuscript', blocks: splitIntoBlocks(exampleMd), references: EXAMPLE_REFERENCES.map((r) => ({ ...r })) });
    if (!stateRef.current.notes.trim()) dispatch({ type: 'set_notes', text: starterNotes });
    setFlash('Example loaded. Its references include two intentional citation problems (a year mismatch and a fictional DOI) and one entry without a DOI. Open References and choose “Check all” to ask doi.org.');
  });

  const loadStarter = () => {
    const run = () => { dispatch({ type: 'set_notes', text: starterNotes }); setRoom('notes'); };
    if (stateRef.current.notes.trim()) setConfirm({ title: 'Replace your notes?', message: 'The starter notes replace the notes you have written. Your outline and manuscript are not changed.', confirmLabel: 'Load starter notes', run });
    else run();
  };

  const insertDraft = (itemId: string) => {
    const d = drafts[itemId];
    if (!d || d.phase !== 'ready' || !d.paragraph) return;
    const id = uid('b');
    dispatch({ type: 'insert_draft', itemId, text: d.paragraph, evidenceNeeded: d.evidenceNeeded, id });
    setDrafts(({ [itemId]: _gone, ...rest }) => rest);
    setRoom('manuscript');
    setFocusId(id);
  };

  // ---- editorial jobs (outline, draft, review): submit, poll, cancel ----
  async function runJob<K extends keyof JobResults>(
    key: string, kind: K, body: JobBodies[K], show: (t: KiroTask | undefined) => void,
  ): Promise<JobResults[K] | null> {
    const ctl: Ctl = { cancelled: false, kind, clear: () => show(undefined) };
    active.current.get(key)?.clear();
    active.current.set(key, ctl);
    show({ phase: 'submitting' });
    try {
      const { id, position } = await submitJob(kind, body);
      ctl.jobId = id;
      if (ctl.cancelled) { void cancelServerJob(kind, id).catch(() => undefined); return null; }
      show({ phase: 'queued', jobId: id, position });
      for (;;) {
        await new Promise((r) => setTimeout(r, 750));
        if (ctl.cancelled) return null;
        const v = await getJob(kind, id);
        if (ctl.cancelled) return null; // a late answer after Cancel is never used
        if (v.state === 'succeeded' && v.result) { show(undefined); return v.result; }
        if (v.state === 'queued') show({ phase: 'queued', jobId: id, position: v.position });
        else if (v.state === 'running') show({ phase: 'running', jobId: id, elapsedMs: v.elapsedMs });
        else {
          if (v.state === 'cancelled') show(undefined);
          else { show({ phase: 'failed', error: v.error ?? { message: 'Kiro did not finish.' } }); refreshHealth(); }
          return null;
        }
      }
    } catch (e) {
      if (!ctl.cancelled) { const err = e as ApiError; show({ phase: 'failed', error: { message: err.message, fix: err.fix } }); refreshHealth(); }
      return null;
    } finally {
      if (active.current.get(key) === ctl) active.current.delete(key);
    }
  }

  const cancelKey = (key: string) => {
    const ctl = active.current.get(key);
    if (!ctl) return;
    ctl.cancelled = true;
    if (ctl.jobId) void cancelServerJob(ctl.kind, ctl.jobId).catch(() => undefined);
    ctl.clear();
    active.current.delete(key);
  };

  // Work whose target disappeared (deleted paragraph or outline section) is cancelled, never resurrected.
  useEffect(() => {
    for (const key of [...active.current.keys()]) {
      const [what, id] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
      if (what === 'review' && !state.blocks.some((b) => b.id === id)) cancelKey(key);
      if (what === 'draft' && !state.outline.some((o) => o.id === id)) cancelKey(key);
    }
  }, [state.blocks, state.outline]);

  const knownKeys = () => stateRef.current.references.map((r) => r.key).filter((k): k is string => !!k).slice(0, 100);

  const structureNotes = async () => {
    const s0 = stateRef.current;
    if (!s0.notes.trim()) return;
    const snap = { notes: s0.notes, outline: JSON.stringify(s0.outline) };
    const result = await runJob('structure', 'structure', { notes: snap.notes, knownKeys: knownKeys() }, setStructureTask);
    if (!result) return;
    const use = () => {
      dispatch({ type: 'outline_set', items: result.items, fromNotes: textHash(snap.notes) });
      const left = [...new Set(result.dropped)];
      setFlash(`Outline ready: ${result.items.length} ${result.items.length === 1 ? 'section' : 'sections'} from Kiro.${left.length ? ` Left out: ${left.join('; ')}.` : ''} Cited keys come from your notes or ledger; check each source before you rely on it.`);
      setRoom('outline');
    };
    const cur = stateRef.current;
    if (cur.notes !== snap.notes || JSON.stringify(cur.outline) !== snap.outline) {
      setConfirm({
        title: 'The notes or outline changed while Kiro was working',
        message: 'This outline was made from the earlier notes and outline. Using it replaces the current outline. Choose Cancel to discard it and structure again when you are ready.',
        confirmLabel: 'Use this outline anyway', run: use,
      });
    } else use();
  };

  const structure = () => {
    if (stateRef.current.outline.length) {
      setConfirm({
        title: 'Replace the outline?', confirmLabel: 'Structure the notes', run: () => void structureNotes(),
        message: 'Kiro will build a new outline from your notes. The current outline, including your edits, is replaced when it arrives. Your manuscript is not changed.',
      });
    } else void structureNotes();
  };

  const draftSection = async (itemId: string) => {
    const s0 = stateRef.current;
    const item = s0.outline.find((o) => o.id === itemId);
    if (!item || !item.brief.trim()) return;
    const snapshot = draftSnapshot(item, s0.notes);
    const at = draftInsertIndex(s0, itemId);
    const show = (t: KiroTask | undefined) => setDrafts((d) => {
      if (!t) { const { [itemId]: _gone, ...rest } = d; return rest; }
      return { ...d, [itemId]: { itemId, phase: t.phase, task: t } };
    });
    const result = await runJob(`draft:${itemId}`, 'draft', {
      item: {
        heading: item.heading, brief: item.brief,
        evidence: item.evidence.slice(0, 12).map((e) => ({ claim: e.claim, status: e.status, keys: e.keys ?? [] })),
      },
      notes: s0.notes, knownKeys: knownKeys(),
      before: (s0.blocks[at - 1]?.text ?? '').slice(0, 4000), after: (s0.blocks[at]?.text ?? '').slice(0, 4000),
    }, show);
    if (!result || !stateRef.current.outline.some((o) => o.id === itemId)) return;
    setDrafts((d) => ({ ...d, [itemId]: { itemId, phase: 'ready', paragraph: result.paragraph, evidenceNeeded: result.evidenceNeeded, flagged: result.flagged, snapshot } }));
  };

  const reviewBlock = async (blockId: string) => {
    const block = stateRef.current.blocks.find((b) => b.id === blockId);
    if (!block || !block.text.trim()) return;
    const sourceText = block.text;
    const show = (t: KiroTask | undefined) => setGhostTasks((g) => {
      if (!t) { const { [blockId]: _gone, ...rest } = g; return rest; }
      return { ...g, [blockId]: t };
    });
    const result = await runJob(`review:${blockId}`, 'review', { blockId, paragraph: sourceText, heading: headingFor(stateRef.current.blocks, blockId) }, show);
    if (!result || !stateRef.current.blocks.some((b) => b.id === blockId)) return;
    if (result.findings.length === 0 && result.dropped.length > 0) {
      show({ phase: 'failed', error: { message: `Kiro raised ${result.returned} ${result.returned === 1 ? 'concern' : 'concerns'}, but none quoted the paragraph exactly, so none can be pinned to your words. This is not a clean review.`, fix: 'Choose Review again.' } });
      return;
    }
    dispatch({ type: 'set_review', review: { id: uid('rv'), blockId, sourceText, reviewedAt: new Date().toISOString(), findings: result.findings, ...(result.dropped.length ? { dropped: result.dropped.length } : {}) } });
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const res = await readImport(file);
    if (!res.ok) { setFlash(res.message); return; }
    withConfirm('Replace the manuscript?', `Importing “${file.name}” replaces the current manuscript. Your reference ledger is kept.`, 'Import', () => {
      dispatch({ type: 'replace_manuscript', blocks: splitIntoBlocks(res.text) });
      setFlash(`Imported ${file.name}.`);
    });
  };

  const startWriting = () => {
    const id = uid('b');
    dispatch({ type: 'add_block', id });
    setRoom('manuscript');
    setFocusId(id);
  };

  // ---- references and DOI checks ----
  const addReferences = (text: string): string[] => {
    const out = parseReferences(text, stateRef.current.references);
    if (out.added.length) dispatch({ type: 'add_references', added: out.added, messages: out.messages });
    if (out.added.length && !out.messages.length) setFlash(`Added ${out.added.length} reference${out.added.length === 1 ? '' : 's'}.`);
    return out.messages;
  };

  const runChecks = async (refs: Reference[], force: boolean) => {
    const valid = refs.filter((r) => r.doi && isValidDoi(normalizeDoi(r.doi)));
    if (!valid.length) return;
    const fingerprints = Object.fromEntries(valid.map((r) => [r.id, fingerprint(r)]));
    dispatch({ type: 'mark_checking', ids: valid.map((r) => r.id) });
    setChecking((n) => n + 1);
    try {
      for (const batch of chunk(valid, 50)) {
        let results: Record<string, Verification>;
        try {
          results = (await verifyDois(batch.map((r) => ({ id: r.id, doi: normalizeDoi(r.doi!), title: r.title, year: r.year, firstAuthor: r.authors?.[0] })), force)).results;
        } catch (e) {
          const msg = (e as ApiError).message ?? 'The check could not be completed.';
          results = Object.fromEntries(batch.map((r) => [r.id, { status: 'uncertain' as const, reason: msg, checkedAt: new Date().toISOString() }]));
        }
        dispatch({ type: 'set_verifications', results, fingerprints });
      }
    } finally {
      setChecking((n) => n - 1);
    }
  };

  // ---- revision ----
  const stopPolling = () => { poll.current = null; };

  const pollJob = async (jobId: string) => {
    poll.current = jobId;
    for (;;) {
      await new Promise((r) => setTimeout(r, 750));
      if (poll.current !== jobId) return;
      try {
        const v = await getRevision(jobId);
        if (poll.current !== jobId) return;
        if (revCancelled.current === jobId && v.state === 'succeeded') {
          // Cancel was chosen: a revision that finished a moment later is not offered.
          stopPolling();
          dispatch({ type: 'revision', patch: { phase: 'failed', error: { message: 'The revision was cancelled.' }, job: { ...v, result: undefined } } });
          return;
        }
        const done = v.state === 'succeeded';
        const over = done || v.state === 'failed' || v.state === 'cancelled' || v.state === 'timed_out';
        dispatch({ type: 'revision', patch: over ? { job: v, phase: done ? 'done' : 'failed', error: v.error } : { job: v } });
        if (over) { stopPolling(); if (!done) refreshHealth(); return; }
      } catch (e) {
        stopPolling();
        dispatch({ type: 'revision', patch: { phase: 'failed', error: { message: (e as ApiError).message } } });
        return;
      }
    }
  };

  const submit = async () => {
    const rev = stateRef.current.revision;
    if (!rev) return;
    const block = stateRef.current.blocks.find((b) => b.id === rev.blockId);
    if (!block) return;
    dispatch({ type: 'revision', patch: { phase: 'submitting', baseText: block.text, job: undefined, error: undefined } });
    try {
      const { id } = await submitRevision({ paragraph: block.text, heading: headingFor(stateRef.current.blocks, block.id), intent: rev.intent.trim() });
      dispatch({ type: 'revision', patch: { jobId: id, phase: 'active', job: { id, state: 'queued', elapsedMs: 0 } } });
      void pollJob(id);
    } catch (e) {
      const err = e as ApiError;
      dispatch({ type: 'revision', patch: { phase: 'failed', error: { message: err.message, fix: err.fix } } });
      refreshHealth();
    }
  };

  const cancelJob = () => { const id = stateRef.current.revision?.jobId; if (id) { revCancelled.current = id; void cancelRevision(id).catch(() => undefined); } };
  const closeSheet = () => {
    const rev = stateRef.current.revision;
    if (rev && (rev.phase === 'active' || rev.phase === 'submitting') && rev.jobId) { revCancelled.current = rev.jobId; void cancelRevision(rev.jobId).catch(() => undefined); }
    stopPolling();
    dispatch({ type: 'close_revision' });
  };
  const rerun = () => {
    const block = stateRef.current.blocks.find((b) => b.id === stateRef.current.revision?.blockId);
    stopPolling();
    dispatch({ type: 'revision', patch: { phase: 'compose', job: undefined, jobId: undefined, error: undefined, baseText: block?.text ?? '' } });
  };

  const apply = (confirmed: boolean) => {
    const s = stateRef.current;
    const rev = s.revision;
    const result = rev?.job?.result;
    if (!rev || !result) return;
    if (result.flagged.length && !confirmed) return;
    const res = prepareApply(s, rev, result.revised);
    if (!res.ok) { dispatch({ type: 'revision', patch: { error: { message: 'The paragraph changed after the request was sent.' } } }); return; }
    dispatch({ type: 'applied', entry: res.entry });
    setSettleId(res.entry.blockId);
  };

  const undo = (id: string) => {
    const s = stateRef.current;
    const entry = s.history.find((h) => h.id === id);
    if (!entry) return;
    const doUndo = () => { dispatch({ type: 'undone', id, blockId: entry.blockId, before: entry.before }); setSettleId(entry.blockId); };
    const c = checkUndo(s, id);
    if (c === 'ok') doUndo();
    else if (c === 'missing') setFlash('That paragraph no longer exists, so the revision cannot be undone.');
    else if (c === 'edited') setConfirm({ title: 'Undo over your edits?', message: 'This paragraph was edited after the revision was applied. Undo will replace the current text with the text from before the revision.', confirmLabel: 'Undo anyway', run: doUndo });
  };

  const rev = state.revision;
  const currentText = rev ? state.blocks.find((b) => b.id === rev.blockId)?.text : undefined;
  const title = titleOf(state.blocks);
  const hasText = state.blocks.length > 0;
  const printRefs = orderedReferences(state.blocks, state.references);
  const progress = candleProgress(bodyWords(state.blocks), state.wordGoal);
  const refProblems = state.references.filter((r) => ['not_found', 'mismatch', 'invalid_doi'].includes(statusOf(r, state.verifications[r.id]))).length;
  const kiroAccess = access(health);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('[role="dialog"]')) setFlash(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="room-shell">
      <header className="masthead">
        <div className="brand">
          <Ghost size={34} className="brand-ghost" />
          <div>
            <h1 className="wordmark">Haunted Ink</h1>
            <p className="tagline">{hasText && title !== 'untitled-manuscript' ? title : 'A ghost editorial room for computer-science papers'}</p>
          </div>
        </div>
        <nav className="actions" aria-label="Manuscript actions">
          <KiroChip health={health} />
          <button type="button" className="btn refs-btn" onClick={() => setRefsOpen(true)} aria-haspopup="dialog">
            References{state.references.length ? <> <span className="count">{state.references.length}</span></> : null}
            {refProblems > 0 && <> <span className="problem">{refProblems} to fix</span></>}
          </button>
          <button type="button" className="btn" onClick={() => fileInput.current?.click()}>Import</button>
          <button type="button" className="btn" onClick={loadExample}>Example</button>
          <ExportMenu blocks={state.blocks} references={state.references} verifications={state.verifications} history={state.history} onHistory={() => setHistoryOpen(true)} />
          <input ref={fileInput} type="file" accept=".md,.markdown,.txt,text/plain,text/markdown" hidden aria-label="Import a manuscript file" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
        </nav>
      </header>

      {(state.notice || flash) && (
        <div className="flash" role="status">
          <span>{state.notice ?? flash}</span>
          <button type="button" className="linklike" onClick={() => (state.notice ? dispatch({ type: 'dismiss_notice' }) : setFlash(null))}>Dismiss</button>
        </div>
      )}

      <nav className="room-switch" aria-label="Rooms">
        {(['notes', 'outline', 'manuscript'] as Room[]).map((r, i) => (
          <button key={r} type="button" aria-pressed={room === r} onClick={() => setRoom(r)}>
            <span className="numeral">{['I', 'II', 'III'][i]}</span> {r === 'notes' ? 'Notes' : r === 'outline' ? 'Outline' : 'Manuscript'}
          </button>
        ))}
      </nav>

      <main className="room" data-room={room}>
        <div className="study">
          <CandleGauge progress={progress} onGoal={(goal) => dispatch({ type: 'set_word_goal', goal })} />
          <NotesPanel
            notes={state.notes} onChange={(text) => dispatch({ type: 'set_notes', text })} onStarter={loadStarter}
            hasOutline={state.outline.length > 0} outlineOutdated={!!state.outlineFromNotes && state.outlineFromNotes !== textHash(state.notes)}
            access={kiroAccess} task={structureTask} onStructure={structure} onCancel={() => cancelKey('structure')}
          />
          <OutlinePanel
            items={state.outline} notes={state.notes} blockIds={new Set(state.blocks.map((b) => b.id))} access={kiroAccess} drafts={drafts}
            onDraft={(id) => void draftSection(id)} onCancelDraft={(id) => cancelKey(`draft:${id}`)}
            onUpdate={(id, patch) => dispatch({ type: 'outline_update', id, patch })}
            onAdd={(afterId) => dispatch({ type: 'outline_add', afterId })}
            onDelete={(id) => { cancelKey(`draft:${id}`); setDrafts(({ [id]: _gone, ...rest }) => rest); dispatch({ type: 'outline_delete', id }); }}
            onMove={(id, dir) => dispatch({ type: 'outline_move', id, dir })}
            onAddEvidence={(itemId, claim) => dispatch({ type: 'evidence_add', itemId, claim })}
            onRemoveEvidence={(itemId, evidenceId) => dispatch({ type: 'evidence_remove', itemId, evidenceId })}
            onInsertDraft={insertDraft}
            onDiscardDraft={(itemId) => { cancelKey(`draft:${itemId}`); setDrafts(({ [itemId]: _gone, ...rest }) => rest); }}
            onShowBlock={(id) => { setRoom('manuscript'); setFocusId(id); }}
          />
        </div>
        <div className="page">
          <Manuscript
            blocks={state.blocks} references={state.references} verifications={state.verifications} history={state.history}
            activeBlockId={rev?.blockId} settleBlockId={settleId} focusBlockId={focusId}
            dispatch={dispatch} onRevise={(id) => dispatch({ type: 'open_revision', blockId: id })}
            onRecheck={(id) => { const r = state.references.find((x) => x.id === id); if (r) void runChecks([r], true); }}
            onUndo={undo} onFocused={() => setFocusId(undefined)} requestFocus={setFocusId}
            reviews={state.reviews} ghostAccess={kiroAccess} ghostTasks={ghostTasks}
            onReview={(id) => void reviewBlock(id)} onCancelReview={(id) => cancelKey(`review:${id}`)}
            onFinding={(blockId, findingId, st) => dispatch({ type: 'finding_state', blockId, findingId, state: st })}
            empty={<EmptyState onExample={loadExample} onImport={() => fileInput.current?.click()} onWrite={startWriting} />}
          />
        </div>
      </main>

      <footer className="colophon">
        <p>Local only. Kiro calls use the Kiro CLI installed and logged in on this machine; DOI checks contact doi.org. A Verified DOI confirms the identifier and its registered metadata, never that the source supports your sentence.</p>
      </footer>

      {refsOpen && (
        <Dialog label="References" onClose={() => setRefsOpen(false)} backdrop className="drawer">
          <div className="drawer-head">
            <p className="room-label">Auxiliary · DOI checks</p>
            <button type="button" className="btn small quiet" onClick={() => setRefsOpen(false)}>Close</button>
          </div>
          <Ledger
            references={state.references} verifications={state.verifications} messages={[]}
            onAdd={addReferences} checking={checking > 0}
            onCheckAll={() => void runChecks(state.references, true)}
            onCheck={(id) => { const r = state.references.find((x) => x.id === id); if (r) void runChecks([r], true); }}
            onUpdate={(id, patch) => dispatch({ type: 'update_reference', id, patch })}
            onDelete={(id) => dispatch({ type: 'delete_reference', id })}
          />
        </Dialog>
      )}

      {rev && (
        <RevisionSheet
          rev={rev} currentText={currentText} health={health}
          onIntent={(intent) => dispatch({ type: 'revision', patch: { intent } })}
          onSubmit={() => void submit()} onCancel={cancelJob} onClose={closeSheet} onApply={apply} onRerun={rerun}
        />
      )}

      {historyOpen && (
        <Dialog label="Revision history" onClose={() => setHistoryOpen(false)} backdrop className="history">
          <h2 className="smallcaps">Revision history</h2>
          {state.history.length === 0 ? <p>No revisions have been applied yet. The last 20 are kept here, even after a reload.</p> : (
            <ol className="history-list">
              {[...state.history].reverse().map((h) => (
                <li key={h.id}>
                  <p><strong>{new Date(h.appliedAt).toLocaleString('en-GB')}</strong> · {h.intent.slice(0, 90)}{h.undone ? ' · Undone' : ''}</p>
                  <p className="muted">{h.after.slice(0, 120)}{h.after.length > 120 ? '…' : ''}</p>
                  {!h.undone && <button type="button" className="btn small" onClick={() => { setHistoryOpen(false); undo(h.id); }}>Undo</button>}
                </li>
              ))}
            </ol>
          )}
          <div className="row end"><button type="button" className="btn" data-autofocus onClick={() => setHistoryOpen(false)}>Close</button></div>
        </Dialog>
      )}

      {confirm && (
        <ConfirmDialog title={confirm.title} message={confirm.message} confirmLabel={confirm.confirmLabel}
          onCancel={() => setConfirm(null)} onConfirm={() => { const run = confirm.run; setConfirm(null); run(); }} />
      )}

      <section className="print-only" aria-hidden="true">
        {state.blocks.map((b) => {
          const m = /^(#{1,6})\s+(.*)$/s.exec(b.text.trim());
          if (m) { const L = Math.min(m[1].length, 3); return L === 1 ? <h1 key={b.id}>{m[2]}</h1> : L === 2 ? <h2 key={b.id}>{m[2]}</h2> : <h3 key={b.id}>{m[2]}</h3>; }
          return <p key={b.id}>{b.text}</p>;
        })}
        {printRefs.length > 0 && (<><h2>References</h2><ol>{printRefs.map((r) => <li key={r.id}>{formatReference(r)}</li>)}</ol></>)}
      </section>
    </div>
  );
}

function KiroChip({ health }: { health: HealthInfo | null }) {
  if (!health) return <span className="chip-status">Checking Kiro…</span>;
  const map = {
    ready: ['◆', 'Kiro CLI ready', 'ok'],
    logged_out: ['!', 'Kiro CLI not logged in', 'bad'],
    missing: ['✕', 'Kiro CLI not found', 'bad'],
    unknown: ['?', 'Kiro status unknown', 'warn'],
  } as const;
  const [glyph, text, tone] = map[health.kiro];
  return <span className={`chip-status ${tone}`} title={health.detail ?? (health.version ? `kiro-cli v${health.version}` : undefined)}><span aria-hidden="true">{glyph}</span> {text}</span>;
}
