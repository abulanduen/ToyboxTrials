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

/** Paint jobs available at the Workshop. Body / trim / accent. */
export const PAINT_JOBS = [
  { name: 'Toy Blue', body: PALETTE.toyBlue, trim: PALETTE.honey, accent: PALETTE.coral },
  { name: 'Coral Clank', body: PALETTE.coral, trim: PALETTE.cream, accent: PALETTE.toyBlue },
  { name: 'Sage Sprocket', body: PALETTE.sage, trim: PALETTE.honey, accent: PALETTE.inkPurple },
  { name: 'Honey Hustle', body: PALETTE.honey, trim: PALETTE.inkPurple, accent: PALETTE.coral },
  { name: 'Midnight Tin', body: PALETTE.inkPurple, trim: PALETTE.honey, accent: PALETTE.sage },
] as const;

export type PaintJob = (typeof PAINT_JOBS)[number];
