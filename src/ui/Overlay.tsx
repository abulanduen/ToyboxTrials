/**
 * All DOM UI layered over the 3D canvas: title card, HUD, pause/settings, info panels.
 * Styled as physical toy-world objects (wooden signs, cardboard, stickers, tickets, felt).
 */
import { useEffect, useRef, useState } from 'react';
import { useGame, type Quality } from '../game/store';
import { sfx, unlockAudio } from '../game/audio';
import { events } from '../game/events';
import { PAINT_JOBS, PALETTE } from '../game/palette';
import { SECRET_IDS } from '../game/interactables';
import { MINIGAMES } from '../minigames/registry';
import { frameStats } from '../scene/PlayroomScene';
import { GearIcon, StarSticker, TickerBadge, WindKeyIcon } from './icons';

function ToyButton({ children, onClick, tone = 'honey', autoFocus, disabled }: { children: React.ReactNode; onClick: () => void; tone?: 'honey' | 'coral' | 'blue' | 'sage' | 'ink'; autoFocus?: boolean; disabled?: boolean }) {
  return (
    <button
      className={`toy-btn toy-btn--${tone}`}
      autoFocus={autoFocus}
      disabled={disabled}
      onMouseEnter={() => sfx.tick()}
      onClick={() => {
        unlockAudio();
        sfx.click();
        onClick();
      }}
    >
      <span>{children}</span>
    </button>
  );
}

function KeyCap({ k, wide }: { k: string; wide?: boolean }) {
  return <kbd className={`keycap${wide ? ' keycap--wide' : ''}`}>{k}</kbd>;
}

// ---------------------------------------------------------------- Title
function TitleScreen() {
  const set = useGame((s) => s.set);
  const paint = PAINT_JOBS[useGame((s) => s.paintIndex) % PAINT_JOBS.length];
  const start = () => {
    unlockAudio();
    sfx.windUp(10);
    set({ screen: 'playing', paused: false });
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        start();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  return (
    <div className="title-layer">
      <div className="title-sign">
        <div className="title-sign__nail title-sign__nail--l" />
        <div className="title-sign__nail title-sign__nail--r" />
        <div className="title-sign__badge">
          <TickerBadge size={92} body={paint.body} trim={paint.trim} accent={paint.accent} />
        </div>
        <h1 className="title-logo" aria-label="Toybox Trials">
          <span className="title-logo__top">Toybox</span>
          <span className="title-logo__bottom">Trials</span>
        </h1>
        <p className="title-tagline">Tiny contenders. Big chaos.</p>
        <div className="title-actions">
          <ToyButton onClick={start} autoFocus>
            Enter the Playroom
          </ToyButton>
        </div>
        <p className="title-hint">
          Press <KeyCap k="Enter" wide /> to start
        </p>
      </div>
      <div className="ticket title-ticket">
        <strong>Prototype · Milestone 2</strong>
        <span>Explorable tabletop hub. Copycat Conductor plugs in at Milestone 4.</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- HUD
function Prompt() {
  const prompt = useGame((s) => s.prompt);
  if (!prompt) return null;
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

function Hud() {
  const secrets = useGame((s) => s.secretsFound.length);
  const locked = useGame((s) => s.pointerLocked);
  const paint = PAINT_JOBS[useGame((s) => s.paintIndex) % PAINT_JOBS.length];
  return (
    <>
      <div className="hud-sign">
        <span className="hud-sign__title">The Playroom</span>
        <span className="hud-sign__sub">{paint.name}</span>
      </div>
      <div className="hud-secrets" title="Playroom secrets found">
        <StarSticker size={24} />
        <span>
          {secrets}/{SECRET_IDS.length}
        </span>
      </div>
      <Prompt />
      <Tickets />
      <Controls />
      <BoostMeter />
      {!locked && <div className="look-hint">Click the scene to look around</div>}
      <Fps />
    </>
  );
}

// ---------------------------------------------------------------- Pause / settings
function Slider({ label, value, onChange, min = 0, max = 1, step = 0.05 }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <label className="setting">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} onPointerUp={() => sfx.tick()} />
    </label>
  );
}

function PauseMenu() {
  const s = useGame();
  return (
    <div className="modal-layer">
      <div className="cardboard-panel pause">
        <div className="tape tape--l" />
        <div className="tape tape--r" />
        <h2>
          <GearIcon /> Paused
        </h2>
        <div className="pause__grid">
          <Slider label="Master volume" value={s.masterVolume} onChange={(v) => s.set({ masterVolume: v })} />
          <Slider label="Effects volume" value={s.sfxVolume} onChange={(v) => s.set({ sfxVolume: v })} />
          <Slider label="Mouse sensitivity" value={s.mouseSensitivity} min={0.4} max={2} step={0.1} onChange={(v) => s.set({ mouseSensitivity: v })} />
          <div className="setting">
            <span>Visual quality</span>
            <div className="segmented">
              {(['low', 'balanced', 'high'] as Quality[]).map((q) => (
                <button
                  key={q}
                  className={s.quality === q ? 'on' : ''}
                  onClick={() => {
                    sfx.click();
                    s.set({ quality: q });
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
          <label className="setting setting--check">
            <input type="checkbox" checked={s.invertY} onChange={(e) => s.set({ invertY: e.target.checked })} />
            <span>Invert camera Y</span>
          </label>
          <label className="setting setting--check">
            <input type="checkbox" checked={s.showFps} onChange={(e) => s.set({ showFps: e.target.checked })} />
            <span>Show frame rate</span>
          </label>
        </div>
        <div className="pause__actions">
          <ToyButton onClick={() => s.togglePause(false)} autoFocus>
            Resume
          </ToyButton>
          <ToyButton tone="ink" onClick={() => s.set({ screen: 'title', paused: false, panel: null })}>
            Back to title
          </ToyButton>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Panels
const INSTRUMENTS = [
  { key: 'A', code: 'KeyA', name: 'Drum', color: PALETTE.coral, play: () => sfx.drum() },
  { key: 'S', code: 'KeyS', name: 'Bell', color: PALETTE.honey, play: () => sfx.bell() },
  { key: 'J', code: 'KeyJ', name: 'Xylophone', color: PALETTE.toyBlue, play: () => sfx.xylophone() },
  { key: 'K', code: 'KeyK', name: 'Music box', color: PALETTE.sage, play: () => sfx.musicBox() },
];

function CopycatPanel() {
  const [lit, setLit] = useState<number | null>(null);
  const timer = useRef(0);
  const hit = (i: number) => {
    INSTRUMENTS[i].play();
    setLit(i);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setLit(null), 220);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const i = INSTRUMENTS.findIndex((x) => x.code === e.code);
      if (i >= 0) hit(i);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const def = MINIGAMES[0];
  return (
    <>
      <p className="panel__lead">{def.tagline}</p>
      <div className="instrument-row">
        {INSTRUMENTS.map((ins, i) => (
          <button key={ins.key} className={`instrument${lit === i ? ' instrument--lit' : ''}`} style={{ ['--c' as string]: ins.color }} onPointerDown={() => hit(i)}>
            <span className="instrument__cap">{ins.key}</span>
            <span className="instrument__name">{ins.name}</span>
          </button>
        ))}
      </div>
      <p className="panel__note">
        Instrument test bench — press <KeyCap k="A" /> <KeyCap k="S" /> <KeyCap k="J" /> <KeyCap k="K" /> to hear the new synthesised voices.
      </p>
      <div className="panel__status">
        <strong>Entrance ready · game not yet connected.</strong> The existing Copycat Conductor rules (sequence memory, timing, scoring, records) live in the
        Base44 app, which isn’t in this repository yet. At Milestone 4 they mount here unchanged inside the mechanical music theatre.
      </div>
    </>
  );
}

function Panel() {
  const panel = useGame((s) => s.panel);
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
        {panel.kind === 'copycat' && <CopycatPanel />}
        {(panel.kind === 'preview' || panel.kind === 'shop') && <p className="panel__lead">{panel.body}</p>}
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
            <div className="scoreboard__row scoreboard__row--muted">
              <span>Copycat Conductor best</span>
              <strong>— (records import at Milestone 4)</strong>
            </div>
          </div>
        )}
        <div className="panel__actions">
          <ToyButton tone="ink" onClick={close} autoFocus>
            Back to the square
          </ToyButton>
          <span className="panel__esc">
            or <KeyCap k="Esc" wide />
          </span>
        </div>
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

  // Esc while a DOM panel or pause menu has focus (the canvas loop handles in-game Esc).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return;
      const g = useGame.getState();
      if (g.panel) {
        g.closePanel();
        e.stopPropagation();
      } else if (g.paused) {
        g.togglePause(false);
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  return (
    <div className="overlay">
      {screen === 'title' && <TitleScreen />}
      {screen === 'playing' && <Hud />}
      {screen === 'playing' && panel && <Panel />}
      {screen === 'playing' && paused && !panel && <PauseMenu />}
    </div>
  );
}
