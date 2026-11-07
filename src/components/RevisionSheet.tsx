import { useState } from 'react';
import type { RevisionUI } from '../state.ts';
import type { HealthInfo } from '../api.ts';
import { Dialog } from './Dialog.tsx';
import { DiffView } from './DiffView.tsx';
import { Quill } from './Engraving.tsx';

export const PRESETS = [
  { id: 'tighten', label: 'Tighten', text: 'Tighten the prose: remove redundancy and shorten sentences without losing any claim.' },
  { id: 'clarify', label: 'Clarify the argument', text: 'Clarify the argument: make the logical order of the claims easier to follow.' },
  { id: 'formal', label: 'Formal academic tone', text: 'Use a formal academic tone suitable for a computer-science paper.' },
  { id: 'grammar', label: 'Grammar only', text: 'Fix grammar, spelling and punctuation only. Do not change wording otherwise.' },
] as const;

interface Props {
  rev: RevisionUI;
  currentText: string | undefined;
  health: HealthInfo | null;
  onIntent: (intent: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  onClose: () => void;
  onApply: (confirmedFlags: boolean) => void;
  onRerun: () => void;
}

export function RevisionSheet({ rev, currentText, health, onIntent, onSubmit, onCancel, onClose, onApply, onRerun }: Props) {
  const [preset, setPreset] = useState<string>('');
  const [ack, setAck] = useState(false);
  const active = rev.phase === 'submitting' || rev.phase === 'active';
  const job = rev.job;
  const result = job?.state === 'succeeded' ? job.result : undefined;
  const stale = currentText !== undefined && currentText !== rev.baseText && rev.phase !== 'compose';
  const missing = currentText === undefined;
  const flagged = result?.flagged ?? [];
  const kiroBlocked = health?.kiro === 'missing' || health?.kiro === 'logged_out';

  const choose = (id: string) => {
    setPreset(id);
    const p = PRESETS.find((x) => x.id === id);
    if (p) onIntent(p.text);
  };

  return (
    <Dialog label="Revise with Kiro" onClose={onClose} className="sheet">
      <header className="sheet-head">
        <Quill size={28} className="engraving" />
        <h2 className="smallcaps">Revise with Kiro</h2>
        <button type="button" className="btn small ghost" onClick={onClose} aria-label={active ? 'Cancel and close' : 'Close the revision sheet'}>{active ? 'Cancel and close' : 'Close'}</button>
      </header>

      {kiroBlocked && health && (
        <div className="banner error" role="alert">
          <strong>{health.kiro === 'missing' ? 'Kiro CLI not found.' : 'Kiro CLI is not logged in.'}</strong> {health.detail}
        </div>
      )}

      {rev.phase === 'compose' && (
        <form
          onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
          onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); if (rev.intent.trim() && !kiroBlocked) onSubmit(); } }}
          className="compose"
        >
          <fieldset>
            <legend className="label">What should Kiro do?</legend>
            <div className="presets" role="radiogroup" aria-label="Preset intents">
              {PRESETS.map((p) => (
                <label key={p.id} className={`chip${preset === p.id ? ' on' : ''}`}>
                  <input type="radio" name="preset" value={p.id} checked={preset === p.id} onChange={() => choose(p.id)} /> {p.label}
                </label>
              ))}
            </div>
          </fieldset>
          <label htmlFor="intent" className="label">Intent (up to 500 characters)</label>
          <textarea
            id="intent" data-autofocus rows={4} maxLength={500} value={rev.intent}
            onChange={(e) => { setPreset(''); onIntent(e.target.value); }}
            placeholder="For example: make the second sentence more direct."
          />
          <p className="hint">{rev.intent.length}/500 · Citations, DOIs, URLs and numbers are locked before Kiro sees the text. Press Ctrl or Cmd + Enter to submit.</p>
          <div className="row end"><button type="submit" className="btn primary" disabled={!rev.intent.trim() || kiroBlocked}>Ask Kiro</button></div>
        </form>
      )}

      {active && (
        <div className="progress" role="status" aria-live="polite">
          <p>
            {job?.state === 'queued'
              ? `Queued, position ${job.position ?? 1}.`
              : `Kiro is revising… ${Math.floor((job?.elapsedMs ?? 0) / 1000)} s`}
          </p>
          <p className="hint">The paragraph is only changed if you choose Apply.</p>
          <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        </div>
      )}

      {rev.phase === 'failed' && (
        <div className="banner error" role="alert">
          <strong>{job?.state === 'cancelled' ? 'Cancelled.' : job?.state === 'timed_out' ? 'Timed out.' : 'The revision did not complete.'}</strong>{' '}
          {rev.error?.message}
          {rev.error?.fix && <p className="fix">{rev.error.fix}</p>}
          <div className="row"><button type="button" className="btn" onClick={onRerun}>Try again</button></div>
        </div>
      )}

      {rev.phase === 'done' && result && (
        <div className="result">
          {(stale || missing) && (
            <div className="banner error" role="alert">
              {missing ? 'This paragraph was deleted after the request was sent.' : 'This paragraph changed after the request was sent, so Apply is blocked.'}{' '}
              {!missing && <button type="button" className="linklike" onClick={onRerun}>Run the revision again</button>}
            </div>
          )}
          <h3 className="label">Comparison</h3>
          <DiffView before={rev.baseText} after={result.revised} />
          {result.changes.length > 0 && (<><h3 className="label">What Kiro changed</h3><ul className="plain">{result.changes.map((c, i) => <li key={i}>{c}</li>)}</ul></>)}
          {result.declined.length > 0 && (<><h3 className="label">What Kiro declined</h3><ul className="plain">{result.declined.map((c, i) => <li key={i}>{c}</li>)}</ul></>)}
          {flagged.length > 0 && (
            <div className="banner warn" role="alert">
              <strong>New figures or citations in the revision.</strong> These do not appear in your original: {flagged.map((f) => `${f.value} (${f.kind})`).join(', ')}.
              <label className="check"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> I have checked these and want to apply anyway.</label>
            </div>
          )}
          <div className="row end">
            <button type="button" className="btn" onClick={onClose}>Discard</button>
            <button type="button" className="btn" onClick={onRerun}>Run again</button>
            <button type="button" className="btn primary" disabled={stale || missing || (flagged.length > 0 && !ack)} onClick={() => onApply(ack)}>Apply</button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
