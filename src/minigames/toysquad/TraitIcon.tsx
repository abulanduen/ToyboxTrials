/**
 * Original, code-drawn symbols for Toy Squad: one per trait, plus the star and handbook marks.
 * Plain inline SVG on a 24-unit grid; no icon pack and no emoji. Each trait keeps one colour so
 * the symbol reads the same on shop cards, unit details, the trait column and the handbook.
 */
import type { ReactNode } from 'react';
import { PALETTE, RARITY } from '../../game/palette';
import type { Trait } from './kits';

export const TRAITS: readonly Trait[] = ['Tin', 'Clockwork', 'Felt', 'Paper', 'Wood', 'Prism', 'Vanguard', 'Ranger', 'Medic', 'Trickster', 'Artificer'];
const INK = PALETTE.ink;
export const TRAIT_COLOURS: Record<Trait, string> = {
  Tin: PALETTE.roomFabric, Clockwork: PALETTE.brass, Felt: PALETTE.felt, Paper: PALETTE.white, Wood: PALETTE.woodLight, Prism: RARITY.epic,
  Vanguard: PALETTE.toyBlue, Ranger: PALETTE.sage, Medic: PALETTE.coral, Trickster: PALETTE.honey, Artificer: PALETTE.cardboard,
};
/** What each symbol depicts, for screen readers and the handbook. */
export const TRAIT_SYMBOLS: Record<Trait, string> = {
  Tin: 'tin can', Clockwork: 'wind-up key', Felt: 'stitched patch', Paper: 'folded sheet', Wood: 'log rings', Prism: 'prism splitting light',
  Vanguard: 'shield', Ranger: 'arrow on a target', Medic: 'cross', Trickster: 'jester hat', Artificer: 'spanner',
};
const line = { fill: 'none', stroke: INK, strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
const SHAPES: Record<Trait, (fill: string) => ReactNode> = {
  Tin: f => <><rect x="6" y="5" width="12" height="15" rx="2" {...line} fill={f} /><path d="M6 9h12M6 16h12" {...line} /><ellipse cx="12" cy="5" rx="6" ry="1.8" fill={PALETTE.white} stroke={INK} strokeWidth="1.6" /></>,
  Clockwork: f => <><circle cx="8" cy="8" r="4" fill="none" stroke={f} strokeWidth="3.6" /><circle cx="16" cy="8" r="4" fill="none" stroke={f} strokeWidth="3.6" /><path d="M12 9v11M9.5 20h5" stroke={f} strokeWidth="3.6" strokeLinecap="round" />
    <circle cx="8" cy="8" r="4" {...line} strokeWidth="1" /><circle cx="16" cy="8" r="4" {...line} strokeWidth="1" /></>,
  Felt: f => <><rect x="4.5" y="4.5" width="15" height="15" rx="3.5" fill={f} stroke={INK} strokeWidth="1.6" /><rect x="7.5" y="7.5" width="9" height="9" rx="1.5" fill="none" stroke={PALETTE.white} strokeWidth="1.5" strokeDasharray="2.2 1.8" /></>,
  Paper: f => <><path d="M6 3.5h8.5L19 8v12.5H6z" {...line} fill={f} /><path d="M14.5 3.5V8H19" {...line} /><path d="M9 12h7M9 15.5h5" {...line} strokeWidth="1.3" /></>,
  Wood: f => <><circle cx="12" cy="12" r="8.5" fill={f} stroke={INK} strokeWidth="1.6" /><circle cx="12" cy="12" r="5.2" {...line} strokeWidth="1.2" /><circle cx="12" cy="12" r="2" {...line} strokeWidth="1.2" /><path d="M17.5 5.5l2-2" {...line} /></>,
  Prism: f => <><path d="M12 4l8 15H4z" fill={f} stroke={INK} strokeWidth="1.6" strokeLinejoin="round" /><path d="M1.5 12.5l8 1" stroke={INK} strokeWidth="1.4" strokeLinecap="round" /><path d="M14.5 12l8-2.5" stroke={PALETTE.coral} strokeWidth="1.6" strokeLinecap="round" />
    <path d="M15 14l7.5 0.5" stroke={PALETTE.honey} strokeWidth="1.6" strokeLinecap="round" /><path d="M15.5 16l6.5 3" stroke={PALETTE.toyBlue} strokeWidth="1.6" strokeLinecap="round" /></>,
  Vanguard: f => <><path d="M12 3l7.5 2.5v6c0 4.6-3 7.8-7.5 9.5-4.500-1.700-7.500-4.900-7.500-9.500v-6z" fill={f} stroke={INK} strokeWidth="1.6" strokeLinejoin="round" /><path d="M12 6.500v11M7.500 11h9" stroke={PALETTE.white} strokeWidth="1.800" strokeLinecap="round" /></>,
  Ranger: f => <><circle cx="10.5" cy="13.5" r="7.500" fill={PALETTE.white} stroke={INK} strokeWidth="1.600" /><circle cx="10.500" cy="13.500" r="4" fill={f} stroke={INK} strokeWidth="1.200" /><path d="M10.500 13.500L20.500 3.500M20.500 3.500h-4M20.500 3.500v4" {...line} strokeWidth="1.800" /></>,
  Medic: f => <><circle cx="12" cy="12" r="9" fill={PALETTE.white} stroke={INK} strokeWidth="1.600" /><path d="M10 6h4v4h4v4h-4v4h-4v-4H6v-4h4z" fill={f} stroke={INK} strokeWidth="1.200" strokeLinejoin="round" /></>,
  Trickster: f => <><path d="M4 17c0-5 1-9-1.500-12 4 0.500 6.500 3 7.500 6.500 1-3.500 3.500-6 7.500-6.500C15 8 20 12 20 17z" fill={f} stroke={INK} strokeWidth="1.600" strokeLinejoin="round" transform="translate(0.75 0)" />
    <rect x="4" y="16.500" width="17" height="3.500" rx="1.700" fill={PALETTE.coral} stroke={INK} strokeWidth="1.400" /><circle cx="3.200" cy="4.800" r="1.700" fill={PALETTE.coral} stroke={INK} strokeWidth="1.200" /><circle cx="18.600" cy="4.800" r="1.700" fill={PALETTE.coral} stroke={INK} strokeWidth="1.200" /></>,
  Artificer: f => <><path d="M15.500 3.500a5 5 0 0 0-4.300 7.300L3.800 18.200a1.900 1.900 0 0 0 2.700 2.700l7.400-7.400A5 5 0 0 0 20.500 8.500l-3 3-2.500-0.500-0.500-2.500 3-3a5 5 0 0 0-2-2z" fill={f} stroke={INK} strokeWidth="1.500" strokeLinejoin="round" /></>,
};
export function TraitIcon({ trait, size = 20, title }: { trait: Trait; size?: number; title?: boolean }) {
  return <svg className="squad-icon" data-trait={trait} viewBox="0 0 24 24" width={size} height={size} role="img" aria-label={`${trait} (${TRAIT_SYMBOLS[trait]})`}>
    {title && <title>{trait}</title>}{SHAPES[trait](TRAIT_COLOURS[trait])}
  </svg>;
}
/** Five-point star, drawn here so it never falls back to a font or emoji glyph. */
export function StarIcon({ size = 14, on = true }: { size?: number; on?: boolean }) {
  return <svg className="squad-icon" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
    <path d="M12 2.500l2.900 6.200 6.600 0.800-4.900 4.600 1.300 6.700L12 17.500 6.100 20.800l1.300-6.700L2.500 9.500l6.600-0.800z" fill={on ? PALETTE.honey : PALETTE.white} stroke={INK} strokeWidth="1.600" strokeLinejoin="round" />
  </svg>;
}
export function BookIcon({ size = 24 }: { size?: number }) {
  return <svg className="squad-icon" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
    <path d="M3.500 5.500C6 4.300 9 4.300 12 6c3-1.700 6-1.700 8.500-0.500v13C18 17.300 15 17.300 12 19c-3-1.700-6-1.700-8.500-0.500z" fill={PALETTE.cream} stroke={INK} strokeWidth="1.600" strokeLinejoin="round" />
    <path d="M12 6v13" stroke={INK} strokeWidth="1.600" /><path d="M6 9c1.500-0.400 2.800-0.300 4 0.200M6 12c1.500-0.400 2.800-0.300 4 0.200M14 9.200c1.200-0.500 2.500-0.600 4-0.200M14 12.200c1.200-0.500 2.500-0.600 4-0.200" stroke={INK} strokeWidth="1.100" strokeLinecap="round" fill="none" />
  </svg>;
}
export function CloseIcon({ size = 18 }: { size?: number }) {
  return <svg className="squad-icon" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke={INK} strokeWidth="3" strokeLinecap="round" /></svg>;
}
export function BarsIcon({ size = 24 }: { size?: number }) {
  return <svg className="squad-icon" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
    <rect x="3" y="4" width="17" height="4.5" rx="1.5" fill={PALETTE.coral} stroke={INK} strokeWidth="1.4" /><rect x="3" y="10" width="11" height="4.5" rx="1.5" fill={PALETTE.honey} stroke={INK} strokeWidth="1.4" />
    <rect x="3" y="16" width="6" height="4.5" rx="1.5" fill={PALETTE.toyBlue} stroke={INK} strokeWidth="1.4" />
  </svg>;
}
