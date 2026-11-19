/**
 * Pieces shared by the Odds & Ends shop and the Workshop: the cog wallet, category tabs, item
 * cards, the four gesture slots, and the try-on / preview helpers that drive the turntable toy.
 */
import type { CSSProperties } from 'react';
import { useGame } from '../game/store';
import { events } from '../game/events';
import { sfx } from '../game/audio';
import { CATEGORIES, CATEGORY_LABELS, RARITY_COLOURS, RARITY_LABELS, SECRET_LABELS, itemById, type CatalogueItem, type Category } from '../game/cosmetics';
import { EMOTE_LABELS, isEmoteId, type EmoteId } from '../game/emotes';
import { achievementById, cogText } from '../game/economy';
import { owns, slotOf, type Loadout, type Profile } from '../game/profile';
import { CogIcon, GestureGlyph, ItemIcon } from './itemIcons';
import { PadlockIcon } from './icons';

/** The wallet: a brass cog and the balance. */
export function CogCount({ value, testId, className = '' }: { value: number; testId?: string; className?: string }) {
  return (
    <span className={`cog-count ${className}`} data-testid={testId} aria-label={cogText(value)} title={cogText(value)}>
      <CogIcon size={22} />
      <strong>{value}</strong>
    </span>
  );
}

export function CategoryTabs({ value, onChange, testPrefix = 'tab' }: { value: Category; onChange: (c: Category) => void; testPrefix?: string }) {
  return (
    <div className="workshop-tabs" role="tablist">
      {CATEGORIES.map((c) => (
        <button
          key={c}
          role="tab"
          aria-selected={value === c}
          className={value === c ? 'on' : ''}
          data-testid={`${testPrefix}-${c}`}
          onClick={() => {
            sfx.click();
            onChange(c);
          }}
        >
          {c === 'paint' ? 'Paint' : CATEGORY_LABELS[c]}
        </button>
      ))}
    </div>
  );
}

/** How an item can be unlocked, in words. */
export function unlockText(item: CatalogueItem): string {
  switch (item.unlock) {
    case 'starter':
      return 'Every toy starts with this.';
    case 'shop':
      return `Sold at the Odds & Ends shop for ${cogText(item.price)}.`;
    case 'secret':
      return `Secret: ${SECRET_LABELS[item.secret ?? ''] ?? 'keep exploring the Playroom'}.`;
    case 'achievement':
      return `Achievement: ${achievementById(item.achievement)?.label ?? 'keep playing'}.`;
  }
}

export function isWearing(loadout: Loadout, id: string): boolean {
  if (isEmoteId(id)) return loadout.gestures.includes(id);
  const slot = slotOf(id);
  return !!slot && loadout[slot] === id;
}

export type CardStatus = 'equipped' | 'owned' | 'buy' | 'locked';
export function cardStatus(profile: Profile, item: CatalogueItem): CardStatus {
  if (owns(profile, item.id)) return isWearing(profile.loadout, item.id) ? 'equipped' : 'owned';
  return item.unlock === 'shop' ? 'buy' : 'locked';
}

/** One item: card art, name, rarity stripe and its price or state. */
export function ItemCard({ item, status, price, fullPrice, selected, onClick, testId }: { item: CatalogueItem; status: CardStatus; price: number; fullPrice?: number; selected: boolean; onClick: () => void; testId?: string }) {
  const style = { '--rarity': RARITY_COLOURS[item.rarity] } as CSSProperties;
  return (
    <button
      className={`shop-card shop-card--${status}${selected ? ' shop-card--on' : ''}`}
      style={style}
      aria-pressed={selected}
      aria-label={`${item.name}, ${RARITY_LABELS[item.rarity]}, ${status === 'buy' ? cogText(price) : status === 'locked' ? 'locked' : status}`}
      data-testid={testId ?? `shop-item-${item.id}`}
      onClick={onClick}
    >
      <span className="shop-card__art">
        <ItemIcon id={item.id} size={44} />
      </span>
      <span className="shop-card__name">{item.name}</span>
      <span className="shop-card__foot">
        {status === 'equipped' && <span className="shop-card__tag shop-card__tag--equipped">Equipped</span>}
        {status === 'owned' && <span className="shop-card__tag">Owned</span>}
        {status === 'buy' && (
          <span className="shop-card__price">
            <CogIcon size={16} />
            {price}
            {fullPrice !== undefined && fullPrice !== price && <s>{fullPrice}</s>}
          </span>
        )}
        {status === 'locked' && (
          <span className="shop-card__tag shop-card__tag--locked">
            <PadlockIcon size={14} /> {item.unlock === 'secret' ? 'Secret' : 'Earned'}
          </span>
        )}
      </span>
    </button>
  );
}

/** The four gestures on keys 1–4. With `pending`, tapping a slot puts that gesture there. */
export function GestureSlots({ gestures, pending, onSlot }: { gestures: EmoteId[]; pending: EmoteId | null; onSlot: (index: number) => void }) {
  return (
    <div className="gesture-slots" role="group" aria-label="Equipped gestures (keys 1 to 4)">
      {gestures.map((g, i) => (
        <button key={i} className={`gesture-slot${pending ? ' gesture-slot--target' : ''}`} data-testid={`gesture-slot-${i + 1}`} onClick={() => onSlot(i)} aria-label={pending ? `Put ${EMOTE_LABELS[pending]} on key ${i + 1} (now ${EMOTE_LABELS[g]})` : `Key ${i + 1}: ${EMOTE_LABELS[g]}`}>
          <span className="gesture-slot__key">{i + 1}</span>
          <GestureGlyph id={g} size={24} />
          <span className="gesture-slot__name">{EMOTE_LABELS[g]}</span>
        </button>
      ))}
    </div>
  );
}

/** Show an item on the turntable toy: wear it (try-on) or play the gesture. Turns the toy for keys and back items. */
export function previewItem(id: string) {
  const item = itemById(id);
  if (!item) return;
  if (isEmoteId(id)) {
    events.emit('workshop:view', { back: false });
    events.emit('toy:preview-gesture', { id });
    return;
  }
  const slot = slotOf(id);
  if (!slot) return;
  const g = useGame.getState();
  g.set({ tryOn: { ...(g.tryOn ?? {}), [slot]: id } });
  events.emit('workshop:view', { back: slot === 'keySkin' || slot === 'back' });
}

/** Drop the try-on for one slot (after equipping, or when the item is taken off). */
export function clearTryOn(slot: keyof Loadout) {
  const g = useGame.getState();
  if (!g.tryOn || !(slot in g.tryOn)) return;
  const next = { ...g.tryOn };
  delete next[slot];
  g.set({ tryOn: Object.keys(next).length ? next : null });
}
