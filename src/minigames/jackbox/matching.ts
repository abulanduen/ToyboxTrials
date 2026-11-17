/**
 * Answer matching for Jack-in-the-Box. Pure and deterministic, so it runs the same on the server.
 *
 * Forgiving by design: rejecting a real answer feels far worse than accepting a near miss.
 *  - case, accents, punctuation, spaces and hyphens are ignored ("Jack-in-the-box" = "jackinthebox")
 *  - a leading "a", "an" or "the" is dropped
 *  - simple plurals are accepted (strawberries → strawberry, peaches → peach, wolves → wolf)
 *  - small typos are forgiven: 1 edit from 5 letters, 2 edits from 9 letters, as long as exactly
 *    one answer is that close (so "lemon" never quietly becomes "melon")
 */
import type { Category } from './categories';

export interface Answer {
  /** Index within the category (stable id for "already said"). */
  id: number;
  display: string;
  tier: 0 | 1 | 2;
}

export interface CategoryIndex {
  answers: Answer[];
  /** Compact key → answer id. */
  keys: Map<string, number>;
}

/** Lowercase, strip accents and punctuation, drop a leading article, remove spaces. */
export function compact(raw: string): string {
  let s = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  s = s.replace(/^(a|an|the) (?=\S)/, '');
  return s.replace(/ /g, '');
}

/** Candidate singular forms of a compact key (the key itself first). */
export function singulars(k: string): string[] {
  const out = [k];
  if (k.length > 4 && k.endsWith('ies')) out.push(k.slice(0, -3) + 'y');
  if (k.length > 4 && k.endsWith('ves')) out.push(k.slice(0, -3) + 'f', k.slice(0, -3) + 'fe');
  if (k.length > 3 && k.endsWith('es')) out.push(k.slice(0, -2));
  if (k.length > 2 && k.endsWith('s') && !k.endsWith('ss')) out.push(k.slice(0, -1));
  return out;
}

const cache = new Map<string, CategoryIndex>();

export function indexCategory(cat: Category): CategoryIndex {
  const hit = cache.get(cat.id);
  if (hit) return hit;
  const answers: Answer[] = [];
  const keys = new Map<string, number>();
  cat.tiers.forEach((list, tier) => {
    for (const entry of list.split(',')) {
      const aliases = entry
        .split('|')
        .map((a) => a.trim())
        .filter(Boolean);
      if (!aliases.length) continue;
      // The same answer may appear in two tiers by accident: keep the first.
      const existing = aliases.map((a) => keys.get(compact(a))).find((v) => v !== undefined);
      const id = existing ?? answers.length;
      if (existing === undefined) answers.push({ id, display: aliases[0], tier: tier as 0 | 1 | 2 });
      for (const a of aliases) {
        const k = compact(a);
        if (k && !keys.has(k)) keys.set(k, id);
      }
    }
  });
  const idx = { answers, keys };
  cache.set(cat.id, idx);
  return idx;
}

const SMALL = new Set(['and', 'of', 'the', 'in', 'a', 'an', 'on', 'de', 'with', 'to', 'for']);
const UPPER = new Set(['uk', 'usa', 'us', 'uae', 'drc', 'pe', 're', 'ict', 'dt', 'pshe', 'f1', 'mma', 'bmx', 'rc', 'sup', 'bbq', 'pjs', 'rv', 'suv', 'ufo', 'bjj']);

/** Display form for an answer: "united kingdom" → "United Kingdom", "uk" → "UK". */
export function pretty(display: string): string {
  return display
    .split(' ')
    .map((w, i) => {
      if (UPPER.has(w)) return w.toUpperCase();
      if (i > 0 && SMALL.has(w)) return w;
      return w.replace(/^[a-z]/, (c) => c.toUpperCase());
    })
    .join(' ');
}

/** Levenshtein distance with an early exit once it exceeds `max`. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

export const typoAllowance = (len: number) => (len >= 9 ? 2 : len >= 5 ? 1 : 0);

/** The answer id `raw` refers to in this category, or null if it isn't a valid answer. */
export function matchAnswer(idx: CategoryIndex, raw: string): number | null {
  const k = compact(raw);
  if (!k) return null;
  for (const c of singulars(k)) {
    const id = idx.keys.get(c);
    if (id !== undefined) return id;
  }
  const allow = typoAllowance(k.length);
  if (!allow) return null;
  let best = allow + 1;
  let bestIds = new Set<number>();
  for (const [key, id] of idx.keys) {
    if (key.length < 4) continue;
    const d = editDistance(k, key, allow);
    if (d < best) {
      best = d;
      bestIds = new Set([id]);
    } else if (d === best) bestIds.add(id);
  }
  return best <= allow && bestIds.size === 1 ? [...bestIds][0] : null;
}
