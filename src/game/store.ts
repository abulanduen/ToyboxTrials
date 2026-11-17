import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { device } from './input';
import type { HatId, KeySkinId } from './cosmetics';
import type { MinigameId } from '../minigames/types';
import type { TournamentFormat } from '../minigames/tournament';

export type Quality = 'low' | 'balanced' | 'high';
/** Top-level screens. `menu` = live 3D diorama main menu; `workshop` = customisation. */
export type Screen = 'menu' | 'playing' | 'workshop' | 'minigame';
export type MenuSheet = 'settings' | 'howto' | null;

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
  kind: 'tournament' | 'preview' | 'scoreboard' | 'shop';
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
  hat: HatId;
  keySkin: KeySkinId;
  contenderName: string;
  secretsFound: string[];
  /** Per-minigame personal records. */
  records: Partial<Record<MinigameId, { best: number; plays: number; wins: number }>>;
  tournamentWins: Partial<Record<TournamentFormat, number>>;
  tournamentHistory: { format: TournamentFormat; place: number; of: number; games: MinigameId[]; at: number }[];
}

interface SessionSlice {
  screen: Screen;
  /** Where to put the toy back in the hub after a minigame. */
  hubReturn: { x: number; z: number; yaw: number } | null;
  /** Where the Workshop returns to when closed. */
  workshopReturn: Screen;
  /** Overlay sheet on the main menu. */
  menuSheet: MenuSheet;
  /** First frames rendered (hides the loading card). */
  ready: boolean;
  paused: boolean;
  prompt: Prompt | null;
  tickets: Ticket[];
  panel: Panel | null;
  boostUntil: number;
  pointerLocked: boolean;
  /** Show on-screen touch controls (touch-primary device, or a touch was seen). */
  touchUI: boolean;
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
  goTo: (screen: Screen) => void;
  openWorkshop: () => void;
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
      // Phones/tablets start on Low; players can raise it in the pause menu.
      quality: device.touch ? 'low' : 'balanced',
      mouseSensitivity: 1,
      invertY: false,
      showFps: false,
      paintIndex: 0,
      hat: 'none',
      keySkin: 'classic',
      contenderName: 'Ticker',
      secretsFound: [],
      records: {},
      tournamentWins: {},
      tournamentHistory: [],

      // session
      screen: 'menu',
      workshopReturn: 'menu',
      hubReturn: null,
      menuSheet: null,
      ready: false,
      paused: false,
      prompt: null,
      tickets: [],
      panel: null,
      boostUntil: 0,
      pointerLocked: false,
      touchUI: device.touch,

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
      goTo: (screen) => set({ screen, paused: false, panel: null, menuSheet: null, prompt: null }),
      openWorkshop: () => {
        const from = get().screen;
        set({ screen: 'workshop', workshopReturn: from === 'workshop' ? get().workshopReturn : from, paused: false, panel: null, menuSheet: null, prompt: null });
      },
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
        hat: s.hat,
        keySkin: s.keySkin,
        contenderName: s.contenderName,
        secretsFound: s.secretsFound,
        records: s.records,
        tournamentWins: s.tournamentWins,
        tournamentHistory: s.tournamentHistory,
      }),
    },
  ),
);

/** True whenever gameplay input should be ignored (menus, panels, pause, workshop). */
export function inputBlocked(s: GameState = useGame.getState()): boolean {
  return s.screen !== 'playing' || s.paused || s.panel !== null;
}
