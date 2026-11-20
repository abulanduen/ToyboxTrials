/**
 * The Who Am I? card stuck on a toy's face (online Hub, the suspicious box). A paper index card
 * taped over the front of the head, drawn in code: a canvas texture with the word in big capitals
 * for everyone else, and a blank card with a "?" on the holder's own toy (the holder is never sent
 * their word: src/net/chat.ts, server/hubChat.ts).
 *
 * Rendered inside WindupBot's head group (its `faceStuck` slot), so it follows every head bob,
 * tilt and gesture. React re-renders only when a card goes on or comes off.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useChat } from '../net/chat';
import { useNet } from '../net/store';
import { PALETTE } from '../game/palette';

/** Card size in head units (the head is 1.18 wide): big enough to read across the Hub. */
const W = 2.3;
const H = 1.5;
const TEX_W = 512;
const TEX_H = Math.round((TEX_W * H) / W);

/** `who`: a player id, or 'self' for the local toy. Nothing is drawn while they wear no card. */
export function FaceCard({ who }: { who: string }) {
  const selfId = useNet((s) => s.selfId);
  const id = who === 'self' ? selfId : who;
  const word = useChat((s) => (id && id in s.cards ? (s.cards[id] ?? '?') : null));
  if (word === null) return null;
  return <PaperCard word={word} hidden={who === 'self' || word === '?'} />;
}

function drawCard(c: HTMLCanvasElement, word: string, hidden: boolean) {
  const g = c.getContext('2d');
  if (!g) return;
  g.clearRect(0, 0, TEX_W, TEX_H);
  // paper with an ink outline, ruled like an index card (a coral margin line, faint blue rules)
  g.fillStyle = PALETTE.white;
  g.fillRect(0, 0, TEX_W, TEX_H);
  g.globalAlpha = 0.28;
  g.strokeStyle = PALETTE.toyBlue;
  g.lineWidth = 3;
  for (let y = 112; y < TEX_H - 16; y += 46) {
    g.beginPath();
    g.moveTo(18, y);
    g.lineTo(TEX_W - 18, y);
    g.stroke();
  }
  g.globalAlpha = 0.5;
  g.strokeStyle = PALETTE.coral;
  g.beginPath();
  g.moveTo(18, 66);
  g.lineTo(TEX_W - 18, 66);
  g.stroke();
  g.globalAlpha = 1;
  g.strokeStyle = PALETTE.ink;
  g.lineWidth = 10;
  g.strokeRect(5, 5, TEX_W - 10, TEX_H - 10);

  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = PALETTE.ink;
  if (hidden) {
    g.font = '700 220px Fredoka, "Trebuchet MS", sans-serif';
    g.fillStyle = PALETTE.inkPurple;
    g.fillText('?', TEX_W / 2, TEX_H / 2 + 14);
    return;
  }
  // The word as large as it fits: one line, or two for a two-word card if that is bigger.
  const text = word.toUpperCase();
  const fit = (s: string, maxW: number, maxH: number) => {
    let px = Math.min(maxH, 190);
    g.font = `700 ${px}px Fredoka, "Trebuchet MS", sans-serif`;
    const w = g.measureText(s).width;
    if (w > maxW) px = Math.floor((px * maxW) / w);
    return px;
  };
  const parts = text.split(' ');
  const one = fit(text, TEX_W - 56, TEX_H - 60);
  const two = parts.length === 2 ? Math.min(fit(parts[0], TEX_W - 56, (TEX_H - 60) / 2), fit(parts[1], TEX_W - 56, (TEX_H - 60) / 2)) : 0;
  // a soft cream halo keeps the letters crisp against the rules when mipmapped
  g.lineJoin = 'round';
  g.strokeStyle = PALETTE.white;
  if (two > one * 1.15) {
    g.font = `700 ${two}px Fredoka, "Trebuchet MS", sans-serif`;
    g.lineWidth = two * 0.12;
    const gap = two * 0.95;
    for (const [i, p] of parts.entries()) {
      const y = TEX_H / 2 + (i === 0 ? -gap / 2 : gap / 2) + 6;
      g.strokeText(p, TEX_W / 2, y);
      g.fillText(p, TEX_W / 2, y);
    }
  } else {
    g.font = `700 ${one}px Fredoka, "Trebuchet MS", sans-serif`;
    g.lineWidth = one * 0.12;
    g.strokeText(text, TEX_W / 2, TEX_H / 2 + 8);
    g.fillText(text, TEX_W / 2, TEX_H / 2 + 8);
  }
}

function PaperCard({ word, hidden }: { word: string; hidden: boolean }) {
  const root = useRef<THREE.Group>(null!);
  const t = useRef(0);
  const { tex, front, back, tape } = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = TEX_W;
    canvas.height = TEX_H;
    drawCard(canvas, word, hidden);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    // Fredoka may still be loading on the first card: draw again once it is in.
    document.fonts?.load('700 100px Fredoka').then(
      () => {
        drawCard(canvas, word, hidden);
        tex.needsUpdate = true;
      },
      () => {},
    );
    return {
      tex,
      front: new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92 }),
      back: new THREE.MeshStandardMaterial({ color: PALETTE.cream, roughness: 0.95 }),
      tape: new THREE.MeshStandardMaterial({ color: PALETTE.cream, roughness: 0.6, transparent: true, opacity: 0.85 }),
    };
  }, [word, hidden]);
  useEffect(
    () => () => {
      tex.dispose();
      front.dispose();
      back.dispose();
      tape.dispose();
    },
    [tex, front, back, tape],
  );
  useEffect(() => {
    t.current = 0; // slap on
  }, [word, hidden]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    t.current += dt;
    const k = t.current;
    // Slapped on: arrives big and tilted, squashes flat against the face, wobbles to rest.
    const s = k < 0.12 ? 1.6 - (k / 0.12) * 0.75 : 1 - Math.sin((k - 0.12) * 22) * Math.exp(-(k - 0.12) * 7) * 0.12;
    root.current.scale.set(s, s, 1);
    root.current.rotation.z = -0.06 + (k < 0.6 ? Math.sin(k * 18) * Math.exp(-k * 6) * 0.35 : 0);
  });

  return (
    <group ref={root} position={[0, 0.74, 0.6]} name={hidden ? 'whoami:card-hidden' : `whoami:card:${word}`}>
      <mesh material={front}>
        <planeGeometry args={[W, H]} />
      </mesh>
      <mesh material={back} rotation={[0, Math.PI, 0]} position={[0, 0, -0.005]}>
        <planeGeometry args={[W, H]} />
      </mesh>
      {/* two strips of tape over the top corners */}
      {[-1, 1].map((side) => (
        <mesh key={side} material={tape} position={[side * (W / 2 - 0.16), H / 2 - 0.1, 0.012]} rotation={[0, 0, side * -0.7]}>
          <boxGeometry args={[0.62, 0.2, 0.01]} />
        </mesh>
      ))}
    </group>
  );
}
