/**
 * Who Am I? at the suspicious box (online Hub only): rules shared by the server and the client.
 * Pure TypeScript: no DOM, no Node, no randomness of its own (the server passes `random`).
 *
 * - Where the box is, and how close a player must be for the server to deal them a card.
 * - Which answers a card accepts: its name, `also` aliases, regular plurals, with "a/an/the",
 *   case, accents, spacing and hyphens ignored, and common guess phrasing ("am I a …?") stripped.
 * - Anti-spoiler masking: a holder's copy of someone else's message hides their answer
 *   ("p******"); everyone else sees the message as written.
 *
 * Unit-tested in tests/unit/whoami.test.ts.
 */
import { WHO_CARDS, type WhoCard } from './whoAmICards';

export { WHO_CARDS, type WhoCard };

/** The jack-in-the-box in the Playroom (1 unit = 1 cm). src/scene/layout.ts re-exports it as JACK. */
export const JACK_BOX = { x: -35, z: -22 } as const;
/** Where a player stands to open it (the interactable's spot) and its prompt radius. */
export const JACK_SPOT = { x: JACK_BOX.x + 3.2, z: JACK_BOX.z + 0.5, radius: 3.4 } as const;
/** How far from JACK_SPOT the server still deals a card (prompt radius plus slack for move lag). */
export const JACK_DEAL_REACH = JACK_SPOT.radius + 3;
/** Least time between two cards for one player (ms). */
export const CARD_COOLDOWN_MS = 4000;
/** A player's last few cards aren't dealt to them again straight away. */
export const CARD_RECENT = 12;

// ---------------------------------------------------------------- text folding
/** Lower case, accents off, apostrophes dropped, anything but letters and digits → one space. */
export function fold(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/['’‘`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const VOWEL = /^[aeiou]/;
/** Regular English plurals of one word (the irregular ones are in each card's `also`). */
export function pluralsOf(word: string): string[] {
  const out = [word + 's'];
  if (/(s|x|z|ch|sh|o)$/.test(word)) out.push(word + 'es');
  if (/[^aeiou]y$/.test(word)) out.push(word.slice(0, -1) + 'ies');
  if (/[^f]f$/.test(word)) out.push(word.slice(0, -1) + 'ves');
  if (/fe$/.test(word)) out.push(word.slice(0, -2) + 'ves');
  return out;
}

/** Every accepted answer of a card, folded, in word form ("police officer", "police officers", …). */
export function answerPhrases(card: WhoCard): string[] {
  const out = new Set<string>();
  for (const raw of [card.name, ...(card.also ?? [])]) {
    const f = fold(raw);
    if (!f) continue;
    out.add(f);
    const words = f.split(' ');
    const last = words[words.length - 1];
    for (const p of pluralsOf(last)) out.add([...words.slice(0, -1), p].join(' '));
  }
  return [...out];
}

/** The same answers with the spaces removed ("icecream" matches "ice cream" and "ice-cream"). */
export function answerKeys(card: WhoCard): Set<string> {
  return new Set(answerPhrases(card).map((p) => p.replace(/ /g, '')));
}

// ---------------------------------------------------------------- guessing
/** Words around a guess that don't change it: "am I a …", "is it the …", "… ?". */
const LEADS = [
  'i think i might be', 'i think i am', 'i think im', 'i think its', 'i think it is', 'i think', 'i guess', 'my guess is', 'my card is', 'my card says', 'is my card',
  'am i maybe', 'am i', 'i am', 'im', 'is it', 'it is', 'its', 'is this', 'this is', 'are you', 'could i be', 'could it be', 'maybe', 'guess', 'so', 'oh', 'ok', 'okay', 'um', 'umm', 'hmm', 'erm', 'er',
];
const ARTICLES = new Set(['a', 'an', 'the', 'some', 'one']);
const TAILS = ['maybe', 'right', 'then', 'perhaps', 'please', 'yes', 'yeah'];

/** A chat message reduced to the thing it guesses ("Am I a penguin?!" → "penguin"). */
export function guessCore(text: string): string {
  let words = fold(text).split(' ').filter(Boolean);
  for (let changed = true; changed && words.length; ) {
    changed = false;
    for (const lead of LEADS) {
      const lw = lead.split(' ');
      if (lw.length < words.length && lw.every((w, i) => words[i] === w)) {
        words = words.slice(lw.length);
        changed = true;
        break;
      }
    }
    if (words.length > 1 && ARTICLES.has(words[0])) {
      words = words.slice(1);
      changed = true;
    }
    if (words.length > 1 && TAILS.includes(words[words.length - 1])) {
      words = words.slice(0, -1);
      changed = true;
    }
  }
  return words.join(' ');
}

/** True when a holder's chat message names their card. */
export function isCorrectGuess(card: WhoCard, text: string): boolean {
  const core = guessCore(text).replace(/ /g, '');
  return core.length > 0 && answerKeys(card).has(core);
}

// ---------------------------------------------------------------- anti-spoiler masking
/** "penguin" → "p******": the first letter, then a star for every other letter or digit. */
export function maskWord(w: string): string {
  let first = true;
  return Array.from(w)
    .map((ch) => {
      if (!/[\p{L}\p{N}]/u.test(ch)) return ch;
      if (first) {
        first = false;
        return ch;
      }
      return '*';
    })
    .join('');
}

/** Masked copy of `text` with every word that gives away `card` hidden, or `text` itself when nothing does. */
export function maskAnswers(text: string, card: WhoCard): string {
  const tokens = [...text.matchAll(/[\p{L}\p{N}'’]+/gu)].map((m) => ({ start: m.index!, end: m.index! + m[0].length, raw: m[0], f: fold(m[0]).replace(/ /g, '') }));
  if (!tokens.length) return text;
  const keys = answerKeys(card);
  // Long answers also hide words that start with them ("penguinish", "elephants'"); short ones
  // ("cat", "bee") only match whole words, so "category" and "been" stay readable.
  const stems = [...keys].filter((k) => k.length >= 4);
  const phrases = answerPhrases(card)
    .filter((p) => p.includes(' '))
    .map((p) => p.split(' '));
  const hide = new Set<number>();
  /** Pieces after the first of a spelled-out answer: no letter kept. */
  const whole = new Set<number>();
  tokens.forEach((t, i) => {
    if (!t.f) return;
    if (keys.has(t.f) || stems.some((s) => t.f.startsWith(s))) hide.add(i);
  });
  // Multi-word answers ("ice cream"), word by word.
  for (const ph of phrases) {
    for (let i = 0; i + ph.length <= tokens.length; i++) {
      if (ph.every((w, k) => tokens[i + k].f === w)) for (let k = 0; k < ph.length; k++) hide.add(i + k);
    }
  }
  // Spelled out letter by letter ("p e n g u i n") or split across words ("pen guin", "ice-cream").
  for (let i = 0; i < tokens.length; i++) {
    let joined = '';
    for (let j = i; j < tokens.length && j < i + 12; j++) {
      joined += tokens[j].f;
      if (j > i && keys.has(joined)) {
        hide.add(i);
        for (let k = i + 1; k <= j; k++) (tokens[k].f.length <= 2 ? whole : hide).add(k);
      }
    }
  }
  if (!hide.size && !whole.size) return text;
  let out = '';
  let at = 0;
  tokens.forEach((t, i) => {
    out += text.slice(at, t.start) + (whole.has(i) ? t.raw.replace(/[\p{L}\p{N}]/gu, '*') : hide.has(i) ? maskWord(t.raw) : t.raw);
    at = t.end;
  });
  return out + text.slice(at);
}

// ---------------------------------------------------------------- dealing and display
/** Index of the card to deal: uniform over the deck, skipping `avoid` (cards in play, recent ones) while any are left. */
export function dealIndex(random: () => number, avoid: Iterable<number>): number {
  const skip = new Set(avoid);
  const pool: number[] = [];
  for (let i = 0; i < WHO_CARDS.length; i++) if (!skip.has(i)) pool.push(i);
  const from = pool.length ? pool : WHO_CARDS.map((_, i) => i);
  return from[Math.min(from.length - 1, Math.floor(random() * from.length))];
}

/** The article for announcements: "a penguin", "an umbrella", "scissors". */
export function articleFor(card: WhoCard): 'a' | 'an' | '' {
  return card.art ?? (VOWEL.test(card.name) ? 'an' : 'a');
}

/** "a penguin" (for "Ticker guessed it: a penguin!"). */
export function withArticle(word: string, art: string): string {
  return art ? `${art} ${word}` : word;
}
