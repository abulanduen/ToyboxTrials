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

/** Pipwick's tour, in order (stop ids match src/game/tour.ts TOUR_STOPS). */
export const TOUR_LINES = {
  hello: "Hello, hello! I'm Pipwick, official Welcomer of the Playroom. You're new, aren't you? Let me show you round. Follow me!",
  scoreboard: "This is the Scoreboard. It keeps the best scores in the Playroom, and the little telly beside it shows who's online and what's on.",
  pavilion: "That's the Tournament Pavilion. Play several trials in a row for points and prizes. Online lobbies gather there too.",
  trials: 'Over the domino bridge is the Trials Table. Every arch is a different game. Walk up to one and its greeter will tell you all about it.',
  jukebox: 'Ooh, and this is my favourite: the Jukebox! Give it a crank to choose the music you hear around the Hub.',
  workshop: 'Back on this side is the Workshop. Repaint yourself, try on hats and swap your wind-up key.',
  shop: 'Trials and secrets pay cogs. Spend them at the Odds and Ends shop on paints, hats, accessories and gestures.',
  online: "When you play online, other toys share the Playroom with you. Wave hello with your gestures! And keep your eyes peeled: there are four secrets hidden about the place.",
  bye: "And that's the grand tour! I'll be right here by the fountain if you'd like it again. Off you go, and keep your spring wound!",
} as const;
export type TourStopId = keyof typeof TOUR_LINES;

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
