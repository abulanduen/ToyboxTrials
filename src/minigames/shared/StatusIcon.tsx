/** The status badges as inline SVG, for HUD legends: the same paths the 3D layer draws (statusIcons.ts). */
import { PALETTE } from '../../game/palette';
import { SHRED_CRACK, STATUS_DEFS, statusList, type StatusKind } from './statusIcons';
import './statusIcons.css';

export function StatusIcon({ kind, size = 18, title }: { kind: StatusKind; size?: number; title?: boolean }) {
  const d = STATUS_DEFS[kind];
  return <svg className="status-icon" width={size} height={size} viewBox="0 0 24 24" role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title ? d.name : undefined} data-status={kind}>
    {title && <title>{d.name}</title>}
    <circle cx="12" cy="12" r="10.6" fill={d.colour} stroke={PALETTE.ink} strokeWidth="1.8" />
    {d.fill.map((p, i) => <path key={i} d={p} fill={d.glyph} />)}
    {d.stroke?.map((p, i) => <path key={`s${i}`} d={p} fill="none" stroke={d.glyph} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />)}
    {kind === 'shred' && <path d={SHRED_CRACK} fill="none" stroke={d.colour} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />}
  </svg>;
}

/** A compact key: each badge with its name, for the statuses a game actually uses. */
export function StatusLegend({ kinds, className }: { kinds: readonly StatusKind[]; className?: string }) {
  return <ul className={`status-legend${className ? ` ${className}` : ''}`} data-testid="status-legend">
    {kinds.map((k) => <li key={k} title={STATUS_DEFS[k].blurb}><StatusIcon kind={k} size={16} /><span>{STATUS_DEFS[k].name}</span></li>)}
  </ul>;
}

/** The badges for a status mask, inline (for a list row). */
export function StatusRow({ mask, size = 14 }: { mask: number; size?: number }) {
  return <>{statusList(mask).map((k) => <StatusIcon key={k} kind={k} size={size} title />)}</>;
}
