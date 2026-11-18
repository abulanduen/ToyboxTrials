import type { SpellId } from './spells';

/** Names remain on buttons; the illustration is decorative for assistive technology. */
export function SpellIcon({spell}:{spell:SpellId}){
  return <img className="spellbox-icon" src={`${import.meta.env.BASE_URL}assets/ui/spellbox/${spell}.webp`} alt="" width={64} height={64} draggable={false} decoding="async"/>;
}
