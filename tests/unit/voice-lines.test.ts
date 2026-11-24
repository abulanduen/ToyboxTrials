import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { CHAT_LINES, CURATOR, GREETERS, SPEAKERS, TOUR_CAPTIONS, TOUR_LINES, VOICE_LINES, chatLineId, greeterSpeaker, lineById, tourLineId } from '../../src/game/voiceLines';
import { TOUR_STOPS } from '../../src/game/tour';
import { MINIGAMES } from '../../src/minigames/registry';
import { STORE_VERSION, migratePersisted } from '../../src/game/economy';

describe('the voice-line script', () => {
  it('every line has a unique kebab-case id, a known speaker and its text', () => {
    const ids = VOICE_LINES.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    const speakers = new Set(SPEAKERS.map((s) => s.id));
    for (const l of VOICE_LINES) {
      expect(l.id, l.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(speakers.has(l.speaker), l.id).toBe(true);
      expect(l.text.trim().length, l.id).toBeGreaterThan(10);
      // short enough to read in a bubble (the tour's lines are long, but the card shows them a caption at a time)
      if (!l.id.startsWith('pipwick-tour-')) expect(l.text.length, l.id).toBeLessThan(220);
      expect(l.text, l.id).not.toMatch(/\s{2}|[\u{1F300}-\u{1FAFF}]/u); // no double spaces or emoji
    }
    for (const s of SPEAKERS) expect(s.direction.length, s.id).toBeGreaterThan(20);
  });

  it('covers every tour stop, the chat with Pipwick and a greeter for every playable trial', () => {
    for (const s of TOUR_STOPS) expect(lineById(tourLineId(s.id))?.text).toBe(TOUR_LINES[s.id]);
    expect(lineById(chatLineId('hello'))).toBeDefined();
    expect(lineById(chatLineId('bye'))).toBeDefined();
    CHAT_LINES.idle.forEach((_, i) => expect(lineById(chatLineId(i))).toBeDefined());
    for (const g of MINIGAMES.filter((m) => m.status === 'playable')) {
      const gr = GREETERS[g.id];
      expect(gr, g.id).toBeDefined();
      expect(gr.id).toBe(`greeter-${g.id}`);
      expect(lineById(gr.id)?.text).toBe(gr.line);
      // hello, a pitch, and the question
      expect(gr.line, g.id).toMatch(/Want to have a go\?$/);
    }
    expect(new Set(Object.values(GREETERS).map((g) => g.name)).size).toBe(Object.keys(GREETERS).length);
    // the Tournament Curator in the Pavilion has a hello line, shown in their bubble
    expect(lineById(CURATOR.id)?.text).toBe(CURATOR.line);
    expect(greeterSpeaker('curator')).toBe(CURATOR);
  });

  it('splits every tour line into short captions, in order, starting as the line starts', () => {
    for (const s of TOUR_STOPS) {
      const caps = TOUR_CAPTIONS[s.id];
      expect(caps[0].at, s.id).toBe(0);
      for (let i = 1; i < caps.length; i++) expect(caps[i].at, s.id).toBeGreaterThan(caps[i - 1].at);
      for (const c of caps) expect(c.text.length, c.text).toBeLessThan(110);
      expect(caps.map((c) => c.text).join(' ')).toBe(TOUR_LINES[s.id]);
    }
  });

  it('every recording in public/assets/audio/voice/ is a line of the script with its own manifest entry', () => {
    const dir = resolve(__dirname, '../../public/assets/audio/voice');
    const files = readdirSync(dir).filter((f) => f.endsWith('.mp3'));
    const manifest = JSON.parse(readFileSync(resolve(__dirname, '../../public/assets/asset-manifest.json'), 'utf8')) as { assets: { file?: string }[] };
    const listed = new Set(manifest.assets.map((a) => a.file));
    for (const f of files) {
      expect(lineById(f.replace(/\.mp3$/, '')), f).toBeDefined();
      expect(listed.has(`audio/voice/${f}`), f).toBe(true);
    }
    // the whole tour is recorded
    for (const s of TOUR_STOPS) expect(files, s.id).toContain(`${tourLineId(s.id)}.mp3`);
  });

  it('documents the recording hand-off (docs/VOICE.md) and lists no recording that is not in the manifest', () => {
    const doc = readFileSync(resolve(__dirname, '../../docs/VOICE.md'), 'utf8');
    expect(doc).toContain('src/game/voiceLines.ts');
    expect(doc).toContain('public/assets/audio/voice/');
    const manifest = JSON.parse(readFileSync(resolve(__dirname, '../../public/assets/asset-manifest.json'), 'utf8')) as { assets: { file?: string }[] };
    const voiceFiles = manifest.assets.map((a) => a.file).filter((f): f is string => !!f && f.startsWith('audio/voice/'));
    for (const f of voiceFiles) expect(lineById(f.replace(/^audio\/voice\//, '').replace(/\.mp3$/, '')), f).toBeDefined();
  });
});

describe('save migration for the welcome tour (store v2)', () => {
  it('is version 2', () => {
    expect(STORE_VERSION).toBe(2);
  });
  it('a new or untouched save sees the tour; one that has already played does not', () => {
    expect(migratePersisted({ quality: 'low' }, 1).tourSeen).toBe(false);
    expect(migratePersisted(undefined, 0).tourSeen).toBe(false);
    expect(migratePersisted({ records: { 'copycat-conductor': { best: 3, plays: 2, wins: 0 } } }, 1).tourSeen).toBe(true);
    expect(migratePersisted({ secretsFound: ['marble'] }, 0).tourSeen).toBe(true);
    expect(migratePersisted({ tournamentHistory: [{ format: 'blitz', place: 1, of: 4, games: [], at: 1 }] }, 1).tourSeen).toBe(true);
    expect(migratePersisted({ records: {}, secretsFound: [], tournamentHistory: [] }, 1).tourSeen).toBe(false);
  });
  it('keeps a flag that is already there (tests seed it), and leaves other fields alone', () => {
    expect(migratePersisted({ quality: 'low', tourSeen: true }, 0).tourSeen).toBe(true);
    expect(migratePersisted({ records: { 'jack-in-the-box': { best: 1, plays: 1, wins: 0 } }, tourSeen: false }, 1).tourSeen).toBe(false);
    const s = migratePersisted({ quality: 'high', contenderName: 'Bolt', masterVolume: 0.3 }, 1);
    expect(s).toMatchObject({ quality: 'high', contenderName: 'Bolt', masterVolume: 0.3 });
    // music/voice volumes and the jukebox track come from the store defaults (the persist merge)
    expect(s.musicVolume).toBeUndefined();
  });
  it('a v2 save is not migrated again', () => {
    const v2 = migratePersisted({ secretsFound: ['key'] }, 1);
    expect(migratePersisted(JSON.parse(JSON.stringify(v2)), 2)).toEqual(v2);
    expect(migratePersisted({ tourSeen: false, records: { 'toy-squad': { best: 1, plays: 1, wins: 1 } } }, 2).tourSeen).toBe(false);
  });
});
