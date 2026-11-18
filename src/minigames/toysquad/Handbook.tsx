/** Toy Handbook: every unit with its picture, rarity, traits and kit, and a star toggle for favourites. */
import { memo, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { useGame } from '../../game/store';
import { ABILITIES, RARITIES, RARITY_COLOURS, ROSTER, type Rarity } from './catalogue';
import type { Trait } from './kits';
import { handbookEntries, toggleFavourite } from './info';
import { portraitCount, subscribePortraits, toyPortrait } from './portraits';
import { CloseIcon, StarIcon, TRAITS, TraitIcon } from './TraitIcon';

export const Handbook = memo(function Handbook({ onClose }: { onClose: () => void }) {
  const [rarity, setRarity] = useState<Rarity | null>(null), [trait, setTrait] = useState<Trait | null>(null);
  const favourites = useGame(s => s.squadFavourites);
  useSyncExternalStore(subscribePortraits, portraitCount); // re-render as pictures finish drawing
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => { close.current?.focus(); }, []);
  const ids = handbookEntries(rarity, trait);
  return <div className="squad-modal squad-handbook" data-testid="squad-handbook" role="dialog" aria-modal="true" aria-labelledby="squad-handbook-title">
    <div className="squad-modal__card squad-handbook__card">
      <header className="squad-panel__head">
        <strong id="squad-handbook-title">Toy Handbook · {ids.length} of {Object.keys(ROSTER).length} toys</strong>
        <button ref={close} className="squad-close" data-testid="squad-handbook-close" onClick={onClose}><CloseIcon /> Close</button>
      </header>
      <p>Star the toys you want. A starred toy shows a star on its shop card whenever it is offered.</p>
      <div className="squad-filters" aria-label="Filter by rarity">
        {RARITIES.map(r => <button key={r} data-testid={`squad-filter-rarity-${r}`} aria-pressed={rarity === r} style={{ '--rarity': RARITY_COLOURS[r] } as CSSProperties} onClick={() => setRarity(rarity === r ? null : r)}>{r}</button>)}
      </div>
      <div className="squad-filters" aria-label="Filter by trait">
        {TRAITS.map(t => <button key={t} data-testid={`squad-filter-trait-${t}`} aria-pressed={trait === t} onClick={() => setTrait(trait === t ? null : t)}><TraitIcon trait={t} size={22} />{t}</button>)}
      </div>
      <ul className="squad-handbook__list">
        {ids.map(id => {
          const def = ROSTER[id], starred = favourites.includes(id), picture = toyPortrait(id);
          return <li key={id} data-testid={`squad-handbook-${id}`} data-rarity={def.rarity} style={{ '--rarity': RARITY_COLOURS[def.rarity] } as CSSProperties}>
            <span className="squad-card__picture">{picture && <img src={picture} alt="" draggable={false} />}</span>
            <span className="squad-handbook__text">
              <strong>{def.name} · {def.cost}c</strong>
              <span className="squad-card__rarity">{def.rarity}</span>
              <span className="squad-trait-tags">{def.traits.map(t => <span key={t}><TraitIcon trait={t} size={18} />{t}</span>)}</span>
              <small>HP {def.hp} · Hit {def.damage} · Range {def.range} · {ABILITIES[def.ability]}</small>
              <small><b>Passive — {def.passive.name}:</b> {def.passive.description}</small>
              <small><b>Spell — {def.spell.name} ({def.spell.mana} mana):</b> {def.spell.description}</small>
            </span>
            <button className="squad-star" data-testid={`squad-star-${id}`} aria-pressed={starred} aria-label={`${starred ? 'Remove star from' : 'Star'} ${def.name}`}
              onClick={() => useGame.setState({ squadFavourites: toggleFavourite(useGame.getState().squadFavourites, id) })}><StarIcon size={26} on={starred} /></button>
          </li>;
        })}
      </ul>
    </div>
  </div>;
});
