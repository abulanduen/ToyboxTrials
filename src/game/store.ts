import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { device } from './input';
import type { AccessorySlot } from './cosmetics';
import { defaultProfile, normalizeProfile, type Loadout, type Profile } from './profile';
import { STORE_VERSION, buyItem, dateKey, equipItem, migratePersisted, rewardSecret, unequipSlot, type BuyResult, type EquipResult } from './economy';
import type { MinigameId } from '../minigames/types';
import type { TournamentFormat } from '../minigames/tournament';
import { tourFlag } from './tourFlag';

export type Quality = 'low' | 'balanced' | 'high';
/** Top-level screens. `menu` = live 3D diorama main menu; `workshop` = customisation. */
export type Screen = 'menu' | 'playing' | 'workshop' | 'minigame';
export type MenuSheet = 'settings' | 'howto' | null;
/** The Workshop screen hosts two panels on the same turntable: the Workshop itself and the Odds & Ends shop. */
export type WorkshopMode = 'workshop' | 'shop';

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
  kind: 'tournament' | 'preview' | 'scoreboard' | 'lobbies' | 'jukebox';
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
  contenderName: string;
  /**
   * Wallet, owned items and the equipped loadout (paint, hat, key, accessories, gestures): one
   * serialisable object, so it can sync to an account later (docs/ECONOMY.md).
   */
  profile: Profile;
  secretsFound: string[];
  /** Per-minigame personal records. */
  records: Partial<Record<MinigameId, { best: number; plays: number; wins: number }>>;
  tournamentWins: Partial<Record<TournamentFormat, number>>;
  tournamentHistory: { format: TournamentFormat; place: number; of: number; games: MinigameId[]; at: number }[];
  /**
   * Music Box Rhythm latency calibration: how many ms late this device's taps arrive relative to
   * the music the player hears (subtracted from every press time before judging). Negative = early.
   */
  rhythmOffsetMs: number;
  /** Show the quick "how to play" tutorial on each minigame's intro card. */
  tutorials: boolean;
  /** Join the public online Hub automatically on entering the Hub (when online play is available). */
  autoOnline: boolean;
  /** Toy Squad: roster ids the player starred in the Toy Handbook (marked on shop cards). */
  squadFavourites: string[];
  /** Background music volume (0..1, times the master volume). Music Box Rhythm's own music ignores it. */
  musicVolume: number;
  /** Spoken lines (Pipwick and the gate greeters), 0..1 times the master volume. */
  voiceVolume: number;
  /** The Hub's background track, picked at the jukebox (src/game/musicScore.ts HUB_TRACKS, or 'off'). Local only. */
  hubTrack: string;
  /** The first-visit Hub tour has been shown (finished or skipped). */
  tourSeen: boolean;
}

interface SessionSlice {
  screen: Screen;
  /** Where to put the toy back in the hub after a minigame. */
  hubReturn: { x: number; z: number; yaw: number } | null;
  /** Where the Workshop returns to when closed. */
  workshopReturn: Screen;
  /** Which panel the Workshop screen shows. */
  workshopMode: WorkshopMode;
  /** Shop try-on: parts of the loadout shown on the toy without owning or equipping them. */
  tryOn: Partial<Loadout> | null;
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
  goTo: (screen: Screen) => void;
  openWorkshop: () => void;
  /** The Odds & Ends shop (same turntable as the Workshop). */
  openShop: () => void;
  /** Mark a secret found; the first time, also unlock its items and pay its cogs. */
  markSecret: (id: string) => boolean;
  /** Replace the profile (the economy functions return a new one). */
  setProfile: (p: Profile) => void;
  buy: (id: string) => BuyResult;
  equip: (id: string, gestureSlot?: number) => EquipResult;
  unequip: (slot: 'hat' | AccessorySlot) => void;
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
      contenderName: 'Ticker',
      profile: defaultProfile(),
      secretsFound: [],
      records: {},
      tournamentWins: {},
      tournamentHistory: [],
      rhythmOffsetMs: 0,
      tutorials: true,
      autoOnline: true,
      squadFavourites: [],
      musicVolume: 0.6,
      voiceVolume: 0.9,
      hubTrack: 'windowsill-waltz',
      tourSeen: false,

      // session
      screen: 'menu',
      workshopReturn: 'menu',
      workshopMode: 'workshop',
      tryOn: null,
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
      goTo: (screen) => set({ screen, paused: false, panel: null, menuSheet: null, prompt: null, tryOn: null }),
      openWorkshop: () => {
        const from = get().screen;
        set({ screen: 'workshop', workshopMode: 'workshop', tryOn: null, workshopReturn: from === 'workshop' ? get().workshopReturn : from, paused: false, panel: null, menuSheet: null, prompt: null });
      },
      openShop: () => {
        const from = get().screen;
        set({ screen: 'workshop', workshopMode: 'shop', tryOn: null, workshopReturn: from === 'workshop' ? get().workshopReturn : from, paused: false, panel: null, menuSheet: null, prompt: null });
      },
      markSecret: (id) => {
        if (get().secretsFound.includes(id)) return false;
        const { profile } = rewardSecret(get().profile, id, Date.now());
        set({ secretsFound: [...get().secretsFound, id], profile });
        return true;
      },
      setProfile: (profile) => set({ profile }),
      buy: (id) => {
        const r = buyItem(get().profile, id, dateKey(new Date()), Date.now());
        if (r.ok) set({ profile: r.profile });
        return r;
      },
      equip: (id, gestureSlot) => {
        const r = equipItem(get().profile, id, gestureSlot);
        if (r.ok) set({ profile: r.profile });
        return r;
      },
      unequip: (slot) => set({ profile: unequipSlot(get().profile, slot) }),
    }),
    {
      name: 'toybox-trials:prototype:v1',
      // v0 kept paintIndex/hat/keySkin at the top level; v1 moved them into `profile`.
      version: STORE_VERSION,
      migrate: (persisted, version) => migratePersisted(persisted, version) as unknown as GameState,
      // Whatever is stored, the profile that comes out is valid (unknown items dropped, nothing negative).
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<GameState>;
        return { ...current, ...p, profile: normalizeProfile(p.profile) };
      },
      partialize: (s) => ({
        masterVolume: s.masterVolume,
        sfxVolume: s.sfxVolume,
        quality: s.quality,
        mouseSensitivity: s.mouseSensitivity,
        invertY: s.invertY,
        showFps: s.showFps,
        contenderName: s.contenderName,
        profile: s.profile,
        secretsFound: s.secretsFound,
        records: s.records,
        tournamentWins: s.tournamentWins,
        tournamentHistory: s.tournamentHistory,
        rhythmOffsetMs: s.rhythmOffsetMs,
        tutorials: s.tutorials,
        autoOnline: s.autoOnline,
        squadFavourites: s.squadFavourites,
        musicVolume: s.musicVolume,
        voiceVolume: s.voiceVolume,
        hubTrack: s.hubTrack,
        tourSeen: s.tourSeen,
      }),
    },
  ),
);

/** True whenever gameplay input should be ignored (menus, panels, pause, workshop, the welcome tour). */
export function inputBlocked(s: GameState = useGame.getState()): boolean {
  return s.screen !== 'playing' || s.paused || s.panel !== null || tourFlag.active;
}

/** The loadout to draw on the local toy: what's equipped, with any shop try-on on top. */
export function useShownLoadout(): Loadout {
  const loadout = useGame((s) => s.profile.loadout);
  const tryOn = useGame((s) => s.tryOn);
  return useMemo(() => (tryOn ? { ...loadout, ...tryOn } : loadout), [loadout, tryOn]);
}
