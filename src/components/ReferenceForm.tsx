import { useState } from 'react';
import { MAX_ENTRY_CHARS } from '../lib/refparse.ts';

interface Props { onAdd: (text: string) => string[]; count: number; max: number }

export function ReferenceForm({ onAdd, count, max }: Props) {
  const [text, setText] = useState('');
  const [messages, setMessages] = useState<string[]>([]);

  const submit = () => {
    const msgs = onAdd(text);
    setMessages(msgs);
    if (!msgs.length) setText('');
  };

  return (
    <form className="ref-form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <label htmlFor="ref-input" className="label">Add references</label>
      <textarea
        id="ref-input" value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={MAX_ENTRY_CHARS * 20}
        placeholder={'10.1038/nature14539\nor a BibTeX entry\nor a bibliography line'}
        onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); submit(); } }}
        aria-describedby="ref-help"
      />
      <p id="ref-help" className="hint">DOIs (one per line), BibTeX, or plain lines. The format is detected for you. {count} of {max} used.</p>
      <div className="row"><button type="submit" className="btn primary" disabled={!text.trim()}>Add to ledger</button></div>
      {messages.length > 0 && <ul className="notes" role="status">{messages.map((m, i) => <li key={i}>{m}</li>)}</ul>}
    </form>
  );
}
