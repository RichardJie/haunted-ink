import { useEffect, useRef, type Dispatch } from 'react';
import { extractCitations, linkToken } from '../../shared/citations.ts';
import { bodyWords, EVIDENCE_MARK } from '../../shared/editorial.ts';
import type { AppliedRevision, Block, GhostFinding, GhostReview, Reference, Status, Verification } from '../../shared/types.ts';
import { isHeading } from '../lib/manuscript.ts';
import type { Action, KiroTask } from '../state.ts';
import { GhostMargin, GhostRoster, type GhostAccess } from './GhostMargin.tsx';
import { statusOf } from './Ledger.tsx';
import { STATUS_GLYPH, STATUS_LABEL } from './StatusMark.tsx';

const SEVERITY: Status[] = ['not_found', 'mismatch', 'invalid_doi', 'uncertain', 'checking', 'unchecked', 'no_doi', 'verified'];

interface Props {
  blocks: Block[];
  references: Reference[];
  verifications: Record<string, Verification>;
  history: AppliedRevision[];
  activeBlockId?: string;
  settleBlockId?: string;
  focusBlockId?: string;
  dispatch: Dispatch<Action>;
  onRevise: (blockId: string) => void;
  onRecheck: (refId: string) => void;
  onUndo: (historyId: string) => void;
  onFocused: () => void;
  requestFocus: (id: string) => void;
  reviews: Record<string, GhostReview>;
  ghostAccess: GhostAccess;
  ghostTasks: Record<string, KiroTask>;
  onReview?: (blockId: string) => void;
  onCancelReview?: (blockId: string) => void;
  onFinding: (blockId: string, findingId: string, state: GhostFinding['state']) => void;
}

/** An empty, dashed citation bracket: a citation with nothing behind it. */
function PhantomBracket() {
  return (
    <svg className="phantom-mark" width="22" height="16" viewBox="0 0 22 16" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="2 1.6" aria-hidden="true" focusable="false">
      <path d="M6 1.5 H2.5 V14.5 H6 M16 1.5 H19.5 V14.5 H16" />
    </svg>
  );
}

export function Manuscript(props: Props & { empty?: React.ReactNode }) {
  const { blocks, references, verifications } = props;
  const words = bodyWords(blocks);
  const cites = blocks.reduce((n, b) => n + extractCitations(b.text).length, 0);
  const phantoms = references.filter((r) => statusOf(r, verifications[r.id]) === 'not_found').length;
  // The roster may extend down beside the leading headings, whose margins are always empty.
  let lead = 0;
  while (lead < blocks.length && isHeading(blocks[lead].text)) lead++;
  const rosterSpan = 1 + (blocks.length ? lead : 1);
  return (
    <article className="manuscript" aria-labelledby="ms-h" style={{ ['--roster-rows' as string]: `1 / span ${rosterSpan}` }}>
      <div className="folio-row folio-head" style={{ ['--row' as string]: 1 }}>
        <header className="running-head">
          <h2 id="ms-h" className="room-label"><span className="numeral">III</span> Manuscript</h2>
          <span>{words.toLocaleString('en-US')} {words === 1 ? 'word' : 'words'} · {cites} {cites === 1 ? 'citation' : 'citations'}{phantoms ? ` · ${phantoms} Not found` : ''}</span>
        </header>
        <GhostRoster access={props.ghostAccess} compact={rosterSpan === 1} />
      </div>
      {blocks.length === 0 && props.empty && <div className="folio-row folio-empty" style={{ ['--row' as string]: 2 }}><div className="block">{props.empty}</div><div className="ghost-margin is-empty" /></div>}
      {blocks.map((b, i) => (
        <BlockView key={b.id} block={b} index={i} {...props} />
      ))}
      {blocks.length > 0 && <div className="folio-row folio-foot" style={{ ['--row' as string]: blocks.length + 2 }}>
        <div className="add-row">
          <button type="button" className="btn small quiet" onClick={() => props.dispatch({ type: 'add_block' })}>Add a paragraph at the end</button>
        </div>
      </div>}
    </article>
  );
}

function tokenStatus(refs: Reference[], vs: Record<string, Verification>, linked: Reference[], unlinked: string[]): string {
  if (unlinked.length) return 'unlinked';
  const statuses = linked.map((r) => statusOf(r, vs[r.id]));
  return SEVERITY.find((s) => statuses.includes(s)) ?? 'unchecked';
}

function BlockView(props: Props & { block: Block; index: number }) {
  const { block, index, references, verifications, history, dispatch } = props;
  const heading = isHeading(block.text);
  const ta = useRef<HTMLTextAreaElement>(null);
  const tokens = extractCitations(block.text).map((t) => linkToken(t, references));

  useEffect(() => {
    if (props.focusBlockId === block.id) { ta.current?.focus(); props.onFocused(); }
  }, [props.focusBlockId, block.id]);

  const segments: React.ReactNode[] = [];
  const hashLen = heading ? (/^\s*#+\s/.exec(block.text)?.[0].length ?? 0) : 0;
  if (hashLen) segments.push(<span key="hash" className="hash">{block.text.slice(0, hashLen)}</span>);
  let pos = hashLen;
  const spans = [
    ...tokens.map((t) => ({ start: t.start, end: t.end, cls: `cite cite-${tokenStatus(references, verifications, t.linked, t.unlinked)}` })),
    ...[...block.text.matchAll(EVIDENCE_MARK)].map((m) => ({ start: m.index!, end: m.index! + m[0].length, cls: 'need' })),
  ].sort((a, b) => a.start - b.start);
  spans.forEach((t, i) => {
    if (t.start < pos) return;
    segments.push(block.text.slice(pos, t.start));
    segments.push(<span key={i} className={t.cls}>{block.text.slice(t.start, t.end)}</span>);
    pos = t.end;
  });
  segments.push(block.text.slice(pos));

  // Margin notes: one per distinct problem.
  const notes: { key: string; status: string; glyph: string; word: string; text: string; refId?: string }[] = [];
  for (const t of tokens) {
    for (const k of t.unlinked) {
      const key = `unl-${k}`;
      if (!notes.some((n) => n.key === key)) notes.push({ key, status: 'unlinked', glyph: '∅', word: 'Unlinked citation', text: `no reference in the ledger matches “${k}”.` });
    }
    for (const r of t.linked) {
      const v = verifications[r.id];
      const st = statusOf(r, v);
      const label = r.key ?? r.title ?? 'reference';
      if (notes.some((n) => n.key === r.id)) continue;
      if (st === 'not_found') notes.push({ key: r.id, status: st, glyph: STATUS_GLYPH[st], word: STATUS_LABEL[st], text: `${label} is a phantom reference. doi.org has no record of this identifier.` });
      else if (st === 'mismatch') {
        const diff = (v?.fields ?? []).filter((f) => !f.match).map((f) => `${f.field === 'firstAuthor' ? 'first author' : f.field}: entered “${f.claimed}”, registered “${f.registered || 'none'}”`).join('; ');
        notes.push({ key: r.id, status: st, glyph: STATUS_GLYPH[st], word: STATUS_LABEL[st], text: `${label}: ${diff || 'registered metadata differs'}.` });
      } else if (st === 'uncertain') notes.push({ key: r.id, status: st, glyph: STATUS_GLYPH[st], word: STATUS_LABEL[st], text: `${label}: ${v?.reason ?? 'the check could not be completed'}.`, refId: r.id });
      else if (st === 'invalid_doi') notes.push({ key: r.id, status: st, glyph: STATUS_GLYPH[st], word: STATUS_LABEL[st], text: `${label} has a DOI that is not of the form 10.NNNN/suffix.` });
    }
  }

  const lastApplied = [...history].reverse().find((h) => h.blockId === block.id && !h.undone);
  const showUndo = lastApplied && lastApplied.after === block.text;

  const onChange = (value: string) => {
    if (/\n[ \t]*\n\s*$/.test(value)) {
      const id = `b-${crypto.randomUUID().slice(0, 8)}`;
      dispatch({ type: 'edit_block', id: block.id, text: value.replace(/\s+$/, '') });
      dispatch({ type: 'add_block', afterId: block.id, id });
      props.requestFocus(id);
      return;
    }
    dispatch({ type: 'edit_block', id: block.id, text: value });
  };

  const settling = props.settleBlockId === block.id;
  const active = props.activeBlockId === block.id;

  const label = heading ? `heading ${index + 1}` : `paragraph ${index + 1}`;
  const locate = (quote: string) => {
    const at = block.text.indexOf(quote);
    if (at < 0 || !ta.current) return;
    ta.current.focus();
    ta.current.setSelectionRange(at, at + quote.length);
  };

  return (
    <div className={`folio-row${heading ? ' is-heading-row' : ''}`} data-row-id={block.id} style={{ ['--row' as string]: index + 2 }}>
    <section className={`block${heading ? ` is-heading lvl-${Math.min(/^\s*(#+)/.exec(block.text)?.[1].length ?? 1, 3)}` : ''}${active ? ' is-active' : ''}`} data-block-id={block.id}>
      <div className="field">
        <div className={`mirror${settling ? ' settle' : ''}`} aria-hidden="true">{segments}{'\n'}</div>
        <textarea
          ref={ta}
          value={block.text}
          rows={1}
          spellCheck
          placeholder="Write a paragraph…"
          aria-label={heading ? `Heading ${index + 1}` : `Paragraph ${index + 1}`}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => { if (!block.text.trim()) dispatch({ type: 'delete_block', id: block.id }); }}
        />
      </div>
      {notes.length > 0 && (
        <ul className="marginalia">
          {notes.map((n) => (
            <li key={n.key} className={`margin-note note-${n.status}`}>
              {n.status === 'not_found' && <PhantomBracket />}
              <span className="glyph" aria-hidden="true">{n.glyph}</span> <strong>{n.word}.</strong> {n.text}
              {n.refId && <button type="button" className="linklike" onClick={() => props.onRecheck(n.refId!)}> Re-check</button>}
            </li>
          ))}
        </ul>
      )}
      {showUndo && (
        <p className="undo-bar" role="status">
          Revision applied · <button type="button" className="linklike" onClick={() => props.onUndo(lastApplied.id)}>Undo</button>
        </p>
      )}
      {!heading && (
        <div className="block-tools">
          {block.text.trim() && <>
            <button type="button" className="tool" onClick={() => props.onRevise(block.id)} aria-label={`Revise paragraph ${index + 1} with Kiro`}>Revise with Kiro</button>
            <button type="button" className="tool" onClick={() => { const id = `b-${crypto.randomUUID().slice(0, 8)}`; dispatch({ type: 'add_block', afterId: block.id, id }); props.requestFocus(id); }} aria-label={`Add a paragraph after paragraph ${index + 1}`}>Add below</button>
          </>}
          <button type="button" className="tool danger" onClick={() => dispatch({ type: 'delete_block', id: block.id })} aria-label={`Delete paragraph ${index + 1}`}>Delete</button>
        </div>
      )}
    </section>
    {!heading && block.text.trim() ? (
      <GhostMargin
        block={block} blocks={props.blocks} label={label} review={props.reviews[block.id]} task={props.ghostTasks[block.id]} access={props.ghostAccess}
        onReview={props.onReview ? () => props.onReview!(block.id) : undefined}
        onCancel={props.onCancelReview ? () => props.onCancelReview!(block.id) : undefined}
        onFinding={(fid, st) => props.onFinding(block.id, fid, st)} onLocate={locate}
      />
    ) : <div className="ghost-margin is-empty" aria-hidden="true" />}
    </div>
  );
}
