import { useEffect, useId, useState } from 'react';
import { clampGoal, type CandleProgress } from '../../shared/editorial.ts';

interface Props {
  progress: CandleProgress;
  onGoal: (goal: number) => void;
  /** `tall` in the study column, `compact` in narrow layouts. */
  variant?: 'tall' | 'compact';
}

const H = 168; // wax column height in viewBox units at a full candle
const BASE = 212;
const fmt = (n: number) => n.toLocaleString('en-US');

/**
 * The writing candle. Its wax is the share of the word goal not yet written:
 * it shortens only when body words are added, never with time.
 */
export function CandleGauge({ progress, onGoal, variant = 'tall' }: Props) {
  const id = useId().replace(/:/g, '');
  const [draft, setDraft] = useState(String(progress.goal));
  useEffect(() => setDraft(String(progress.goal)), [progress.goal]);
  const drop = (1 - progress.wax) * H;
  const lit = progress.state === 'burning';
  const text =
    progress.state === 'unlit' ? 'Unlit. Write the first sentence to light the candle.'
    : progress.state === 'spent' ? 'Burned to the stub. Word goal reached.'
    : `${fmt(progress.remaining)} words of wax left.`;
  const commit = () => {
    const n = Number(draft.replace(/[,\s]/g, ''));
    if (draft.trim() && Number.isFinite(n)) {
      const goal = clampGoal(n);
      // The field shows the stored goal even when the clamped value equals the old one (so the effect would not run).
      setDraft(String(goal));
      onGoal(goal);
    } else setDraft(String(progress.goal));
  };
  return (
    <section className={`candle candle-${variant} candle-${progress.state}`} aria-labelledby={`${id}-h`}>
      <div className="candle-art" data-wax={progress.wax.toFixed(3)}>
        <svg viewBox="0 0 80 240" width="100%" height="100%" aria-hidden="true" focusable="false">
          <defs>
            <radialGradient id={`${id}-glow`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#f1c97a" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#f1c97a" stopOpacity="0" />
            </radialGradient>
            <linearGradient id={`${id}-wax`} x1="0" x2="1">
              <stop offset="0%" stopColor="#cdbf9f" />
              <stop offset="45%" stopColor="#efe4c8" />
              <stop offset="100%" stopColor="#b9a985" />
            </linearGradient>
          </defs>
          {/* wax body: scaled from the dish, so its painted height is the remaining share */}
          <rect className="wax-body" x="26" y={BASE - H} width="28" height={H} fill={`url(#${id}-wax)`} style={{ transform: `scaleY(${progress.wax})` }} />
          {/* everything above the wax rides down with it */}
          <g className="wax-top" style={{ transform: `translateY(${drop}px)` }}>
            {lit && <circle className="glow" cx="40" cy={BASE - H - 22} r="30" fill={`url(#${id}-glow)`} />}
            <path d={`M26 ${BASE - H + 2} C30 ${BASE - H - 3} 50 ${BASE - H - 3} 54 ${BASE - H + 2} L54 ${BASE - H + 14} C52 ${BASE - H + 14} 52 ${BASE - H + 5} 50 ${BASE - H + 5} C46 ${BASE - H + 5} 47 ${BASE - H + 22} 44 ${BASE - H + 22} C41 ${BASE - H + 22} 42 ${BASE - H + 6} 38 ${BASE - H + 6} L26 ${BASE - H + 6} Z`} fill="#f4ead2" />
            <path d={`M40 ${BASE - H} V${BASE - H - 9}`} stroke="#2a2420" strokeWidth="1.4" strokeLinecap="round" />
            {lit && (
              <g className="flame">
                <path d={`M40 ${BASE - H - 40} C32 ${BASE - H - 26} 33 ${BASE - H - 12} 40 ${BASE - H - 8} C47 ${BASE - H - 12} 48 ${BASE - H - 26} 40 ${BASE - H - 40} Z`} fill="#f0c163" />
                <path d={`M40 ${BASE - H - 28} C37 ${BASE - H - 20} 37.5 ${BASE - H - 13} 40 ${BASE - H - 11} C42.5 ${BASE - H - 13} 43 ${BASE - H - 20} 40 ${BASE - H - 28} Z`} fill="#fff4d6" />
              </g>
            )}
            {progress.state === 'spent' && <path className="smoke" d={`M40 ${BASE - H - 10} C34 ${BASE - H - 20} 46 ${BASE - H - 28} 40 ${BASE - H - 40} C36 ${BASE - H - 47} 42 ${BASE - H - 52} 39 ${BASE - H - 58}`} fill="none" stroke="#9aa7ad" strokeWidth="0.9" opacity="0.7" />}
          </g>
          {/* brass dish */}
          <path d={`M10 ${BASE + 2} H70 C70 ${BASE + 14} 10 ${BASE + 14} 10 ${BASE + 2} Z`} fill="#2b2418" stroke="#c9a45c" strokeWidth="1" />
          <path d={`M64 ${BASE + 8} C74 ${BASE + 8} 76 ${BASE + 18} 66 ${BASE + 18}`} fill="none" stroke="#c9a45c" strokeWidth="1" />
          {/* goal scale: quarter ticks against the full candle */}
          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <path key={t} d={`M58 ${BASE - H * t} H63`} stroke="#6f6557" strokeWidth="0.8" />
          ))}
        </svg>
      </div>
      <div className="candle-read">
        <h2 id={`${id}-h`} className="room-label">Writing candle</h2>
        <p
          className="candle-count"
          role="progressbar"
          aria-label="Words written toward the goal"
          aria-valuemin={0}
          aria-valuemax={progress.goal}
          aria-valuenow={Math.min(progress.words, progress.goal)}
          aria-valuetext={`${fmt(progress.words)} of ${fmt(progress.goal)} words, ${progress.percent} percent`}
        >
          <strong>{fmt(progress.words)}</strong> <span>/ {fmt(progress.goal)} words</span>
        </p>
        <p className="candle-state">{progress.percent}% · {text}</p>
        <label className="candle-goal">
          <span>Word goal</span>
          <input
            type="number" inputMode="numeric" min={50} max={200000} step={50} value={draft}
            onChange={(e) => setDraft(e.target.value)} onBlur={commit}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }}
          />
        </label>
        <p className="candle-note">Counts body words only: headings, citations and evidence markers are not counted.</p>
      </div>
    </section>
  );
}
