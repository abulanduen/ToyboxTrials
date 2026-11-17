/**
 * Find the Original HUD: round and score, the phase banner, the round timer, the "wound down"
 * lockout bar and the field. The reference card itself is drawn in the 3D scene (same model, same
 * light as the crowd); this HUD only leaves room for it.
 */
import { useTicker } from '../copycat/Hud';
import type { MinigameSceneProps } from '../types';
import type { FindState } from './rules';

const ORDINAL = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];

export function FindHud({ getState, contestants, localId }: MinigameSceneProps<FindState>) {
  useTicker(12);
  const s = getState();
  if (!s) return null;
  const me = s.players.find((p) => p.id === localId);
  const multi = s.players.length > 1;
  const nameOf = (id: string) => (id === localId ? 'You' : (contestants.find((c) => c.id === id)?.name ?? '?'));
  const locked = s.phase === 'search' && !!me && me.lockMs > 0;
  const hurry = s.phase === 'search' && s.limitMs < s.config.searchMs;

  let banner = '';
  let tone = 'watch';
  if (s.phase === 'intro') banner = 'Winding up the crowd…';
  else if (s.phase === 'study') banner = s.round === 1 ? 'This is Baldwyn. Remember him!' : 'Baldwyn again. Look closely…';
  else if (s.phase === 'search') {
    if (me?.found) {
      banner = `Found him! +${me.lastPoints}`;
      tone = 'good';
    } else if (locked) {
      banner = 'Not Baldwyn! Wound down…';
      tone = 'out';
    } else {
      banner = hurry ? 'Hurry! Someone spotted him!' : 'Find Baldwyn!';
      tone = 'go';
    }
  } else if (s.phase === 'reveal') {
    banner = me?.found ? `There he is! +${me.lastPoints}` : 'There he was!';
    tone = me?.found ? 'good' : 'out';
  } else banner = 'That’s every Baldwyn!';

  const timeFrac = s.phase === 'search' ? Math.max(0, 1 - s.phaseT / s.limitMs) : 0;
  const lockFrac = locked && me!.lockTotalMs > 0 ? me!.lockMs / me!.lockTotalMs : 0;

  return (
    <div className={`fo-hud${locked ? ' fo-hud--locked' : ''}`}>
      <div className="fo-top">
        <div className="fo-stickers">
          <span className="sticker cc-round" data-testid="fo-round">
            Round <strong>{s.round}</strong>
            <span> / {s.config.rounds.length}</span>
          </span>
          <span className="sticker fo-score" data-testid="fo-score">
            <strong>{me?.score ?? 0}</strong> pts
          </span>
        </div>
        <div className={`cc-banner cc-banner--${tone} fo-banner`} key={`${s.phase}-${s.round}-${tone}-${hurry}`} data-testid="fo-banner">
          {banner}
        </div>
        <div className={`cc-timer fo-timer${hurry ? ' hurry' : ''}`} style={{ opacity: s.phase === 'search' ? 1 : 0 }}>
          <div style={{ width: `${timeFrac * 100}%` }} />
        </div>
      </div>

      {locked && (
        <div className="fo-lock" data-testid="fo-lock" role="status">
          <span>Winding back up</span>
          <div className="fo-lock__bar">
            <div style={{ width: `${(1 - lockFrac) * 100}%` }} />
          </div>
        </div>
      )}

      {multi && (
        <div className="fo-field" data-testid="fo-field">
          {s.players.map((p) => {
            const c = contestants.find((x) => x.id === p.id);
            const st = p.found ? 'done' : s.phase === 'search' && p.lockMs > 0 ? 'locked' : '';
            return (
              <div key={p.id} className={`cc-chip fo-chip ${st}${p.id === localId ? ' me' : ''}`}>
                <span className="cc-chip__dot" style={{ background: c?.paint.body }} />
                <span className="fo-chip__name">{nameOf(p.id)}</span>
                {p.found && <b>{ORDINAL[p.foundOrder]}</b>}
                <em>{p.score}</em>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
