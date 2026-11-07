import { isReviewStale } from '../../shared/editorial.ts';
import type { Block, GhostCategory, GhostFinding, GhostReview } from '../../shared/types.ts';
import type { KiroTask } from '../state.ts';
import { Ghost, InkBlot, Seal } from './Engraving.tsx';

export const GHOSTS: Record<GhostCategory, { name: string; word: string; role: string }> = {
  logic: { name: 'The Logician', word: 'Logic', role: 'looks for steps the argument skips' },
  evidence: { name: 'The Archivist', word: 'Evidence', role: 'asks where each claim is supported' },
  clarity: { name: 'The Copyist', word: 'Clarity', role: 'marks sentences a reader would trip on' },
};

/** What the margin needs to summon a real review. `available: false` renders an honest disabled state. */
export interface GhostAccess {
  available: boolean;
  /** Plain-English reason shown when not available, including the fix when there is one. */
  reason?: string;
}

interface MarginProps {
  block: Block;
  blocks: Block[];
  label: string;
  review?: GhostReview;
  task?: KiroTask;
  access: GhostAccess;
  onReview?: () => void;
  onCancel?: () => void;
  onFinding: (findingId: string, state: GhostFinding['state']) => void;
  /** Moves the caret to the quoted words in the paragraph. */
  onLocate?: (quote: string) => void;
}

const secs = (ms?: number) => `${Math.max(0, Math.round((ms ?? 0) / 1000))} s`;

export function GhostMargin({ block, blocks, label, review, task, access, onReview, onCancel, onFinding, onLocate }: MarginProps) {
  const busy = task && task.phase !== 'failed';
  const stale = review ? isReviewStale(review, blocks) : false;
  const open = review?.findings.filter((f) => f.state === 'open') ?? [];
  const settled = review?.findings.filter((f) => f.state !== 'open') ?? [];
  const canSummon = access.available && !!onReview && !busy;
  const summon = (
    <button type="button" className="summon" onClick={onReview} disabled={!canSummon}
      aria-label={`${review ? 'Review again' : 'Summon the ghost reviewers for'} ${label}`}
      aria-describedby={!access.available ? `why-${block.id}` : undefined}>
      <Ghost size={18} /> {review ? 'Review again' : 'Summon reviewers'}
    </button>
  );

  return (
    <aside className={`ghost-margin${review ? ' has-review' : ''}${busy ? ' is-busy' : ''}${stale ? ' is-stale' : ''}`} aria-label={`Ghost reviewers for ${label}`}>
      {busy ? (
        <div className="ghost-reading" role="status">
          <Ghost size={30} className="drift" />
          <p>{task.phase === 'queued' ? `Waiting to read · position ${task.position ?? 1}` : task.phase === 'submitting' ? 'Calling the ghosts…' : `The ghosts are reading · ${secs(task.elapsedMs)}`}</p>
          {onCancel && <button type="button" className="btn small quiet" onClick={onCancel}>Cancel</button>}
        </div>
      ) : task?.phase === 'failed' ? (
        <div className="ghost-failed" role="alert">
          <p><strong>The review did not finish.</strong> {task.error?.message}</p>
          {task.error?.fix && <p className="fix"><code>{task.error.fix}</code></p>}
          {summon}
        </div>
      ) : review ? (
        <>
          <p className="review-head">
            <span>Read {new Date(review.reviewedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
            <span>{review.findings.length === 0 ? 'no concerns' : `${open.length} open${settled.length ? ` · ${settled.length} settled` : ''}`}</span>
          </p>
          {stale && <p className="stale-note">You edited this paragraph after the ghosts read it, so their notes may no longer fit.</p>}
          {!!review.dropped && (
            <p className="stale-note">Kiro raised {review.dropped} more {review.dropped === 1 ? 'concern' : 'concerns'}, left out because {review.dropped === 1 ? 'it' : 'they'} did not quote this paragraph exactly.</p>
          )}
          {review.findings.length === 0 && (
            <p className="quiet-review"><Ghost size={22} /> The ghosts read this paragraph and raised nothing. That is a reading, not a guarantee.</p>
          )}
          {open.map((f) => <GhostCard key={f.id} finding={f} block={block} stale={stale} onState={(s) => onFinding(f.id, s)} onLocate={onLocate} />)}
          {settled.length > 0 && (
            <details className="settled">
              <summary>{settled.length} settled {settled.length === 1 ? 'concern' : 'concerns'}</summary>
              {settled.map((f) => <GhostCard key={f.id} finding={f} block={block} stale={stale} onState={(s) => onFinding(f.id, s)} />)}
            </details>
          )}
          <div className="margin-actions">{summon}</div>
        </>
      ) : (
        <div className="margin-actions idle">{summon}</div>
      )}
      {!access.available && !busy && <p className="why" id={`why-${block.id}`}>{access.reason}</p>}
    </aside>
  );
}

interface CardProps {
  finding: GhostFinding;
  block: Block;
  stale: boolean;
  onState: (s: GhostFinding['state']) => void;
  onLocate?: (quote: string) => void;
}

/** One concern, pinned to the exact words it quotes. */
export function GhostCard({ finding: f, block, stale, onState, onLocate }: CardProps) {
  const g = GHOSTS[f.category];
  const present = block.text.includes(f.quote);
  return (
    <article className={`ghost-card cat-${f.category} state-${f.state}${stale ? ' stale' : ''}`} aria-label={`${g.word} concern from ${g.name}`}>
      <header>
        {f.category === 'evidence' ? <InkBlot size={20} /> : <Ghost size={20} />}
        <span className="persona">{g.name}</span>
        <span className="cat-word">{g.word}</span>
        {f.state === 'resolved' && <span className="seal-word"><Seal size={16} /> Resolved</span>}
        {f.state === 'dismissed' && <span className="seal-word">Dismissed</span>}
      </header>
      <blockquote>
        {onLocate && present
          ? <button type="button" className="quote-link" onClick={() => onLocate(f.quote)} aria-label={`Show “${f.quote}” in the paragraph`}>“{f.quote}”</button>
          : <>“{f.quote}”</>}
      </blockquote>
      {!present && <p className="gone">These words are no longer in the paragraph.</p>}
      <p className="critique">{f.critique}</p>
      <p className="advice"><span>Try:</span> {f.advice}</p>
      <div className="card-actions">
        {f.state === 'open' ? (
          <>
            <button type="button" className="btn small quiet" onClick={() => onState('resolved')}><Seal size={16} /> Resolve</button>
            <button type="button" className="btn small quiet" onClick={() => onState('dismissed')}>Dismiss</button>
          </>
        ) : (
          <button type="button" className="btn small quiet" onClick={() => onState('open')}>Reopen</button>
        )}
      </div>
    </article>
  );
}

/** The margin's header: who the ghosts are and how to call them. */
export function GhostRoster({ access, compact = false }: { access: GhostAccess; compact?: boolean }) {
  return (
    <aside className={`ghost-roster${compact ? ' compact' : ''}`} aria-labelledby="roster-h">
      <div className="roster-title">
        <h2 id="roster-h" className="room-label">Ghost reviewers</h2>
        {!access.available && <span className="offline" title={access.reason}>Kiro unavailable</span>}
      </div>
      <ul>
        {(Object.keys(GHOSTS) as GhostCategory[]).map((c) => (
          <li key={c} className={`cat-${c}`} title={`${GHOSTS[c].name} ${GHOSTS[c].role}.`}>
            {c === 'evidence' ? <InkBlot size={20} /> : <Ghost size={20} />}
            <strong>{GHOSTS[c].name}</strong>
            <span className="cat">{GHOSTS[c].word}</span>
          </li>
        ))}
      </ul>
      <p className="roster-note">Summoned beside a paragraph, each ghost quotes the words it doubts. Their critique reads your argument; DOI checks live in References.</p>
      {!access.available && <p className="why">{access.reason}</p>}
    </aside>
  );
}
