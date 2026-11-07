import { useState } from 'react';
import { doiKey, isValidDoi, normalizeDoi } from '../../shared/doi.ts';
import { DISCLAIMER, type Reference, type Status, type Verification } from '../../shared/types.ts';
import { MAX_REFERENCES } from '../lib/refparse.ts';
import { Moth } from './Engraving.tsx';
import { ReferenceForm } from './ReferenceForm.tsx';
import { STATUS_GLYPH, STATUS_LABEL, StatusMark } from './StatusMark.tsx';

export function statusOf(r: Reference, v?: Verification): Status {
  if (v) return v.status;
  if (!r.doi) return 'no_doi';
  return isValidDoi(normalizeDoi(r.doi)) ? 'unchecked' : 'invalid_doi';
}

interface Props {
  references: Reference[];
  verifications: Record<string, Verification>;
  onAdd: (text: string) => string[];
  onCheckAll: () => void;
  onCheck: (id: string) => void;
  onUpdate: (id: string, patch: Partial<Reference>) => void;
  onDelete: (id: string) => void;
  checking: boolean;
  messages: string[];
}

export function Ledger({ references, verifications, onAdd, onCheckAll, onCheck, onUpdate, onDelete, checking, messages }: Props) {
  const checkable = references.filter((r) => r.doi && isValidDoi(normalizeDoi(r.doi))).length;
  const anyVerified = references.some((r) => verifications[r.id]?.status === 'verified');
  return (
    <aside className="ledger" aria-label="Reference ledger">
      <header className="ledger-head">
        <h2 className="smallcaps">Reference ledger</h2>
        <button type="button" className="btn" onClick={onCheckAll} disabled={!checkable || checking}>
          {checking ? 'Checking…' : `Check all${checkable ? ` (${checkable})` : ''}`}
        </button>
      </header>
      {references.length > 0 && <Tally references={references} verifications={verifications} />}
      {messages.length > 0 && <ul className="notes" role="status">{messages.map((m, i) => <li key={i}>{m}</li>)}</ul>}
      {references.length === 0 ? (
        <div className="ledger-empty">
          <Moth size={44} className="engraving" />
          <p>No references yet. Paste a DOI, a BibTeX entry or a bibliography line below, and Haunted Ink will check each DOI against doi.org.</p>
        </div>
      ) : (
        <ol className="refs">
          {references.map((r, i) => (
            <Row key={r.id} r={r} index={i + 1} v={verifications[r.id]} onCheck={() => onCheck(r.id)}
              onUpdate={(p) => onUpdate(r.id, p)} onDelete={() => onDelete(r.id)} />
          ))}
        </ol>
      )}
      {anyVerified && <p className="disclaimer">{DISCLAIMER}</p>}
      <ReferenceForm onAdd={onAdd} count={references.length} max={MAX_REFERENCES} />
    </aside>
  );
}

const TALLY_ORDER: Status[] = ['not_found', 'mismatch', 'invalid_doi', 'uncertain', 'checking', 'unchecked', 'verified', 'no_doi'];

/** Counts of the current statuses, nothing more: no score, no weighting. */
function Tally({ references, verifications }: { references: Reference[]; verifications: Record<string, Verification> }) {
  const statuses = references.map((r) => statusOf(r, verifications[r.id]));
  const counts = TALLY_ORDER.map((s) => [s, statuses.filter((x) => x === s).length] as const).filter(([, n]) => n > 0);
  const total = references.length;
  return (
    <div className="tally">
      <p className="tally-line" aria-label={`Ledger summary: ${total} ${total === 1 ? 'reference' : 'references'}, ${counts.map(([s, n]) => `${n} ${STATUS_LABEL[s]}`).join(', ')}`}>
        <span className="tally-total">{total} {total === 1 ? 'reference' : 'references'}</span>
        {counts.map(([s, n]) => (
          <span key={s} className={`tally-item tally-${s}`}><span aria-hidden="true">{STATUS_GLYPH[s]}</span> {n} {STATUS_LABEL[s]}</span>
        ))}
      </p>
      <p className="tally-strip" aria-hidden="true">
        {statuses.map((s, i) => <span key={i} className={`tick tick-${s}`} title={`${i + 1}: ${STATUS_LABEL[s]}`} />)}
      </p>
    </div>
  );
}

/** Example notes: "INTENTIONAL…" notes get a visible tag; routine notes live in Details. */
interface NoteParts { intentional: boolean; label?: string; text?: string }
function noteParts(note?: string): NoteParts {
  if (!note) return { intentional: false };
  const m = /^INTENTIONAL( PROBLEM)?:\s*/.exec(note);
  if (!m) return { intentional: false, label: 'Example note', text: note };
  return { intentional: true, label: m[1] ? 'Intentional example problem' : 'Intentional example', text: note.slice(m[0].length) };
}

function Row({ r, index, v, onCheck, onUpdate, onDelete }: {
  r: Reference; index: number; v?: Verification; onCheck: () => void; onUpdate: (p: Partial<Reference>) => void; onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const status = statusOf(r, v);
  const label = r.key ?? r.title ?? r.doi ?? `Reference ${index}`;
  const detailId = `ref-detail-${r.id}`;
  const note = noteParts(r.note);
  return (
    <li className={`ref ref-${status}`} data-ref-key={r.key}>
      <div className="ref-main">
        <span className="ref-num">{index}</span>
        <div className="ref-body">
          <p className="ref-title">{r.key && <code>{r.key}</code>} {r.title ?? r.raw}</p>
          <p className="ref-sub">{[r.authors?.[0]?.split(',')[0], r.year].filter(Boolean).join(' · ')}{r.doi ? <> · <span className="doi">{normalizeDoi(r.doi)}</span></> : null}</p>
          <p className="ref-status">
            <StatusMark status={status} />
            {status === 'not_found' && <span className="phantom-tag">phantom reference</span>}
            {note.intentional && <span className="intent-tag" title={note.text}>{note.label}</span>}
          </p>
        </div>
      </div>
      <div className="ref-actions">
        {(r.doi && status !== 'invalid_doi') && <button type="button" className="btn small quiet" onClick={onCheck} disabled={status === 'checking'} aria-label={`${status === 'unchecked' ? 'Check' : 'Re-check'} ${label}`}>{status === 'unchecked' ? 'Check' : 'Re-check'}</button>}
        <button type="button" className="btn small quiet" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={detailId}>Details</button>
        <button type="button" className="btn small quiet" onClick={() => setEditing(true)} aria-label={`Edit ${label}`}>Edit</button>
        <button type="button" className="btn small quiet danger" onClick={onDelete} aria-label={`Delete ${label}`}>Delete</button>
      </div>
      {open && <Detail id={detailId} r={r} v={v} status={status} note={note} />}
      {editing && <EditForm r={r} onCancel={() => setEditing(false)} onSave={(p) => { onUpdate(p); setEditing(false); }} />}
    </li>
  );
}

function Detail({ id, r, v, status, note }: { id: string; r: Reference; v?: Verification; status: Status; note: NoteParts }) {
  return (
    <div className="detail" id={id}>
      {note.text && (
        <p className={`ref-note${note.intentional ? ' intentional' : ''}`}>
          <strong>{note.label}: </strong>{note.text}
        </p>
      )}
      {status === 'verified' && <p className="disclaimer">{DISCLAIMER}</p>}
      {v?.reason && <p><strong>Reason:</strong> {v.reason}</p>}
      {status === 'invalid_doi' && <p>This is not a DOI of the form 10.NNNN/suffix, so no request was made.</p>}
      {status === 'no_doi' && <p>This entry has no DOI, so it cannot be checked against doi.org.</p>}
      {status === 'not_found' && <p>A “phantom reference”: doi.org has no record of this identifier. Check the DOI for typing errors.</p>}
      {status === 'uncertain' && v?.registered?.url && <p>The identifier exists, but its metadata could not be retrieved.</p>}
      {v?.fields && v.fields.length > 0 && (
        <table className="fields">
          <thead><tr><th>Field</th><th>Your entry</th><th>Registered</th><th><span className="sr-only">Result</span></th></tr></thead>
          <tbody>
            {v.fields.map((f) => (
              <tr key={f.field} className={f.match ? '' : 'differs'}>
                <td>{f.field === 'firstAuthor' ? 'First author' : f.field}</td><td>{f.claimed}</td><td>{f.registered || 'none'}</td><td>{f.match ? '✓ matches' : '≠ differs'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {v?.registered && (v.registered.title || v.registered.year) && (
        <dl className="registered">
          {v.registered.title && (<><dt>Registered title</dt><dd>{v.registered.title}</dd></>)}
          {v.registered.authors?.length ? (<><dt>Authors</dt><dd>{v.registered.authors.slice(0, 4).join('; ')}{v.registered.authors.length > 4 ? ' …' : ''}</dd></>) : null}
          {v.registered.year && (<><dt>Year</dt><dd>{v.registered.year}</dd></>)}
          {v.registered.container && (<><dt>Container</dt><dd>{v.registered.container}</dd></>)}
        </dl>
      )}
      {v?.checkedAt && <p className="muted">Checked {new Date(v.checkedAt).toLocaleString('en-GB')} · provider {v.provider ?? 'doi.org'}{v.agency ? ` (metadata via ${v.agency})` : ''}</p>}
      {!v?.checkedAt && r.doi && <p className="muted">Not checked yet.</p>}
      {r.doi && isValidDoi(normalizeDoi(r.doi)) && <p><a href={`https://doi.org/${normalizeDoi(r.doi)}`} target="_blank" rel="noopener noreferrer">Open https://doi.org/{normalizeDoi(r.doi)}</a></p>}
    </div>
  );
}

function EditForm({ r, onSave, onCancel }: { r: Reference; onSave: (p: Partial<Reference>) => void; onCancel: () => void }) {
  const [key, setKey] = useState(r.key ?? '');
  const [doi, setDoi] = useState(r.doi ?? '');
  const [title, setTitle] = useState(r.title ?? '');
  const [authors, setAuthors] = useState((r.authors ?? []).join('; '));
  const [year, setYear] = useState(r.year ? String(r.year) : '');
  const [err, setErr] = useState('');
  const submit = () => {
    const y = year.trim() ? Number(year) : undefined;
    if (y !== undefined && !(Number.isInteger(y) && y >= 1000 && y <= 2200)) { setErr('Year must be four digits.'); return; }
    const d = doi.trim() ? normalizeDoi(doi) : undefined;
    onSave({ key: key.trim() || undefined, doi: d, title: title.trim() || undefined, authors: authors.split(';').map((a) => a.trim()).filter(Boolean), year: y });
  };
  const id = (n: string) => `edit-${r.id}-${n}`;
  return (
    <form className="edit-form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <p className="hint">Changing the DOI, title, author or year resets the status to Unchecked.</p>
      <label htmlFor={id('key')}>Citation key</label><input id={id('key')} value={key} onChange={(e) => setKey(e.target.value)} />
      <label htmlFor={id('doi')}>DOI</label><input id={id('doi')} value={doi} onChange={(e) => setDoi(e.target.value)} />
      <label htmlFor={id('title')}>Title</label><input id={id('title')} value={title} onChange={(e) => setTitle(e.target.value)} />
      <label htmlFor={id('authors')}>Authors (separate with “;”)</label><input id={id('authors')} value={authors} onChange={(e) => setAuthors(e.target.value)} />
      <label htmlFor={id('year')}>Year</label><input id={id('year')} value={year} onChange={(e) => setYear(e.target.value)} inputMode="numeric" />
      {err && <p className="error-text" role="alert">{err}</p>}
      <div className="row end"><button type="button" className="btn small" onClick={onCancel}>Cancel</button><button type="submit" className="btn small primary">Save</button></div>
    </form>
  );
}

export { doiKey };
