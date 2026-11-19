/**
 * Main menu over the live 3D diorama (the camera frames the contender in front of the village).
 * Landscape: sign + menu on the left, contender on the right. Portrait: contender on top, menu below.
 */
import { useEffect } from 'react';
import { useGame } from '../game/store';
import { sfx, unlockAudio } from '../game/audio';
import { HATS, itemById, paintJobFor } from '../game/cosmetics';
import { CogCount } from './Catalogue';
import { SECRET_IDS } from '../game/interactables';
import { CardboardSheet, KeyCap, SettingsForm, ToyButton } from './common';
import { GearIcon, StarSticker, TickerBadge } from './icons';
import { openOnlineSheet } from './OnlineUI';
import { useNet } from '../net/store';

export function MainMenu() {
  const s = useGame();
  const loadout = s.profile.loadout;
  const paint = paintJobFor(loadout.paint);
  const paintName = itemById(loadout.paint)?.name ?? '';
  const hatName = HATS.find((h) => h.id === loadout.hat)?.name ?? '';

  const play = () => {
    unlockAudio();
    sfx.windUp(10);
    s.goTo('playing');
  };

  // Enter starts (only when no sheet is open and focus isn't on another control).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (useGame.getState().menuSheet || useNet.getState().sheetOpen) return;
      const el = document.activeElement as HTMLElement | null;
      const onOtherButton = el && el.tagName === 'BUTTON' && !el.dataset.testid?.startsWith('menu-play');
      if ((e.code === 'Enter' || e.code === 'Space') && !onOtherButton) {
        e.preventDefault();
        play();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="menu-layer">
      <div className="menu-column">
        <div className="menu-sign">
          <div className="title-sign__nail title-sign__nail--l" />
          <div className="title-sign__nail title-sign__nail--r" />
          <h1 className="title-logo menu-logo" aria-label="Toybox Trials">
            <span className="title-logo__top">Toybox</span>
            <span className="title-logo__bottom">Trials</span>
          </h1>
          <p className="title-tagline">Tiny contenders. Big chaos.</p>
        </div>

        <nav className="menu-buttons" aria-label="Main menu">
          <ToyButton onClick={play} autoFocus className="menu-btn menu-btn--primary" testId="menu-play">
            Play
          </ToyButton>
          <ToyButton tone="blue" onClick={() => s.openWorkshop()} className="menu-btn" testId="menu-workshop">
            Workshop
          </ToyButton>
          <div className="menu-row">
            <ToyButton tone="ink" onClick={() => s.set({ menuSheet: 'settings' })} className="menu-btn menu-btn--small" testId="menu-settings">
              Settings
            </ToyButton>
            <ToyButton tone="ink" onClick={() => s.set({ menuSheet: 'howto' })} className="menu-btn menu-btn--small" testId="menu-howto">
              How to play
            </ToyButton>
          </div>
        </nav>
        <div className="menu-online menu-row">
          <ToyButton tone="coral" onClick={() => s.openShop()} className="menu-btn menu-btn--online" testId="menu-shop">
            Shop
          </ToyButton>
          <ToyButton tone="sage" onClick={openOnlineSheet} className="menu-btn menu-btn--online" testId="menu-online">
            Play online
          </ToyButton>
        </div>

        <div className="menu-contender card-felt">
          <TickerBadge size={44} body={paint.body} trim={paint.trim} accent={paint.accent} />
          <div>
            <strong>{s.contenderName || 'Contender'}</strong>
            <span>
              {paintName}
              {loadout.hat !== 'none' ? ` · ${hatName}` : ''}
            </span>
          </div>
          <div className="menu-contender__secrets" title="Playroom secrets found">
            <StarSticker size={20} />
            {s.secretsFound.length}/{SECRET_IDS.length}
          </div>
          <CogCount value={s.profile.wallet.cogs} testId="menu-cogs" className="menu-contender__cogs" />
        </div>
      </div>

      {!s.touchUI && (
        <p className="menu-hint">
          <KeyCap k="Enter" wide /> to play
        </p>
      )}
      <div className="ticket menu-ticket">
        <strong>Prototype · Milestone 3</strong>
        <span>Playroom hub + Workshop. Copycat Conductor plugs in at Milestone 4.</span>
      </div>

      {s.menuSheet === 'settings' && (
        <CardboardSheet title="Settings" icon={<GearIcon />} className="pause" onBackdrop={() => s.set({ menuSheet: null })}>
          <SettingsForm />
          <div className="pause__actions">
            <ToyButton onClick={() => s.set({ menuSheet: null })} autoFocus>
              Done
            </ToyButton>
          </div>
        </CardboardSheet>
      )}
      {s.menuSheet === 'howto' && <HowToPlay onClose={() => s.set({ menuSheet: null })} touch={s.touchUI} />}
    </div>
  );
}

function HowToPlay({ onClose, touch }: { onClose: () => void; touch: boolean }) {
  return (
    <CardboardSheet title="How to play" className="howto" onBackdrop={onClose}>
      <p className="panel__lead">
        Explore the Playroom, step through the gates to enter trials, and hunt for the four hidden secrets. Each secret unlocks something new in the Workshop. Trials, tournaments and secrets pay cogs to spend at the Odds &amp; Ends shop.
      </p>
      <div className="howto__cols">
        <div className={`howto__col${touch ? '' : ' howto__col--active'}`}>
          <h3>Keyboard &amp; mouse</h3>
          <ul>
            <li>
              <KeyCap k="W" />
              <KeyCap k="A" />
              <KeyCap k="S" />
              <KeyCap k="D" /> move · <KeyCap k="Shift" wide /> run
            </li>
            <li>
              <KeyCap k="Space" wide /> jump · <KeyCap k="E" /> interact
            </li>
            <li>Click the scene, then move the mouse to look</li>
            <li>
              <KeyCap k="Esc" wide /> pause
            </li>
          </ul>
        </div>
        <div className={`howto__col${touch ? ' howto__col--active' : ''}`}>
          <h3>Touch</h3>
          <ul>
            <li>Left thumb anywhere low-left: joystick (push to the rim to run)</li>
            <li>Drag anywhere else to look</li>
            <li>Jump button, plus a red action button near things you can use</li>
            <li>Gear button: pause</li>
          </ul>
        </div>
      </div>
      <div className="pause__actions">
        <ToyButton onClick={onClose} autoFocus>
          Got it
        </ToyButton>
      </div>
    </CardboardSheet>
  );
}
