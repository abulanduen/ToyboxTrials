/**
 * Odd Page Out: one picture as inline SVG (vector, so it is crisp at any device pixel ratio).
 * Memoised per scene and variant list: a picture is built once per round, not per HUD tick.
 */
import { memo, type ReactNode } from 'react';
import { drawPicture } from './art';
import { INK, PIC_H, PIC_W, type Shape } from './shapes';
import type { ThemeId } from './themes';

function el(sh: Shape, key: number): ReactNode {
  if (sh.t === 'g')
    return (
      <g key={key} transform={sh.tf} opacity={sh.o}>
        {sh.k.map(el)}
      </g>
    );
  const st = {
    fill: sh.f,
    stroke: sh.s === null ? 'none' : (sh.s ?? INK),
    strokeWidth: sh.s === null ? undefined : (sh.sw ?? 2),
    opacity: sh.o,
  };
  switch (sh.t) {
    case 'c':
      return <circle key={key} cx={sh.x} cy={sh.y} r={sh.r} {...st} />;
    case 'e':
      return <ellipse key={key} cx={sh.x} cy={sh.y} rx={sh.rx} ry={sh.ry} {...st} />;
    case 'r':
      return <rect key={key} x={sh.x} y={sh.y} width={sh.w} height={sh.h} rx={sh.rx} {...st} />;
    case 'p':
      return <path key={key} d={sh.d} {...st} />;
  }
}

export const Picture = memo(function Picture({ theme, variants }: { theme: ThemeId; variants: readonly number[] }) {
  return (
    <svg className="sd-art" viewBox={`0 0 ${PIC_W} ${PIC_H}`} preserveAspectRatio="none" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
      {drawPicture(theme, variants).map(el)}
    </svg>
  );
});
