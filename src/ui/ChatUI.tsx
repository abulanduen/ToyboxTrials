/**
 * Online Hub text chat and the Who Am I? chip.
 *
 * - Desktop: a compact log bottom-left, above the controls card. Recent lines fade out after a
 *   while and come back while the chat is open. Enter or T opens the box (Enter interacts instead
 *   while an interaction prompt is showing, as before); Enter sends, Esc closes. Opening lets go of
 *   the pointer lock so the player can type; sending with Enter tries to take it back.
 * - Phones: a Chat button (≥ 56 px) opens a sheet with the log and a text box. The sheet follows
 *   the visual viewport, so the on-screen keyboard never covers the text box.
 * - Name tags: a speech bubble (text written by src/net/chat.ts) and, while a player wears a Who
 *   Am I? card, its word.
 * - Who Am I? chip: shown while your own card is on, with "Guess in chat" and "Peel it off".
 *
 * State lives in src/net/chat.ts (changes per message, never per frame).
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useGame } from '../game/store';
import { useNet } from '../net/store';
import { canChat, closeChat, openChat, peelCard, sendChat, toggleMute, useChat, type ChatLine } from '../net/chat';
import { CHAT_MAX } from '../net/chatFilter';
import { isTypingTarget } from '../game/input';
import { unlockAudio, sfx } from '../game/audio';
import { KeyCap } from './common';

// ---------------------------------------------------------------- name tags
/** Inside a remote player's name tag: the speech bubble and their Who Am I? card word. */
export function NameTagChat({ id }: { id: string }) {
  const word = useChat((s) => (id in s.cards ? s.cards[id] : undefined));
  return (
    <>
      <span className="name-tag__bubble" style={{ display: 'none' }} />
      {word && (
        <span className="name-tag__card" data-testid="name-tag-card">
          {word}
        </span>
      )}
    </>
  );
}

// ---------------------------------------------------------------- keys and closing rules
/** Enter / T open the chat (desktop), Esc closes it; anything that takes over the screen closes it. */
function useChatControls(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const open = useChat.getState().open;
      if (open && e.code === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeChat();
        return;
      }
      if (open || e.repeat || e.altKey || e.ctrlKey || e.metaKey || isTypingTarget(e.target)) return;
      const enter = e.code === 'Enter' || e.code === 'NumpadEnter';
      // Enter still interacts while a prompt is showing ("Open a suspicious box"): never steal it then.
      if (!(e.code === 'KeyT' || (enter && !useGame.getState().prompt)) || !canChat()) return;
      // Capture phase on window: the game's key handler never sees this press, and the letter
      // doesn't land in the box that opens.
      e.preventDefault();
      e.stopPropagation();
      openChat();
    };
    window.addEventListener('keydown', onKey, true);
    const offGame = useGame.subscribe((s, p) => {
      if (!useChat.getState().open) return;
      if ((s.pointerLocked && !p.pointerLocked) || s.screen !== 'playing' || s.paused || s.panel || !s.textChat) closeChat();
    });
    const offNet = useNet.subscribe((s) => {
      if (s.status !== 'online' && useChat.getState().open) closeChat();
    });
    return () => {
      window.removeEventListener('keydown', onKey, true);
      offGame();
      offNet();
      closeChat();
    };
  }, [active]);
}

// ---------------------------------------------------------------- the log
function useVisibleLines(max: number): ChatLine[] {
  const lines = useChat((s) => s.lines);
  const muted = useChat((s) => s.muted);
  const shown = muted.length ? lines.filter((l) => l.id === null || !muted.includes(l.id)) : lines;
  return shown.slice(-max);
}

/** `open`: the chat is open (desktop: names become a menu with Mute; phones mute from the People list instead). */
function LogLines({ open, max, nameMenu = true }: { open: boolean; max: number; nameMenu?: boolean }) {
  const lines = useVisibleLines(max);
  const selfId = useNet((s) => s.selfId);
  const [menu, setMenu] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines.length, open]);
  useEffect(() => {
    if (!open) setMenu(null);
  }, [open]);
  return (
    <div ref={box} className="chat-log__lines" data-testid="chat-lines" role="log" aria-live="polite">
      {lines.map((l) => {
        const other = open && nameMenu && l.id !== null && l.id !== selfId;
        return (
          <div key={l.key} className={`chat-line chat-line--${l.kind}${l.id === selfId ? ' chat-line--mine' : ''}`} data-testid="chat-line">
            {l.kind === 'say' &&
              (other ? (
                <button className="chat-line__name" onClick={() => setMenu(menu === l.key ? null : l.key)} aria-expanded={menu === l.key}>
                  {l.name}
                </button>
              ) : (
                <span className="chat-line__name">{l.name}</span>
              ))}
            <span className="chat-line__text">{l.text}</span>
            {other && menu === l.key && (
              <span className="chat-line__menu">
                <button
                  className="chat-mini-btn"
                  data-testid="chat-mute"
                  onClick={() => {
                    sfx.click();
                    toggleMute(l.id!);
                    setMenu(null);
                  }}
                >
                  Mute {l.name}
                </button>
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Muted players (open chat only), each with Unmute. */
function MutedRow() {
  const muted = useChat((s) => s.muted);
  const players = useNet((s) => s.players);
  if (!muted.length) return null;
  return (
    <div className="chat-muted" data-testid="chat-muted">
      <span>Muted:</span>
      {muted.map((id) => (
        <button key={id} className="chat-mini-btn" onClick={() => toggleMute(id)}>
          Unmute {players.find((p) => p.id === id)?.name ?? 'player'}
        </button>
      ))}
    </div>
  );
}

function ChatInput({ touch }: { touch: boolean }) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // Focus once open (on phones this brings up the keyboard: the tap that opened it counts).
    ref.current?.focus({ preventScroll: true });
  }, []);
  const send = (relock: boolean) => {
    if (sendChat(text)) setText('');
    if (!touch) closeChat(relock);
    else ref.current?.focus({ preventScroll: true });
  };
  return (
    <div className="chat-input">
      <input
        ref={ref}
        data-testid="chat-input"
        className="chat-input__box"
        value={text}
        maxLength={CHAT_MAX}
        placeholder={touch ? 'Say something…' : 'Say something… (Enter to send, Esc to close)'}
        aria-label="Chat message"
        autoComplete="off"
        autoCorrect="on"
        enterKeyHint="send"
        spellCheck
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            send(true);
          }
        }}
      />
      {touch && (
        <button className="chat-btn chat-btn--send" data-testid="chat-send" onClick={() => send(false)}>
          Send
        </button>
      )}
    </div>
  );
}

/** Desktop: the log bottom-left (in the HUD dock, above the controls card), and the box when open. */
function ChatDock() {
  const open = useChat((s) => s.open);
  const count = useChat((s) => s.lines.length);
  return (
    <div className={`chat-log${open ? ' chat-log--open' : ''}`} data-testid="chat-log" onMouseDown={(e) => e.target === e.currentTarget && e.preventDefault()}>
      {open && <MutedRow />}
      {(open || count > 0) && <LogLines open={open} max={open ? 50 : 7} />}
      {open ? (
        <ChatInput touch={false} />
      ) : (
        <div className="chat-log__hint">
          <KeyCap k="Enter" wide /> or <KeyCap k="T" /> to chat
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- phones
function TouchChat() {
  const open = useChat((s) => s.open);
  const unread = useChat((s) => s.unread);
  return (
    <>
      {!open && (
        <button
          className="touch-btn touch-btn--chat"
          aria-label="Chat"
          data-testid="chat-button"
          onClick={() => {
            unlockAudio();
            openChat();
          }}
        >
          <span>Chat</span>
          {unread > 0 && (
            <span className="touch-btn__badge" data-testid="chat-unread">
              {unread}
            </span>
          )}
        </button>
      )}
      {open && <ChatSheet />}
    </>
  );
}

/** Phone chat sheet, kept inside the visual viewport so the on-screen keyboard never hides the text box. */
function ChatSheet() {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const vv = window.visualViewport;
    const place = () => {
      const el = ref.current;
      if (!el) return;
      const top = vv ? vv.offsetTop : 0;
      const h = vv ? vv.height : window.innerHeight;
      const want = Math.min(h, Math.max(250, Math.round(h * 0.55)));
      el.style.top = `${Math.round(top + h - want)}px`;
      el.style.height = `${want}px`;
    };
    place();
    vv?.addEventListener('resize', place);
    vv?.addEventListener('scroll', place);
    window.addEventListener('resize', place);
    return () => {
      vv?.removeEventListener('resize', place);
      vv?.removeEventListener('scroll', place);
      window.removeEventListener('resize', place);
    };
  }, []);
  const [people, setPeople] = useState(false);
  return (
    <div ref={ref} className="chat-sheet" role="dialog" aria-label="Chat" data-testid="chat-sheet">
      {people ? <PeopleList /> : <LogLines open max={50} nameMenu={false} />}
      <div className="chat-sheet__row">
        <button className={`chat-btn chat-btn--people${people ? ' is-on' : ''}`} data-testid="chat-people" aria-pressed={people} onClick={() => setPeople((v) => !v)}>
          {people ? 'Chat' : 'People'}
        </button>
        <ChatInput touch />
        <button className="chat-btn chat-btn--close" data-testid="chat-close" aria-label="Close chat" onClick={() => closeChat()}>
          Close
        </button>
      </div>
    </div>
  );
}

/** Phones: everyone in the room, each with Mute / Unmute (≥ 56 px). */
function PeopleList() {
  const players = useNet((s) => s.players);
  const selfId = useNet((s) => s.selfId);
  const muted = useChat((s) => s.muted);
  const others = players.filter((p) => p.id !== selfId);
  return (
    <div className="chat-people" data-testid="chat-people-list">
      {others.length === 0 && <p className="chat-people__empty">Nobody else is here yet.</p>}
      {others.map((p) => (
        <div key={p.id} className="chat-people__row">
          <span>{p.name}</span>
          <button className="chat-btn chat-btn--peel" onClick={() => toggleMute(p.id)} data-testid={`chat-mute-${p.name}`}>
            {muted.includes(p.id) ? 'Unmute' : 'Mute'}
          </button>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- the HUD part
/** Chat in the Hub HUD: the desktop dock's log (`placement="dock"`) or the phone button and sheet. */
export function HubChat({ placement }: { placement: 'dock' | 'touch' }) {
  const online = useNet((s) => s.status === 'online' || s.status === 'reconnecting');
  const textChat = useGame((s) => s.textChat);
  useChatControls(online && textChat);
  if (!online || !textChat) return null;
  return placement === 'dock' ? <ChatDock /> : <TouchChat />;
}

/** While your own Who Am I? card is on: what's going on, and the two ways out. */
export function WhoAmIChip() {
  const selfId = useNet((s) => s.selfId);
  const wearing = useChat((s) => !!selfId && selfId in s.cards);
  const textChat = useGame((s) => s.textChat);
  const touch = useGame((s) => s.touchUI);
  if (!wearing) return null;
  return (
    <div className="whoami-chip" data-testid="whoami-chip" role="status">
      <span className="whoami-chip__card" aria-hidden>
        ?
      </span>
      <div className="whoami-chip__body">
        <strong>Who Am I?</strong>
        <span>Something's stuck to your face! Ask the others, then guess in chat.</span>
        {!textChat && <span className="whoami-chip__warn">Text chat is off: turn it on in Settings to guess.</span>}
        <div className="whoami-chip__actions">
          {textChat && (
            <button className="chat-btn" data-testid="whoami-guess" onClick={() => openChat()}>
              {touch ? 'Guess in chat' : 'Guess (T)'}
            </button>
          )}
          <button
            className="chat-btn chat-btn--peel"
            data-testid="whoami-peel"
            onClick={() => {
              sfx.click();
              peelCard();
            }}
          >
            Peel it off
          </button>
        </div>
      </div>
    </div>
  );
}
