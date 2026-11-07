import { wordDiff } from '../lib/diff.ts';

export function DiffView({ before, after }: { before: string; after: string }) {
  const pieces = wordDiff(before, after);
  const changed = pieces.some((p) => p.kind !== 'same');
  return (
    <div className="diff" aria-label="Word-level comparison">
      <p className="diff-text">
        {pieces.map((p, i) =>
          p.kind === 'same' ? <span key={i}>{p.text}</span>
          : p.kind === 'del' ? <del key={i}><span className="sr-only">[removed: </span>{p.text}<span className="sr-only">]</span></del>
          : <ins key={i} className="wet"><span className="sr-only">[added: </span>{p.text}<span className="sr-only">]</span></ins>,
        )}
      </p>
      {!changed && <p className="muted">Kiro returned the paragraph unchanged.</p>}
    </div>
  );
}
