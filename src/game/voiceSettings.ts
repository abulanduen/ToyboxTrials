/**
 * Voice chat settings (persisted in the game store): pure defaults and cleaning, so a save from
 * before voice chat, or one with a damaged value, comes out with valid settings. Unit-tested in
 * tests/unit/voice-chat.test.ts.
 *
 * Listening is on by default (the owner's choice): anyone nearby whose mic is on can be heard
 * unless the player mutes them or switches "Hear voice chat" off. The microphone itself is never
 * on by default: it is only asked for when the player presses the mic button or V, and it starts
 * off again every session.
 */
export type MicMode = 'ptt' | 'open';

export interface VoiceSettings {
  /** Hear other players' voices. */
  voiceHear: boolean;
  /** Voice chat volume, 0..1 (times the master volume). Separate from "Voice volume" (Pipwick's lines). */
  voiceChatVolume: number;
  /** `ptt`: hold V (or the mic button) to talk. `open`: the mic button (or V) switches the mic on and off. */
  micMode: MicMode;
}

export const VOICE_SETTING_DEFAULTS: VoiceSettings = { voiceHear: true, voiceChatVolume: 0.8, micMode: 'ptt' };

/** Valid voice settings from whatever a save holds (missing or invalid → the default). */
export function cleanVoiceSettings(saved: unknown): VoiceSettings {
  const s = saved && typeof saved === 'object' ? (saved as Record<string, unknown>) : {};
  const vol = s.voiceChatVolume;
  return {
    voiceHear: typeof s.voiceHear === 'boolean' ? s.voiceHear : VOICE_SETTING_DEFAULTS.voiceHear,
    voiceChatVolume: typeof vol === 'number' && Number.isFinite(vol) ? Math.max(0, Math.min(1, vol)) : VOICE_SETTING_DEFAULTS.voiceChatVolume,
    micMode: s.micMode === 'ptt' || s.micMode === 'open' ? s.micMode : VOICE_SETTING_DEFAULTS.micMode,
  };
}
