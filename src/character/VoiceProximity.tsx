/**
 * Proximity voice chat's frame loop (renders nothing): every frame in the Hub it hands voiceChat.ts
 * where the local toy and the other players are, the camera's right-hand direction for stereo
 * panning, and the push-to-talk action (V or the held mic button, from the shared input layer).
 * Positions come from the plain remote-player objects (remotes.ts), never from React state.
 */
import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useNet } from '../net/store';
import { remotes } from '../net/remotes';
import { sampleRemote } from '../net/client';
import type { NetSample } from '../net/interp';
import { voiceFrame, type VoiceFrameInput } from '../net/voiceChat';
import type { VoiceCandidate } from '../net/voicePlan';
import { player } from '../game/player';
import { isDown, takePresses } from '../game/input';
import { useGame } from '../game/store';

export function VoiceProximity() {
  const st = useMemo(() => ({ sample: { t: 0, x: 0, y: 0, z: 0, yaw: 0, speed: 0, grounded: true } as NetSample, pool: [] as VoiceCandidate[], input: { self: { x: 0, z: 0 }, others: [], rightX: 1, rightZ: 0, talk: false, presses: 0 } as VoiceFrameInput }), []);
  // V pressed in a trial, the Workshop or offline doesn't count once back in the Hub.
  useEffect(() => void takePresses('talk'), []);
  useFrame((state) => {
    const presses = takePresses('talk');
    const net = useNet.getState();
    if (net.status !== 'online') return;
    const others: VoiceCandidate[] = [];
    let i = 0;
    for (const p of net.players) {
      if (p.id === net.selfId) continue;
      const r = remotes.get(p.id);
      const s = r ? sampleRemote(p.id, st.sample) : null;
      if (!r || !s) continue;
      const c = (st.pool[i++] ??= { id: '', x: 0, z: 0, micOn: false, inHub: false });
      c.id = p.id;
      c.x = s.x;
      c.z = s.z;
      c.micOn = false; // filled in by the planner from the server's list
      c.inHub = !r.activity && !r.off;
      others.push(c);
    }
    const e = state.camera.matrixWorld.elements; // column 0 = the camera's right-hand direction
    const f = st.input;
    f.self.x = player.pos.x;
    f.self.z = player.pos.z;
    f.others = others;
    f.rightX = e[0];
    f.rightZ = e[2];
    f.talk = isDown('talk');
    const g = useGame.getState();
    f.presses = g.paused || g.panel ? 0 : presses; // V in the pause menu or a panel does nothing
    voiceFrame(f);
  });
  return null;
}
