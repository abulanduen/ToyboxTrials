/**
 * Hub text chat: cleaning and a simple word filter, shared by the server (which applies them to
 * every message before relaying it) and the client (which applies the same cleaning to what the
 * player types, so the box shows what will be sent). Pure TypeScript: no DOM, no Node.
 *
 * The word filter is deliberately small and blunt: an original list of swear words and slurs,
 * matched per word after undoing common letter swaps ("5h1t") and spacing ("f u c k"), and masked
 * with stars. It is not a moderation system (docs/ONLINE.md lists what isn't done).
 * Unit-tested in tests/unit/chat.test.ts.
 */

/** Longest chat message after cleaning (characters). */
export const CHAT_MAX = 120;
/** Longest `chat` text a client may send (the server cleans and cuts it to CHAT_MAX). */
export const CHAT_RAW_MAX = 300;
/** Server chat rate limit per player: a burst of this many messages… */
export const CHAT_BURST = 3;
/** …then one every this many ms. */
export const CHAT_REFILL_MS = 1500;

/**
 * Trim, drop control and invisible formatting characters (zero-width, bidi overrides), private-use
 * characters and piles of combining marks; turn any run of whitespace into one space; cut to
 * CHAT_MAX characters (whole code points). An empty result means "nothing to send".
 */
export function cleanChatText(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const s = raw
    .slice(0, CHAT_RAW_MAX * 2)
    .normalize('NFC')
    .replace(/[\t\n\r\v\f\u2028\u2029]/g, ' ')
    .replace(/[\p{Cc}\p{Cf}\p{Co}\p{Cs}]/gu, '')
    .replace(/(\p{M}{2})\p{M}+/gu, '$1')
    .replace(/^\p{M}+/u, '')
    .replace(/\s+/gu, ' ')
    .trim();
  return Array.from(s).slice(0, CHAT_MAX).join('').trim();
}

// ---------------------------------------------------------------- word filter
/** Roots that are never fine inside a word. */
const ANYWHERE = [
  'fuck', 'fuk', 'shit', 'cunt', 'bitch', 'nigg', 'niga', 'whore', 'slut', 'nazi', 'twat', 'wank', 'asshole', 'arsehole', 'dildo',
  'jizz', 'porn', 'faggot', 'retard', 'bastard', 'hitler', 'bollock', 'tranny', 'kike', 'motherf', 'paedo', 'pedophil',
];
/** Words that are only bad on their own (so "class", "grape", "cocktail" and "scrape" are fine). */
const WHOLE = new Set([
  'ass', 'asses', 'arse', 'arses', 'dick', 'dicks', 'cock', 'cocks', 'cum', 'pussy', 'rape', 'raped', 'rapist', 'raping', 'kys', 'spic', 'spics',
  'chink', 'chinks', 'fag', 'fags', 'penis', 'vagina', 'boob', 'boobs', 'tits', 'titty', 'sex', 'sexy', 'slag', 'coon', 'coons', 'dyke', 'dykes',
  'wtf', 'stfu', 'gtfo', 'nonce', 'pedo', 'pedos', 'prick', 'pricks', 'dickhead', 'piss', 'pissed', 'crap', 'damn',
]);
/** Two-word phrases (first word, second words). */
const PHRASES: [string, string[]][] = [
  ['kill', ['yourself', 'urself', 'yourselves', 'ureself']],
  ['go', ['die']],
];

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g', '@': 'a', $: 's', '!': 'i', '|': 'i', '+': 't', '€': 'e' };

/** One word as the filter sees it: lower case, accents off, letter swaps undone, only letters kept, repeats squeezed. */
function foldWord(w: string): string {
  const base = w
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[0-9@$!|+€]/g, (c) => LEET[c] ?? c)
    .replace(/[^a-z]/g, '');
  return base;
}
const squeeze = (w: string) => w.replace(/(.)\1+/g, '$1');

function badWord(f: string): boolean {
  if (!f) return false;
  const sq = squeeze(f);
  return WHOLE.has(f) || WHOLE.has(sq) || ANYWHERE.some((r) => f.includes(r) || sq.includes(r));
}

/** Stars for every character but the edge punctuation ("sh!t!" → "****!"). */
function star(token: string): string {
  const m = /^(\p{P}*)(.*?)(\p{P}*)$/su.exec(token)!;
  const core = m[2] || token;
  return (m[2] ? m[1] : '') + '*'.repeat(Array.from(core).length) + (m[2] ? m[3] : '');
}

/** The message with blocked words masked by stars. Unchanged when nothing matched. */
export function filterChat(text: string): string {
  const tokens = [...text.matchAll(/\S+/gu)].map((m) => ({ start: m.index!, end: m.index! + m[0].length, raw: m[0], f: foldWord(m[0]) }));
  const hide = new Set<number>();
  tokens.forEach((t, i) => {
    if (badWord(t.f)) hide.add(i);
  });
  // Spaced or dotted out ("f u c k", "s.h.i.t"): join runs of short pieces and look again.
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].f.length > 2) continue;
    let joined = '';
    for (let j = i; j < tokens.length && tokens[j].f.length <= 2 && j < i + 10; j++) {
      joined += tokens[j].f;
      if (j > i && badWord(joined)) for (let k = i; k <= j; k++) hide.add(k);
    }
  }
  for (const [a, bs] of PHRASES) {
    for (let i = 0; i + 1 < tokens.length; i++) {
      if (tokens[i].f === a && bs.includes(tokens[i + 1].f)) hide.add(i).add(i + 1);
    }
  }
  if (!hide.size) return text;
  let out = '';
  let at = 0;
  tokens.forEach((t, i) => {
    out += text.slice(at, t.start) + (hide.has(i) ? star(t.raw) : t.raw);
    at = t.end;
  });
  return out + text.slice(at);
}
