/**
 * The Workshop: customise the contender on a turntable (drag the scene to spin it).
 * Paint jobs, hats and key skins; some are unlocked by Playroom secrets.
 */
import { useState } from 'react';
import { useGame } from '../game/store';
import { sfx } from '../game/audio';
import { events } from '../game/events';
import { PAINT_JOBS } from '../game/palette';
import { HATS, KEY_SKINS, SECRET_LABELS, isUnlocked, type Cosmetic } from '../game/cosmetics';
import { ToyButton } from './common';
import { HatIcon, KeySkinIcon, PadlockIcon } from './icons';

type Tab = 'paint' | 'hat' | 'key';

export function WorkshopScreen() {
  const s = useGame();
  const [tab, setTab] = useState<Tab>('paint');
  const paint = PAINT_JOBS[s.paintIndex % PAINT_JOBS.length];
  const [info, setInfo] = useState<{ name: string; blurb: string } | null>(null);

  const done = () => s.goTo(s.workshopReturn === 'workshop' ? 'menu' : s.workshopReturn);

  const choose = <Id extends string>(item: Cosmetic<Id>, apply: () => void) => {
    if (!isUnlocked(item, s.secretsFound)) {
      sfx.bump();
      setInfo({ name: `${item.name} (locked)`, blurb: SECRET_LABELS[item.unlockedBy!] ?? 'Keep exploring.' });
      return;
    }
    sfx.windUp(5);
    apply();
    setInfo({ name: item.name, blurb: item.blurb });
  };

  return (
    <div className="workshop-layer">
      <div className="workshop-hint">Drag to spin your contender</div>
      <section className="cardboard-panel workshop-panel" aria-label="Workshop">
        <div className="tape tape--l" />
        <div className="tape tape--r" />
        <h2>The Workshop</h2>
        <label className="workshop-name">
          <span>Name</span>
          <input
            value={s.contenderName}
            maxLength={14}
            onChange={(e) => s.set({ contenderName: e.target.value.replace(/[^\p{L}\p{N} '\-]/gu, '') })}
            onBlur={() => !s.contenderName.trim() && s.set({ contenderName: 'Ticker' })}
            aria-label="Contender name"
          />
        </label>

        <div className="workshop-tabs" role="tablist">
          {(
            [
              ['paint', 'Paint'],
              ['hat', 'Hats'],
              ['key', 'Keys'],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              className={tab === id ? 'on' : ''}
              onClick={() => {
                sfx.click();
                setTab(id);
                setInfo(null);
                events.emit('workshop:view', { back: id === 'key' });
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="swatches" role="listbox" aria-label={tab}>
          {tab === 'paint' &&
            PAINT_JOBS.map((p, i) => {
              const on = s.paintIndex % PAINT_JOBS.length === i;
              return (
                <button
                  key={p.name}
                  role="option"
                  aria-selected={on}
                  aria-label={p.name}
                  className={`swatch${on ? ' swatch--on' : ''}`}
                  onClick={() => {
                    sfx.windUp(5);
                    s.set({ paintIndex: i });
                    setInfo({ name: p.name, blurb: 'Fresh coat, still tacky.' });
                  }}
                >
                  <span className="swatch__paint" style={{ background: `conic-gradient(${p.body} 0 55%, ${p.trim} 55% 80%, ${p.accent} 80% 100%)` }} />
                  <span className="swatch__label">{p.name}</span>
                </button>
              );
            })}
          {tab === 'hat' &&
            HATS.map((h) => {
              const unlocked = isUnlocked(h, s.secretsFound);
              const on = s.hat === h.id;
              return (
                <button
                  key={h.id}
                  role="option"
                  aria-selected={on}
                  aria-label={unlocked ? h.name : `${h.name}, locked`}
                  className={`swatch${on ? ' swatch--on' : ''}${unlocked ? '' : ' swatch--locked'}`}
                  onClick={() => choose(h, () => s.set({ hat: h.id }))}
                >
                  <HatIcon id={h.id} />
                  <span className="swatch__label">{h.name}</span>
                  {!unlocked && (
                    <span className="swatch__lock">
                      <PadlockIcon />
                    </span>
                  )}
                </button>
              );
            })}
          {tab === 'key' &&
            KEY_SKINS.map((k) => {
              const unlocked = isUnlocked(k, s.secretsFound);
              const on = s.keySkin === k.id;
              return (
                <button
                  key={k.id}
                  role="option"
                  aria-selected={on}
                  aria-label={unlocked ? k.name : `${k.name}, locked`}
                  className={`swatch${on ? ' swatch--on' : ''}${unlocked ? '' : ' swatch--locked'}`}
                  onClick={() => choose(k, () => s.set({ keySkin: k.id }))}
                >
                  <KeySkinIcon id={k.id} />
                  <span className="swatch__label">{k.name}</span>
                  {!unlocked && (
                    <span className="swatch__lock">
                      <PadlockIcon />
                    </span>
                  )}
                </button>
              );
            })}
        </div>

        <div className="workshop-info" aria-live="polite">
          {info ? (
            <>
              <strong>{info.name}</strong>
              <span>{info.blurb}</span>
            </>
          ) : (
            <>
              <strong>{paint.name}</strong>
              <span>Pick a {tab === 'paint' ? 'paint job' : tab === 'hat' ? 'hat' : 'key'}. Secrets in the Playroom unlock more.</span>
            </>
          )}
        </div>

        <div className="pause__actions">
          <ToyButton onClick={done} autoFocus testId="workshop-done">
            {s.workshopReturn === 'playing' ? 'Back to the Playroom' : 'Done'}
          </ToyButton>
        </div>
      </section>
    </div>
  );
}
