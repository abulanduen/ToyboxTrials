import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Quality = 'low' | 'balanced' | 'high';
export type Screen = 'title' | 'playing';

export interface Prompt {
  id: string;
  verb: string;
  label: string;
}

export interface Ticket {
  id: number;
  title: string;
  body: string;
  tone: 'info' | 'reward' | 'warning';
}

export interface Panel {
  kind: 'copycat' | 'preview' | 'scoreboard' | 'shop';
  title: string;
  subtitle?: string;
  body?: string;
  accent?: string;
}

/** Persisted player-facing settings. Kept separate from session state so they can sync later. */
interface SettingsSlice {
  masterVolume: number; // 0..1
  sfxVolume: number; // 0..1
  quality: Quality;
  mouseSensitivity: number; // 0.5..2
  invertY: boolean;
  showFps: boolean;
  paintIndex: number;
  secretsFound: string[];
}

interface SessionSlice {
  screen: Screen;
  paused: boolean;
  prompt: Prompt | null;
  tickets: Ticket[];
  panel: Panel | null;
  boostUntil: number;
  pointerLocked: boolean;
}

interface Actions {
  set: (patch: Partial<SettingsSlice & SessionSlice>) => void;
  setPrompt: (p: Prompt | null) => void;
  pushTicket: (t: Omit<Ticket, 'id'>) => void;
  dropTicket: (id: number) => void;
  openPanel: (p: Panel) => void;
  closePanel: () => void;
  togglePause: (force?: boolean) => void;
  cyclePaint: () => void;
  markSecret: (id: string) => boolean;
}

export type GameState = SettingsSlice & SessionSlice & Actions;

let ticketSeq = 1;

export const useGame = create<GameState>()(
  persist(
    (set, get) => ({
      // settings
      masterVolume: 0.8,
      sfxVolume: 0.9,
      quality: 'balanced',
      mouseSensitivity: 1,
      invertY: false,
      showFps: false,
      paintIndex: 0,
      secretsFound: [],

      // session
      screen: 'title',
      paused: false,
      prompt: null,
      tickets: [],
      panel: null,
      boostUntil: 0,
      pointerLocked: false,

      set: (patch) => set(patch),
      setPrompt: (p) => {
        const cur = get().prompt;
        if (cur?.id === p?.id && cur?.verb === p?.verb && cur?.label === p?.label) return;
        set({ prompt: p });
      },
      pushTicket: (t) => {
        const id = ticketSeq++;
        set({ tickets: [...get().tickets.slice(-2), { ...t, id }] });
        window.setTimeout(() => get().dropTicket(id), 4200);
      },
      dropTicket: (id) => set({ tickets: get().tickets.filter((t) => t.id !== id) }),
      openPanel: (p) => set({ panel: p }),
      closePanel: () => set({ panel: null }),
      togglePause: (force) => set({ paused: force ?? !get().paused }),
      cyclePaint: () => set({ paintIndex: get().paintIndex + 1 }),
      markSecret: (id) => {
        if (get().secretsFound.includes(id)) return false;
        set({ secretsFound: [...get().secretsFound, id] });
        return true;
      },
    }),
    {
      name: 'toybox-trials:prototype:v1',
      partialize: (s) => ({
        masterVolume: s.masterVolume,
        sfxVolume: s.sfxVolume,
        quality: s.quality,
        mouseSensitivity: s.mouseSensitivity,
        invertY: s.invertY,
        showFps: s.showFps,
        paintIndex: s.paintIndex,
        secretsFound: s.secretsFound,
      }),
    },
  ),
);

/** True whenever gameplay input should be ignored (menus, panels, pause, title). */
export function inputBlocked(s: GameState = useGame.getState()): boolean {
  return s.screen !== 'playing' || s.paused || s.panel !== null;
}
