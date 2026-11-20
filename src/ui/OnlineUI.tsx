/**
 * Online Hub UI: the "Play online" sheet (main menu, pause menu, #room= deep links), the compact
 * HUD chip while online, and the touch Emote menu. Same cardboard/toy styling as the other menus.
 */
import { useEffect, useRef, useState } from 'react';
import { useGame } from '../game/store';
import { useNet, roomLink } from '../net/store';
import { nameTagEls } from '../net/remotes';
import { joinOnline, leaveOnline, leaveOnlineByChoice, onlineAvailable } from '../net/client';
import { OFFLINE_TEXT } from '../net/config';
import { ROOM_CODE_LENGTH } from '../net/protocol';
import { EMOTE_LABELS } from '../game/emotes';
import { GestureGlyph } from './itemIcons';
import { EMOTE_ACTIONS, tapVirtual } from '../game/input';
import { unlockAudio } from '../game/audio';
import { CardboardSheet, ToyButton } from './common';
import { NameTagChat } from './ChatUI';

const cleanName = (v: string) => v.replace(/[^\p{L}\p{N} '\-]/gu, '').slice(0, 16);
const cleanCode = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, ROOM_CODE_LENGTH);

export function openOnlineSheet() {
  useNet.getState().set({ sheetOpen: true, error: null });
}

export function OnlineSheet() {
  const status = useNet((s) => s.status);
  const error = useNet((s) => s.error);
  const joining = useNet((s) => s.joining);
  const room = useNet((s) => s.room);
  const name = useGame((s) => s.contenderName);
  const setGame = useGame((s) => s.set);
  const [code, setCode] = useState(() => (joining?.kind === 'code' ? cleanCode(joining.code) : ''));
  const available = onlineAvailable();
  const busy = status === 'connecting';

  const close = () => {
    if (busy) leaveOnline(true);
    useNet.getState().set({ sheetOpen: false, error: null });
  };
  const joinCode = () => code.length === ROOM_CODE_LENGTH && joinOnline({ kind: 'code', code });

  let statusLine: string | null = null;
  if (busy) statusLine = joining?.kind === 'host' ? 'Setting up your room…' : joining?.kind === 'code' ? `Joining room ${cleanCode(joining.code)}…` : 'Finding a public Hub…';
  else if (status === 'online' && room) statusLine = room.kind === 'private' ? `You're in room ${room.code}.` : `You're in Public Hub ${room.instance}.`;

  return (
    <CardboardSheet title="Play online" className="online-sheet" onBackdrop={close}>
      {!available ? (
        <p className="panel__lead" data-testid="online-off">
          {OFFLINE_TEXT} For now, the Playroom and every trial work on your own.
        </p>
      ) : (
        <>
          <p className="panel__lead">Walk around the Playroom with friends, see each other and wave hello. Trials stay single-player for now.</p>
          <label className="online-name">
            <span>Nickname</span>
            <input
              data-testid="online-name"
              value={name}
              maxLength={16}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setGame({ contenderName: cleanName(e.target.value) })}
              onBlur={() => !name.trim() && setGame({ contenderName: 'Ticker' })}
            />
          </label>
          <div className="online-actions">
            <ToyButton testId="online-public" onClick={() => joinOnline({ kind: 'public' })} disabled={busy}>
              Join public Hub
            </ToyButton>
            <ToyButton tone="blue" testId="online-host" onClick={() => joinOnline({ kind: 'host' })} disabled={busy}>
              Host private room
            </ToyButton>
            <div className="online-code">
              <input
                data-testid="online-code"
                value={code}
                placeholder="CODE"
                aria-label="Room code"
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => setCode(cleanCode(e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') joinCode();
                }}
              />
              <ToyButton tone="sage" testId="online-join-code" onClick={joinCode} disabled={busy || code.length !== ROOM_CODE_LENGTH}>
                Join with code
              </ToyButton>
            </div>
          </div>
          {statusLine && (
            <p className="online-status" aria-live="polite">
              {statusLine}
            </p>
          )}
          {error && (
            <p className="online-error" role="alert" data-testid="online-error">
              {error}
            </p>
          )}
        </>
      )}
      <div className="pause__actions">
        <ToyButton tone="ink" onClick={close} testId="online-close">
          {busy ? 'Cancel' : 'Back'}
        </ToyButton>
      </div>
    </CardboardSheet>
  );
}

/** Compact status chip in the hub HUD while online. */
export function OnlineChip() {
  const status = useNet((s) => s.status);
  const room = useNet((s) => s.room);
  const count = useNet((s) => s.players.length);
  const [shared, setShared] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  if (status === 'offline' || status === 'connecting' || !room) return null;

  const flash = (text: string) => {
    setShared(text);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setShared(null), 2500);
  };
  const share = async () => {
    if (!room.code) return;
    const url = roomLink(room.code);
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share && useGame.getState().touchUI) {
      try {
        await nav.share({ title: 'Toybox Trials', text: `Join my Toybox Trials room: ${room.code}`, url });
        return;
      } catch {
        /* cancelled or refused: fall back to copying */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      flash('Link copied');
    } catch {
      flash(`Code ${room.code}`);
    }
  };

  const reconnecting = status === 'reconnecting';
  return (
    <div className={`online-chip${reconnecting ? ' online-chip--warn' : ''}`} data-testid="online-chip">
      <span className={`online-chip__dot${reconnecting ? ' online-chip__dot--warn' : ''}`} aria-hidden />
      <span className="online-chip__text">
        <strong data-testid="online-room">{room.kind === 'private' ? `Room ${room.code}` : `Public Hub ${room.instance}`}</strong>
        <span data-testid="online-count">{shared ?? (reconnecting ? 'Reconnecting…' : `${count} ${count === 1 ? 'toy' : 'toys'} online`)}</span>
      </span>
      {room.kind === 'private' && (
        <button className="online-chip__btn" data-testid="online-share" onClick={share}>
          Share
        </button>
      )}
      <button className="online-chip__btn online-chip__btn--leave" data-testid="online-leave" onClick={() => leaveOnlineByChoice()}>
        Leave
      </button>
    </div>
  );
}

/**
 * Name tags for the other players: plain DOM over the canvas. React only adds and removes them
 * when the roster changes; the 3D frame loop (RemotePlayers) moves each one above its toy.
 */
export function NameTags() {
  const players = useNet((s) => s.players);
  const selfId = useNet((s) => s.selfId);
  const online = useNet((s) => s.status === 'online' || s.status === 'reconnecting');
  if (!online) return null;
  return (
    <div className="name-tags" aria-hidden>
      {players
        .filter((p) => p.id !== selfId)
        .map((p) => (
          <div
            key={p.id}
            className="name-tag"
            data-player={p.id}
            style={{ display: 'none' }}
            ref={(el) => {
              if (el) nameTagEls.set(p.id, el);
              else if (nameTagEls.get(p.id)) nameTagEls.delete(p.id);
            }}
          >
            <span className="name-tag__name">{p.name}</span>
            <span className="name-tag__sub" style={{ display: 'none' }} />
            <NameTagChat id={p.id} />
          </div>
        ))}
    </div>
  );
}

/** Touch: an Emote button that opens the four equipped gestures beside it. */
export function TouchEmotes() {
  const [open, setOpen] = useState(false);
  const gestures = useGame((s) => s.profile.loadout.gestures);
  return (
    <div className="emote-touch">
      {open && (
        <div className="emote-menu" role="menu" aria-label="Emotes" data-testid="emote-menu">
          {gestures.map((id, i) => (
            <button
              key={id}
              role="menuitem"
              className="emote-menu__btn"
              data-testid={`emote-${id}`}
              onClick={(e) => {
                tapVirtual(EMOTE_ACTIONS[i], e.timeStamp);
                setOpen(false);
              }}
            >
              <GestureGlyph id={id} />
              <span>{EMOTE_LABELS[id]}</span>
            </button>
          ))}
        </div>
      )}
      <button
        className={`touch-btn touch-btn--emote${open ? ' is-open' : ''}`}
        aria-label="Emote"
        aria-expanded={open}
        data-testid="emote-button"
        onClick={() => {
          unlockAudio();
          setOpen((o) => !o);
        }}
      >
        <span>Emote</span>
      </button>
    </div>
  );
}
