/**
 * The voice-line script: every line a character speaks in the Hub, with its id and exact text.
 * This file is the hand-off for recording (docs/VOICE.md): record each line as
 * `public/assets/audio/voice/<id>.mp3`, add an entry to public/assets/asset-manifest.json, and it
 * plays automatically. A line without a recording is shown as text only (silent).
 *
 * Pure data, no imports beyond types: the unit tests check that ids are unique and every tour
 * stop and every gate greeter has its line.
 */
import type { MinigameId } from '../minigames/ids';

export type SpeakerId = 'pipwick' | `greeter-${MinigameId}`;

export interface Speaker {
  id: SpeakerId;
  /** Name shown on the speech bubble. */
  name: string;
  /** Who they are, for whoever casts and directs the voice. */
  direction: string;
}

export interface VoiceLine {
  /** File name without extension: public/assets/audio/voice/<id>.mp3. Kebab case. */
  id: string;
  speaker: SpeakerId;
  /** Exactly what is shown on screen and what should be recorded. */
  text: string;
}

export const PIPWICK: Speaker = {
  id: 'pipwick',
  name: 'Pipwick',
  direction:
    'A small wind-up tin songbird, the self-appointed official Welcomer of the Playroom. Bright, quick and chirpy, proud of her polished tin and a little officious, but warm. Short breathy pauses as if her spring needs a turn.',
};

/** The gate greeters: one small wind-up toy by each trial's arch (src/scene/Greeters.tsx). */
export const GREETERS: Record<MinigameId, Speaker & { line: string }> = {
  'copycat-conductor': {
    id: 'greeter-copycat-conductor',
    name: 'Maestro Tibbs',
    direction: 'A tiny tin conductor with a baton. Grand, theatrical, a touch pompous.',
    line: 'Hello there! I play a tune on four toy instruments, and you play it back, one note longer every round. Want to have a go?',
  },
  'jack-in-the-box': {
    id: 'greeter-jack-in-the-box',
    name: 'Jangles',
    direction: 'A jester doll with a belled hat. Giggly and mischievous.',
    line: "Hiya! Name something that fits the category, then pass the box along. Just don't be holding it when it pops! Want to have a go?",
  },
  'find-the-original': {
    id: 'greeter-find-the-original',
    name: 'Inspector Pell',
    direction: 'A peg-doll detective with a magnifying glass. Calm, observant, hushed.',
    line: "Good day! Baldwyn is hiding in a crowd of look-alikes. Spot the real one before anyone else does. Want to have a go?",
  },
  'red-light-green-light': {
    id: 'greeter-red-light-green-light',
    name: 'Signal Sal',
    direction: 'A crossing-guard toy with a stop-go lollipop sign. Brisk, sporty, encouraging.',
    line: "Hey there! Run on green and freeze on red. If the Signalman sees you move, it's back to the start! Want to have a go?",
  },
  'wind-up-dash': {
    id: 'greeter-wind-up-dash',
    name: 'Dashwood',
    direction: 'A racing driver toy in goggles with a chequered flag. Fast-talking and excited.',
    line: 'Ready, steady! A brand-new road full of traps every race, and the first toy over the line wins. Want to have a go?',
  },
  'music-box-rhythm': {
    id: 'greeter-music-box-rhythm',
    name: 'Nell',
    direction: 'A music-box dancer in a tutu. Light, musical, graceful.',
    line: 'Oh, hello! Tap each pin as it reaches the comb, right on the beat, and keep your combo going. Want to have a go?',
  },
  'inferno-escape': {
    id: 'greeter-inferno-escape',
    name: 'Captain Cinder',
    direction: 'A toy fire captain with a helmet and bucket. Steady, reassuring, a bit drill-sergeant.',
    line: 'Hello, recruit! Dig yourself a shelter, build one wall, and outlast the creeping heat. Want to have a go?',
  },
  'midnight-hunger': {
    id: 'greeter-midnight-hunger',
    name: 'Nightcap Noor',
    direction: 'A sleepy toy in a nightcap holding a candle. Soft, whispery, yawning.',
    line: "Psst, hello. Hunt for batteries by night and shelter from the sun by day. Don't run out of energy! Want to have a go?",
  },
  'toy-squad': {
    id: 'greeter-toy-squad',
    name: 'Sergeant Brass',
    direction: 'A little tin soldier with a tall hat and a flag. Crisp, proud, kindly.',
    line: 'Attention! Buy toys, merge them into stars, and lead your squad through ten little battles. Want to have a go?',
  },
  'blink-duel': {
    id: 'greeter-blink-duel',
    name: 'Flicker',
    direction: 'A caped duellist toy with a fencing foil. Cool, playful, quick.',
    line: "Hello, quick-step! Blink about, bait a swing, then strike. One hit and they're out. Want to have a go?",
  },
  'spellbox-showdown': {
    id: 'greeter-spellbox-showdown',
    name: 'Wizzle',
    direction: 'A toy wizard with a starry hat and wand. Whimsical and dramatic.',
    line: 'Greetings! Choose three toy spells and knock your rivals right out of the ring. Want to have a go?',
  },
  'odd-page-out': {
    id: 'greeter-odd-page-out',
    name: 'Bookworm Bea',
    direction: 'A bespectacled reader doll with a picture book. Bright, bookish, eager.',
    line: 'Hello, reader! Two storybook pictures, fifteen little differences, thirty seconds. Can you find them all? Want to have a go?',
  },
  'toy-tower-tumble': {
    id: 'greeter-toy-tower-tumble',
    name: 'Builder Bo',
    direction: 'A builder toy in a hard hat carrying a block. Cheerful, practical, a little gruff.',
    line: 'Hiya! Build random toy towers, merge them up a tier, and hold the line for twenty waves. Want to have a go?',
  },
  'toybox-siege': {
    id: 'greeter-toybox-siege',
    name: 'Sir Rally',
    direction: 'A tiny toy knight with a plumed helmet and shield. Gallant and hearty.',
    line: 'Well met! Pick a hero and hold your patch of table against swarms of dust bunnies for five whole minutes. Want to have a go?',
  },
};

/**
 * Pipwick's tour (the owner's "In this town…" script, recorded with ElevenLabs as one take and cut
 * into a clip per stop: public/assets/audio/voice/pipwick-tour-<stop>.mp3). Each stop's line is a
 * list of captions with the time (s, into that stop's clip) where Pipwick starts saying it, so the
 * tour card can follow the voice. Stop ids match src/game/tour.ts TOUR_STOPS, which sets the order.
 */
export const TOUR_CAPTIONS = {
  hello: [
    { at: 0, text: 'In this town, every toy arrives with a dream.' },
    { at: 2.42, text: 'Riches. Fame. Power! Want them?' },
    { at: 5.0, text: 'Then wind yourself up and earn them!' },
    { at: 6.84, text: 'Although… our riches are cogs, our fame is a name on the scoreboard,' },
    { at: 10.24, text: 'and our power mostly involves wearing a very impressive hat.' },
    { at: 13.04, text: 'I’m Pipwick, official Welcomer of the Playroom.' },
    { at: 15.2, text: 'Self-appointed. Fully qualified.' },
  ],
  pavilion: [
    { at: 0, text: 'See that striped Pavilion, right of the fountain?' },
    { at: 1.68, text: 'That’s where rivals become legends.' },
    { at: 3.52, text: 'Choose Blitz for three trials, Normal for five, or Treasure for eight.' },
    { at: 6.72, text: 'Practise with bots, or gather an online party.' },
    { at: 8.64, text: 'Most points wins!' },
  ],
  trials: [
    { at: 0, text: 'Prefer one little adventure? Cross the domino bridge to the Trials Table by the window.' },
    { at: 2.97, text: 'Every arch holds a different game.' },
    { at: 4.95, text: 'Walk up, press E—or tap the prompt—and choose your challenge.' },
    { at: 7.76, text: 'Earn cogs. Find secrets. Make a name for yourself.' },
  ],
  workshop: [{ at: 0, text: 'Then visit the Workshop, left of the fountain, to put your own stamp on that splendid little body.' }],
  shop: [{ at: 0, text: 'Odds and Ends, right beside it, has more cosmetics for your hard-earned cogs.' }],
  scoreboard: [{ at: 0, text: 'Fancy boasting? The scoreboard behind the fountain keeps the evidence.' }],
  jukebox: [{ at: 0, text: 'Fancy a tune? The jukebox waits by the Music Box arch.' }],
  play: [
    { at: 0, text: 'Between trials, explore! Kick a ball. Shoot a basket.' },
    { at: 2.85, text: 'There are four secrets hiding around here.' },
  ],
  bye: [
    { at: 0, text: 'And whenever you open somewhere new, I’ll show you which buttons do what.' },
    { at: 2.72, text: 'Now… choose an arch, or start a Blitz.' },
    { at: 4.72, text: 'In this town, legends don’t arrive ready-made.' },
    { at: 6.72, text: 'They arrive needing a little winding.' },
  ],
} as const satisfies Record<string, readonly { at: number; text: string }[]>;

/** Each stop's whole line (the recording script; shown in full when there's no voice to follow). */
export const TOUR_LINES = Object.fromEntries(
  Object.entries(TOUR_CAPTIONS).map(([k, caps]) => [k, caps.map((c) => c.text).join(' ')]),
) as Record<keyof typeof TOUR_CAPTIONS, string>;
export type TourStopId = keyof typeof TOUR_CAPTIONS;

/** Talking to Pipwick in the Hub after the tour. */
export const CHAT_LINES = {
  hello: 'Oh, hello again! Shall I show you round once more?',
  bye: 'Right you are! Keep your spring wound!',
  idle: [
    'Did you know I polish my tin every morning? Twice on Sundays.',
    "When a gate's bell rings, someone has just stepped into a trial.",
    'The Jukebox by the Music Box gate takes requests. Well, cranks.',
    'Tournaments are the quickest way to earn a pile of cogs.',
    "I'd tell you where the secrets are, but then they wouldn't be secrets, would they?",
  ],
} as const;

export const tourLineId = (stop: TourStopId) => `pipwick-tour-${stop}`;
export const chatLineId = (key: 'hello' | 'bye' | number) => (typeof key === 'number' ? `pipwick-chat-idle-${key + 1}` : `pipwick-chat-${key}`);

/** Every line, flattened: the complete recording script. */
export const VOICE_LINES: VoiceLine[] = [
  ...(Object.keys(TOUR_LINES) as TourStopId[]).map((k) => ({ id: tourLineId(k), speaker: 'pipwick' as const, text: TOUR_LINES[k] })),
  { id: chatLineId('hello'), speaker: 'pipwick', text: CHAT_LINES.hello },
  ...CHAT_LINES.idle.map((text, i) => ({ id: chatLineId(i), speaker: 'pipwick' as const, text })),
  { id: chatLineId('bye'), speaker: 'pipwick', text: CHAT_LINES.bye },
  ...Object.values(GREETERS).map((g) => ({ id: g.id, speaker: g.id, text: g.line })),
];

export const SPEAKERS: Speaker[] = [PIPWICK, ...Object.values(GREETERS).map(({ id, name, direction }) => ({ id, name, direction }))];

export const lineById = (id: string) => VOICE_LINES.find((l) => l.id === id);
