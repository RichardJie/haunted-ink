import type { Status } from '../../shared/types.ts';

export const STATUS_LABEL: Record<Status, string> = {
  verified: 'Verified', mismatch: 'Mismatch', not_found: 'Not found', uncertain: 'Uncertain',
  invalid_doi: 'Invalid DOI', no_doi: 'No DOI', unchecked: 'Unchecked', checking: 'Checking',
};

export const STATUS_GLYPH: Record<Status, string> = {
  verified: '✓', mismatch: '≠', not_found: '✕', uncertain: '?', invalid_doi: '!', no_doi: '–', unchecked: '○', checking: '…',
};

export function StatusMark({ status }: { status: Status }) {
  return (
    <span className={`status status-${status}`}>
      <span className="glyph" aria-hidden="true">{STATUS_GLYPH[status]}</span>
      <span className="word">{STATUS_LABEL[status]}</span>
    </span>
  );
}
