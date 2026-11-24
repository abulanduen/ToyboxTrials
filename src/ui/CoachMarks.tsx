/**
 * First-time menu tips (DOM side; the tours, the words and the placement maths are in
 * src/game/coach.ts). A menu mounts `<CoachMarks tour="pavilion" />`; the first time it shows (with
 * the "Game tutorials" setting on), Pipwick's speech card walks through the parts of the menu
 * marked `data-coach="<target>"`: an outline round each part in turn, the card beside it (never
 * over it, inside the screen and its safe areas), Next / Back / Skip, and Done at the end.
 *
 * - Keys: Enter, Space or → next; ← back; Esc skips. Only while a tour shows, and they go no
 *   further (an Esc that skips never also closes the menu).
 * - The dimming and outline let taps through: the menu stays usable underneath, and only the card
 *   itself takes input.
 * - Parts that aren't on screen (another tab, a section that isn't there) are passed over; if the
 *   part being shown goes away, the tour moves on.
 * - The card follows scrolling, resizing and turning the phone; on each step the menu scrolls the
 *   part into view, with room for the card where it can.
 * - The tour counts as seen as soon as it starts (saved), so it shows once per menu; Settings has
 *   "Show menu tips again".
 * Positions are written straight to the DOM on those events, never as per-frame React state.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useGame } from '../game/store';
import { useNet } from '../net/store';
import { useAccount } from '../net/account';
import { tourFlag } from '../game/tourFlag';
import { isTypingTarget } from '../game/input';
import { COACH_TOURS, intersect, placeCard, roomScroll, shouldCoach, stepCount, stepFrom, stepText, withSeen, type CoachTourId, type Rect } from '../game/coach';
import { ToyButton } from './common';
import { PipwickBadge } from './WelcomeUI';

/** Which tour is showing (at most one at a time). Read by tests through the DOM, not this. */
export const coachFlag: { active: CoachTourId | null } = { active: null };

/** The showing tour's key handler. One capture listener on window, added before any menu's own. */
let onCoachKey: ((e: KeyboardEvent) => void) | null = null;
if (typeof window !== 'undefined') window.addEventListener('keydown', (e) => onCoachKey?.(e), true);

/** Margin inside the safe area, and the gap between the card and what it points at (px). */
const MARGIN = 10;
const GAP = 12;
/** Outline padding round the target (px). */
const PAD = 6;

const targetEl = (target: string): HTMLElement | null => {
  for (const el of document.querySelectorAll<HTMLElement>(`[data-coach="${target}"]`)) if (el.getClientRects().length > 0) return el;
  return null;
};
const present = (target: string) => !!targetEl(target);

const toRect = (r: DOMRect): Rect => ({ x: r.left, y: r.top, w: r.width, h: r.height });

let probe: HTMLDivElement | null = null;
/** The screen less its safe-area insets and a margin. */
function safeView(): Rect {
  if (!probe) {
    probe = document.createElement('div');
    probe.style.cssText =
      'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
    document.body.appendChild(probe);
  }
  const cs = getComputedStyle(probe);
  const t = parseFloat(cs.paddingTop) || 0;
  const r = parseFloat(cs.paddingRight) || 0;
  const b = parseFloat(cs.paddingBottom) || 0;
  const l = parseFloat(cs.paddingLeft) || 0;
  const W = window.innerWidth;
  const H = window.innerHeight;
  return { x: l + MARGIN, y: t + MARGIN, w: Math.max(0, W - l - r - MARGIN * 2), h: Math.max(0, H - t - b - MARGIN * 2) };
}

/** The part of an element that can be seen: clipped by scrolling ancestors and the screen. */
function visibleRect(el: HTMLElement): Rect | null {
  let r: Rect | null = toRect(el.getBoundingClientRect());
  for (let p = el.parentElement; p && r; p = p.parentElement) {
    const cs = getComputedStyle(p);
    if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') r = intersect(r, toRect(p.getBoundingClientRect()));
  }
  return r && intersect(r, { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight });
}

function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight + 1) return p;
  }
  return null;
}

export function CoachMarks({ tour, hold = false }: { tour: CoachTourId; hold?: boolean }) {
  const steps = COACH_TOURS[tour];
  const eligible = useGame((s) => shouldCoach(s, tour));
  const touch = useGame((s) => s.touchUI);
  const netSheet = useNet((s) => s.sheetOpen);
  const accountSheet = useAccount((s) => s.sheetOpen);
  const held = hold || netSheet || accountSheet;
  const [step, setStep] = useState<number | null>(null);
  const showing = step !== null && !held;
  const root = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const spot = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  // Start once its first part is on screen and has stopped moving (the menu's entrance animation
  // is over); it's seen from then on.
  useEffect(() => {
    if (step !== null || !eligible || held) return;
    let last = '';
    const id = window.setInterval(() => {
      if (tourFlag.active || (coachFlag.active && coachFlag.active !== tour)) return;
      const first = stepFrom(steps, -1, 1, present);
      const el = first >= 0 ? targetEl(steps[first].target) : null;
      const r = el?.getBoundingClientRect();
      const now = r ? `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}` : '';
      const still = !!now && now === last;
      last = now;
      if (!still) return;
      window.clearInterval(id);
      const g = useGame.getState();
      g.set({ coachSeen: withSeen(g.coachSeen, tour) });
      returnFocus.current = document.activeElement as HTMLElement | null;
      setStep(first);
    }, 300);
    return () => window.clearInterval(id);
  }, [step, eligible, held, steps, tour]);

  const end = useCallback(() => {
    setStep(null);
    const back = returnFocus.current;
    returnFocus.current = null;
    if (back?.isConnected) back.focus({ preventScroll: true });
  }, []);

  const go = useCallback(
    (dir: 1 | -1) => {
      if (step === null) return;
      const to = stepFrom(steps, step, dir, present);
      if (to >= 0) setStep(to);
      else if (dir === 1) end();
    },
    [step, steps, end],
  );

  /** Put the outline and the card in place; `scroll` also brings the part into view first. */
  const layout = useCallback(
    (scroll: boolean) => {
      if (step === null || !card.current || !spot.current || !root.current) return;
      const el = targetEl(steps[step].target);
      if (!el) {
        // The part went away (another tab, a closed section): move on, or back, or finish.
        const to = stepFrom(steps, step, 1, present);
        const back = to >= 0 ? to : stepFrom(steps, step, -1, present);
        if (back >= 0) setStep(back);
        else end();
        return;
      }
      const view = safeView();
      const size = { w: card.current.offsetWidth, h: card.current.offsetHeight };
      if (scroll) {
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        const vis = visibleRect(el);
        if (placeCard(view, vis, size, GAP).side === 'overlap') {
          const sp = scrollParent(el);
          for (const above of [false, true]) {
            if (!sp) break;
            const r = el.getBoundingClientRect();
            const d = roomScroll(view, r.top, r.height, size.h, GAP, above);
            if (d) sp.scrollTop += d;
            if (placeCard(view, visibleRect(el), size, GAP).side !== 'overlap') break;
          }
        }
      }
      const vis = visibleRect(el);
      const pos = placeCard(view, vis, size, GAP);
      card.current.style.left = `${Math.round(pos.x)}px`;
      card.current.style.top = `${Math.round(pos.y)}px`;
      root.current.dataset.side = pos.side;
      const s = spot.current.style;
      if (vis) {
        s.display = '';
        s.left = `${vis.x - PAD}px`;
        s.top = `${vis.y - PAD}px`;
        s.width = `${vis.w + PAD * 2}px`;
        s.height = `${vis.h + PAD * 2}px`;
      } else s.display = 'none';
    },
    [step, steps, end],
  );

  // Each step: scroll its part into view and place everything (before paint, so nothing jumps).
  useLayoutEffect(() => {
    if (showing) layout(true);
  }, [showing, step, layout]);

  // Follow scrolling, resizing and turning; catch parts that move or vanish on their own.
  useEffect(() => {
    if (!showing) return;
    let raf = 0;
    const later = (scroll: boolean) => () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => layout(scroll));
    };
    const onScroll = later(false);
    const onResize = later(true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    const id = window.setInterval(() => layout(false), 400);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
      window.clearInterval(id);
    };
  }, [showing, layout]);

  // Keys, and which tour holds the screen.
  useEffect(() => {
    if (!showing) return;
    coachFlag.active = tour;
    card.current?.focus({ preventScroll: true });
    onCoachKey = (e) => {
      const onCardButton = !!card.current && card.current.contains(e.target as Node) && (e.target as HTMLElement).tagName === 'BUTTON';
      if (e.code === 'Escape') end();
      else if (isTypingTarget(e.target)) return;
      else if (e.code === 'ArrowRight') go(1);
      else if (e.code === 'ArrowLeft') go(-1);
      else if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') {
        // A focused card button (Back, Skip) answers its own Enter / Space.
        if (onCardButton) {
          e.stopImmediatePropagation();
          return;
        }
        go(1);
      } else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    return () => {
      onCoachKey = null;
      if (coachFlag.active === tour) coachFlag.active = null;
    };
  }, [showing, tour, go, end]);

  // A tour cut short by the menu closing still frees the screen.
  useEffect(
    () => () => {
      if (coachFlag.active === tour) coachFlag.active = null;
    },
    [tour],
  );

  if (!showing || step === null) return null;
  const s = steps[step];
  const { n, of } = stepCount(steps, step, present);
  const first = stepFrom(steps, step, -1, present) < 0;
  const last = stepFrom(steps, step, 1, present) < 0;
  return createPortal(
    <div
      ref={root}
      className="coach"
      data-testid="coach"
      data-tour={tour}
      data-step={s.target}
      // Taps on the card stay with the card (React passes portal events up to the menu otherwise).
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div ref={spot} className="coach__spot" aria-hidden />
      <div ref={card} className="coach__card" role="dialog" aria-labelledby="coach-title" aria-describedby="coach-text" tabIndex={-1} data-testid="coach-card">
        <div className="coach__head">
          <PipwickBadge size={40} />
          <strong id="coach-title" className="coach__title">
            {s.title}
          </strong>
          <span className="coach__count" data-testid="coach-count">
            {n} / {of}
          </span>
        </div>
        <p id="coach-text" className="coach__text" key={s.target} aria-live="polite">
          {stepText(s, touch)}
        </p>
        <div className="coach__nav">
          {!last && (
            <ToyButton tone="ink" className="coach__btn coach__skip" onClick={end} testId="coach-skip">
              Skip
            </ToyButton>
          )}
          <ToyButton tone="ink" className="coach__btn" onClick={() => go(-1)} disabled={first} testId="coach-back">
            Back
          </ToyButton>
          <ToyButton tone="sage" className="coach__btn coach__next" onClick={() => go(1)} testId="coach-next">
            {last ? 'Done' : 'Next'}
          </ToyButton>
        </div>
      </div>
    </div>,
    document.body,
  );
}
