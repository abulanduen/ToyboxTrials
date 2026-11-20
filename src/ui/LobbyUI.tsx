/**
 * Online lobby UI: the Hub alert ("Ticker is hosting a Blitz tournament · 3/8 · Join"), the
 * Lobbies button and sheet, the host choices at the Pavilion and the trial gates, the lobby
 * screen (members, settings, host controls), and the server-run match's reveal, results,
 * standings and final cards. Also the game card grid (thumbnail, length chip, players) shared by
 * the host's trial picker and the Pavilion's "practise one trial" list.
 *
 * Everything shown comes from the server (src/net/lobby.ts); buttons only send requests.
 */
import { useEffect, useMemo, useState } from 'react';
import { useGame } from '../game/store';
import { sfx } from '../game/audio';
import { useNet } from '../net/store';
import { onlineAvailable } from '../net/client';
import {
  changeLobby,
  hostLobby,
  joinLobby,
  kickFromLobby,
  leaveLobby,
  openLobbiesSheet,
  setLobbyReady,
  startLobby,
  useLobby,
} from '../net/lobby';
import { watchSeat } from '../minigames/remote';
import { fetchLeaderboard, useLeaderboard } from '../net/leaderboard';
import { DEFAULT_LOBBY_SETTINGS, LOBBY_MAX_CAP, LOBBY_MIN_CAP, type LobbyFormat, type LobbySettings, type LobbyState, type LobbySummary } from '../net/protocol';
import { MINIGAMES, gameById } from '../minigames/registry';
import { isOnlineGame } from '../minigames/facts';
import { FORMATS, groupOf, isStrategy } from '../minigames/tournament';
import { GROUP_INFO, GROUP_ORDER, LENGTH_LABEL, byLength, durationChip, durationLabel, groupDurationLabel, inGroup, lengthClassOf } from '../minigames/length';
import { getMatchState, pauseMatch, useMatch } from '../minigames/session';
import { pointsForPlace, rankStandings } from '../minigames/scoring';
import type { BotDifficulty, MinigameDefinition, MinigameId, TrialGroup } from '../minigames/types';
import { CardboardSheet, ToyButton } from './common';
import { GearIcon } from './icons';
import { PAINT_JOBS } from '../game/palette';
import { netLink } from '../net/link';
import { Countdown, IntroGuide, Medal, Who, unit } from './MatchOverlay';

const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;

/** "a Blitz tournament" / "Copycat Conductor". */
export function lobbyWhat(l: Pick<LobbySummary, 'mode' | 'game' | 'format'>) {
  return l.mode === 'tournament' ? `a ${FORMATS[l.format].name} tournament` : gameById(l.game).title;
}

// ---------------------------------------------------------------- length chip and game cards
export function LengthChip({ def }: { def: Pick<MinigameDefinition, 'durationSec'> }) {
  const cls = lengthClassOf(def);
  return (
    <span className={`length-chip length-chip--${cls}`} title={durationLabel(def)} data-testid="length-chip">
      {durationChip(def)} · {LENGTH_LABEL[cls]}
    </span>
  );
}

export type CardSort = 'length' | 'name' | 'category';
const SORT_LABEL: Record<CardSort, string> = { length: 'Length', name: 'Name', category: 'Type' };

function sortGames(games: MinigameDefinition[], sort: CardSort): MinigameDefinition[] {
  if (sort === 'name') return games.slice().sort((a, b) => a.title.localeCompare(b.title));
  if (sort === 'category') return byLength(games).sort((a, b) => a.category.localeCompare(b.category));
  return byLength(games);
}

/** Where a trial's thumbnail lives (public/assets/thumbs/<id>.webp; recorded in the asset manifest). */
export const thumbUrl = (id: MinigameId) => `${import.meta.env.BASE_URL}assets/thumbs/${id}.webp`;

function Thumb({ def }: { def: MinigameDefinition }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="game-card__thumb" style={{ background: def.accent }} aria-hidden>
      {!failed && <img src={thumbUrl(def.id)} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />}
      {failed && <span className="game-card__initial">{def.title[0]}</span>}
    </span>
  );
}

/**
 * Trials as picture cards: thumbnail (or the trial's accent colour), title, length chip, players.
 * In two collapsible sections, party games and strategy games (each game's `group`), closed at
 * first so a long list never fills the sheet; a picked trial shows compactly above them. Ordered
 * short to long by default; the player can re-sort by name or type. Two columns in portrait, more
 * in landscape, no sideways scrolling.
 */
export function GameCardGrid({
  selected,
  onPick,
  disabledReason,
  testPrefix,
  sub,
  readOnly,
}: {
  selected?: MinigameId | null;
  onPick: (id: MinigameId) => void;
  /** Why a card can't be picked here (it shows on the card), or null. */
  disabledReason?: (def: MinigameDefinition) => string | null;
  testPrefix: string;
  /** Extra line on each card (e.g. the player's best). */
  sub?: (def: MinigameDefinition) => string | null;
  readOnly?: boolean;
}) {
  const [sort, setSort] = useState<CardSort>('length');
  const [open, setOpen] = useState<Record<TrialGroup, boolean>>({ party: false, strategy: false });
  const games = useMemo(() => sortGames(MINIGAMES.filter((g) => g.status === 'playable'), sort), [sort]);
  const picked = selected ? games.find((g) => g.id === selected) : undefined;
  const anyOpen = GROUP_ORDER.some((k) => open[k]);
  const card = (g: MinigameDefinition) => {
    const reason = disabledReason?.(g) ?? null;
    const on = selected === g.id;
    const extra = sub?.(g);
    return (
      <button
        key={g.id}
        role="radio"
        aria-checked={on}
        className={`game-card${on ? ' on' : ''}${reason ? ' game-card--off' : ''}`}
        style={{ ['--accent' as string]: g.accent }}
        disabled={!!reason || readOnly}
        data-testid={`${testPrefix}-${g.id}`}
        onClick={() => {
          sfx.click();
          onPick(g.id);
          // Picked: fold the list away again so the choice shows compactly.
          if (selected !== undefined) setOpen({ party: false, strategy: false });
        }}
      >
        <Thumb def={g} />
        <strong className="game-card__title">{g.title}</strong>
        <span className="game-card__meta">
          <LengthChip def={g} />
          <span className="game-card__players">
            {g.players.min === g.players.max ? g.players.min : `${g.players.min}–${g.players.max}`} toys
          </span>
        </span>
        {(reason || extra) && <span className="game-card__sub">{reason ?? extra}</span>}
      </button>
    );
  };
  return (
    <div className="game-grid-wrap">
      {picked && (
        <div className="game-picked" style={{ ['--accent' as string]: picked.accent }} data-testid={`${testPrefix}-selected`} data-game={picked.id}>
          <Thumb def={picked} />
          <span className="game-picked__words">
            <strong>{picked.title}</strong>
            <span className="game-card__meta">
              <LengthChip def={picked} />
              <span>{GROUP_INFO[groupOf(picked)].label.replace(/s$/, '')}</span>
            </span>
          </span>
        </div>
      )}
      {anyOpen && (
        <div className="game-grid__sort" role="radiogroup" aria-label="Sort trials">
          <span>Sort</span>
          {(Object.keys(SORT_LABEL) as CardSort[]).map((k) => (
            <button key={k} role="radio" aria-checked={sort === k} className={sort === k ? 'on' : ''} onClick={() => (sfx.click(), setSort(k))} data-testid={`${testPrefix}-sort-${k}`}>
              {SORT_LABEL[k]}
            </button>
          ))}
        </div>
      )}
      {GROUP_ORDER.map((group) => {
        const list = inGroup(games, group);
        if (!list.length) return null;
        const isOpen = open[group];
        const bodyId = `${testPrefix}-group-${group}-cards`;
        const hasPick = !!picked && groupOf(picked) === group;
        return (
          <section key={group} className={`game-group game-group--${group}${isOpen ? ' open' : ''}`} aria-label={GROUP_INFO[group].label}>
            <button
              className="game-group__head"
              aria-expanded={isOpen}
              aria-controls={bodyId}
              data-testid={`${testPrefix}-group-${group}`}
              onClick={() => (sfx.click(), setOpen((o) => ({ ...o, [group]: !o[group] })))}
            >
              <span className="game-group__chev" aria-hidden />
              <span className="game-group__words">
                <strong>
                  {GROUP_INFO[group].label} <span className="game-group__count">· {list.length}</span>
                </strong>
                <span className="game-group__blurb">
                  {GROUP_INFO[group].blurb} · {groupDurationLabel(list)}
                </span>
              </span>
              {hasPick && !isOpen && <span className="game-group__tag">Picked</span>}
            </button>
            {isOpen && (
              <div className="game-grid" id={bodyId} role="radiogroup" aria-label={GROUP_INFO[group].label}>
                {list.map(card)}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** What a tournament format deals, from the formats table and each game's group. */
export function formatRule(format: LobbyFormat): string {
  const finales = MINIGAMES.filter((g) => g.status === 'playable' && g.eligibility.tournament && isStrategy(g)).map((g) => g.title);
  const f = FORMATS[format];
  const words = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
  const parties = f.finale ? f.games - 1 : f.games;
  return f.finale && finales.length
    ? `${f.name}: ${words[parties] ?? parties} party trials, then a strategy finale (${new Intl.ListFormat('en', { style: 'long', type: 'disjunction' }).format(finales)}).`
    : `${f.name}: ${words[parties] ?? parties} quick party trials.`;
}

// ---------------------------------------------------------------- Hub: join popup, open lobbies, sheet
/**
 * "Ticker is hosting a Blitz tournament. Join?" A popup on every other player's screen in this Hub
 * room when a lobby opens. It stays until answered (Join / No thanks), until you join a lobby some
 * other way, or until that lobby closes (src/net/lobby.ts clears it then).
 */
export function HubLobbyAlert() {
  const alert = useLobby((s) => s.alert);
  const list = useLobby((s) => s.list);
  if (!alert) return null;
  const live = list.find((l) => l.id === alert.lobby.id) ?? alert.lobby;
  const full = live.players >= live.cap || live.locked;
  const no = () => (sfx.click(), useLobby.getState().set({ alert: null }));
  return (
    <div className="lobby-alert" role="alertdialog" aria-labelledby="lobby-alert-title" data-testid="lobby-alert">
      <strong className="lobby-alert__title" id="lobby-alert-title">
        Join this lobby?
      </strong>
      <span className="lobby-alert__text">
        <strong>{live.host}</strong> is hosting {lobbyWhat(live)} · {live.players}/{live.cap}
        {live.playing ? ' · playing now' : ''}
      </span>
      <div className="lobby-alert__actions">
        <button className="lobby-alert__join" onClick={() => (sfx.click(), joinLobby(live.id))} disabled={full} data-testid="lobby-alert-join">
          {full ? (live.locked ? 'Locked' : 'Full') : 'Join'}
        </button>
        <button className="lobby-alert__no" onClick={no} data-testid="lobby-alert-no">
          No thanks
        </button>
      </div>
    </div>
  );
}

/** How many open lobbies the Hub lists under the room chip before "+N more". */
const HUB_LOBBY_ROWS = 3;

/**
 * Under the room chip while online: the open lobbies in this Hub room, each with Join. The heading
 * opens the full Lobbies sheet. (On desktop, hold Alt to free the cursor and click these.)
 */
export function HubLobbies() {
  const online = useNet((s) => s.status === 'online');
  const list = useLobby((s) => s.list);
  if (!online) return null;
  const shown = list.slice(0, HUB_LOBBY_ROWS);
  return (
    <section className="hub-lobbies" aria-label="Open lobbies" data-testid="hub-lobbies">
      <button className="hub-lobbies__head" onClick={() => (sfx.click(), openLobbiesSheet())} data-testid="lobbies-button">
        Open lobbies{list.length ? ` · ${list.length}` : ''}
      </button>
      {shown.length ? (
        <ul className="hub-lobbies__list">
          {shown.map((l) => {
            const full = l.players >= l.cap || l.locked;
            return (
              <li key={l.id} className="hub-lobbies__row" data-testid={`hub-lobby-${l.id}`}>
                <span className="hub-lobbies__what">
                  <strong>{l.host}</strong>
                  <small>
                    {lobbyWhat(l)} · {l.players}/{l.cap}
                    {l.playing ? ' · playing' : ''}
                  </small>
                </span>
                <button className="hub-lobbies__join" onClick={() => (sfx.click(), joinLobby(l.id))} disabled={full} data-testid={`hub-lobby-join-${l.id}`}>
                  {l.locked ? 'Locked' : full ? 'Full' : 'Join'}
                </button>
              </li>
            );
          })}
          {list.length > HUB_LOBBY_ROWS && (
            <li>
              <button className="hub-lobbies__more" onClick={() => (sfx.click(), openLobbiesSheet())}>
                +{list.length - HUB_LOBBY_ROWS} more
              </button>
            </li>
          )}
        </ul>
      ) : (
        <p className="hub-lobbies__none">None open. Host one at the Pavilion or a trial gate.</p>
      )}
    </section>
  );
}

/** The open lobbies in this Hub room, each with Join. */
export function LobbyList({ empty }: { empty?: string }) {
  const list = useLobby((s) => s.list);
  if (!list.length) return <p className="panel__note" data-testid="lobby-list-empty">{empty ?? 'Nobody is hosting right now. Host one from the Tournament Pavilion or a trial gate.'}</p>;
  return (
    <ul className="lobby-list" data-testid="lobby-list">
      {list.map((l) => {
        const full = l.players >= l.cap;
        return (
          <li key={l.id} className="lobby-list__row" data-testid={`lobby-row-${l.id}`}>
            <span className="lobby-list__what">
              <strong>{l.host}</strong>
              <span>
                {lobbyWhat(l)} · {l.players}/{l.cap}
                {l.locked ? ' · locked' : ''}
                {l.playing ? ' · playing (join to watch)' : ''}
              </span>
            </span>
            <ToyButton tone="sage" onClick={() => joinLobby(l.id)} disabled={full || l.locked} testId={`lobby-join-${l.id}`}>
              {l.locked ? 'Locked' : full ? 'Full' : 'Join'}
            </ToyButton>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------- host choices (gates and Pavilion)
/** Why hosting isn't possible right now, or null. */
function useHostBlock(): string | null {
  const status = useNet((s) => s.status);
  if (!onlineAvailable()) return "Online play isn't switched on in this build.";
  if (status !== 'online') return 'Join the online Hub to host a lobby (Settings, or Play online).';
  return null;
}

/** On a trial's intro card: practise with bots (the card's Start) or host this trial online. */
export function HostTrialRow({ game }: { game: MinigameId }) {
  const block = useHostBlock();
  const busy = useLobby((s) => s.busy);
  const offline = !isOnlineGame(game);
  return (
    <div className="setting intro-online" data-testid="online-lobby-note">
      <span>Online lobby</span>
      <button
        className="host-btn"
        disabled={!!block || busy || offline}
        title={block ?? undefined}
        data-testid="host-trial"
        onClick={() => {
          sfx.click();
          hostLobby({ ...DEFAULT_LOBBY_SETTINGS, mode: 'single', game });
        }}
      >
        {offline ? 'Not online yet' : block ? 'Join the online Hub to host' : 'Host this trial online'}
      </button>
    </div>
  );
}

/** Pavilion, online tab: host a tournament lobby with these settings, and the open lobbies. */
export function PavilionOnline({ format, onClose }: { format: TournamentFormatSel; onClose: () => void }) {
  const block = useHostBlock();
  const busy = useLobby((s) => s.busy);
  const [cap, setCap] = useState(8);
  const [botFill, setBotFill] = useState(true);
  const [difficulty, setDifficulty] = useState<BotDifficulty>('normal');
  return (
    <div className="pavilion-online" data-testid="pavilion-online">
      <p className="panel__note">
        Host a lobby: everyone in this Hub hears about it and can join at any time unless you lock it. You can kick players, cap the lobby, switch to one trial,
        and start when you're ready. Finished online tournaments go on the leaderboard.
      </p>
      <div className="intro-options">
        <LobbySeg label="Players" value={cap} options={[2, 3, 4, 5, 6, 7, 8]} onChange={setCap} testId="pav-cap" />
        <LobbySeg label="Bot fill" value={botFill ? 'on' : 'off'} options={['on', 'off']} onChange={(v) => setBotFill(v === 'on')} testId="pav-bots" />
        {botFill && <LobbySeg label="Bot skill" value={difficulty} options={['easy', 'normal', 'hard'] as BotDifficulty[]} onChange={setDifficulty} testId="pav-skill" />}
      </div>
      {block && <p className="online-error" data-testid="host-blocked">{block}</p>}
      <div className="pause__actions">
        <ToyButton
          tone="blue"
          disabled={!!block || busy}
          testId="host-tournament"
          onClick={() => {
            hostLobby({ ...DEFAULT_LOBBY_SETTINGS, mode: 'tournament', format, cap, botFill, difficulty });
          }}
        >
          Host online lobby
        </ToyButton>
        <ToyButton tone="ink" onClick={onClose}>
          Not now
        </ToyButton>
      </div>
      <span className="practice-list__title">Lobbies in this Hub</span>
      <LobbyList />
    </div>
  );
}
type TournamentFormatSel = LobbyFormat;

// ---------------------------------------------------------------- small controls
function LobbySeg<T extends string | number>({ label, value, options, onChange, disabled, testId, labels }: { label: string; value: T; options: T[]; onChange: (v: T) => void; disabled?: boolean; testId: string; labels?: Partial<Record<string, string>> }) {
  return (
    <div className="setting lobby-setting">
      <span>{label}</span>
      <div className="segmented lobby-seg" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button key={String(o)} role="radio" aria-checked={value === o} className={value === o ? 'on' : ''} disabled={disabled} data-testid={`${testId}-${o}`} onClick={() => (sfx.click(), onChange(o))}>
            {labels?.[String(o)] ?? String(o)}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- the lobby screen
function LobbyCard({ lobby, you }: { lobby: LobbyState; you: string }) {
  const host = lobby.hostId === you;
  const s = lobby.settings;
  const me = lobby.members.find((m) => m.id === you);
  const set = (p: Partial<LobbySettings>) => host && changeLobby(p);
  const def = gameById(s.game);
  const hostName = lobby.members.find((m) => m.id === lobby.hostId)?.name ?? '';
  return (
    <CardboardSheet title={host ? 'Your lobby' : `${hostName}'s lobby`} className="lobby-card">
      <div className="info-panel__sub" style={{ background: s.mode === 'single' ? def.accent : 'var(--honey)' }} data-testid="lobby-what">
        {s.mode === 'tournament' ? `${FORMATS[s.format].name} tournament · ${FORMATS[s.format].games} trials` : `${def.title} · ${durationLabel(def)}`} · Lobby {lobby.id}
      </div>
      <ul className="lobby-members" data-testid="lobby-members">
        {lobby.members.map((m) => (
          <li key={m.id} className={`lobby-member${m.id === you ? ' me' : ''}${m.off ? ' off' : ''}`} data-testid={`member-${m.name}`}>
            <span className="who__dot" style={{ background: (PAINT_JOBS[m.look.paint] ?? PAINT_JOBS[0]).body, borderColor: (PAINT_JOBS[m.look.paint] ?? PAINT_JOBS[0]).trim }} />
            <span className="lobby-member__name">
              {m.name}
              {m.id === you ? ' (you)' : ''}
            </span>
            {m.id === lobby.hostId && <span className="lobby-tag lobby-tag--host">Host</span>}
            {m.off && <span className="lobby-tag">reconnecting</span>}
            {m.ready && <span className="lobby-tag lobby-tag--ready">Ready</span>}
            {host && m.id !== you && (
              <button className="lobby-kick" onClick={() => (sfx.click(), kickFromLobby(m.id))} data-testid={`kick-${m.name}`}>
                Kick
              </button>
            )}
          </li>
        ))}
      </ul>
      <p className="panel__note lobby-note">
        {lobby.members.length}/{s.cap} players{s.locked ? ' · locked: nobody new can join' : ' · open: anyone in this Hub can join'}
        {s.botFill ? ` · bots fill the empty seats (${s.difficulty})` : ' · no bots'}
        {host ? '' : ' · only the host can change these'}
      </p>
      <div className="intro-options lobby-settings" data-testid="lobby-settings">
        <LobbySeg label="Play" value={s.mode} options={['single', 'tournament']} labels={{ single: 'One trial', tournament: 'Tournament' }} onChange={(v) => set({ mode: v })} disabled={!host} testId="lobby-mode" />
        {s.mode === 'tournament' ? (
          <LobbySeg label="Format" value={s.format} options={['blitz', 'normal', 'treasure'] as LobbyFormat[]} labels={{ blitz: 'Blitz · 3', normal: 'Normal · 5', treasure: 'Treasure · 8' }} onChange={(v) => set({ format: v })} disabled={!host} testId="lobby-format" />
        ) : null}
        <LobbySeg label="Player cap" value={s.cap} options={Array.from({ length: LOBBY_MAX_CAP - LOBBY_MIN_CAP + 1 }, (_, i) => i + LOBBY_MIN_CAP)} onChange={(v) => set({ cap: v })} disabled={!host} testId="lobby-cap" />
        <LobbySeg label="Joining" value={s.locked ? 'locked' : 'open'} options={['open', 'locked']} onChange={(v) => set({ locked: v === 'locked' })} disabled={!host} testId="lobby-lock" />
        <LobbySeg label="Bot fill" value={s.botFill ? 'on' : 'off'} options={['on', 'off']} onChange={(v) => set({ botFill: v === 'on' })} disabled={!host} testId="lobby-bots" />
        {s.botFill && <LobbySeg label="Bot skill" value={s.difficulty} options={['easy', 'normal', 'hard'] as BotDifficulty[]} onChange={(v) => set({ difficulty: v })} disabled={!host} testId="lobby-skill" />}
      </div>
      {s.mode === 'single' && (
        <>
          <span className="practice-list__title">{host ? 'Pick the trial' : 'The trial'}</span>
          <GameCardGrid selected={s.game} onPick={(id) => set({ game: id })} readOnly={!host} testPrefix="pick" disabledReason={(g) => (isOnlineGame(g.id) ? null : 'Not online yet')} />
        </>
      )}
      {s.mode === 'tournament' && (
        <p className="panel__note" data-testid="lobby-format-rule">
          The server deals the trials. {formatRule(s.format)}
        </p>
      )}
      <div className="pause__actions">
        {host ? (
          <ToyButton onClick={startLobby} testId="lobby-start" autoFocus>
            Start
          </ToyButton>
        ) : (
          <ToyButton tone={me?.ready ? 'sage' : 'honey'} onClick={() => setLobbyReady(!me?.ready)} testId="lobby-ready">
            {me?.ready ? 'Ready!' : "I'm ready"}
          </ToyButton>
        )}
        <ToyButton tone="ink" onClick={leaveLobby} testId="lobby-leave">
          Leave lobby
        </ToyButton>
      </div>
    </CardboardSheet>
  );
}

// ---------------------------------------------------------------- the online match screens
/** Seconds until the server moves the match on by itself (its `endsAt` is server time). */
function useSecondsLeft(endsAt: number | null) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 500);
    return () => window.clearInterval(id);
  }, []);
  if (endsAt === null) return null;
  const now = netLink.serverTime() ?? Date.now();
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

/**
 * The server's `reveal` phase: the trial's intro card, as in practice and local tournaments (the
 * same How to play steps, following the player's tutorial setting), with Ready. The server starts
 * the countdown once every seated player is ready, or when its time limit runs out.
 */
function OnlineIntro({ lobby, you }: { lobby: LobbyState; you: string }) {
  const match = lobby.match!;
  const def = gameById(match.game);
  const t = match.tournament;
  const touch = useGame((s) => s.touchUI);
  const left = useSecondsLeft(match.endsAt);
  const Extras = useMatch((s) => (s.gameId === match.game ? s.module?.IntroExtras : undefined));
  useEffect(() => sfx.windUp(8), [match.seq]);
  const me = lobby.members.find((x) => x.id === you);
  const seated = !!me && !me.spectating && match.seats.some((s) => s.id === you);
  const humans = lobby.members.filter((x) => !x.spectating && match.seats.some((s) => s.id === x.id));
  const readyCount = humans.filter((x) => x.ready).length;
  return (
    <CardboardSheet title={def.title} className="match-intro online-intro">
      <div className="info-panel__sub" style={{ background: def.accent }} data-testid="online-reveal">
        {t ? `${FORMATS[t.format].name} · Trial ${t.round + 1} of ${t.games.length}${t.round + 1 === t.games.length && isStrategy(def) ? ' · the finale' : ''}` : 'Online lobby'}
      </div>
      <div className="intro-length">
        <LengthChip def={def} /> <span>{durationLabel(def)}</span>
      </div>
      <IntroGuide key={match.seq} def={def} touch={touch} />
      {/* Game options that are the player's own (Music Box Rhythm's timing offset), as in local tournaments. */}
      {Extras && <Extras practice={false} />}
      <div className="intro-field">
        {match.seats.map((s) => {
          const m = lobby.members.find((x) => x.id === s.id);
          return (
            <span key={s.id} className="who" data-testid={`intro-seat-${s.name}`}>
              <span className="who__dot" style={{ background: (PAINT_JOBS[s.look.paint] ?? PAINT_JOBS[0]).body, borderColor: (PAINT_JOBS[s.look.paint] ?? PAINT_JOBS[0]).trim }} />
              {s.id === you ? <strong>{s.name} (you)</strong> : s.name}
              {!s.bot && m?.ready && <span className="lobby-tag lobby-tag--ready">Ready</span>}
            </span>
          );
        })}
      </div>
      <div className="pause__actions">
        {seated ? (
          <ToyButton armDelay={700} onClick={() => setLobbyReady(true, 'reveal')} disabled={me?.ready} autoFocus testId="online-intro-ready">
            {me?.ready ? `Waiting for the others… ${readyCount}/${humans.length}` : 'Ready!'}
          </ToyButton>
        ) : (
          <p className="panel__note">You are watching this trial; you join at the next one.</p>
        )}
        <ToyButton armDelay={700} tone="ink" onClick={leaveLobby} testId="online-intro-leave">
          Leave lobby
        </ToyButton>
      </div>
      {left !== null && (
        <p className="panel__note" data-testid="online-intro-left">
          Starts when everyone is ready, or in {left} s
        </p>
      )}
    </CardboardSheet>
  );
}

function OnlineResults({ lobby, you }: { lobby: LobbyState; you: string }) {
  const m = useMatch();
  const match = lobby.match!;
  const left = useSecondsLeft(match.endsAt);
  const res = match.result;
  if (!res) return null;
  const def = gameById(match.game);
  const mine = res.placements.find((p) => p.contestantId === you);
  const byId = (id: string) => m.contestants.find((c) => c.id === id);
  const me = lobby.members.find((x) => x.id === you);
  const t = match.tournament;
  return (
    <CardboardSheet title={mine ? (mine.place === 1 ? 'You win!' : `You placed ${ordinal(mine.place)}`) : 'Results'} className="results">
      <div className="info-panel__sub" style={{ background: def.accent }}>
        {def.title} · decided by the server
      </div>
      <ol className="results-list" data-testid="online-placements">
        {res.placements.map((p) => {
          const c = byId(p.contestantId);
          return (
            <li key={p.contestantId} className={p.contestantId === you ? 'me' : ''} data-place={p.place} data-name={c?.name}>
              <Medal place={p.place} />
              {c ? <Who c={c} /> : <span className="who">{p.contestantId}</span>}
              <span className="results-list__score">{p.forfeit ? 'forfeit' : def.scoring === 'elimination-order' && !p.eliminated ? 'last standing' : `${p.score} ${unit(def.recordUnit, p.score)}`}</span>
              {t && <span className="results-list__pts">+{pointsForPlace(p.place)}</span>}
            </li>
          );
        })}
      </ol>
      <div className="pause__actions">
        <ToyButton armDelay={700} onClick={() => setLobbyReady(true, 'results')} disabled={me?.ready} testId="online-continue">
          {me?.ready ? 'Waiting for the others…' : t && t.round + 1 < t.games.length ? 'Standings' : t ? 'Final standings' : 'Back to the lobby'}
        </ToyButton>
        <ToyButton armDelay={700} tone="ink" onClick={leaveLobby} testId="online-leave">
          Leave lobby
        </ToyButton>
      </div>
      {left !== null && <p className="panel__note">Moving on in {left} s</p>}
    </CardboardSheet>
  );
}

function OnlineStandingsTable({ lobby, you }: { lobby: LobbyState; you: string }) {
  const m = useMatch();
  const t = lobby.match!.tournament!;
  const ranked = rankStandings(t.standings);
  const nameOf = (id: string) => m.contestants.find((c) => c.id === id) ?? null;
  return (
    <div className="standings card-felt" style={{ ['--cols' as string]: t.games.length }} data-testid="online-standings">
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
      {ranked.map((s) => {
        const c = nameOf(s.contestantId);
        return (
          <div key={s.contestantId} className={`standings__row${s.contestantId === you ? ' me' : ''}`} data-place={s.place}>
            <Medal place={s.place} />
            {c ? <Who c={c} /> : <span className="who">{lobby.match!.forfeits.includes(s.contestantId) ? 'left' : s.contestantId}</span>}
            {t.games.map((_, i) => (
              <span key={i} className={i < s.rounds.length ? '' : 'dim'}>
                {s.rounds[i] ?? '·'}
              </span>
            ))}
            <strong>{s.points}</strong>
          </div>
        );
      })}
    </div>
  );
}

function OnlineStandings({ lobby, you, final }: { lobby: LobbyState; you: string; final: boolean }) {
  const match = lobby.match!;
  const t = match.tournament!;
  const me = lobby.members.find((x) => x.id === you);
  const mine = rankStandings(t.standings).find((s) => s.contestantId === you);
  const left = useSecondsLeft(match.endsAt);
  return (
    <CardboardSheet title={final ? (mine?.place === 1 ? 'Tournament champion!' : mine ? `Tournament over: ${ordinal(mine.place)} of ${t.standings.length}` : 'Tournament over') : 'Standings'} className={`standings-sheet${final ? ' final' : ''}`}>
      <div className="info-panel__sub" style={{ background: 'var(--honey)' }}>
        {FORMATS[t.format].name} · {final ? 'final table · on the leaderboard' : `after trial ${t.round + 1} of ${t.games.length}`}
      </div>
      <OnlineStandingsTable lobby={lobby} you={you} />
      <div className="pause__actions">
        <ToyButton armDelay={700} onClick={() => setLobbyReady(true, final ? 'final' : 'standings')} disabled={me?.ready} testId={final ? 'online-final-continue' : 'online-standings-next'}>
          {me?.ready ? 'Waiting for the others…' : final ? 'Back to the lobby' : 'Next trial'}
        </ToyButton>
        <ToyButton armDelay={700} tone="ink" onClick={leaveLobby}>
          Leave lobby
        </ToyButton>
      </div>
      {left !== null && <p className="panel__note">Moving on in {left} s</p>}
    </CardboardSheet>
  );
}

/** In play: the menu (Esc / gear) doesn't pause an online match; it offers to leave. */
function OnlineMenu({ spectating }: { spectating: boolean }) {
  return (
    <CardboardSheet title="Menu" icon={<GearIcon />} className="pause">
      <p className="panel__lead">The match keeps going: online trials don't pause. {spectating ? '' : 'Leaving now counts as a forfeit.'}</p>
      <div className="pause__actions">
        <ToyButton armDelay={300} onClick={() => pauseMatch(false)} autoFocus testId="online-menu-back">
          Back to the trial
        </ToyButton>
        <ToyButton armDelay={300} tone="ink" onClick={leaveLobby} testId="online-menu-leave">
          Leave lobby
        </ToyButton>
      </div>
    </CardboardSheet>
  );
}

function SpectatorBar({ lobby }: { lobby: LobbyState }) {
  const m = useMatch();
  const seats = lobby.match!.seats;
  const watched = seats.find((s) => s.id === m.localId);
  const next = () => {
    const i = seats.findIndex((s) => s.id === m.localId);
    const to = seats[(i + 1) % seats.length];
    if (to) watchSeat(to.id);
  };
  return (
    <div className="spectator-bar" data-testid="spectating">
      <span>
        Watching <strong>{watched?.name ?? '…'}</strong> · you join at the next trial
      </span>
      <button onClick={() => (sfx.click(), next())} data-testid="watch-next">
        Watch next
      </button>
    </div>
  );
}

/** The DOM side of an online lobby and its server-run match (MatchOverlay hands over to this). */
export function OnlineMatchOverlay() {
  const m = useMatch();
  const lobby = useLobby((s) => s.current);
  const you = useLobby((s) => s.you) ?? '';
  if (!lobby) {
    return (
      <div className="match-layer">
        <div className="loading match-loading">
          <span>Joining the lobby…</span>
        </div>
      </div>
    );
  }
  const match = lobby.match;
  const seated = !!match && match.seats.some((s) => s.id === you) && !lobby.members.find((x) => x.id === you)?.spectating;
  const inPlay = m.phase === 'countdown' || m.phase === 'playing';
  const Hud = m.module?.Hud;
  return (
    <div className="match-layer" data-testid="online-match" data-phase={m.phase}>
      {inPlay && Hud && seated && <div className="match-hud"><Hud getState={getMatchState} contestants={m.contestants} localId={m.localId} /></div>}
      {inPlay && (
        <button className="match-pause" aria-label="Menu" onClick={() => pauseMatch(true)}>
          <GearIcon size={26} color="#2B2433" />
        </button>
      )}
      {inPlay && !seated && match && <SpectatorBar lobby={lobby} />}
      {m.phase === 'countdown' && <Countdown />}
      {m.phase === 'lobby' && <LobbyCard lobby={lobby} you={you} />}
      {m.phase === 'reveal' && match && <OnlineIntro lobby={lobby} you={you} />}
      {inPlay && !m.module && (
        <div className="loading match-loading">
          <span>Setting the stage…</span>
        </div>
      )}
      {m.phase === 'results' && match && <OnlineResults lobby={lobby} you={you} />}
      {m.phase === 'standings' && match?.tournament && <OnlineStandings lobby={lobby} you={you} final={false} />}
      {m.phase === 'final' && match?.tournament && <OnlineStandings lobby={lobby} you={you} final />}
      {m.paused && inPlay && <OnlineMenu spectating={!seated} />}
      {m.error && <p className="online-error">{m.error}</p>}
    </div>
  );
}

/** The Pavilion's two choices, as tabs. */
export type PavilionTab = 'practice' | 'online';
export function PavilionTabs({ tab, onTab }: { tab: PavilionTab; onTab: (t: PavilionTab) => void }) {
  const online = useNet((s) => s.status === 'online');
  return (
    <div className="pavilion-tabs" role="tablist" aria-label="How to play">
      <button role="tab" aria-selected={tab === 'practice'} className={tab === 'practice' ? 'on' : ''} onClick={() => (sfx.click(), onTab('practice'))} data-testid="pavilion-practice">
        <strong>Practise with bots</strong>
        <span>On your own, any time</span>
      </button>
      <button role="tab" aria-selected={tab === 'online'} className={tab === 'online' ? 'on' : ''} onClick={() => (sfx.click(), onTab('online'))} data-testid="pavilion-host">
        <strong>Host an online lobby</strong>
        <span>{online ? 'Everyone in this Hub can join' : 'Needs the online Hub'}</span>
      </button>
    </div>
  );
}


// ---------------------------------------------------------------- the online leaderboard (Scoreboard panel)
/** Top players from server-run lobby tournaments, by format. Shown on the Hub Scoreboard. */
export function OnlineLeaderboard() {
  const [board, setBoard] = useState<LobbyFormat>('blitz');
  const entry = useLeaderboard((s) => s.boards[board]);
  useEffect(() => {
    void fetchLeaderboard(board);
  }, [board]);
  const rows = entry?.data?.entries ?? [];
  return (
    <section className="leaderboard" data-testid="leaderboard" aria-label="Online leaderboard">
      <div className="leaderboard__head">
        <strong>Online tournaments</strong>
        <div className="segmented lobby-seg" role="radiogroup" aria-label="Format">
          {(['blitz', 'normal', 'treasure'] as LobbyFormat[]).map((f) => (
            <button key={f} role="radio" aria-checked={board === f} className={board === f ? 'on' : ''} onClick={() => (sfx.click(), setBoard(f))} data-testid={`leaderboard-${f}`}>
              {FORMATS[f].name}
            </button>
          ))}
        </div>
      </div>
      {entry?.status === 'off' || !onlineAvailable() ? (
        <p className="panel__note">The online leaderboard needs the online server, which isn't switched on in this build.</p>
      ) : !rows.length ? (
        <p className="panel__note" data-testid="leaderboard-empty">
          {entry?.status === 'loading' || !entry ? 'Fetching the leaderboard…' : entry.status === 'error' ? "Couldn't reach the leaderboard. Try again in a minute." : `No ${FORMATS[board].name} tournaments finished online yet. Host one at the Pavilion!`}
        </p>
      ) : (
        <ol className="leaderboard__list">
          {rows.slice(0, 10).map((e, i) => (
            <li key={`${e.account}:${e.name}`} data-testid={`leaderboard-row-${e.name}`}>
              <Medal place={i + 1} />
              <span className="leaderboard__name">
                {e.name}
                {e.account && (
                  <span className="lobby-tag" title="Signed-in account">
                    acct
                  </span>
                )}
              </span>
              <span className="leaderboard__num">
                {e.wins} {e.wins === 1 ? 'win' : 'wins'}
              </span>
              <span className="leaderboard__num">{e.points} pts</span>
              <span className="leaderboard__num leaderboard__played">{e.played} played</span>
            </li>
          ))}
        </ol>
      )}
      <p className="panel__note">Only matches the server ran count. Practice and local tournaments stay on this device (below).</p>
    </section>
  );
}
