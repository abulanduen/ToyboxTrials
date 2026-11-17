/**
 * Toybox Trials palette. Every colour used in the miniature world should come from here
 * so the toy layer stays cohesive. Room-scale colours are deliberately muted so toys pop.
 */
export const PALETTE = {
  cream: '#F4E8CE',
  honey: '#EFAE45',
  coral: '#E76B62',
  toyBlue: '#6BA7C8',
  sage: '#89B78A',
  inkPurple: '#574D69',

  // Supporting toy materials
  woodLight: '#D9A86C',
  woodMid: '#B9824A',
  woodDark: '#7E5332',
  cardboard: '#C9A57A',
  cardboardDark: '#A9845B',
  felt: '#7FA878',
  feltDark: '#5F8A5C',
  brass: '#C8973A',
  ink: '#2B2433',
  white: '#FFF9EE',

  // Room scale (muted, slightly desaturated so the toy layer reads first)
  roomWall: '#B7A99A',
  roomWallShadow: '#8B7F78',
  roomFloor: '#8A6A4E',
  roomFabric: '#9DAAB8',
  roomSky: '#CFE3F2',
} as const;

/**
 * Room-layer colours (the giant real room around the table). Albedo values for the baked
 * room lighting in `src/scene/room/`: muted and below ~60 % saturation so the toy layer reads first.
 */
export const ROOM = {
  wallUpper: '#DCCBB4',
  wainscot: '#86A39C',
  trim: '#EFE7D8',
  ceiling: '#EEE6D8',
  floorWood: '#8A6A4E',
  windowFrame: '#F2EEE6',
  curtain: '#C98B76',
  curtainRod: '#7A5A3C',
  radiator: '#E4DFD4',
  shelfWood: '#A87D57',
  darkWood: '#6E4C33',
  paleWood: '#D2B48A',
  chairWood: '#B98B58',
  wardrobe: '#B5895E',
  door: '#E6DCCB',
  sofa: '#7C8FA6',
  sofaDark: '#647890',
  cushionA: '#D9A45B',
  cushionB: '#C97A6A',
  throwBlanket: '#E9DCC3',
  bedFrame: '#E8DED0',
  blanket: '#7D93B0',
  pillow: '#F2D9A0',
  rug: '#6C7FA0',
  rugAccent: '#D8C9A8',
  terracotta: '#C9744F',
  leaf: '#6E9A6A',
  leafDark: '#4F7C57',
  lampShade: '#F3E2BE',
  lampMetal: '#5D5A5E',
  pendant: '#6F8F8A',
  cardboardBox: '#C2A075',
  teddy: '#B98857',
  teddyLight: '#E2C59A',
  bin: '#D9CDB8',
  globeSea: '#6F9DB5',
  globeLand: '#9DB58A',
  bookSpines: ['#C46A5D', '#5E86A3', '#7E9C78', '#D9B26A', '#574D69', '#D8CBB5', '#A0705A', '#8C9AAE'],
  // Baked light colours (linear multipliers are applied in src/scene/room/bake.ts)
  sunWarm: '#FFD9A0',
  skyFill: '#F4F1EA',
  bounceWarm: '#FFC48A',
  shaft: '#FFE9BF',
  fairyLight: '#FFD9A0',
} as const;

/** Paint jobs available at the Workshop. Body / trim / accent. */
export const PAINT_JOBS = [
  { name: 'Toy Blue', body: PALETTE.toyBlue, trim: PALETTE.honey, accent: PALETTE.coral },
  { name: 'Coral Clank', body: PALETTE.coral, trim: PALETTE.cream, accent: PALETTE.toyBlue },
  { name: 'Sage Sprocket', body: PALETTE.sage, trim: PALETTE.honey, accent: PALETTE.inkPurple },
  { name: 'Honey Hustle', body: PALETTE.honey, trim: PALETTE.inkPurple, accent: PALETTE.coral },
  { name: 'Midnight Tin', body: PALETTE.inkPurple, trim: PALETTE.honey, accent: PALETTE.sage },
] as const;

export type PaintJob = (typeof PAINT_JOBS)[number];
