/** Original inline SVG icons for the Toybox Trials UI (no icon libraries, no emoji). */
import type { CSSProperties } from 'react';

export function WindKeyIcon({ size = 28, color = '#C8973A', style }: { size?: number; color?: string; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" style={style} aria-hidden>
      <g fill="none" stroke="#2B2433" strokeWidth="2.5" strokeLinejoin="round">
        <rect x="21" y="22" width="6" height="20" rx="2" fill={color} />
        <ellipse cx="14" cy="14" rx="9" ry="8" fill={color} />
        <ellipse cx="34" cy="14" rx="9" ry="8" fill={color} />
        <circle cx="24" cy="18" r="5" fill={color} />
      </g>
      <ellipse cx="14" cy="14" rx="3.4" ry="2.8" fill="#F4E8CE" stroke="#2B2433" strokeWidth="2" />
      <ellipse cx="34" cy="14" rx="3.4" ry="2.8" fill="#F4E8CE" stroke="#2B2433" strokeWidth="2" />
    </svg>
  );
}

export function GearIcon({ size = 22, color = '#574D69' }: { size?: number; color?: string }) {
  const teeth = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2;
    return <rect key={i} x="21" y="2" width="6" height="9" rx="1.5" fill={color} transform={`rotate(${(a * 180) / Math.PI} 24 24)`} />;
  });
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      {teeth}
      <circle cx="24" cy="24" r="14" fill={color} />
      <circle cx="24" cy="24" r="5.5" fill="#F4E8CE" />
    </svg>
  );
}

export function StarSticker({ size = 22, color = '#EFAE45' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <path d="M24 4l5.6 12.4 13.4 1.4-10 9 2.9 13.2L24 33.3 12.1 40l2.9-13.2-10-9 13.4-1.4z" fill={color} stroke="#2B2433" strokeWidth="2.5" strokeLinejoin="round" />
    </svg>
  );
}

/** The contender's face, used on the title sign. Matches the 3D model. */
export function TickerBadge({ size = 96, body = '#6BA7C8', trim = '#EFAE45', accent = '#E76B62' }: { size?: number; body?: string; trim?: string; accent?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden>
      <g stroke="#2B2433" strokeWidth="3.5" strokeLinejoin="round">
        <line x1="60" y1="20" x2="60" y2="8" />
        <circle cx="60" cy="7" r="5" fill={accent} />
        <rect x="40" y="18" width="40" height="30" rx="12" fill={body} />
        <circle cx="60" cy="33" r="12" fill="#FFFDF6" />
        <circle cx="60" cy="33" r="6" fill="#2B2433" />
        <rect x="24" y="44" width="72" height="50" rx="14" fill={body} />
        <rect x="14" y="58" width="12" height="16" rx="5" fill={accent} />
        <rect x="94" y="58" width="12" height="16" rx="5" fill={accent} />
        <rect x="38" y="60" width="44" height="20" rx="4" fill="#2B2433" />
        <rect x="18" y="98" width="84" height="12" rx="6" fill={body} />
      </g>
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <rect x={42 + i * 9.5} y="62" width="7" height="6" rx="1" fill="#FFF9EE" />
          <rect x={42 + i * 9.5} y="72" width="7" height="6" rx="1" fill="#FFF9EE" />
        </g>
      ))}
      <circle cx="64" cy="31" r="2" fill="#fff" />
      <rect x="30" y="99" width="60" height="3" rx="1.5" fill={trim} />
    </svg>
  );
}
