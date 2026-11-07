import { useEffect, useRef, useState } from 'react';
import type { AppliedRevision, Block, Reference, Verification } from '../../shared/types.ts';
import { download, exportName, toBibtex, toCitationReport, toCslJson, toMarkdown } from '../lib/export.ts';
import { titleOf } from '../lib/manuscript.ts';

interface Props {
  blocks: Block[];
  references: Reference[];
  verifications: Record<string, Verification>;
  history: AppliedRevision[];
  onHistory: () => void;
}

export function ExportMenu({ blocks, references, verifications, history, onHistory }: Props) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const empty = blocks.length === 0;

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  const run = (fn: () => void) => () => { fn(); setOpen(false); };
  const title = titleOf(blocks);

  return (
    <div className="menu-wrap" ref={wrap} onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}>
      <button type="button" className="btn" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(!open)}>Export</button>
      {open && (
        <div className="menu" role="group" aria-label="Export">
          <button type="button" disabled={empty} onClick={run(() => download(exportName(blocks, 'md'), toMarkdown(blocks, references), 'text/markdown'))}>Manuscript (Markdown)</button>
          <button type="button" disabled={!references.length} onClick={run(() => download(exportName(blocks, 'bib', '-references'), toBibtex(references), 'text/plain'))}>References (BibTeX)</button>
          <button type="button" disabled={!references.length} onClick={run(() => download(exportName(blocks, 'json', '-references'), toCslJson(references, verifications), 'application/json'))}>References (CSL-JSON)</button>
          <button type="button" disabled={!references.length} onClick={run(() => download(exportName(blocks, 'md', '-citation-report'), toCitationReport(references, verifications, title), 'text/markdown'))}>Citation report (Markdown)</button>
          <button type="button" disabled={empty} onClick={run(() => setTimeout(() => window.print(), 50))}>Print or save as PDF</button>
          <hr />
          <button type="button" onClick={run(onHistory)}>Revision history ({history.filter((h) => !h.undone).length})</button>
        </div>
      )}
    </div>
  );
}
