/**
 * Server-side cleaning of everything a player chooses about themselves: nickname and cosmetics.
 * Pure functions (randomness is passed in) so they are unit-tested in tests/unit/online-hub.test.ts.
 */
import { cleanAccessories, isHatId, isKeySkinId, type Accessories, type HatId, type KeySkinId } from '../src/game/cosmetics';
import { PAINT_JOBS } from '../src/game/palette';
import { NICKNAME_MAX, NICKNAME_MIN, type Look } from '../src/net/protocol';

export interface CleanLook extends Accessories {
  paint: number;
  hat: HatId;
  keySkin: KeySkinId;
}

export const DEFAULT_LOOK: CleanLook = { paint: 0, hat: 'none', keySkin: 'classic', back: 'none', face: 'none', neck: 'none' };

/**
 * Replace unknown cosmetic ids with the defaults, checking each against the shared catalogue
 * (src/game/cosmetics.ts), and accessories against their own slot (a scarf can't be worn on the
 * back). Ownership lives on the client and is not checked: there are no accounts yet.
 */
export function sanitizeLook(raw: Partial<Look> | null | undefined): CleanLook {
  const paint = typeof raw?.paint === 'number' && Number.isInteger(raw.paint) && raw.paint >= 0 && raw.paint < PAINT_JOBS.length ? raw.paint : DEFAULT_LOOK.paint;
  const hat = isHatId(raw?.hat) ? raw.hat : DEFAULT_LOOK.hat;
  const keySkin = isKeySkinId(raw?.keySkin) ? raw.keySkin : DEFAULT_LOOK.keySkin;
  return { paint, hat, keySkin, ...cleanAccessories(raw) };
}

/**
 * Word fragments that turn a nickname into the fallback. Matched after lower-casing, undoing
 * common digit/symbol swaps and removing everything but letters, so "F.u_c k" and "5h1t" match.
 * Deliberately short and blunt: names are only shown to people in the same room.
 */
const BLOCKED = [
  'fuck', 'fuk', 'shit', 'cunt', 'bitch', 'nigg', 'nigga', 'fag', 'dick', 'cock', 'pussy', 'whore',
  'slut', 'rape', 'nazi', 'hitler', 'penis', 'vagina', 'twat', 'wank', 'bastard', 'asshole',
  'retard', 'porn', 'kys', 'kike', 'spic', 'chink', 'tranny', 'dildo', 'cum', 'jizz',
];
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g', '@': 'a', $: 's', '!': 'i', '|': 'i' };

export function isBlockedName(name: string): boolean {
  const folded = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[0-9@$!|]/g, (c) => LEET[c] ?? c)
    .replace(/[^a-z]/g, '');
  return BLOCKED.some((w) => folded.includes(w));
}

/** "Toy 123": the name used when a nickname is missing, too short or not allowed. */
export function fallbackName(random: () => number): string {
  return `Toy ${100 + Math.floor(random() * 900)}`;
}

/**
 * Trim, keep printable letters/digits/marks plus a few name punctuation marks (no emoji, no
 * control or invisible characters), collapse spaces, cap at NICKNAME_MAX characters. Names that
 * end up shorter than NICKNAME_MIN or contain a blocked word become "Toy NNN".
 */
export function sanitizeNickname(raw: unknown, random: () => number): string {
  if (typeof raw !== 'string') return fallbackName(random);
  let s = raw
    .normalize('NFC')
    .replace(/[^\p{L}\p{M}\p{N} '._-]/gu, '') // printable name characters only
    .replace(/(\p{M})\p{M}+/gu, '$1') // no stacked combining marks
    .replace(/^\p{M}+/u, '')
    .replace(/\s+/g, ' ')
    .trim();
  s = Array.from(s).slice(0, NICKNAME_MAX).join('').trim();
  if (Array.from(s).length < NICKNAME_MIN || isBlockedName(s)) return fallbackName(random);
  return s;
}

/** Make a name unique within a room by appending " 2", " 3"… (still at most NICKNAME_MAX characters). */
export function uniqueName(name: string, taken: Iterable<string>): string {
  const used = new Set(Array.from(taken, (n) => n.toLowerCase()));
  if (!used.has(name.toLowerCase())) return name;
  for (let i = 2; i < 100; i++) {
    const suffix = ` ${i}`;
    const base = Array.from(name).slice(0, NICKNAME_MAX - suffix.length).join('').trimEnd();
    const candidate = base + suffix;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
  return name;
}
