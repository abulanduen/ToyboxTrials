/**
 * Other online players in the hub: each one a WindupBot in their own paint, hat and key, moved by
 * interpolated snapshots (about 100 ms behind the newest) and animated from the interpolated
 * speed, with a DOM name tag above the head (rendered by NameTags in the overlay; this frame loop
 * moves it). Remote toys don't collide with the local toy.
 *
 * Per-frame work reads plain objects (net/remotes.ts); React only re-renders when the roster or
 * someone's cosmetics change.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { WindupBot } from './WindupBot';
import { FaceCard } from './FaceCard';
import { stepEmote, type ToyAnim } from './anim';
import { useNet } from '../net/store';
import { nameTagEls, remotes, upsertRemote } from '../net/remotes';
import { sampleRemote } from '../net/client';
import type { NetSample } from '../net/interp';
import type { PlayerInfo } from '../net/protocol';
import { EMOTE_DURATION } from '../game/emotes';
import { PAINT_JOBS } from '../game/palette';
import { cleanAccessories, isHatId, isKeySkinId } from '../game/cosmetics';
import { blobShadowTexture } from '../scene/textures';
import { groundHeightAt } from '../game/collision';
import { MINIGAMES } from '../minigames/registry';
import { RIDES, riderAt, type RidePose } from '../game/hubRides';
import { levelOfY } from '../game/hubBounds';
import { netLink } from '../net/link';
import { INTERP_DELAY_MS } from '../net/protocol';

/** Name tags further than this from the camera are hidden (cm). */
const TAG_RANGE = 90;
const damp = (a: number, b: number, l: number, dt: number) => THREE.MathUtils.lerp(a, b, 1 - Math.exp(-l * dt));
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

function activityText(a: string | null, off: boolean): string {
  if (off) return 'reconnecting…';
  if (!a) return '';
  if (a === 'workshop') return 'in the Workshop';
  if (a === 'shop') return 'at the Odds & Ends shop';
  const g = MINIGAMES.find((m) => m.id === a);
  return g ? `playing ${g.title}` : 'playing a trial';
}

export function RemotePlayers() {
  const players = useNet((s) => s.players);
  const selfId = useNet((s) => s.selfId);
  const online = useNet((s) => s.status === 'online' || s.status === 'reconnecting');
  if (!online) return null;
  return (
    <>
      {players
        .filter((p) => p.id !== selfId)
        .map((p) => (
          <RemoteToy key={p.id} info={p} />
        ))}
    </>
  );
}

function RemoteToy({ info }: { info: PlayerInfo }) {
  const remote = useMemo(() => remotes.get(info.id) ?? upsertRemote(info), [info]);
  const anim = useRef<ToyAnim>(remote.anim);
  anim.current = remote.anim;
  const root = useRef<THREE.Group>(null!);
  const shadow = useRef<THREE.Mesh>(null!);
  const st = useRef({ sample: { t: 0, x: 0, y: 0, z: 0, yaw: 0, speed: 0, grounded: true } as NetSample, placed: false, prevY: 0, prevYaw: 0, subText: '', tagShown: false, tagX: NaN, tagY: NaN, tagEl: undefined as HTMLElement | undefined });
  const head = useMemo(() => new THREE.Vector3(), []);
  const rideTmp = useMemo(() => ({ pose: { x: 0, y: 0, z: 0, f: [0, 0, 1], u: [0, 1, 0], yaw: 0, h: 0 } as RidePose, x: new THREE.Vector3(), y: new THREE.Vector3(), z: new THREE.Vector3(), m: new THREE.Matrix4() }), []);

  const paint = PAINT_JOBS[((info.look.paint % PAINT_JOBS.length) + PAINT_JOBS.length) % PAINT_JOBS.length];
  const hat = isHatId(info.look.hat) ? info.look.hat : 'none';
  const keySkin = isKeySkinId(info.look.keySkin) ? info.look.keySkin : 'classic';
  const { back, face, neck } = info.look;
  const accessories = useMemo(() => cleanAccessories({ back, face, neck }), [back, face, neck]);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    const s = st.current;
    const a = remote.anim;
    const r = sampleRemote(info.id, s.sample);
    const g = root.current;
    const tag = nameTagEls.get(info.id);
    if (tag !== s.tagEl) {
      // A new tag element (the overlay re-rendered it): start from its initial hidden state.
      s.tagEl = tag;
      s.tagShown = false;
      s.tagX = s.tagY = NaN;
      s.subText = '';
    }
    if (!r) {
      g.visible = false;
      shadow.current.visible = false;
      if (tag && s.tagShown) tag.style.display = 'none';
      s.tagShown = false;
      return;
    }
    g.visible = true;
    // On a ride between the levels: placed from the ride's own clock (smooth through the loop), drawn
    // as far behind the server as the snapshots are.
    let onRide = false;
    const rd = remote.ride;
    const serverNow = rd ? netLink.serverTime() : null;
    if (rd && serverNow !== null) {
      const t = (serverNow - INTERP_DELAY_MS) / 1000 - rd.t0;
      if (t >= RIDES[rd.kind].duration) remote.ride = null;
      else if (t >= 0) {
        const p = riderAt(rd.kind, t, rideTmp.pose);
        r.x = p.x;
        r.y = p.y;
        r.z = p.z;
        r.yaw = p.yaw;
        r.speed = 0;
        r.grounded = true;
        onRide = true;
      }
    }
    shadow.current.visible = !onRide;
    g.position.set(r.x, r.y, r.z);
    if (onRide) {
      const p = rideTmp.pose;
      rideTmp.z.set(p.f[0], p.f[1], p.f[2]);
      rideTmp.y.set(p.u[0], p.u[1], p.u[2]);
      rideTmp.x.crossVectors(rideTmp.y, rideTmp.z).normalize();
      rideTmp.y.crossVectors(rideTmp.z, rideTmp.x);
      g.quaternion.setFromRotationMatrix(rideTmp.m.makeBasis(rideTmp.x, rideTmp.y, rideTmp.z));
    } else g.rotation.set(0, r.yaw, 0);

    // Animation from the interpolated motion.
    a.speed = remote.activity ? 0 : r.speed;
    a.maxSpeed = 14;
    const wasGrounded = a.grounded;
    a.grounded = r.grounded;
    const vy = dt > 0 && s.placed ? (r.y - s.prevY) / dt : 0;
    a.vy = damp(a.vy, vy, 10, dt);
    if (a.grounded && !wasGrounded && s.placed) {
      a.landT = 0;
      a.landImpact = Math.min(2, Math.max(0.3, -a.vy / 14));
    }
    a.landT += dt;
    a.turnRate = damp(a.turnRate, dt > 0 && s.placed ? wrapAngle(r.yaw - s.prevYaw) / dt : 0, 12, dt);
    if (a.grounded) a.stepPhase += a.speed * dt * 1.35;
    stepEmote(a, dt, EMOTE_DURATION);
    s.prevY = r.y;
    s.prevYaw = r.yaw;
    s.placed = true;

    shadow.current.position.set(r.x, groundHeightAt(r.x, r.z, 0.85, r.y, levelOfY(r.y)) + 0.03, r.z);

    // Name tag: project the point above the head to the screen; hide when behind or far away.
    if (tag) {
      head.set(r.x, r.y + 4.5, r.z).project(state.camera);
      const show = head.z < 1 && Math.abs(head.x) < 1.2 && Math.abs(head.y) < 1.2 && state.camera.position.distanceTo(g.position) < TAG_RANGE;
      if (show !== s.tagShown) {
        tag.style.display = show ? '' : 'none';
        s.tagShown = show;
      }
      if (show) {
        const px = Math.round((head.x * 0.5 + 0.5) * state.size.width);
        const py = Math.round((-head.y * 0.5 + 0.5) * state.size.height);
        if (px !== s.tagX || py !== s.tagY) {
          tag.style.transform = `translate(-50%, -100%) translate(${px}px, ${py}px)`;
          s.tagX = px;
          s.tagY = py;
        }
      }
      const text = activityText(remote.activity, remote.off);
      if (text !== s.subText) {
        const sub = tag.querySelector<HTMLElement>('.name-tag__sub');
        if (sub) {
          sub.textContent = text;
          sub.style.display = text ? '' : 'none';
        }
        s.subText = text;
      }
    }
  });

  return (
    <>
      <group ref={root} visible={false}>
        <WindupBot anim={anim} paint={paint} hat={hat} keySkin={keySkin} accessories={accessories} faceStuck={<FaceCard who={info.id} />} />
      </group>
      <mesh ref={shadow} rotation={[-Math.PI / 2, 0, 0]} scale={3.2} renderOrder={1} visible={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={blobShadowTexture()} transparent depthWrite={false} opacity={0.85} />
      </mesh>
    </>
  );
}
