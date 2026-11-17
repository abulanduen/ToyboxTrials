/**
 * Chase camera for movement minigames: sits behind and above the local toy and looks down the
 * course, so "forward" on the stick is always "away from the camera", as in the hub.
 *
 * It works in the course's own frame (a group that may be rotated/offset on the table) and
 * follows the toy by tracking it, never by lerping the camera through it. The first frame cuts.
 * Portrait screens get a wider FOV and a longer, higher boom so the course's width still fits.
 */
import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { player } from '../../game/player';

export interface ChaseShot {
  /** Camera height above the table and distance behind the toy (cm). */
  height: number;
  back: number;
  /** Look this far ahead of the toy, at this height. */
  ahead: number;
  lookY: number;
  /** How much of the toy's sideways position the camera follows (0..1). */
  followX: number;
}

export interface ChaseCamProps {
  /** The course group: camera maths happens in its local space. */
  frame: React.RefObject<THREE.Group | null>;
  /** Local-space position of the toy to follow. */
  target: () => { x: number; y: number; z: number } | null;
  landscape: ChaseShot;
  portrait: ChaseShot;
  /** Keep the camera's x within ±this (so it never leaves the course). */
  maxX?: number;
}

const _pos = new THREE.Vector3();
const _look = new THREE.Vector3();

export function ChaseCam({ frame, target, landscape, portrait, maxX = 99 }: ChaseCamProps) {
  const { camera, size } = useThree();
  const track = useRef({ x: 0, y: 0, z: 0, init: false });
  useFrame((_, rawDt) => {
    const f = frame.current;
    const tg = target();
    if (!f || !tg) return;
    const dt = Math.min(rawDt, 1 / 20);
    const cam = camera as THREE.PerspectiveCamera;
    const isPortrait = size.width < size.height;
    const shot = isPortrait ? portrait : landscape;
    const fov = isPortrait ? 50 + (1 - size.width / size.height) * 36 : 46;
    if (Math.abs(cam.fov - fov) > 0.1) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    const tr = track.current;
    const k = tr.init ? 1 - Math.exp(-7 * dt) : 1;
    tr.x += (tg.x - tr.x) * k;
    tr.z += (tg.z - tr.z) * k;
    tr.y += (tg.y - tr.y) * (tr.init ? 1 - Math.exp(-3 * dt) : 1);
    tr.init = true;
    const cx = THREE.MathUtils.clamp(tr.x * shot.followX, -maxX, maxX);
    f.updateWorldMatrix(true, false);
    _pos.set(cx, tr.y + shot.height, tr.z + shot.back);
    _look.set(cx, tr.y + shot.lookY, tr.z - shot.ahead);
    f.localToWorld(_pos);
    f.localToWorld(_look);
    cam.position.copy(_pos);
    cam.lookAt(_look);
    // Keep the sun's shadow frustum (and the High tier's focus) on the toy.
    _pos.set(tg.x, tg.y, tg.z);
    f.localToWorld(_pos);
    player.pos.copy(_pos);
  });
  return null;
}
