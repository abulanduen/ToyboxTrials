/**
 * Damage overview for the local squad's battle: who dealt (or took) the most, high to low, with a
 * bar per toy and a brief flash on a row when that toy lands or takes a hit. Presentation only;
 * the numbers are the read-only `stats` tally kept on each fighter.
 */
import { useRef, useState } from 'react';
import { ROSTER } from './catalogue';
import { damageRows, type DamageMode } from './info';
import { toyPortrait } from './portraits';
import type { Battle } from './rules';
import { BarsIcon, CloseIcon, StarIcon } from './TraitIcon';

const FLASH_MS = 420;
export function DamagePanel({ battle, t }: { battle: Battle; t: number }) {
  // Phones start with the panel folded into a tab so it never covers the board.
  const [open, setOpen] = useState(() => window.innerWidth >= 700 && window.innerHeight >= 500);
  const [mode, setMode] = useState<DamageMode>('dealt');
  const seen = useRef({ battle, last: new Map<number, { dealt: number; taken: number; dealtAt: number; takenAt: number }>() });
  if (seen.current.battle !== battle) { seen.current.battle = battle; seen.current.last.clear(); }
  const mine = battle.fighters.filter(u => u.side === 0);
  for (const u of mine) {
    const was = seen.current.last.get(u.id);
    if (!was) { seen.current.last.set(u.id, { dealt: u.stats.dealt, taken: u.stats.taken, dealtAt: -Infinity, takenAt: -Infinity }); continue; }
    if (u.stats.dealt > was.dealt) was.dealtAt = t; if (u.stats.taken > was.taken) was.takenAt = t;
    was.dealt = u.stats.dealt; was.taken = u.stats.taken;
  }
  if (!open) return <button className="squad-damage-open" data-testid="squad-damage-open" aria-label="Show damage overview" onClick={() => setOpen(true)}><BarsIcon /><span>Damage</span></button>;
  const rows = damageRows(mine, mode), top = Math.max(1, ...rows.map(r => r.value)), total = rows.reduce((n, r) => n + r.value, 0);
  return <aside className="squad-panel squad-damage" data-testid="squad-damage" data-mode={mode} aria-label="Damage overview">
    <header className="squad-panel__head">
      <button data-testid="squad-damage-dealt" aria-pressed={mode === 'dealt'} onClick={() => setMode('dealt')}>Dealt</button>
      <button data-testid="squad-damage-taken" aria-pressed={mode === 'taken'} onClick={() => setMode('taken')}>Taken</button>
      <button className="squad-close" data-testid="squad-damage-close" aria-label="Minimise damage overview" onClick={() => setOpen(false)}><CloseIcon /></button>
    </header>
    <ol>{rows.map(r => {
      const mark = seen.current.last.get(r.id), hit = !!mark && t - (mode === 'dealt' ? mark.dealtAt : mark.takenAt) < FLASH_MS, picture = toyPortrait(r.kind);
      return <li key={r.id} data-testid={`squad-damage-row-${r.id}`} data-value={r.value} className={`${hit ? 'is-hit' : ''}${r.alive ? '' : ' is-down'}`}>
        <span className="squad-damage__picture">{picture && <img src={picture} alt="" draggable={false} />}</span>
        <span className="squad-damage__name">{ROSTER[r.kind].name} {Array.from({ length: r.tier }, (_, i) => <StarIcon key={i} size={9} />)}</span>
        <b>{r.value}</b>
        <span className="squad-damage__bar" style={{ width: `${r.value / top * 100}%` }}>{mode === 'dealt' && r.spell > 0 && <i style={{ width: `${r.spell / Math.max(1, r.value) * 100}%` }} />}</span>
      </li>; })}</ol>
    <small>{mode === 'dealt' ? <>Squad total {total}. <i className="squad-damage__key" /> spells and passives, the rest basic attacks.</> : <>Squad total {total} health lost (shields not counted).</>}</small>
  </aside>;
}
