/**
 * "This one is you": a bouncing arrow with a YOU tag over the local player's toy, so you can find
 * yourself among the other toys at the start of a match. It shows through the intro and countdown
 * and for the first few seconds of play, then fades away (the games' own floor rings stay).
 *
 * It is a sprite with a fixed on-screen size (sizeAttenuation off), so it reads the same on a
 * phone in portrait as on a desktop, however far the game's camera is from the toys, and it draws
 * on top of everything so a crowd can't hide it. Mount it inside the local toy's group.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PALETTE } from '../../game/palette';
import { useMatch } from '../session';

/** Seconds of play the marker stays fully visible for, then how long it takes to fade. */
const HOLD_S = 3.5;
const FADE_S = 0.8;
/** Height on screen, as a fraction of the viewport's height. */
const SCREEN_H = 0.085;
const TEX_W = 256;
const TEX_H = 224;

let shared: THREE.CanvasTexture | null = null;
let users = 0;

/** Draw the tag and arrow onto `c`. */
function paint(c: HTMLCanvasElement) {
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, TEX_W, TEX_H);
  const ink = PALETTE.ink;
  g.lineJoin = 'round';
  g.lineWidth = 12;
  g.strokeStyle = ink;
  // The YOU tag: a honey pill with an ink outline.
  const pill = { x: 28, y: 12, w: TEX_W - 56, h: 104 };
  g.beginPath();
  g.roundRect(pill.x, pill.y, pill.w, pill.h, pill.h / 2);
  g.fillStyle = PALETTE.honey;
  g.fill();
  g.stroke();
  g.fillStyle = ink;
  g.font = `700 70px Fredoka, 'Trebuchet MS', system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('YOU', TEX_W / 2, pill.y + pill.h / 2 + 4);
  // The arrow, pointing down at the toy.
  g.beginPath();
  g.moveTo(TEX_W / 2 - 46, 134);
  g.lineTo(TEX_W / 2 + 46, 134);
  g.lineTo(TEX_W / 2, TEX_H - 14);
  g.closePath();
  g.fillStyle = PALETTE.honey;
  g.fill();
  g.stroke();
}

/** The tag and arrow, drawn once and shared by every marker. */
function markerTexture() {
  if (shared) return shared;
  const c = document.createElement('canvas');
  c.width = TEX_W;
  c.height = TEX_H;
  paint(c);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  shared = tex;
  // If the web font wasn't ready for the first draw, draw again once it is.
  document.fonts?.ready.then(() => {
    paint(c);
    tex.needsUpdate = true;
  });
  return tex;
}

/**
 * @param height where the arrow's tip sits, in the parent group's units (above the toy's hat).
 * @param visible false hides it (e.g. the toy is out); the timing is the match's.
 * @param waiting for games that open behind a panel (Spellbox's spell draft): while it returns
 *   true the marker stays up, and its few seconds start when it turns false.
 */
export function YouMarker({ height = 5.2, visible = true, waiting }: { height?: number; visible?: boolean; waiting?: () => boolean }) {
  const sprite = useRef<THREE.Sprite>(null!);
  const material = useMemo(
    () => new THREE.SpriteMaterial({ map: markerTexture(), sizeAttenuation: false, depthTest: false, depthWrite: false, transparent: true, toneMapped: false, fog: false }),
    [],
  );
  useEffect(() => {
    users++;
    return () => {
      material.dispose();
      if (--users === 0 && shared) {
        shared.dispose();
        shared = null;
      }
    };
  }, [material]);
  const playingSince = useRef(-1);
  const reduced = useRef(window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  useFrame(({ clock, camera }) => {
    const sp = sprite.current;
    const now = clock.elapsedTime;
    const phase = useMatch.getState().phase;
    let o = 0;
    if (phase === 'intro' || phase === 'countdown' || (phase === 'playing' && waiting?.())) {
      playingSince.current = -1;
      o = 1;
    } else if (phase === 'playing') {
      if (playingSince.current < 0) playingSince.current = now;
      const t = now - playingSince.current;
      o = t < HOLD_S ? 1 : Math.max(0, 1 - (t - HOLD_S) / FADE_S);
    } else playingSince.current = -1;
    sp.visible = visible && o > 0.01;
    if (!sp.visible) return;
    material.opacity = o;
    // A fixed fraction of the screen's height: undo the projection's own scale.
    // (The sprite shader scales a perspective sprite by its depth; an orthographic camera's
    // projection holds its own scale, so the same formula works for both.)
    const h = (SCREEN_H * 2) / camera.projectionMatrix.elements[5];
    sp.scale.set(h * (TEX_W / TEX_H), h, 1);
    // Bounce: the anchor sits at the arrow's tip, lifted by a hop.
    const hop = reduced.current ? 0 : Math.abs(Math.sin(now * 4.2)) * 0.22;
    sp.center.set(0.5, -hop);
  });

  return <sprite ref={sprite} material={material} position={[0, height, 0]} renderOrder={1000} frustumCulled={false} raycast={() => {}} />;
}
