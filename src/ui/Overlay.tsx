/**
 * All DOM UI layered over the 3D canvas: title card, HUD, pause/settings, info panels.
 * Styled as physical toy-world objects (wooden signs, cardboard, stickers, tickets, felt).
 */
import { useEffect, useRef, useState } from 'react';
import { useGame } from '../game/store';
import { events } from '../game/events';
import { PALETTE } from '../game/palette';
import { itemById } from '../game/cosmetics';
import { CogCount } from './Catalogue';
import { SECRET_IDS } from '../game/interactables';
import { MatchOverlay, TournamentPicker, unit } from './MatchOverlay';
import { MINIGAMES } from '../minigames/registry';
import { frameStats } from '../scene/PlayroomScene';
import { GearIcon, StarSticker, WindKeyIcon } from './icons';
import { TouchControls, tapInteract } from './TouchControls';
import { KeyCap, SettingsForm, ToyButton } from './common';
import { MainMenu } from './MainMenu';
import { WorkshopScreen } from './WorkshopScreen';
import { NameTags, OnlineChip, OnlineSheet, openOnlineSheet } from './OnlineUI';
import { useNet } from '../net/store';
import { leaveOnline } from '../net/client';

// ---------------------------------------------------------------- HUD
function Prompt() {
  const prompt = useGame((s) => s.prompt);
  const touch = useGame((s) => s.touchUI);
  if (!prompt) return null;
  if (touch)
    return (
      <button className="prompt prompt--touch" key={prompt.id} onClick={tapInteract}>
        <span className="prompt__tap" aria-hidden />
        <span className="prompt__verb">{prompt.verb}</span>
        <span className="prompt__label">{prompt.label}</span>
      </button>
    );
  return (
    <div className="prompt" key={prompt.id}>
      <KeyCap k="E" />
      <span className="prompt__verb">{prompt.verb}</span>
      <span className="prompt__label">{prompt.label}</span>
    </div>
  );
}

function Tickets() {
  const tickets = useGame((s) => s.tickets);
  return (
    <div className="tickets">
      {tickets.map((t) => (
        <div key={t.id} className={`ticket ticket--${t.tone}`}>
          {t.tone === 'reward' && <StarSticker size={26} />}
          <div>
            <strong>{t.title}</strong>
            <span>{t.body}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function Controls() {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    const id = window.setTimeout(() => setOpen(false), 14000);
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyH') setOpen((o) => !o);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener('keydown', onKey);
    };
  }, []);
  if (!open)
    return (
      <div className="controls controls--mini">
        <KeyCap k="H" /> controls
      </div>
    );
  return (
    <div className="controls card-felt">
      <div className="controls__row">
        <span className="controls__keys">
          <KeyCap k="W" />
          <KeyCap k="A" />
          <KeyCap k="S" />
          <KeyCap k="D" />
        </span>
        move
      </div>
      <div className="controls__row">
        <KeyCap k="Shift" wide /> run
      </div>
      <div className="controls__row">
        <KeyCap k="Space" wide /> jump
      </div>
      <div className="controls__row">
        <KeyCap k="E" /> interact
      </div>
      <div className="controls__row">
        <span className="controls__mouse" /> click &amp; move mouse to look
      </div>
      <div className="controls__row">
        <KeyCap k="1" />
        <KeyCap k="2" />
        <KeyCap k="3" />
        <KeyCap k="4" /> emotes
      </div>
      <div className="controls__row">
        <KeyCap k="Esc" wide /> pause · <KeyCap k="H" /> hide
      </div>
    </div>
  );
}

function BoostMeter() {
  const ref = useRef<HTMLDivElement>(null);
  const until = useRef(0);
  useEffect(() => {
    const off = events.on('player:boost', ({ seconds }) => {
      until.current = performance.now() + seconds * 1000;
    });
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!ref.current) return;
      const left = Math.max(0, until.current - performance.now());
      ref.current.style.setProperty('--fill', String(left / 8000));
      ref.current.style.opacity = left > 0 ? '1' : '0';
    };
    loop();
    return () => {
      off();
      cancelAnimationFrame(raf);
    };
  }, []);
  return (
    <div ref={ref} className="boost" style={{ opacity: 0 }}>
      <WindKeyIcon size={30} />
      <div className="boost__bar">
        <div className="boost__fill" />
      </div>
      <span>Fully wound!</span>
    </div>
  );
}

function Fps() {
  const show = useGame((s) => s.showFps);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!show) return;
    const id = window.setInterval(() => {
      if (ref.current) ref.current.textContent = `${frameStats.fps.toFixed(0)} fps · ${frameStats.frameMs.toFixed(1)} ms`;
    }, 500);
    return () => window.clearInterval(id);
  }, [show]);
  return show ? <div ref={ref} className="fps" /> : null;
}

/** Touch: brief hint, then gets out of the way. */
function LookHint() {
  const [show, setShow] = useState(true);
  useEffect(() => {
    const id = window.setTimeout(() => setShow(false), 9000);
    return () => window.clearTimeout(id);
  }, []);
  return show ? <div className="look-hint look-hint--touch">Drag the scene to look around</div> : null;
}

function Hud() {
  const secrets = useGame((s) => s.secretsFound.length);
  const name = useGame((s) => s.contenderName);
  const locked = useGame((s) => s.pointerLocked);
  const touch = useGame((s) => s.touchUI);
  const paintName = itemById(useGame((s) => s.profile.loadout.paint))?.name ?? '';
  const cogs = useGame((s) => s.profile.wallet.cogs);
  return (
    <>
      <div className="hud-sign">
        <span className="hud-sign__title">The Playroom</span>
        <span className="hud-sign__sub">{name || paintName}</span>
      </div>
      <div className="hud-secrets" title="Playroom secrets found">
        <StarSticker size={24} />
        <span>
          {secrets}/{SECRET_IDS.length}
        </span>
      </div>
      <CogCount value={cogs} testId="hud-cogs" className="hud-cogs" />
      <Prompt />
      <OnlineChip />
      <Tickets />
      {touch ? <TouchControls /> : <Controls />}
      <BoostMeter />
      {touch ? <LookHint /> : !locked && <div className="look-hint">Click the scene to look around</div>}
      <Fps />
    </>
  );
}

// ---------------------------------------------------------------- Pause / settings
function PauseMenu() {
  const s = useGame();
  return (
    <div className="modal-layer">
      <div className="cardboard-panel pause" role="dialog" aria-label="Paused">
        <div className="tape tape--l" />
        <div className="tape tape--r" />
        <h2>
          <GearIcon /> Paused
        </h2>
        <SettingsForm />
        <div className="pause__actions">
          <ToyButton onClick={() => s.togglePause(false)} autoFocus>
            Resume
          </ToyButton>
          <ToyButton tone="blue" onClick={() => s.openWorkshop()}>
            Workshop
          </ToyButton>
          <ToyButton tone="ink" onClick={() => s.goTo('menu')}>
            Main menu
          </ToyButton>
        </div>
        <PauseShop />
        <PauseOnline />
      </div>
    </div>
  );
}

/** Shop section of the pause menu: the wallet and a way into Odds & Ends. */
function PauseShop() {
  const cogs = useGame((s) => s.profile.wallet.cogs);
  return (
    <div className="pause__online pause__shop">
      <span>
        <CogCount value={cogs} /> Spend cogs at Odds &amp; Ends.
      </span>
      <ToyButton tone="honey" onClick={() => useGame.getState().openShop()} testId="pause-shop">
        Shop
      </ToyButton>
    </div>
  );
}

/** Online section of the pause menu: join from here, or see the room and leave. */
function PauseOnline() {
  const status = useNet((n) => n.status);
  const room = useNet((n) => n.room);
  const count = useNet((n) => n.players.length);
  if (status === 'offline' || status === 'connecting' || !room)
    return (
      <div className="pause__online">
        <span>Play with friends in the same Playroom.</span>
        <ToyButton tone="sage" onClick={openOnlineSheet} testId="pause-online">
          Play online
        </ToyButton>
      </div>
    );
  return (
    <div className="pause__online">
      <span>
        {room.kind === 'private' ? `Online in room ${room.code}` : `Online in Public Hub ${room.instance}`} · {count} {count === 1 ? 'toy' : 'toys'}
      </span>
      <ToyButton tone="ink" onClick={() => leaveOnline()} testId="pause-leave-online">
        Leave online
      </ToyButton>
    </div>
  );
}

/** Shown until the first frames have rendered (texture generation + shader compile). */
function LoadingCard() {
  const ready = useGame((s) => s.ready);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    if (!ready) return;
    const id = window.setTimeout(() => setGone(true), 450);
    return () => window.clearTimeout(id);
  }, [ready]);
  if (gone) return null;
  return (
    <div className={`loading${ready ? ' loading--out' : ''}`} aria-live="polite">
      <div className="loading__key">
        <WindKeyIcon size={64} />
      </div>
      <span>Winding up the Playroom…</span>
    </div>
  );
}

// ---------------------------------------------------------------- Panels
function Panel() {
  const panel = useGame((s) => s.panel);
  const touchUI = useGame((s) => s.touchUI);
  const records = useGame((s) => s.records);
  const tWins = useGame((s) => s.tournamentWins);
  const close = useGame((s) => s.closePanel);
  const secrets = useGame((s) => s.secretsFound);
  if (!panel) return null;
  return (
    <div className="modal-layer" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="cardboard-panel info-panel" style={{ ['--accent' as string]: panel.accent ?? PALETTE.honey }}>
        <div className="tape tape--l" />
        <div className="tape tape--r" />
        <div className="info-panel__flag" />
        <h2>{panel.title}</h2>
        {panel.subtitle && <div className="info-panel__sub">{panel.subtitle}</div>}
        {panel.kind === 'tournament' && <TournamentPicker onClose={close} />}
        {panel.kind === 'preview' && <p className="panel__lead">{panel.body}</p>}
        {panel.kind === 'scoreboard' && (
          <div className="scoreboard">
            <div className="scoreboard__row">
              <span>Playroom secrets</span>
              <strong>
                {secrets.length} / {SECRET_IDS.length}
              </strong>
            </div>
            {SECRET_IDS.map((id) => (
              <div key={id} className={`scoreboard__row${secrets.includes(id) ? '' : ' scoreboard__row--hidden'}`}>
                <span>{secrets.includes(id) ? SECRET_NAMES[id] : '? ? ?'}</span>
                {secrets.includes(id) && <StarSticker size={18} />}
              </div>
            ))}
            {MINIGAMES.filter((g) => g.status === 'playable').map((g) => {
              const r = records[g.id];
              return (
                <div key={g.id} className="scoreboard__row">
                  <span>{g.title} best</span>
                  <strong>{r ? `${r.best} ${unit(g.recordUnit, r.best)}` : 'not played yet'}</strong>
                </div>
              );
            })}
            <div className="scoreboard__row scoreboard__row--muted">
              <span>Tournament wins</span>
              <strong>
                Blitz {tWins.blitz ?? 0} · Normal {tWins.normal ?? 0} · Treasure {tWins.treasure ?? 0}
              </strong>
            </div>
          </div>
        )}
        {panel.kind !== 'tournament' && (
          <div className="panel__actions">
            <ToyButton tone="ink" onClick={close} autoFocus>
              Back to the square
            </ToyButton>
            {!touchUI && (
              <span className="panel__esc">
                or <KeyCap k="Esc" wide />
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const SECRET_NAMES: Record<string, string> = {
  musicbox: 'Forgotten music box',
  marble: 'The rolling marble',
  jack: 'Jack-in-the-box ambush',
  key: 'The golden key',
};

// ---------------------------------------------------------------- Root
export function Overlay() {
  const screen = useGame((s) => s.screen);
  const paused = useGame((s) => s.paused);
  const panel = useGame((s) => s.panel);
  const onlineSheet = useNet((s) => s.sheetOpen);

  // Esc closes the top-most DOM layer (the canvas loop handles in-game Esc → pause).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return;
      const g = useGame.getState();
      const net = useNet.getState();
      if (net.sheetOpen) {
        if (net.status === 'connecting') leaveOnline(true);
        net.set({ sheetOpen: false, error: null });
      } else if (g.panel) g.closePanel();
      else if (g.paused) g.togglePause(false);
      else if (g.menuSheet) g.set({ menuSheet: null });
      else if (g.screen === 'workshop') g.goTo(g.workshopReturn === 'workshop' ? 'menu' : g.workshopReturn);
      else return;
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  return (
    <div className="overlay">
      {screen === 'menu' && <MainMenu />}
      {screen === 'workshop' && <WorkshopScreen />}
      {screen === 'minigame' && <MatchOverlay />}
      {screen === 'playing' && <NameTags />}
      {screen === 'playing' && <Hud />}
      {screen === 'playing' && panel && <Panel />}
      {screen === 'playing' && paused && !panel && <PauseMenu />}
      {onlineSheet && screen !== 'minigame' && <OnlineSheet />}
      <LoadingCard />
    </div>
  );
}
