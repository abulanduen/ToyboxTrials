/**
 * Odd Page Out HUD: the open picture book (two DOM pages with SVG pictures, laid over the 3D book
 * in the Scene), your finds ringed on both pages, the round timer, your score, and a mini
 * leaderboard of everyone's finds. Re-renders at 12 Hz from the live state; the pictures
 * themselves are memoised per round.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from 'react';
import { sfx, unlockAudio } from '../../game/audio';
import { exposeDebug } from '../../game/debug';
import { matchBus, useMatch } from '../session';
import type { MinigameSceneProps } from '../types';
import { Picture } from './Picture';
import { bookLayout, readInsets, type Rect } from './layout';
import { local, resetLocal, submitTap } from './local';
import type { SpotState } from './rules';
import { PIC_H, PIC_W } from './shapes';
import { themeById, type SlotDef } from './themes';
import './spotdiff.css';

function useTicker(hz: number) {
  const [, setN] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setN((n) => n + 1), 1000 / hz);
    return () => window.clearInterval(id);
  }, [hz]);
}

function useViewport() {
  const [v, setV] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const on = () => setV({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', on);
    window.addEventListener('orientationchange', on);
    return () => {
      window.removeEventListener('resize', on);
      window.removeEventListener('orientationchange', on);
    };
  }, []);
  return v;
}

const box = (r: Rect, o?: Rect): CSSProperties => ({ left: r.x - (o?.x ?? 0), top: r.y - (o?.y ?? 0), width: r.w, height: r.h });

/** Ring radius for a found difference: hugs the prop, never smaller than a fingertip mark. */
const ringR = (s: SlotDef) => Math.max(17, s.r - 7);

const ORDINAL = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];

export function SpotHud({ getState, contestants, localId }: MinigameSceneProps<SpotState>) {
  useTicker(12);
  const vp = useViewport();
  const insets = useMemo(() => readInsets(), [vp.w, vp.h]);
  const lay = bookLayout(vp.w, vp.h, insets);
  /** Local reactions (performance.now() ms): wrong taps, +10s, the latest toast. */
  const fx = useRef({ wrongs: [] as { x: number; y: number; at: number; n: number }[], plus: new Map<number, number>(), toast: null as null | { text: string; tone: string; at: number; ms: number }, n: 0 });

  // ---- events: sounds and local feedback ----
  useEffect(() => {
    resetLocal();
    const f = fx.current;
    const toast = (text: string, tone: string, ms = 1600) => (f.toast = { text, tone, at: performance.now(), ms });
    const off = matchBus.on('event', (e) => {
      const now = performance.now();
      const s = getState();
      switch (e.type) {
        case 'round-start':
          f.wrongs = [];
          f.plus.clear();
          f.toast = null;
          local.cursor = -1;
          sfx.pageTurn();
          break;
        case 'search':
          sfx.promptIn();
          break;
        case 'found':
          if (e.id === localId) {
            f.plus.set(e.slot as number, now);
            sfx.inkRing(e.count as number);
          }
          break;
        case 'done':
          if (e.id === localId) {
            const order = e.order as number;
            toast(`All ${s?.data.diffs.length ?? 15} found! ${order === 0 ? 'First! ' : ''}+${e.bonus as number}`, 'good', 2400);
            sfx.spotted();
          } else {
            const name = contestants.find((c) => c.id === e.id)?.name ?? 'Someone';
            if (!s?.players.find((p) => p.id === localId)?.done) toast(`${name} found all ${s?.data.diffs.length ?? 15}!`, 'watch', 1500);
            sfx.knock();
          }
          break;
        case 'again':
          if (e.id === localId) sfx.tick();
          break;
        case 'wrong':
          if (e.id === localId) {
            f.wrongs.push({ x: (e.x as number) * PIC_W, y: (e.y as number) * PIC_H, at: now, n: ++f.n });
            sfx.buzz();
          }
          break;
        case 'unlock':
          if (e.id === localId) sfx.click();
          break;
        case 'reveal': {
          const me = s?.players.find((p) => p.id === localId);
          const missed = (s?.data.diffs.length ?? 0) - (me?.found.length ?? 0);
          if (missed > 0) toast(e.reason === 'time' ? `Time! ${missed} still hiding (circled)` : `Round over: ${missed} still hiding`, 'out', 3000);
          else if (!f.toast || now - f.toast.at > 1200) toast('Page complete!', 'good', 2500);
          sfx.bell(undefined, 0.12);
          break;
        }
      }
    });
    return () => {
      off();
      resetLocal();
    };
  }, [getState, localId, contestants]);

  // ---- debug hooks (e2e tests only) ----
  useEffect(() => {
    exposeDebug({
      spotdiff: {
        /** This round's differences on screen (CSS px) on both pages, and whether you have found each. */
        slots: () => {
          const s = getState();
          const pics = [0, 1].map((i) => document.querySelector(`.sd-pic[data-page="${i}"]`)?.getBoundingClientRect());
          if (!s || !pics[0] || !pics[1]) return [];
          const theme = themeById(s.data.theme);
          const me = s.players.find((p) => p.id === localId);
          return s.data.diffs.map((i) => {
            const sl = theme.slots[i];
            const at = (r: DOMRect) => ({ x: r.left + (sl.x / PIC_W) * r.width, y: r.top + (sl.y / PIC_H) * r.height, r: (sl.r / PIC_W) * r.width });
            return { slot: i, found: !!me?.found.includes(i), a: at(pics[0]!), b: at(pics[1]!) };
          });
        },
        /** Points on screen that are certainly not a difference (page A), for wrong-tap tests. */
        misses: () => {
          const s = getState();
          const r = document.querySelector('.sd-pic[data-page="0"]')?.getBoundingClientRect();
          if (!s || !r) return [];
          const theme = themeById(s.data.theme);
          const diffs = s.data.diffs.map((i) => theme.slots[i]);
          return theme.slots
            .filter((sl) => diffs.every((d) => Math.hypot(d.x - sl.x, d.y - sl.y) > d.r + 6))
            .map((sl) => ({ x: r.left + (sl.x / PIC_W) * r.width, y: r.top + (sl.y / PIC_H) * r.height }));
        },
        open: () => local.open,
        cursor: () => local.cursor,
        /** Where the keyboard ring is on page A (CSS px), or null. */
        cursorAt: () => {
          const sl = local.slots[local.cursor];
          const r = document.querySelector('.sd-pic[data-page="0"]')?.getBoundingClientRect();
          return sl && r ? { x: r.left + (sl.x / PIC_W) * r.width, y: r.top + (sl.y / PIC_H) * r.height } : null;
        },
        layout: () => bookLayout(window.innerWidth, window.innerHeight, readInsets()),
        theme: () => getState()?.data.theme ?? null,
      },
    });
  }, [getState, localId]);

  const s = getState();
  if (!s) return null;
  const cfg = s.config;
  const theme = themeById(s.data.theme);
  const me = s.players.find((p) => p.id === localId);
  const multi = s.players.length > 1;
  const total = s.data.diffs.length;
  const search = s.phase === 'search';
  const covered = s.phase === 'intro' || s.phase === 'turn' || s.phase === 'over';
  const locked = search && !!me && me.lockMs > 0;
  const now = performance.now();
  const f = fx.current;

  local.slots = theme.slots;
  local.open = search && !!me && !me.done;
  if (!local.open) local.cursor = -1;

  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    unlockAudio();
    const st = getState();
    const mine = st?.players.find((p) => p.id === localId);
    if (!local.open || useMatch.getState().paused || !mine) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    if (mine.lockMs > 0) {
      sfx.bump(); // wound down: the rules will ignore it
      return;
    }
    if (e.pointerType !== 'mouse') local.cursor = -1;
    submitTap(x, y);
  };

  const timeFrac = search ? Math.max(0, 1 - s.phaseT / cfg.searchMs) : s.phase === 'reveal' ? 0 : 1;
  const secs = Math.ceil(Math.max(0, cfg.searchMs - s.phaseT) / 1000);
  const toast = f.toast && now - f.toast.at < f.toast.ms ? f.toast : null;
  const ranked = [...s.players].sort((a, b) => b.score - a.score || b.found.length - a.found.length);
  const nameOf = (id: string) => (id === localId ? 'You' : (contestants.find((c) => c.id === id)?.name ?? '?'));
  const reveal = s.phase === 'reveal';

  const marks = (
    <svg className="sd-marks" viewBox={`0 0 ${PIC_W} ${PIC_H}`} preserveAspectRatio="none" aria-hidden="true">
      {reveal &&
        s.data.diffs
          .filter((i) => !me?.found.includes(i))
          .map((i) => {
            const sl = theme.slots[i];
            return <circle key={`m${i}`} className="sd-missed" cx={sl.x} cy={sl.y} r={ringR(sl)} />;
          })}
      {me?.found.map((i) => {
        const sl = theme.slots[i];
        const at = f.plus.get(i);
        return (
          <g key={`f${i}`} className="sd-found">
            <circle cx={sl.x} cy={sl.y} r={ringR(sl)} className="sd-found__under" />
            <circle cx={sl.x} cy={sl.y} r={ringR(sl)} className="sd-found__ring" />
            {at !== undefined && now - at < 900 && (
              <text x={sl.x} y={sl.y - ringR(sl) - 4} className="sd-plus">
                +{cfg.pointsPerFind}
              </text>
            )}
          </g>
        );
      })}
      {f.wrongs
        .filter((w) => now - w.at < 1100)
        .map((w) => (
          <g key={`w${w.n}`} className="sd-wrong">
            <path d={`M${w.x - 11},${w.y - 11}L${w.x + 11},${w.y + 11}M${w.x + 11},${w.y - 11}L${w.x - 11},${w.y + 11}`} className="sd-wrong__under" />
            <path d={`M${w.x - 11},${w.y - 11}L${w.x + 11},${w.y + 11}M${w.x + 11},${w.y - 11}L${w.x - 11},${w.y + 11}`} className="sd-wrong__x" />
          </g>
        ))}
      {local.open && local.cursor >= 0 && theme.slots[local.cursor] && (
        <circle className="sd-cursor" cx={theme.slots[local.cursor].x} cy={theme.slots[local.cursor].y} r={ringR(theme.slots[local.cursor]) + 2} />
      )}
    </svg>
  );

  return (
    <div className={`sd-hud${lay.portrait ? ' sd-hud--portrait' : ''}${lay.short ? ' sd-hud--short' : ''}${locked ? ' sd-hud--locked' : ''}`}>
      <div className="sd-top">
        <div className="sd-stickers">
          <span className="sticker sd-round" data-testid="sd-round">
            Page <strong>{s.round}</strong>
            <span>/{cfg.rounds}</span>
          </span>
          <span className="sticker sd-found-count" data-testid="sd-found">
            <strong>{me?.found.length ?? 0}</strong>/{total} found
          </span>
          <span className="sticker sd-score" data-testid="sd-score">
            <strong>{me?.score ?? 0}</strong> pts
          </span>
        </div>
        <div className="sd-clock">
          <div className={`cc-timer sd-timer${search && secs <= 5 ? ' sd-timer--late' : ''}`} data-testid="sd-timer">
            <div style={{ width: `${timeFrac * 100}%` }} />
          </div>
          <span className="sd-secs">{search ? `${secs}s` : ''}</span>
        </div>
        {multi && (
          <div className="sd-board" data-testid="sd-board">
            {ranked.map((p) => {
              const c = contestants.find((x) => x.id === p.id);
              return (
                <span key={p.id} className={`cc-chip sd-chip${p.id === localId ? ' me' : ''}${p.done ? ' done' : ''}${search && p.lockMs > 0 ? ' locked' : ''}`}>
                  <span className="cc-chip__dot" style={{ background: c?.paint.body }} />
                  <span className="sd-chip__name">{nameOf(p.id)}</span>
                  <b>{p.done ? ORDINAL[p.doneOrder] : `${p.found.length}/${total}`}</b>
                  <em>{p.score}</em>
                </span>
              );
            })}
          </div>
        )}
      </div>

      <div className="sd-book" style={box(lay.book)}>
        {[0, 1].map((i) => (
          <div key={`${i}-${s.round}`} className={`sd-page sd-page--${i ? 'b' : 'a'}`} style={box(lay.pages[i], lay.book)}>
            <div className="sd-pic" data-page={i} style={box(lay.pics[i], lay.pages[i])} onPointerDown={onDown}>
              <Picture theme={s.data.theme} variants={i ? s.data.alt : s.data.ref} />
              {marks}
            </div>
            <span className="sd-folio">{(s.round - 1) * 2 + i + 1}</span>
          </div>
        ))}
        {covered && (
          <div className="sd-cover" data-testid="sd-cover">
            <div className="sd-cover__card" key={`${s.phase}-${s.round}`}>
              {s.phase === 'over' ? (
                <strong>The end!</strong>
              ) : (
                <>
                  <span>
                    Page {s.round} of {cfg.rounds}
                  </span>
                  <strong>{theme.title}</strong>
                  <em>Find the {total} differences</em>
                </>
              )}
            </div>
          </div>
        )}
        {locked && (
          <div className="sd-lock" data-testid="sd-lock" role="status">
            <span>Not a difference!</span>
            <div className="sd-lock__bar">
              <div style={{ width: `${(1 - me!.lockMs / cfg.lockMs) * 100}%` }} />
            </div>
          </div>
        )}
        {toast && !locked && (
          <div className={`cc-banner cc-banner--${toast.tone} sd-toast`} key={toast.at} data-testid="sd-banner">
            {toast.text}
          </div>
        )}
      </div>
    </div>
  );
}
