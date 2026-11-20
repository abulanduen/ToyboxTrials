/**
 * The player rail: every player in a column at the side of the screen. Tap or click a row (or Tab
 * to it and press Enter) to view that player's board, read-only; your own row takes you back. Rows
 * can highlight players who are still going this round and mark who won their last match.
 *
 * Shared by Toy Tower Tumble and Toy Squad, with the "Watching X · Back to my board" banner and the
 * knocked-out popup that offers to watch the others. Presentation only: the games decide what a
 * row says, its order, and what viewing a board means. Re-rendered by the game's HUD timer (never
 * per frame). On phones (narrow or short screens) it shrinks to a column of 56 px chips.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { PALETTE } from '../../game/palette';
import { pauseMatch } from '../session';
import './playerRail.css';

export type RailResult = 'win' | 'loss' | 'draw';
export interface RailEntry {
  id: string;
  name: string;
  /** The main figure, e.g. "12", and its unit, e.g. "pts". */
  stat: string;
  statLabel: string;
  /** A second line on roomy layouts (hidden on phones). */
  detail?: string;
  /** Knocked out: greyed. */
  out?: boolean;
  /** Still going this round: highlighted so others know whom they are waiting for. */
  busy?: boolean;
  busyLabel?: string;
  /** How their last match went (Toy Squad). */
  result?: RailResult | null;
  /** The row's accent colour (left edge). */
  accent?: string;
}

const RESULT_TEXT: Record<RailResult, string> = { win: 'Won last match', loss: 'Lost last match', draw: 'Drew last match' };

/** Code-drawn result marks: a rosette for a win, an even sign for a draw, a small cross for a loss. */
export function ResultMark({ result, size = 18 }: { result: RailResult; size?: number }) {
  if (result === 'win') return <svg className="rail-mark rail-mark--win" width={size} height={size} viewBox="0 0 24 24" aria-hidden>
    <path d="M8 14 5.5 22l4-1.8L12 23l1-8M16 14l2.5 8-4-1.8L12 23" fill={PALETTE.coral} stroke={PALETTE.ink} strokeWidth="1.4" strokeLinejoin="round" />
    <circle cx="12" cy="10" r="7.6" fill={PALETTE.honey} stroke={PALETTE.ink} strokeWidth="1.6" />
    <path d="m8.6 10.2 2.3 2.2 4.6-4.6" fill="none" stroke={PALETTE.ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
  return <svg className={`rail-mark rail-mark--${result}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden>
    <circle cx="12" cy="12" r="9" fill={result === 'draw' ? PALETTE.cream : PALETTE.tinGrey} stroke={PALETTE.ink} strokeWidth="1.6" />
    {result === 'draw' ? <path d="M8 10h8M8 14h8" stroke={PALETTE.ink} strokeWidth="2" strokeLinecap="round" />
      : <path d="m9 9 6 6M15 9l-6 6" stroke={PALETTE.white} strokeWidth="2" strokeLinecap="round" />}
  </svg>;
}

export function PlayerRail({ entries, localId, viewing, onView, title = 'Players', ranked = false, className, label }: {
  entries: readonly RailEntry[]; localId: string; viewing: string; onView: (id: string) => void;
  title?: string; ranked?: boolean; className?: string; label?: string;
}) {
  return <nav className={`player-rail${className ? ` ${className}` : ''}`} data-testid="player-rail" aria-label={label ?? title}>
    <strong className="player-rail__title">{title}</strong>
    <ol>{entries.map((e, i) => {
      const you = e.id === localId, shown = e.id === viewing;
      const action = shown ? 'showing now' : you ? 'back to your board' : 'view their board';
      const aria = `${ranked ? `${i + 1}. ` : ''}${e.name}${you ? ' (you)' : ''}: ${e.stat} ${e.statLabel}${e.out ? ', out' : ''}${e.busy ? `, ${e.busyLabel ?? 'still going'}` : ''}${e.result ? `, ${RESULT_TEXT[e.result].toLowerCase()}` : ''}. ${action}`;
      return <li key={e.id} className={`rail-row${e.out ? ' is-out' : ''}${e.busy ? ' is-busy' : ''}${shown ? ' is-shown' : ''}${you ? ' is-you' : ''}`}
        style={e.accent ? { ['--rail-accent' as string]: e.accent } : undefined}>
        <button type="button" data-testid={`rail-${e.id}`} data-busy={e.busy || undefined} data-result={e.result ?? undefined}
          aria-pressed={shown} aria-label={aria} title={e.busy ? e.busyLabel : e.result ? RESULT_TEXT[e.result] : undefined} onClick={() => onView(e.id)}>
          {ranked && <span className="rail-row__rank">{i + 1}</span>}
          <span className="rail-row__name">{e.name}{you && <span className="rail-row__you"> (you)</span>}</span>
          <span className="rail-row__stat"><b>{e.stat}</b> <small>{e.statLabel}</small></span>
          {e.detail && <small className="rail-row__detail">{e.detail}</small>}
          {e.result && <ResultMark result={e.result} />}
          {e.busy && <span className="rail-row__busy" aria-hidden />}
        </button>
      </li>;
    })}</ol>
  </nav>;
}

/** "Watching X · Back to my board". Escape also goes back (and does not pause). */
export function WatchBanner({ name, onBack, className, children }: { name: string; onBack: () => void; className?: string; children?: ReactNode }) {
  const back = useRef(onBack);
  back.current = onBack;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape' || e.defaultPrevented) return;
      e.stopPropagation(); e.preventDefault(); pauseMatch(false); back.current();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
  return <div className={`watch-banner${className ? ` ${className}` : ''}`} data-testid="watch-banner" role="status">
    <span className="watch-banner__text">Watching <b data-testid="watch-name">{name}</b><small> · read-only</small></span>
    {children}
    <button type="button" data-testid="watch-back" onClick={onBack}>Back to my board<small>Esc</small></button>
  </div>;
}

/** Knocked out: offer to watch the others (never forced). */
export function SpectateOffer({ title, body, onWatch, onDismiss }: { title: string; body: string; onWatch: () => void; onDismiss: () => void }) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => { first.current?.focus(); }, []);
  return <div className="spectate-offer" data-testid="spectate-offer" role="dialog" aria-labelledby="spectate-offer-title">
    <strong id="spectate-offer-title">{title}</strong>
    <p>{body}</p>
    <div className="spectate-offer__row">
      <button type="button" ref={first} className="is-primary" data-testid="spectate-watch" onClick={onWatch}>Watch other players</button>
      <button type="button" data-testid="spectate-dismiss" onClick={onDismiss}>Dismiss</button>
    </div>
  </div>;
}
