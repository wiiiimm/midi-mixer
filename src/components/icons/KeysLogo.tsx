import type { CSSProperties } from 'react';

export interface KeysLogoProps {
  /** Animation mode: "loop" (splash), "hover" (brand: plays on demand), or omitted (static). */
  play?: 'loop' | 'hover';
  className?: string;
  label?: string;
  idPrefix?: string;
}

const BACK = 7;
const FRONT = 29;
const DEPTH = 4.5;
const MID = 24;
const PERSP = 0.8;
const BLACK_END = 20;

const at = (x: number, y: number) =>
  (MID + (x - MID) * (PERSP + (1 - PERSP) * ((y - BACK) / (FRONT - BACK)))).toFixed(2);

const quad = (x0: number, x1: number, y0: number, y1: number) =>
  `${at(x0, y0)},${y0} ${at(x1, y0)},${y0} ${at(x1, y1)},${y1} ${at(x0, y1)},${y1}`;

const WHITE_KEYS = [0, 1, 2, 3, 4].map((i) => ({
  i,
  x0: 4 + 8 * i + 0.4,
  x1: 12 + 8 * i - 0.4,
}));

const BLACK_KEYS = [1, 2, 4].map((j) => ({
  i: j - 0.5,
  x0: 4 + 8 * j - 2.6,
  x1: 4 + 8 * j + 2.6,
}));

const BED_POINTS = quad(3, 45, BACK - 1.5, FRONT + DEPTH + 1);

/** App mark: five piano keys seen from a front-top angle, so a press reads as the key going down. */
export function KeysLogo({
  play,
  className = '',
  label = 'midi-mixer',
  idPrefix,
}: KeysLogoProps) {
  const id = idPrefix ?? `kl-${play ?? 'static'}`;
  const classes = ['keys-logo', className, play ? `keys-${play}` : '']
    .filter(Boolean)
    .join(' ');

  return (
    <svg className={classes} viewBox="0 0 48 40" role="img" aria-label={label}>
      <defs>
        <linearGradient id={`${id}-w`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d8d8de" />
          <stop offset="1" stopColor="#ffffff" />
        </linearGradient>
        <linearGradient id={`${id}-b`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1a1a1c" />
          <stop offset="1" stopColor="#3a3a3e" />
        </linearGradient>
      </defs>
      <polygon className="bed" points={BED_POINTS} />
      {WHITE_KEYS.map((key) => (
        <g key={key.i} className="key white" style={{ '--i': key.i } as CSSProperties}>
          <polygon className="front" points={quad(key.x0, key.x1, FRONT, FRONT + DEPTH)} />
          <polygon
            className="top"
            points={quad(key.x0, key.x1, BACK, FRONT)}
            fill={`url(#${id}-w)`}
          />
          <polygon className="lit" points={quad(key.x0, key.x1, BACK, FRONT)} />
        </g>
      ))}
      {BLACK_KEYS.map((key) => (
        <g key={key.i} className="key black" style={{ '--i': key.i } as CSSProperties}>
          <polygon className="front" points={quad(key.x0, key.x1, BLACK_END, BLACK_END + 2.6)} />
          <polygon
            className="top"
            points={quad(key.x0, key.x1, BACK, BLACK_END)}
            fill={`url(#${id}-b)`}
          />
          <polygon className="lit" points={quad(key.x0, key.x1, BACK, BLACK_END)} />
        </g>
      ))}
    </svg>
  );
}

export default KeysLogo;
