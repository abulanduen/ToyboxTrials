/**
 * The Odds & Ends shop: spend cogs on paints, hats, keys, accessories and gestures. Shares the
 * Workshop's turntable (screen 'workshop', workshopMode 'shop'): picking a card tries the item on
 * the toy before you buy it, or plays the gesture. Rules live in src/game/economy.ts.
 */
import { useMemo, useState } from 'react';
import { useGame } from '../game/store';
import { sfx } from '../game/audio';
import { RARITY_COLOURS, RARITY_LABELS, itemById, itemsIn, SLOT_LABELS, ACCESSORY_SLOTS, type Category } from '../game/cosmetics';
import { isEmoteId, EMOTE_LABELS, type EmoteId } from '../game/emotes';
import { BUY_ERROR_TEXT, FEATURED_DISCOUNT, cogText, dateKey, featuredFor, priceFor } from '../game/economy';
import { owns, slotOf } from '../game/profile';
import { ToyButton } from './common';
import { CategoryTabs, CogCount, GestureSlots, ItemCard, cardStatus, clearTryOn, previewItem, unlockText } from './Catalogue';

export function ShopScreen() {
  const profile = useGame((s) => s.profile);
  const workshopReturn = useGame((s) => s.workshopReturn);
  const [tab, setTab] = useState<Category>('paint');
  const [sel, setSel] = useState<string | null>(null);
  const [note, setNote] = useState<{ text: string; tone: 'good' | 'bad' } | null>(null);
  // The featured row changes at local midnight; the shop reads the date when it opens.
  const today = useMemo(() => dateKey(new Date()), []);
  const featured = useMemo(() => featuredFor(today), [today]);
  const item = sel ? itemById(sel) : undefined;

  const done = () => useGame.getState().goTo(workshopReturn === 'workshop' ? 'menu' : workshopReturn);
  const pick = (id: string) => {
    sfx.tick();
    setSel(id);
    setNote(null);
    previewItem(id);
  };
  const buy = (id: string) => {
    const r = useGame.getState().buy(id);
    if (r.ok) {
      sfx.purchase();
      setNote({ text: `Bought ${itemById(id)?.name}! −${cogText(r.price)}`, tone: 'good' });
    } else {
      sfx.bump();
      setNote({ text: BUY_ERROR_TEXT[r.error], tone: 'bad' });
    }
  };
  const equip = (id: string, gestureSlot?: number) => {
    const r = useGame.getState().equip(id, gestureSlot);
    if (!r.ok) return;
    sfx.windUp(5);
    const slot = slotOf(id);
    if (slot) clearTryOn(slot);
    setNote({ text: isEmoteId(id) ? `${EMOTE_LABELS[id]} is on key ${(gestureSlot ?? 0) + 1}.` : `Equipped ${itemById(id)?.name}.`, tone: 'good' });
  };
  const takeOff = (slot: 'hat' | 'back' | 'face' | 'neck') => {
    useGame.getState().unequip(slot);
    clearTryOn(slot);
    sfx.click();
    setNote(null);
  };

  const card = (id: string, testId?: string) => {
    const it = itemById(id)!;
    const status = cardStatus(profile, it);
    return <ItemCard key={`${testId ?? ''}${id}`} item={it} status={status} price={priceFor(it, today)} fullPrice={it.price} selected={sel === id} onClick={() => pick(id)} testId={testId} />;
  };

  const status = item ? cardStatus(profile, item) : null;
  const price = item ? priceFor(item, today) : 0;
  const slot = item ? slotOf(item.id) : null;

  return (
    <div className="workshop-layer">
      <div className="workshop-hint">Pick anything to try it on</div>
      <section className="cardboard-panel workshop-panel shop-panel" aria-label="Odds & Ends shop" data-testid="shop">
        <div className="tape tape--l" />
        <div className="tape tape--r" />
        <div className="shop-head">
          <h2>Odds &amp; Ends</h2>
          <CogCount value={profile.wallet.cogs} testId="wallet" className="shop-wallet" />
        </div>

        <div className="shop-featured" aria-label="Today's featured items">
          <div className="shop-featured__title">
            Today’s picks <span>{Math.round(FEATURED_DISCOUNT * 100)}% off</span>
          </div>
          <div className="shop-grid shop-grid--featured">{featured.map((id) => card(id, `featured-${id}`))}</div>
        </div>

        <CategoryTabs value={tab} onChange={(c) => (setTab(c), setNote(null))} testPrefix="shop-tab" />

        {tab === 'accessory' ? (
          ACCESSORY_SLOTS.map((s) => (
            <div key={s} className="shop-group">
              <h3 className="shop-group__title">{SLOT_LABELS[s]}</h3>
              <div className="shop-grid">{itemsIn('accessory', s).map((i) => card(i.id))}</div>
            </div>
          ))
        ) : (
          <div className="shop-grid">{itemsIn(tab).map((i) => card(i.id))}</div>
        )}

        <div className="shop-detail" aria-live="polite" data-testid="shop-detail">
          {item ? (
            <>
              <div className="shop-detail__head">
                <strong>{item.name}</strong>
                <span className="rarity-chip" style={{ background: RARITY_COLOURS[item.rarity] }}>
                  {RARITY_LABELS[item.rarity]}
                </span>
              </div>
              <span className="shop-detail__blurb">{item.blurb}</span>
              <span className="shop-detail__how">{status === 'equipped' ? 'Equipped.' : status === 'owned' ? 'You own this.' : unlockText(item)}</span>
              {note && <span className={`shop-note shop-note--${note.tone}`} data-testid="shop-note">{note.text}</span>}
              <div className="shop-detail__actions">
                {status === 'buy' && (
                  <ToyButton tone={profile.wallet.cogs >= price ? 'honey' : 'ink'} onClick={() => buy(item.id)} testId="shop-buy">
                    Buy · {price}
                  </ToyButton>
                )}
                {isEmoteId(item.id) && (
                  <ToyButton tone="blue" onClick={() => previewItem(item.id)} testId="shop-play">
                    Play
                  </ToyButton>
                )}
                {owns(profile, item.id) && slot && status === 'owned' && (
                  <ToyButton tone="sage" onClick={() => equip(item.id)} testId="shop-equip">
                    Equip
                  </ToyButton>
                )}
                {status === 'equipped' && slot && slot !== 'paint' && slot !== 'keySkin' && (
                  <ToyButton tone="ink" onClick={() => takeOff(slot)} testId="shop-unequip">
                    Take off
                  </ToyButton>
                )}
              </div>
              {isEmoteId(item.id) && owns(profile, item.id) && (
                <div className="shop-gestures">
                  <span>Put it on a key:</span>
                  <GestureSlots gestures={profile.loadout.gestures} pending={item.id as EmoteId} onSlot={(i) => equip(item.id, i)} />
                </div>
              )}
            </>
          ) : (
            <>
              <strong>Welcome in!</strong>
              <span>Earn cogs by playing trials, finding secrets and winning tournaments. Pick anything to try it on.</span>
            </>
          )}
        </div>

        <div className="pause__actions">
          <ToyButton onClick={done} autoFocus testId="shop-done">
            {workshopReturn === 'playing' ? 'Back to the Playroom' : 'Done'}
          </ToyButton>
          <ToyButton tone="blue" onClick={() => useGame.getState().openWorkshop()} testId="shop-to-workshop">
            Workshop
          </ToyButton>
        </div>
      </section>
    </div>
  );
}
