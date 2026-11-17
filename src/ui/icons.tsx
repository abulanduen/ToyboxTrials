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

/** Small swatch icons for the Workshop (match the 3D cosmetics). */
export function HatIcon({ id, size = 40 }: { id: string; size?: number }) {
  const o = { stroke: '#2B2433', strokeWidth: 2.5, strokeLinejoin: 'round' as const };
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      {/* turret silhouette for context */}
      <circle cx="24" cy="36" r="10" fill="#6BA7C8" {...o} />
      <circle cx="24" cy="36" r="5" fill="#FFFDF6" stroke="#2B2433" strokeWidth="1.5" />
      {id === 'none' && (
        <>
          <line x1="24" y1="26" x2="24" y2="14" {...o} />
          <circle cx="24" cy="12" r="4" fill="#E76B62" {...o} />
        </>
      )}
      {id === 'thimble' && <path d="M14 27 L16 12 Q24 4 32 12 L34 27 Z" fill="#C9C7C2" {...o} />}
      {id === 'bottlecap' && <path d="M12 27 L12 19 L16 12 L20 19 L24 10 L28 19 L32 12 L36 19 L36 27 Z" fill="#EFAE45" {...o} />}
      {id === 'paperboat' && <path d="M6 27 L42 27 L36 21 L28 21 L24 6 L20 21 L12 21 Z" fill="#F6EEDC" {...o} />}
      {id === 'acorn' && (
        <>
          <path d="M11 27 Q11 13 24 13 Q37 13 37 27 Z" fill="#8A5A34" {...o} />
          <line x1="24" y1="13" x2="27" y2="6" {...o} />
        </>
      )}
    </svg>
  );
}

export function KeySkinIcon({ id, size = 40 }: { id: string; size?: number }) {
  const o = { stroke: '#2B2433', strokeWidth: 2.5, strokeLinejoin: 'round' as const };
  const fill = id === 'golden' ? '#F2C14E' : id === 'heart' ? '#E76B62' : id === 'star' ? '#6BA7C8' : '#C8973A';
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <rect x="21" y="26" width="6" height="18" rx="2" fill="#C8973A" {...o} />
      {(id === 'classic' || id === 'golden') && (
        <>
          <ellipse cx="14" cy="17" rx="9" ry="8" fill={fill} {...o} />
          <ellipse cx="34" cy="17" rx="9" ry="8" fill={fill} {...o} />
          <circle cx="24" cy="21" r="5" fill={fill} {...o} />
          {id === 'golden' && <path d="M38 6 l1.5 3 3 1.5 -3 1.5 -1.5 3 -1.5 -3 -3 -1.5 3 -1.5z" fill="#FFF9EE" />}
        </>
      )}
      {id === 'heart' && <path d="M24 30 C14 22 8 16 12 10 C16 4 22 7 24 11 C26 7 32 4 36 10 C40 16 34 22 24 30 Z" fill={fill} {...o} />}
      {id === 'star' && <path d="M24 4l5 10 11 1.5-8 7.5 2 11-10-5.5-10 5.5 2-11-8-7.5 11-1.5z" fill={fill} {...o} />}
    </svg>
  );
}

export function PadlockIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d="M7 11 V8 a5 5 0 0 1 10 0 V11" fill="none" stroke="#2B2433" strokeWidth="2.5" />
      <rect x="4.5" y="11" width="15" height="10" rx="2.5" fill="#EFAE45" stroke="#2B2433" strokeWidth="2.2" />
    </svg>
  );
}
