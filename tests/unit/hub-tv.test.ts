/* The hub TV beside the Scoreboard: its pixel font and the cards it cycles through (pure parts). */
import { describe, expect, it } from 'vitest';
import { ADVANCE, GLYPH_H, GLYPH_W, glyph, textWidth, wrap } from '../../src/scene/pixelFont';
import { TV_CARDS, TV_CARD_SECONDS, TV_COLS, TV_ROWS, tvCard, tvCardKey, tvChannel, type TvInputs } from '../../src/scene/tvCards';
import { HATS, KEY_SKINS } from '../../src/game/cosmetics';

const base: TvInputs = {
  status: 'offline',
  room: null,
  selfId: null,
  players: [],
  records: {},
  tournamentWins: 0,
  secrets: 0,
  secretTotal: 4,
  featured: [...HATS, ...KEY_SKINS].map((c) => ({ name: c.name, blurb: c.blurb, swatch: c.swatch, kind: 'Hat' })),
};
const online: TvInputs = {
  ...base,
  status: 'online',
  room: { kind: 'public', code: null, instance: 2 },
  selfId: 'me',
  players: [
    { id: 'me', name: 'Ticker', activity: null },
    { id: 'b', name: 'Bravo', activity: 'copycat-conductor' },
    { id: 'c', name: 'Charlie', activity: null },
    { id: 'd', name: 'Delta', activity: 'workshop' },
    { id: 'e', name: 'Echo', activity: 'wind-up-dash' },
  ],
};

describe('pixel font', () => {
  it('every glyph is 5 × 7, letters are case-insensitive and unknown characters fall back to ?', () => {
    for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,:!?-\'/+()#&·>*') {
      const g = glyph(ch);
      expect(g.length, ch).toBe(GLYPH_H);
      for (const row of g) expect(row, ch).toMatch(new RegExp(`^[#.]{${GLYPH_W}}$`));
    }
    expect(glyph('a')).toEqual(glyph('A'));
    expect(glyph('§')).toEqual(glyph('?'));
    expect(textWidth('AB', 2)).toBe((2 * ADVANCE - 1) * 2);
  });

  it('wraps words to the line length', () => {
    expect(wrap('PLAY ONLINE FROM THE MENU', 11)).toEqual(['PLAY ONLINE', 'FROM THE', 'MENU']);
    expect(wrap('ABCDEFGHIJ', 4)).toEqual(['ABCD', 'EFGH', 'IJ']);
  });
});

describe('TV cards', () => {
  const fits = (inp: TvInputs) => {
    for (const id of TV_CARDS) {
      const c = tvCard(id, inp, 3);
      expect(c.lines.length, id).toBeLessThanOrEqual(TV_ROWS);
      for (const l of c.lines) expect(l.text.length, `${id}: ${l.text}`).toBeLessThanOrEqual(TV_COLS);
      expect(textWidth(c.title, 2), id).toBeLessThanOrEqual(156); // the title bar's big letters fit the 160 px screen
    }
  };

  it('cycles through the five cards, a few seconds each, and a channel change skips ahead', () => {
    expect(TV_CARDS).toEqual(['online', 'friends', 'leaders', 'shop', 'records']);
    expect(tvChannel(0).index).toBe(0);
    expect(tvChannel(TV_CARD_SECONDS - 0.01).index).toBe(0);
    expect(tvChannel(TV_CARD_SECONDS).index).toBe(1);
    expect(tvChannel(TV_CARD_SECONDS * 6).index).toBe(1);
    expect(tvChannel(0, 3).index).toBe(3);
    expect(TV_CARD_SECONDS).toBeGreaterThanOrEqual(2);
  });

  it('the online leaderboard card: champions by wins, or a pointer to the Pavilion', () => {
    expect(tvCard('leaders', base).lines.map((l) => l.text).join(' ')).toContain('NO ONLINE CHAMPIONS');
    const withBoard: TvInputs = { ...online, lobbies: 2, leaders: { board: 'blitz', entries: Array.from({ length: 12 }, (_, i) => ({ name: `Player Number ${i}`, wins: 12 - i, points: 100 - i })) } };
    const c = tvCard('leaders', withBoard);
    expect(c.lines[0].text).toBe('BLITZ TOURNAMENTS');
    expect(c.lines[1].text).toBe('1 Player Numb. W12 100');
    expect(c.lines[c.lines.length - 1].text).toBe('2 LOBBIES OPEN NOW');
    fits(withBoard);
  });

  it('offline: a friendly card pointing at Play online on the menu', () => {
    const c = tvCard('online', base);
    expect(c.lines.map((l) => l.text).join(' ')).toContain('PLAY ONLINE FROM');
    expect(tvCard('friends', base).lines.map((l) => l.text).join(' ')).toContain('GO ONLINE');
    fits(base);
  });

  it('online: the room, the head count and who is here; friends playing lists those in a trial', () => {
    const c = tvCard('online', online);
    const text = c.lines.map((l) => l.text);
    expect(text[0]).toBe('PUBLIC HUB #2');
    expect(text[1]).toBe('5 TOYS HERE');
    expect(text).toContain('Ticker (YOU)');
    expect(text).toContain('Bravo > Copycat');
    const f = tvCard('friends', online).lines.map((l) => l.text);
    expect(f).toEqual(['Bravo > Copycat', 'Echo > Dash']); // not the Workshop, not yourself
    fits(online);
    const many = { ...online, players: Array.from({ length: 24 }, (_, i) => ({ id: `p${i}`, name: `Player number ${i}`, activity: 'toy-squad' as const })) };
    fits(many);
    expect(tvCard('online', many).lines.at(-1)!.text).toMatch(/^\+\d+ MORE$/);
  });

  it('the shop features one catalogue item per cycle; records show your best games', () => {
    const a = tvCard('shop', base, 0);
    const b = tvCard('shop', base, 1);
    expect(a.swatch).toBeTruthy();
    expect(a.lines[1].text).not.toBe(b.lines[1].text);
    expect(tvCard('records', base).lines[0].text).toContain('NO RECORDS');
    const r = tvCard('records', { ...base, records: { 'copycat-conductor': { best: 12, plays: 5, wins: 2 }, 'jack-in-the-box': { best: 3, plays: 9, wins: 1 } }, tournamentWins: 2, secrets: 3 });
    expect(r.lines[0].text.startsWith('Jack')).toBe(true); // most played first
    expect(r.lines[1].text).toContain('*12');
    expect(r.lines.at(-1)!.text).toBe('CUPS 2   SECRETS 3/4');
  });

  it('the redraw key changes only when what is shown changes', () => {
    expect(tvCardKey(tvCard('online', online))).toBe(tvCardKey(tvCard('online', { ...online })));
    const moved = { ...online, players: online.players.map((p) => (p.id === 'c' ? { ...p, activity: 'blink-duel' as const } : p)) };
    expect(tvCardKey(tvCard('online', moved))).not.toBe(tvCardKey(tvCard('online', online)));
  });
});
