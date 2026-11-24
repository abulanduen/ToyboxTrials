/**
 * The Workshop: customise the contender on a turntable (drag the scene to spin it). Equip owned
 * paint jobs, hats, keys, accessories (back, face, neck) and the four gestures on keys 1–4.
 * Locked items say how to get them: a Playroom secret, an achievement, or the Odds & Ends shop.
 * The same screen hosts the shop (ShopScreen) when `workshopMode` is 'shop'.
 */
import { useState } from 'react';
import { useGame } from '../game/store';
import { sfx } from '../game/audio';
import { events } from '../game/events';
import { ACCESSORY_SLOTS, HATS, SLOT_LABELS, itemById, itemsIn, type AccessorySlot, type CatalogueItem, type Category } from '../game/cosmetics';
import { EMOTE_LABELS, isEmoteId, type EmoteId } from '../game/emotes';
import { owns } from '../game/profile';
import { ToyButton } from './common';
import { PadlockIcon } from './icons';
import { ItemIcon } from './itemIcons';
import { CategoryTabs, CogCount, GestureSlots, isWearing, unlockText } from './Catalogue';
import { ShopScreen } from './ShopScreen';
import { CoachMarks } from './CoachMarks';

export function WorkshopScreen() {
  const mode = useGame((s) => s.workshopMode);
  return mode === 'shop' ? <ShopScreen /> : <Workshop />;
}

/** A swatch button (the Workshop's compact item tile). */
function Swatch({ id, name, on, unlocked, category, onClick }: { id: string; name: string; on: boolean; unlocked: boolean; category: Category; onClick: () => void }) {
  return (
    <button
      role="option"
      aria-selected={on}
      aria-label={unlocked ? name : `${name}, locked`}
      className={`swatch${on ? ' swatch--on' : ''}${unlocked ? '' : ' swatch--locked'}`}
      data-testid={`swatch-${id}`}
      onClick={onClick}
    >
      <ItemIcon id={id} category={category} size={category === 'paint' ? 42 : 40} />
      <span className="swatch__label">{name}</span>
      {!unlocked && (
        <span className="swatch__lock">
          <PadlockIcon />
        </span>
      )}
    </button>
  );
}

function Workshop() {
  const s = useGame();
  const profile = s.profile;
  const loadout = profile.loadout;
  const [tab, setTab] = useState<Category>('paint');
  const [info, setInfo] = useState<{ name: string; blurb: string } | null>(null);
  const [pending, setPending] = useState<EmoteId | null>(null);

  const done = () => s.goTo(s.workshopReturn === 'workshop' ? 'menu' : s.workshopReturn);

  const choose = (item: CatalogueItem) => {
    if (!owns(profile, item.id)) {
      sfx.bump();
      setInfo({ name: `${item.name} (locked)`, blurb: unlockText(item) });
      return;
    }
    if (isEmoteId(item.id)) {
      sfx.click();
      setPending(item.id);
      events.emit('toy:preview-gesture', { id: item.id });
      setInfo({ name: item.name, blurb: `${item.blurb} Now tap a key slot above to put it there.` });
      return;
    }
    sfx.windUp(5);
    s.equip(item.id);
    setInfo({ name: item.name, blurb: item.blurb });
  };

  const takeOff = (slot: 'hat' | AccessorySlot) => {
    sfx.windUp(3);
    s.unequip(slot);
    setInfo(slot === 'hat' ? { name: 'Bare turret', blurb: 'Factory standard.' } : { name: `No ${SLOT_LABELS[slot].toLowerCase()} item`, blurb: 'Travelling light.' });
  };

  const swatches = (items: CatalogueItem[]) =>
    items.map((i) => <Swatch key={i.id} id={i.id} name={i.name} category={i.category} on={isWearing(loadout, i.id)} unlocked={owns(profile, i.id)} onClick={() => choose(i)} />);

  const onSlot = (index: number) => {
    if (pending) {
      sfx.windUp(5);
      s.equip(pending, index);
      setInfo({ name: EMOTE_LABELS[pending], blurb: `On key ${index + 1}.` });
      setPending(null);
    } else {
      events.emit('toy:preview-gesture', { id: loadout.gestures[index] });
    }
  };

  const hint: Record<Category, string> = {
    paint: 'Pick a paint job.',
    hat: 'Pick a hat.',
    key: 'Pick a wind-up key.',
    accessory: 'One item each on the back, face and neck.',
    gesture: 'Tap a gesture, then a key slot. Keys 1–4 or the Emote button play them.',
  };

  return (
    <div className="workshop-layer">
      <div className="workshop-hint">Drag to spin your contender</div>
      <section className="cardboard-panel workshop-panel" aria-label="Workshop">
        <div className="tape tape--l" />
        <div className="tape tape--r" />
        <div className="shop-head">
          <h2>The Workshop</h2>
          <CogCount value={profile.wallet.cogs} className="shop-wallet" />
        </div>
        <label className="workshop-name" data-coach="workshop-name">
          <span>Name</span>
          <input
            value={s.contenderName}
            maxLength={14}
            onChange={(e) => s.set({ contenderName: e.target.value.replace(/[^\p{L}\p{N} '\-]/gu, '') })}
            onBlur={() => !s.contenderName.trim() && s.set({ contenderName: 'Ticker' })}
            aria-label="Contender name"
          />
        </label>

        <CategoryTabs
          value={tab}
          testPrefix="workshop-tab"
          coach="workshop-tabs"
          onChange={(c) => {
            setTab(c);
            setInfo(null);
            setPending(null);
            events.emit('workshop:view', { back: c === 'key' });
          }}
        />

        {tab === 'gesture' && <GestureSlots gestures={loadout.gestures} pending={pending} onSlot={onSlot} />}

        {tab === 'accessory' ? (
          ACCESSORY_SLOTS.map((slot) => (
            <div key={slot} className="shop-group">
              <h3 className="shop-group__title">{SLOT_LABELS[slot]}</h3>
              <div className="swatches" role="listbox" aria-label={SLOT_LABELS[slot]}>
                <Swatch id="none" name="None" category="accessory" on={loadout[slot] === 'none'} unlocked onClick={() => takeOff(slot)} />
                {swatches(itemsIn('accessory', slot))}
              </div>
            </div>
          ))
        ) : (
          <div className="swatches" role="listbox" aria-label={tab} data-coach="workshop-items">
            {tab === 'hat' && <Swatch id="none" name={HATS[0].name} category="hat" on={loadout.hat === 'none'} unlocked onClick={() => takeOff('hat')} />}
            {swatches(itemsIn(tab))}
          </div>
        )}

        <div className="workshop-info" aria-live="polite">
          {info ? (
            <>
              <strong>{info.name}</strong>
              <span>{info.blurb}</span>
            </>
          ) : (
            <>
              <strong>{itemById(loadout.paint)?.name}</strong>
              <span>{hint[tab]} Secrets, achievements and the Odds &amp; Ends shop unlock more.</span>
            </>
          )}
        </div>

        <div className="pause__actions" data-coach="workshop-actions">
          <ToyButton onClick={done} autoFocus testId="workshop-done">
            {s.workshopReturn === 'playing' ? 'Back to the Playroom' : 'Done'}
          </ToyButton>
          <ToyButton tone="blue" onClick={() => s.openShop()} testId="workshop-to-shop">
            Shop
          </ToyButton>
        </div>
      </section>
      <CoachMarks tour="workshop" />
    </div>
  );
}
