import { useState } from 'react';
import { countWords, EVIDENCE_MARK, LIMITS } from '../../shared/editorial.ts';
import type { OutlineItem } from '../../shared/types.ts';
import { isDraftStale, type DraftPreviewState, type KiroTask } from '../state.ts';
import { InkBlot, Quill } from './Engraving.tsx';
import type { GhostAccess } from './GhostMargin.tsx';

const secs = (ms?: number) => `${Math.max(0, Math.round((ms ?? 0) / 1000))} s`;

function TaskLine({ task, verb, onCancel }: { task: KiroTask; verb: string; onCancel?: () => void }) {
  if (task.phase === 'failed') {
    return (
      <div className="task-line failed" role="alert">
        <p><strong>{verb} did not finish.</strong> {task.error?.message}</p>
        {task.error?.fix && <p className="fix"><code>{task.error.fix}</code></p>}
      </div>
    );
  }
  return (
    <div className="task-line" role="status">
      <span className="ink-dot" aria-hidden="true" />
      <p>{task.phase === 'queued' ? `Queued · position ${task.position ?? 1}` : task.phase === 'submitting' ? 'Sending to Kiro…' : `${verb} · ${secs(task.elapsedMs)}`}</p>
      {onCancel && <button type="button" className="btn small quiet" onClick={onCancel}>Cancel</button>}
    </div>
  );
}

// ---------------- Notes ----------------

interface NotesProps {
  notes: string;
  onChange: (text: string) => void;
  onStarter: () => void;
  /** Notes changed since the outline was structured. */
  outlineOutdated: boolean;
  hasOutline: boolean;
  access: GhostAccess;
  task?: KiroTask;
  onStructure?: () => void;
  onCancel?: () => void;
}

export function NotesPanel({ notes, onChange, onStarter, outlineOutdated, hasOutline, access, task, onStructure, onCancel }: NotesProps) {
  const words = countWords(notes);
  const busy = !!task && task.phase !== 'failed';
  const can = access.available && !!onStructure && !busy && notes.trim().length > 0;
  return (
    <section className="study-panel notes-panel" aria-labelledby="notes-h">
      <header className="panel-head">
        <h2 id="notes-h" className="room-label"><span className="numeral">I</span> Research notes</h2>
        <span className="panel-meta">{words.toLocaleString('en-US')} {words === 1 ? 'word' : 'words'}</span>
      </header>
      <label className="sr-only" htmlFor="notes-text">Research notes</label>
      <textarea
        id="notes-text" className="notes-text" value={notes} maxLength={LIMITS.notesChars} spellCheck
        placeholder={'Jot findings, sources and half-formed claims.\nUse [@key] for sources in your reference ledger.'}
        onChange={(e) => onChange(e.target.value)}
      />
      {!notes.trim() && (
        <p className="panel-empty">
          No notes yet. Write your own, or <button type="button" className="linklike" onClick={onStarter}>load the starter notes</button> (a short bundled set on sequence models).
        </p>
      )}
      {task ? <TaskLine task={task} verb="Kiro is structuring the notes" onCancel={onCancel} /> : null}
      <div className="panel-foot">
        <button type="button" className="btn brass" onClick={onStructure} disabled={!can} aria-describedby={!access.available ? 'notes-why' : undefined}>
          <Quill size={18} /> {hasOutline ? 'Restructure into outline' : 'Structure into outline'}
        </button>
        {hasOutline && outlineOutdated && <span className="hint-warn">Notes changed since the outline was made.</span>}
      </div>
      {!access.available && <p className="why" id="notes-why">{access.reason}</p>}
      {hasOutline && access.available && <p className="hint">Restructuring replaces the outline after you confirm. Your manuscript is not changed.</p>}
    </section>
  );
}

// ---------------- Outline ----------------

interface OutlineProps {
  items: OutlineItem[];
  /** Current notes, to tell whether a draft is out of date. */
  notes: string;
  /** Block ids still present, so links to drafted paragraphs can be checked. */
  blockIds: Set<string>;
  access: GhostAccess;
  drafts: Record<string, DraftPreviewState>;
  onUpdate: (id: string, patch: Partial<Pick<OutlineItem, 'heading' | 'brief'>>) => void;
  onAdd: (afterId?: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onAddEvidence: (id: string, claim: string) => void;
  onRemoveEvidence: (id: string, evidenceId: string) => void;
  onDraft?: (id: string) => void;
  onCancelDraft?: (id: string) => void;
  onInsertDraft: (id: string) => void;
  onDiscardDraft: (id: string) => void;
  onShowBlock: (blockId: string) => void;
}

export function OutlinePanel(p: OutlineProps) {
  return (
    <section className="study-panel outline-panel" aria-labelledby="outline-h">
      <header className="panel-head">
        <h2 id="outline-h" className="room-label"><span className="numeral">II</span> Outline</h2>
        <span className="panel-meta">{p.items.length} {p.items.length === 1 ? 'section' : 'sections'}</span>
      </header>
      {p.items.length === 0 ? (
        <div className="panel-empty">
          <p>The outline is empty. Structure your notes with Kiro, or add a section yourself.</p>
        </div>
      ) : (
        <ol className="outline">
          {p.items.map((it, i) => <OutlineRow key={it.id} item={it} index={i} count={p.items.length} {...p} />)}
        </ol>
      )}
      <div className="panel-foot">
        <button type="button" className="btn small quiet" onClick={() => p.onAdd()}>Add a section</button>
      </div>
    </section>
  );
}

function OutlineRow({ item, index, count, blockIds, access, drafts, notes, ...p }: OutlineProps & { item: OutlineItem; index: number; count: number }) {
  const [claim, setClaim] = useState('');
  const draft = drafts[item.id];
  const busy = !!draft && draft.phase !== 'ready' && draft.phase !== 'failed';
  const canDraft = access.available && !!p.onDraft && !busy && !!item.brief.trim();
  const n = index + 1;
  const drafted = item.blockId && blockIds.has(item.blockId) ? item.blockId : undefined;
  const needed = item.evidence.filter((e) => e.status === 'needed').length;
  return (
    <li className={`outline-item${draft ? ' has-draft' : ''}`}>
      <div className="item-num" aria-hidden="true">§{n}</div>
      <div className="item-body">
        <label className="sr-only" htmlFor={`oh-${item.id}`}>Section {n} heading</label>
        <input id={`oh-${item.id}`} className="item-heading" value={item.heading} placeholder="Section heading" maxLength={LIMITS.headingChars}
          onChange={(e) => p.onUpdate(item.id, { heading: e.target.value })} />
        <label className="sr-only" htmlFor={`ob-${item.id}`}>Section {n} brief: what the paragraph should argue</label>
        <textarea id={`ob-${item.id}`} className="item-brief" value={item.brief} rows={2} placeholder="What should this paragraph argue?" maxLength={LIMITS.briefChars}
          onChange={(e) => p.onUpdate(item.id, { brief: e.target.value })} />
        {item.evidence.length > 0 && (
          <ul className="evidence" aria-label={`Evidence for section ${n}`}>
            {item.evidence.map((e) => (
              <li key={e.id} className={`ev ev-${e.status}`}>
                {e.status === 'needed' ? <InkBlot size={14} /> : <span className="ev-key" aria-hidden="true">@</span>}
                <span><strong>{e.status === 'needed' ? 'Evidence needed' : 'Cited'}</strong> {e.claim}{e.keys?.length ? ` (${e.keys.map((k) => `@${k}`).join(', ')})` : ''}</span>
                <button type="button" className="x" onClick={() => p.onRemoveEvidence(item.id, e.id)} aria-label={`Remove evidence “${e.claim}”`}>×</button>
              </li>
            ))}
          </ul>
        )}
        <form className="ev-add" onSubmit={(e) => { e.preventDefault(); p.onAddEvidence(item.id, claim); setClaim(''); }}>
          <label className="sr-only" htmlFor={`oe-${item.id}`}>Add a claim in section {n} that needs a source</label>
          <input id={`oe-${item.id}`} value={claim} onChange={(e) => setClaim(e.target.value)} placeholder="Add a claim that needs a source" maxLength={LIMITS.claimChars} />
        </form>
        <div className="item-tools">
          <button type="button" className="btn small" onClick={() => p.onDraft?.(item.id)} disabled={!canDraft}
            aria-label={`Draft a paragraph for section ${n}${item.heading ? `, ${item.heading}` : ''}`}>
            <Quill size={16} /> {drafted ? 'Draft again' : 'Draft paragraph'}
          </button>
          {drafted && <button type="button" className="btn small quiet" onClick={() => p.onShowBlock(drafted)}>Show paragraph</button>}
          {needed > 0 && <span className="need-count"><InkBlot size={13} /> {needed} needed</span>}
          <span className="spacer" />
          <button type="button" className="icon" onClick={() => p.onMove(item.id, -1)} disabled={index === 0} aria-label={`Move section ${n} up`}>↑</button>
          <button type="button" className="icon" onClick={() => p.onMove(item.id, 1)} disabled={index === count - 1} aria-label={`Move section ${n} down`}>↓</button>
          <button type="button" className="icon" onClick={() => p.onDelete(item.id)} aria-label={`Remove section ${n}`}>×</button>
        </div>
        {draft && (
          <DraftPreview draft={draft} stale={isDraftStale(draft, item, notes)} onInsert={() => p.onInsertDraft(item.id)} onDiscard={() => p.onDiscardDraft(item.id)} onCancel={p.onCancelDraft ? () => p.onCancelDraft!(item.id) : undefined} />
        )}
      </div>
    </li>
  );
}

// ---------------- Draft preview ----------------

/** Draft text with `[evidence needed: …]` markers set apart. */
export function MarkedText({ text }: { text: string }) {
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(EVIDENCE_MARK)) {
    out.push(text.slice(last, m.index));
    out.push(<mark key={m.index} className="need">{m[0]}</mark>);
    last = m.index! + m[0].length;
  }
  out.push(text.slice(last));
  return <>{out}</>;
}

interface DraftProps {
  draft: DraftPreviewState;
  /** The section or the notes changed after Kiro was asked. */
  stale?: boolean;
  onInsert: () => void;
  onDiscard: () => void;
  onCancel?: () => void;
}

export function DraftPreview({ draft, stale, onInsert, onDiscard, onCancel }: DraftProps) {
  if (draft.phase !== 'ready') {
    return (
      <div className="draft-preview pending">
        {draft.task && <TaskLine task={draft.task} verb="Kiro is drafting" onCancel={draft.phase === 'failed' ? undefined : onCancel} />}
        {draft.phase === 'failed' && <div className="row"><button type="button" className="btn small quiet" onClick={onDiscard}>Close</button></div>}
      </div>
    );
  }
  return (
    <div className="draft-preview" role="group" aria-label="Drafted paragraph preview">
      <p className="draft-label">Draft from Kiro · not yet in the manuscript</p>
      {stale && <p className="stale-note" role="status">You changed this section or the notes after asking for this draft, so it may not match them. Draft again, or insert it anyway.</p>}
      <p className="draft-text wet"><MarkedText text={draft.paragraph ?? ''} /></p>
      {draft.evidenceNeeded && draft.evidenceNeeded.length > 0 && (
        <ul className="evidence">
          {draft.evidenceNeeded.map((c) => <li key={c} className="ev ev-needed"><InkBlot size={14} /><span><strong>Evidence needed</strong> {c}</span></li>)}
        </ul>
      )}
      <p className="hint">Inserting adds a new paragraph; no existing text is changed. Unsupported claims stay marked until you cite a source.</p>
      <div className="row">
        <button type="button" className="btn small brass" onClick={onInsert}>{stale ? 'Insert anyway' : 'Insert into manuscript'}</button>
        <button type="button" className="btn small quiet" onClick={onDiscard}>Discard</button>
      </div>
    </div>
  );
}
