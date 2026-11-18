/**
 * HUD pieces shared by the racing minigames: a start-to-finish progress strip with a dot per toy,
 * and a clock. Re-rendered by the owning HUD's ticker (never per frame).
 */
export interface TrackEntry {
  id: string;
  name: string;
  colour: string;
  /** 0 at the start line, 1 at the finish. */
  progress: number;
  me: boolean;
  /** Finished, or knocked back / stunned right now. */
  state?: 'done' | 'hurt' | '';
}

export function RaceTrack({ entries, marks = [] }: { entries: TrackEntry[]; marks?: number[] }) {
  // Draw the local toy last so its dot is never hidden under a rival's.
  const ordered = entries.slice().sort((a, b) => Number(a.me) - Number(b.me));
  return (
    <div className="mv-track" role="img" aria-label="Race progress">
      <div className="mv-track__line" />
      {marks.map((m) => (
        <span key={m} className="mv-track__mark" style={{ left: `${m * 100}%` }} />
      ))}
      <span className="mv-track__flag" aria-hidden />
      {ordered.map((e) => (
        <span
          key={e.id}
          className={`mv-dot${e.me ? ' me' : ''}${e.state ? ` ${e.state}` : ''}`}
          style={{ left: `${Math.max(0, Math.min(1, e.progress)) * 100}%`, background: e.colour }}
          title={e.name}
          data-testid={e.me ? 'mv-dot-me' : undefined}
        />
      ))}
    </div>
  );
}

export function RaceClock({ ms, urgent }: { ms: number; urgent?: boolean }) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const text = `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  return (
    <div className={`sticker mv-clock${urgent ? ' urgent' : ''}`} data-testid="mv-clock">
      {text}
    </div>
  );
}

export const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;
