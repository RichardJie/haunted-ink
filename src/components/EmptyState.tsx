import { Flourish, Ghost } from './Engraving.tsx';

interface Props { onExample: () => void; onImport: () => void; onWrite: () => void }

export function EmptyState({ onExample, onImport, onWrite }: Props) {
  return (
    <div className="empty-page">
      <Ghost size={64} className="empty-ghost" />
      <h2 className="smallcaps">The page is blank</h2>
      <Flourish size={150} className="engraving empty-rule" />
      <p>Gather notes on the left, shape them into an outline, then draft one paragraph at a time. Ghost reviewers read a paragraph when you summon them.</p>
      <div className="row center">
        <button type="button" className="btn ink" onClick={onWrite}>Start writing</button>
        <button type="button" className="btn on-ivory" onClick={onExample}>Load the example</button>
        <button type="button" className="btn on-ivory" onClick={onImport}>Import a file</button>
      </div>
      <p className="empty-foot">The example paper’s references include two intentional citation problems, labelled in References.</p>
    </div>
  );
}
