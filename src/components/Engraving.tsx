import type { SVGProps } from 'react';

type Props = SVGProps<SVGSVGElement> & { size?: number };

function Base({ size = 48, children, viewBox = '0 0 64 64', ...rest }: Props & { viewBox?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={rest.height ?? size}
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth={0.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export function Quill(p: Props) {
  return (
    <Base {...p}>
      <path d="M8 57 C20 44 34 28 54 8" />
      <path d="M54 8 C40 8 24 18 18 34 C16 40 14 48 8 57" />
      <path d="M54 8 C54 22 46 36 32 44 C25 48 17 52 8 57" />
      <path d="M44 14 L34 17 M38 20 L28 24 M32 28 L24 33 M26 36 L20 42" />
      <path d="M48 20 L42 28 M42 30 L36 37 M36 40 L28 46" />
      <path d="M8 57 L4 61 M4 61 L9 59" />
    </Base>
  );
}

export function Moth(p: Props) {
  return (
    <Base {...p}>
      <ellipse cx="32" cy="35" rx="2.2" ry="11" />
      <circle cx="32" cy="22" r="2.6" />
      <path d="M31 20 C28 13 24 10 19 10 M33 20 C36 13 40 10 45 10" />
      <path d="M30 28 C18 18 6 20 6 30 C6 38 18 40 30 34" />
      <path d="M34 28 C46 18 58 20 58 30 C58 38 46 40 34 34" />
      <path d="M30 37 C20 38 14 48 20 54 C26 56 30 48 31 41" />
      <path d="M34 37 C44 38 50 48 44 54 C38 56 34 48 33 41" />
      <circle cx="15" cy="29" r="3.2" />
      <circle cx="49" cy="29" r="3.2" />
      <path d="M12 26 C18 24 24 26 28 30 M52 26 C46 24 40 26 36 30" />
      <path d="M32 24 V44 M30.6 30 H33.4 M30.4 36 H33.6" />
    </Base>
  );
}

export function Candle(p: Props) {
  return (
    <Base {...p}>
      <path d="M32 6 C25 15 25 22 32 27 C39 22 39 15 32 6 Z" />
      <path d="M32 12 C29 17 29 21 32 24" />
      <path d="M32 27 V32" />
      <path d="M24 32 H40 V56 H24 Z" />
      <path d="M24 38 C24 43 28 43 28 48 M40 36 C40 41 36 41 36 46" />
      <path d="M14 56 H50 M17 56 C17 61 47 61 47 56" />
    </Base>
  );
}

/** Wide border flourish. Width and height come from the viewBox ratio. */
export function Flourish({ size = 240, ...rest }: Props) {
  return (
    <Base {...rest} size={size} height={size / 10} viewBox="0 0 240 24">
      <path d="M4 12 H98 M142 12 H236" />
      <path d="M98 12 C104 3 114 3 117 9 C119 13 115 16 113 13" />
      <path d="M142 12 C136 3 126 3 123 9 C121 13 125 16 127 13" />
      <path d="M120 6 L125 12 L120 18 L115 12 Z" />
      <path d="M60 12 C64 7 70 7 72 11 M180 12 C176 7 170 7 168 11" />
      <circle cx="4" cy="12" r="1.2" />
      <circle cx="236" cy="12" r="1.2" />
    </Base>
  );
}

/** Empty-desk vignette: a candle, an inkwell with a quill, and a moth drawn to the flame, on one baseline. */
export function DeskScene({ size = 220, ...rest }: Props) {
  return (
    <Base {...rest} size={size} height={size * 0.5} viewBox="0 0 200 100">
      {/* baseline with small end flourishes */}
      <path d="M18 88 H182" />
      <path d="M18 88 C14 88 12 85 14 83 M182 88 C186 88 188 85 186 83" />
      {/* candle and holder */}
      <path d="M66 12 C60 21 60 28 66 33 C72 28 72 21 66 12 Z" />
      <path d="M66 19 C63.5 23 63.5 27 66 30" />
      <path d="M66 33 V37" />
      <path d="M58 37 H74 V80 H58 Z" />
      <path d="M58 44 C58 49 62 49 62 54 M74 42 C74 47 70 47 70 52" />
      <path d="M48 80 H84 M50 80 C50 86 82 86 82 80" />
      <path d="M84 82 C90 82 92 78 89 76" />
      {/* faint light around the flame: hairline arcs only */}
      <path d="M54 16 C52 22 52 28 55 33 M78 16 C80 22 80 28 77 33" strokeDasharray="1.5 3" />
      {/* moth near the flame */}
      <g transform="translate(90 18) rotate(18) scale(0.42)">
        <ellipse cx="32" cy="35" rx="2.2" ry="11" />
        <path d="M30 28 C18 18 6 20 6 30 C6 38 18 40 30 34" />
        <path d="M34 28 C46 18 58 20 58 30 C58 38 46 40 34 34" />
        <path d="M30 37 C20 38 14 48 20 54 C26 56 30 48 31 41" />
        <path d="M34 37 C44 38 50 48 44 54 C38 56 34 48 33 41" />
        <path d="M31 20 C28 13 24 10 19 10 M33 20 C36 13 40 10 45 10" />
      </g>
      {/* inkwell */}
      <path d="M124 88 C120 88 118 84 118 80 V70 C118 66 122 64 128 64 H146 C152 64 156 66 156 70 V80 C156 84 154 88 150 88" />
      <path d="M128 64 V58 H146 V64" />
      <path d="M126 58 H148" />
      <path d="M122 76 H152" strokeDasharray="1.5 2.5" />
      {/* quill resting in the well */}
      <path d="M137 60 C146 42 158 26 176 10" />
      <path d="M176 10 C164 12 152 22 148 36 C146 42 142 50 139 56" />
      <path d="M176 10 C176 22 168 34 156 41 C150 45 144 50 139 56" />
      <path d="M168 18 L160 21 M162 25 L154 29 M156 32 L150 37" />
    </Base>
  );
}

/** A draped reviewer ghost: a hood, two hollow eyes, a frayed hem. Line art, tinted by its role. */
export function Ghost(p: Props) {
  return (
    <Base {...p} viewBox="0 0 48 56">
      <path d="M8 50 C8 28 10 8 24 6 C38 8 40 28 40 50" />
      <path d="M8 50 C11 47 13 53 16 50 C19 47 21 53 24 50 C27 47 29 53 32 50 C35 47 37 53 40 50" />
      <path d="M16 24 C16 21 20 21 20 24 C20 27 16 27 16 24 Z M28 24 C28 21 32 21 32 24 C32 27 28 27 28 24 Z" />
      <path d="M21 33 C22.5 34.5 25.5 34.5 27 33" strokeDasharray="1.2 1.6" />
      <path d="M12 16 C14 12 17 10 20 9" opacity="0.6" />
    </Base>
  );
}

/** A pressed wax seal with a scalloped rim: used when a concern is resolved. */
export function Seal(p: Props) {
  const rim = Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2;
    const r = i % 2 ? 20 : 22;
    return `${(24 + r * Math.cos(a)).toFixed(2)} ${(24 + r * Math.sin(a)).toFixed(2)}`;
  });
  return (
    <Base {...p} viewBox="0 0 48 48">
      <path d={`M${rim.join(' L')} Z`} />
      <circle cx="24" cy="24" r="14" />
      <path d="M17 24.5 L22 29 L31 19" />
    </Base>
  );
}

/** A small ink blot with a drip: marks evidence that is still needed. */
export function InkBlot(p: Props) {
  return (
    <Base {...p} viewBox="0 0 32 32">
      <path d="M16 4 C21 4 22 9 26 10 C30 12 28 18 25 20 C23 22 24 27 19 27 C15 27 14 24 11 24 C6 24 4 20 6 16 C8 12 6 8 10 6 C12 5 13 4 16 4 Z" />
      <path d="M19 27 C19 29 18.5 30 18 30.5" />
      <circle cx="27.5" cy="25" r="1" />
    </Base>
  );
}
