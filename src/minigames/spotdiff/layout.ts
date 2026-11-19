/**
 * Odd Page Out: where the open book sits on screen (CSS px). Shared by the Hud (DOM pages) and the
 * Scene (the 3D book cover and the props around it), so the two line up.
 *
 * Landscape: the two pages side by side, gutter in the middle. Portrait: the book is turned, so the
 * pages are stacked. Each picture is 4 : 3 (400 × 300 picture units).
 */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface BookLayout {
  portrait: boolean;
  /** Short landscape (phones on their side): one-line HUD. */
  short: boolean;
  /** The two pictures (reference first). */
  pics: [Rect, Rect];
  /** The two pages (paper around each picture). */
  pages: [Rect, Rect];
  /** The book's cover, behind both pages. */
  book: Rect;
  /** CSS px per picture unit. */
  scale: number;
}

const ASPECT = 0.75;
/** Room kept for the HUD at the top (px, below the safe area). */
export const HUD_TOP = { portrait: 126, landscape: 104, short: 46 };

export function bookLayout(w: number, h: number, inset: Insets = { top: 0, right: 0, bottom: 0, left: 0 }): BookLayout {
  const portrait = h > w;
  const short = !portrait && h < 520;
  const top = inset.top + (portrait ? HUD_TOP.portrait : short ? HUD_TOP.short : HUD_TOP.landscape);
  const x0 = inset.left + (portrait ? 3 : 10);
  const x1 = w - inset.right - (portrait ? 3 : 10);
  const y1 = h - inset.bottom - (portrait ? 8 : 6);
  const availW = Math.max(100, x1 - x0);
  const availH = Math.max(100, y1 - top);
  // Paper margin round each picture, the cover's edge and the gutter between the pages.
  const pad = portrait ? 5 : short ? 6 : 10;
  const cover = portrait ? 5 : short ? 6 : 10;
  const gutter = portrait ? 8 : short ? 10 : 16;
  let pw: number;
  if (portrait) pw = Math.min(availW - 2 * pad - 2 * cover, (availH - gutter - 4 * pad - 2 * cover) / (2 * ASPECT));
  else pw = Math.min((availW - gutter - 4 * pad - 2 * cover) / 2, (availH - 2 * pad - 2 * cover) / ASPECT, 640);
  pw = Math.max(80, Math.floor(pw));
  const ph = Math.round(pw * ASPECT);
  const pageW = pw + 2 * pad;
  const pageH = ph + 2 * pad;
  const bookW = portrait ? pageW + 2 * cover : 2 * pageW + gutter + 2 * cover;
  const bookH = portrait ? 2 * pageH + gutter + 2 * cover : pageH + 2 * cover;
  const bx = Math.round(x0 + (availW - bookW) / 2);
  const by = Math.round(top + (availH - bookH) / 2);
  const pageA = { x: bx + cover, y: by + cover, w: pageW, h: pageH };
  const pageB = portrait ? { x: bx + cover, y: by + cover + pageH + gutter, w: pageW, h: pageH } : { x: bx + cover + pageW + gutter, y: by + cover, w: pageW, h: pageH };
  const pic = (p: Rect): Rect => ({ x: p.x + pad, y: p.y + pad, w: pw, h: ph });
  return {
    portrait,
    short,
    pics: [pic(pageA), pic(pageB)],
    pages: [pageA, pageB],
    book: { x: bx, y: by, w: bookW, h: bookH },
    scale: pw / 400,
  };
}

/** Safe-area insets in px (notches), read from CSS. */
export function readInsets(): Insets {
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const out = { top: parseFloat(cs.paddingTop) || 0, right: parseFloat(cs.paddingRight) || 0, bottom: parseFloat(cs.paddingBottom) || 0, left: parseFloat(cs.paddingLeft) || 0 };
  probe.remove();
  return out;
}
