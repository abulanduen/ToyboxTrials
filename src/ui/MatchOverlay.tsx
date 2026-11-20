/**
 * DOM side of the minigame host: loading, tournament reveal, intro card, countdown, in-game HUD
 * slot + pause, results, standings, final podium. Shared by every minigame.
 */
import { useEffect, useRef, useState } from 'react';
import { useGame } from '../game/store';
import { sfx } from '../game/audio';
import { MINIGAMES, gameById } from '../minigames/registry';
import {
  LOCAL_ID,
  beginCountdown,
  continueAfterResults,
  getMatchState,
  matchBus,
  nextTournamentRound,
  openPractice,
  pauseMatch,
  playRevealedGame,
  quitMatch,
  setPracticeOpponents,
  startTournament,
  useMatch,
} from '../minigames/session';
import { FORMATS, poolForFormat, type TournamentFormat } from '../minigames/tournament';
import { pointsForPlace, rankStandings } from '../minigames/scoring';
import type { BotDifficulty, Contestant } from '../minigames/types';
import { tutorialFor, tutorialText, type TutorialStep } from '../minigames/tutorials';
import { CardboardSheet, KeyCap, ToyButton } from './common';
import { TutorialPicture, preloadTutorialArt } from './TutorialPicture';
import { GearIcon, StarSticker, WindKeyIcon } from './icons';
import { CogIcon } from './itemIcons';
import type { Reward } from '../game/economy';
import { GameCardGrid, HostTrialRow, LengthChip, OnlineMatchOverlay, PavilionOnline, PavilionTabs, type PavilionTab } from './LobbyUI';
import { durationLabel } from '../minigames/length';

/** "+23 cogs" with the breakdown, and anything an achievement just unlocked. */
function CogsEarned({ reward, unlocked, testId }: { reward: Reward; unlocked: string[]; testId: string }) {
  const wallet = useGame((s) => s.profile.wallet.cogs);
  if (reward.total <= 0 && !unlocked.length) return null;
  return (
    <div className="cogs-earned" data-testid={testId}>
      {reward.total > 0 && (
        <div className="cogs-earned__main">
          <CogIcon size={24} />
          <strong>+{reward.total} cogs</strong>
          <span className="cogs-earned__lines">{reward.lines.map((l) => `${l.label} +${l.cogs}`).join(' · ')}</span>
          <span className="cogs-earned__wallet">Wallet: {wallet}</span>
        </div>
      )}
      {unlocked.length > 0 && (
        <div className="cogs-earned__unlock">
          <StarSticker size={18} /> Unlocked: {unlocked.join(', ')} (Workshop)
        </div>
      )}
    </div>
  );
}

const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;

export function Medal({ place }: { place: number }) {
  const cls = place === 1 ? 'gold' : place === 2 ? 'silver' : place === 3 ? 'bronze' : 'plain';
  return <span className={`medal medal--${cls}`}>{place}</span>;
}

export function Who({ c }: { c: Contestant }) {
  return (
    <span className="who">
      <span className="who__dot" style={{ background: c.paint.body, borderColor: c.paint.trim }} />
      {c.isLocal ? <strong>{c.name} (you)</strong> : c.name}
    </span>
  );
}

export function MatchOverlay() {
  const m = useMatch();
  const touch = useGame((s) => s.touchUI);

  // Esc: pause/resume during play (capture phase so the hub handlers never see it).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape' && e.code !== 'KeyP') return;
      const el = e.target as HTMLElement | null;
      if (e.code === 'KeyP' && el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      const s = useMatch.getState();
      if (s.phase === 'playing' || s.phase === 'countdown') {
        pauseMatch(!s.paused);
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
  // The intro card's pictures load in their own chunk: fetch it while the game itself loads.
  useEffect(() => {
    if (m.phase === 'loading' || m.phase === 'reveal' || m.phase === 'intro') preloadTutorialArt();
  }, [m.phase]);

  const def = m.gameId ? gameById(m.gameId) : null;
  const Hud = m.module?.Hud;
  const inPlay = m.phase === 'countdown' || m.phase === 'playing';
  // Online lobby matches have their own cards (LobbyUI.tsx); the game's Hud is shared.
  if (m.kind === 'online') return <OnlineMatchOverlay />;

  return (
    <div className="match-layer">
      {inPlay && Hud && <Hud getState={getMatchState} contestants={m.contestants} localId={LOCAL_ID} />}
      {inPlay && (
        <button className="match-pause" aria-label="Pause" onClick={() => pauseMatch(true)}>
          <GearIcon size={26} color="#2B2433" />
        </button>
      )}
      {m.phase === 'countdown' && <Countdown />}
      {m.phase === 'loading' && (
        <div className="loading match-loading">
          <div className="loading__key">
            <WindKeyIcon size={56} />
          </div>
          <span>Setting the stage…</span>
        </div>
      )}
      {m.phase === 'reveal' && <Reveal />}
      {m.phase === 'intro' && def && <Intro touch={touch} />}
      {m.phase === 'results' && <Results />}
      {m.phase === 'standings' && <Standings />}
      {m.phase === 'final' && <Final />}
      {m.paused && inPlay && (
        <CardboardSheet title="Paused" icon={<GearIcon />} className="pause">
          <p className="panel__lead">{m.kind === 'tournament' ? 'Leaving now abandons the whole tournament.' : 'Take a breather. The conductor will wait.'}</p>
          <div className="pause__actions">
            <ToyButton armDelay={700} onClick={() => pauseMatch(false)} autoFocus>
              Resume
            </ToyButton>
            <ToyButton armDelay={700} tone="ink" onClick={quitMatch}>
              {m.kind === 'tournament' ? 'Quit tournament' : 'Back to the Playroom'}
            </ToyButton>
          </div>
        </CardboardSheet>
      )}
    </div>
  );
}

export function Countdown() {
  const [n, setN] = useState<number | null>(3);
  useEffect(() => matchBus.on('countdown', ({ n }) => setN(n)), []);
  if (n === null) return null;
  return (
    <div className="countdown" key={n} aria-live="assertive">
      {n > 0 ? n : 'Go!'}
    </div>
  );
}

function Intro({ touch }: { touch: boolean }) {
  const m = useMatch();
  const def = gameById(m.gameId!);
  const rec = useGame((s) => s.records[def.id]);
  const t = m.tournament;
  const isTournament = m.kind === 'tournament';
  const steps = tutorialFor(def.id);
  // Decided once per intro card: the setting only controls whether it opens by itself.
  const [showTutorial, setShowTutorial] = useState(() => useGame.getState().tutorials);
  const [turnedOff, setTurnedOff] = useState(false);
  return (
    <CardboardSheet title={def.title} className="match-intro" onBackdrop={undefined}>
      <div className="info-panel__sub" style={{ ['--accent' as string]: def.accent, background: def.accent }}>
        {isTournament && t ? `${FORMATS[t.format].name} · Trial ${t.round + 1} of ${t.games.length}` : 'Practice with bots'}
      </div>
      <div className="intro-length">
        <LengthChip def={def} /> <span>{durationLabel(def)}</span>
      </div>
      {m.error ? (
        <p className="panel__lead">{m.error}</p>
      ) : (
        <>
          {steps && showTutorial ? (
            <Tutorial steps={steps} touch={touch} accent={def.accent} onClose={() => setShowTutorial(false)} onNever={() => (useGame.getState().set({ tutorials: false }), setShowTutorial(false), setTurnedOff(true))} />
          ) : (
            <>
              {steps && (
                <div className="intro-art-row" data-testid="intro-art-row" aria-hidden>
                  {steps.map((st, k) => (
                    <TutorialPicture key={k} id={(touch && st.touchArt) || st.art} className="intro-art-row__item" testId="intro-art" />
                  ))}
                </div>
              )}
              <p className="panel__lead">{def.description}</p>
              <div className="intro-controls">
                {touch ? (
                  <span>{def.touch.notes ?? 'Use the on-screen buttons.'}</span>
                ) : (
                  def.controls.map((c) => (
                    <span key={c.keys} className="intro-controls__item">
                      <KeyCap k={c.keys} /> {c.action}
                    </span>
                  ))
                )}
              </div>
              {turnedOff ? (
                <p className="tutorial-note" data-testid="tutorial-off-note">Tutorials are off. You can turn them back on in Settings.</p>
              ) : steps ? (
                <button className="tutorial-open" onClick={() => (sfx.click(), setShowTutorial(true))} data-testid="tutorial-open">
                  How to play
                </button>
              ) : null}
            </>
          )}
          {!isTournament && (
            <div className="intro-options">
              <div className="setting">
                <span>Opponents</span>
                <div className="segmented">
                  {[0, 1, 3, 5, 7].filter((n) => n + 1 >= def.players.min && n + 1 <= def.players.max).map((n) => (
                    <button key={n} className={m.opponents === n ? 'on' : ''} onClick={() => (sfx.click(), setPracticeOpponents(n))}>
                      {n === 0 ? 'Solo' : `${n} bot${n > 1 ? 's' : ''}`}
                    </button>
                  ))}
                </div>
              </div>
              {m.opponents > 0 && <DifficultyPicker value={m.difficulty} onChange={(d) => setPracticeOpponents(m.opponents, d)} />}
              {/* The other choice at a gate: host this trial as an online lobby (server-run). */}
              <HostTrialRow game={def.id} />
            </div>
          )}
          {m.module?.IntroExtras && <m.module.IntroExtras practice={!isTournament} />}
          {isTournament && (
            <div className="intro-field">
              {m.contestants.map((c) => (
                <Who key={c.id} c={c} />
              ))}
            </div>
          )}
          {rec && (
            <p className="intro-record">
              <StarSticker size={18} /> Best: <strong>{rec.best}</strong> {unit(def.recordUnit, rec.best)} · played {rec.plays}
              {rec.wins ? ` · ${rec.wins} win${rec.wins > 1 ? 's' : ''}` : ''}
            </p>
          )}
        </>
      )}
      <div className="pause__actions">
        {!m.error && (
          <ToyButton armDelay={700} onClick={beginCountdown} autoFocus testId="match-start">
            {isTournament ? 'Ready!' : 'Start'}
          </ToyButton>
        )}
        <ToyButton armDelay={700} tone="ink" onClick={quitMatch} testId="match-leave">
          {isTournament ? 'Quit tournament' : 'Back to the Playroom'}
        </ToyButton>
      </div>
    </CardboardSheet>
  );
}

/** Quick paged "how to play" for one minigame, shown inside the intro card. Start stays available. */
function Tutorial({ steps, touch, accent, onClose, onNever }: { steps: TutorialStep[]; touch: boolean; accent: string; onClose: () => void; onNever: () => void }) {
  const [i, setI] = useState(0);
  const root = useRef<HTMLElement>(null);
  const go = (next: number) => {
    sfx.click(); setI(next);
    root.current?.scrollIntoView({ block: 'start' });
  };
  const step = steps[i];
  const last = i === steps.length - 1;
  return (
    <section ref={root} className="tutorial" aria-label="How to play" data-testid="tutorial" style={{ ['--accent' as string]: accent }}>
      <div className="tutorial__head">
        <span>How to play</span>
        <span aria-live="polite" data-testid="tutorial-step">
          {i + 1} / {steps.length}
        </span>
      </div>
      <div className="tutorial__body">
        {step.image ? (
          <figure className="tutorial__visual">
            <img key={step.image} src={step.image} alt={step.caption ?? step.title} width={960} height={540} decoding="async" data-testid="tutorial-photo" />
            <figcaption>{step.caption}</figcaption>
          </figure>
        ) : <TutorialPicture key={i} id={(touch && step.touchArt) || step.art} className="tutorial__art" />}
        <div className="tutorial__words">
          <h3 className="tutorial__title">{step.title}</h3>
          <p className="tutorial__text">{tutorialText((touch && step.touch) || step.text, step.emphasis).map((part, n) =>
            part.strong ? <strong key={n}>{part.text}</strong> : part.text,
          )}</p>
        </div>
      </div>
      <div className="tutorial__dots" aria-hidden>
        {steps.map((_, k) => (
          <span key={k} className={k === i ? 'on' : ''} />
        ))}
      </div>
      <div className="tutorial__nav">
        <button onClick={() => go(i - 1)} disabled={i === 0} data-testid="tutorial-back">
          Back
        </button>
        <button className="tutorial__next" onClick={() => { if (last) { sfx.click(); onClose(); } else go(i + 1); }} data-testid="tutorial-next">
          {last ? 'Got it' : 'Next'}
        </button>
      </div>
      <button className="tutorial__never" onClick={() => (sfx.click(), onNever())} data-testid="tutorial-never">
        Don’t show tutorials again
      </button>
    </section>
  );
}

function DifficultyPicker({ value, onChange }: { value: BotDifficulty; onChange: (d: BotDifficulty) => void }) {
  return (
    <div className="setting">
      <span>Bot skill</span>
      <div className="segmented">
        {(['easy', 'normal', 'hard'] as BotDifficulty[]).map((d) => (
          <button key={d} className={value === d ? 'on' : ''} onClick={() => (sfx.click(), onChange(d))}>
            {d}
          </button>
        ))}
      </div>
    </div>
  );
}

function Reveal() {
  const t = useMatch((s) => s.tournament)!;
  const def = gameById(t.games[t.round]);
  useEffect(() => sfx.windUp(8), [t.round]);
  return (
    <div className="modal-layer">
      <div className="reveal-ticket" style={{ ['--accent' as string]: def.accent }}>
        <span className="reveal-ticket__round">
          {FORMATS[t.format].name} · Trial {t.round + 1} of {t.games.length}
        </span>
        <span className="reveal-ticket__next">Next up</span>
        <strong className="reveal-ticket__title">{def.title}</strong>
        <span className="reveal-ticket__tag">{def.tagline}</span>
        <ToyButton armDelay={700} onClick={playRevealedGame} autoFocus testId="reveal-go">
          Let’s go
        </ToyButton>
      </div>
    </div>
  );
}

function Results() {
  const m = useMatch();
  const res = m.lastResult!;
  const def = gameById(res.minigame);
  const isTournament = m.kind === 'tournament';
  const mine = res.placements.find((p) => p.contestantId === LOCAL_ID);
  const solo = res.placements.length === 1;
  const byId = (id: string) => m.contestants.find((c) => c.id === id)!;
  const t = m.tournament;
  const last = t && t.round + 1 >= t.games.length;
  return (
    <CardboardSheet title={solo ? 'Run over!' : mine?.place === 1 ? 'You win!' : `You placed ${ordinal(mine?.place ?? 0)}`} className="results">
      <div className="info-panel__sub" style={{ background: def.accent }}>
        {def.title}
      </div>
      {solo ? (
        <div className="results-solo">
          <span>{def.recordUnit === 'rounds' ? 'Rounds survived' : def.recordUnit[0].toUpperCase() + def.recordUnit.slice(1)}</span>
          <strong data-testid="solo-score">{mine?.score ?? 0}</strong>
          {m.newBest && <span className="sticker-badge">New personal best!</span>}
        </div>
      ) : (
        <ol className="results-list">
          {res.placements.map((p) => (
            <li key={p.contestantId} className={p.contestantId === LOCAL_ID ? 'me' : ''}>
              <Medal place={p.place} />
              <Who c={byId(p.contestantId)} />
              <span className="results-list__score">
                {p.forfeit ? 'quit' : def.scoring === 'elimination-order' && !p.eliminated ? 'last standing' : `${p.score} ${unit(def.recordUnit, p.score)}`}
              </span>
              {isTournament && <span className="results-list__pts">+{pointsForPlace(p.place)}</span>}
            </li>
          ))}
        </ol>
      )}
      {!solo && m.newBest && <p className="intro-record"><StarSticker size={18} /> New personal best: {mine?.score} {unit(def.recordUnit, mine?.score ?? 0)}</p>}
      <CogsEarned reward={m.reward} unlocked={m.unlocked} testId="results-cogs" />
      <div className="pause__actions">
        {isTournament ? (
          <ToyButton armDelay={700} onClick={continueAfterResults} autoFocus testId="results-next">
            {last ? 'Final standings' : 'Standings'}
          </ToyButton>
        ) : (
          <>
            <ToyButton armDelay={700} onClick={beginCountdown} autoFocus testId="results-again">
              Play again
            </ToyButton>
            <ToyButton armDelay={700} tone="blue" onClick={continueAfterResults}>
              Change settings
            </ToyButton>
            <ToyButton armDelay={700} tone="ink" onClick={quitMatch} testId="results-leave">
              Back to the Playroom
            </ToyButton>
          </>
        )}
      </div>
    </CardboardSheet>
  );
}

function StandingsTable() {
  const m = useMatch();
  const t = m.tournament!;
  const ranked = rankStandings(t.standings);
  const byId = (id: string) => m.contestants.find((c) => c.id === id)!;
  return (
    <div className="standings card-felt" style={{ ['--cols' as string]: t.games.length }}>
      <div className="standings__head">
        <span />
        <span>Toy</span>
        {t.games.map((_, i) => (
          <span key={i} className={i <= t.round ? '' : 'dim'}>
            {i + 1}
          </span>
        ))}
        <span>Pts</span>
      </div>
      {ranked.map((s) => (
        <div key={s.contestantId} className={`standings__row${s.contestantId === LOCAL_ID ? ' me' : ''}`}>
          <Medal place={s.place} />
          <Who c={byId(s.contestantId)} />
          {t.games.map((_, i) => (
            <span key={i} className={i < s.rounds.length ? '' : 'dim'}>
              {s.rounds[i] ?? '·'}
            </span>
          ))}
          <strong>{s.points}</strong>
        </div>
      ))}
    </div>
  );
}

function Standings() {
  const t = useMatch((s) => s.tournament)!;
  return (
    <CardboardSheet title="Standings" className="standings-sheet">
      <div className="info-panel__sub" style={{ background: 'var(--honey)' }}>
        {FORMATS[t.format].name} · after trial {t.round + 1} of {t.games.length}
      </div>
      <StandingsTable />
      <div className="pause__actions">
        <ToyButton armDelay={700} onClick={nextTournamentRound} autoFocus testId="standings-next">
          Next trial
        </ToyButton>
        <ToyButton armDelay={700} tone="ink" onClick={quitMatch}>
          Quit tournament
        </ToyButton>
      </div>
    </CardboardSheet>
  );
}

function Final() {
  const m = useMatch();
  const t = m.tournament!;
  const ranked = rankStandings(t.standings);
  const me = ranked.find((s) => s.contestantId === LOCAL_ID);
  const wins = useGame((s) => s.tournamentWins[t.format] ?? 0);
  return (
    <CardboardSheet title={me?.place === 1 ? 'Tournament champion!' : `Tournament over: ${ordinal(me?.place ?? 0)} of ${ranked.length}`} className="standings-sheet final">
      <div className="info-panel__sub" style={{ background: 'var(--honey)' }}>
        {FORMATS[t.format].name} complete · {FORMATS[t.format].name} wins: {wins}
      </div>
      <StandingsTable />
      <CogsEarned reward={m.tournamentReward} unlocked={m.unlocked} testId="final-cogs" />
      <div className="pause__actions">
        <ToyButton armDelay={700} onClick={() => startTournament(t.format, m.opponents, m.difficulty)} autoFocus testId="final-again">
          Play another
        </ToyButton>
        <ToyButton armDelay={700} tone="ink" onClick={quitMatch} testId="final-leave">
          Back to the Playroom
        </ToyButton>
      </div>
    </CardboardSheet>
  );
}

/** Hub panel at the Tournament Pavilion. */
export function TournamentPicker({ onClose }: { onClose: () => void }) {
  const [format, setFormat] = useState<TournamentFormat>('blitz');
  const [opponents, setOpponents] = useState(3);
  const [difficulty, setDifficulty] = useState<BotDifficulty>('normal');
  const [tab, setTab] = useState<PavilionTab>('practice');
  const history = useGame((s) => s.tournamentHistory);
  return (
    <>
      <PavilionTabs tab={tab} onTab={setTab} />
      <div className="formats" role="radiogroup" aria-label="Tournament format">
        {(Object.keys(FORMATS) as TournamentFormat[]).map((f) => (
          <button
            key={f}
            role="radio"
            aria-checked={format === f}
            className={`format-card${format === f ? ' on' : ''}`}
            onClick={() => (sfx.click(), setFormat(f))}
            data-testid={`format-${f}`}
          >
            <strong>{FORMATS[f].name}</strong>
            <span className="format-card__n">{FORMATS[f].games} trials</span>
            <span className="format-card__blurb">{FORMATS[f].blurb}</span>
          </button>
        ))}
      </div>
      {tab === 'online' ? (
        <PavilionOnline format={format} onClose={onClose} />
      ) : (
        <>
      <div className="intro-options">
        <div className="setting">
          <span>Bot opponents</span>
          <div className="segmented">
            {[1, 3, 5, 7].map((n) => (
              <button key={n} className={opponents === n ? 'on' : ''} onClick={() => (sfx.click(), setOpponents(n))}>
                {n}
              </button>
            ))}
          </div>
        </div>
        <DifficultyPicker value={difficulty} onChange={setDifficulty} />
      </div>
      <p className="panel__note">
        Practice against bots, unranked. In the {FORMATS[format].name} rotation:{' '}
        {new Intl.ListFormat('en', { style: 'long', type: 'conjunction' }).format(poolForFormat(format, MINIGAMES).map((g) => g.title))}.
      </p>
      <PracticeList onClose={onClose} />
      {history[0] && (
        <p className="intro-record">
          Last: {FORMATS[history[0].format].name}, placed {ordinal(history[0].place)} of {history[0].of}
        </p>
      )}
      <div className="pause__actions">
        <ToyButton
          onClick={() => {
            onClose();
            startTournament(format, opponents, difficulty);
          }}
          autoFocus
          testId="tournament-start"
        >
          Start tournament
        </ToyButton>
        <ToyButton tone="ink" onClick={onClose}>
          Not now
        </ToyButton>
      </div>
        </>
      )}
    </>
  );
}

/** "1 answer" / "3 answers"; units are stored plural. */
export function unit(plural: string, n: number) {
  return n === 1 && plural.endsWith('s') ? plural.slice(0, -1) : plural;
}

/** Every playable trial as picture cards, for solo/bot practice (each also has its own gate in the hub). */
function PracticeList({ onClose }: { onClose: () => void }) {
  const records = useGame((s) => s.records);
  return (
    <div className="practice-list" aria-label="Practice a trial">
      <span className="practice-list__title">Or practise one trial</span>
      <GameCardGrid
        testPrefix="practice"
        onPick={(id) => {
          onClose();
          openPractice(id);
        }}
        sub={(g) => {
          const r = records[g.id];
          return r ? `Best ${r.best} ${unit(g.recordUnit, r.best)}` : null;
        }}
      />
    </div>
  );
}
