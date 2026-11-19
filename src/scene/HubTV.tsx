/**
 * The little retro TV beside the Scoreboard (layout.ts TV): a chunky wooden set on splayed legs
 * with two knobs and a rabbit-ear aerial, built in the toy style and merged into one mesh.
 *
 * Its screen is a 160 × 120 canvas drawn in a 5 × 7 pixel font (pixelFont.ts) and shown with
 * nearest-neighbour magnification, so it reads as a pixel-art screen. It flips between cards
 * (tvCards.ts) every few seconds: who is online in this Hub, friends in a trial, the shop's
 * featured item and your records. Interacting with the TV changes channel.
 *
 * Never per frame: a 1 s timer (not the render loop) works out which card is up and redraws the
 * canvas only when that card or its content has changed, and at most every 2 s (a channel change
 * by hand redraws at once). It reads the net store, the remote players' plain objects and the game
 * store directly: no React state changes at all.
 */
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { PALETTE } from '../game/palette';
import { events } from '../game/events';
import { useGame } from '../game/store';
import { camBlock } from '../game/player';
import { HATS, KEY_SKINS } from '../game/cosmetics';
import { SECRET_IDS } from '../game/interactables';
import { exposeDebug } from '../game/debug';
import { useNet } from '../net/store';
import { remotes } from '../net/remotes';
import { fetchLeaderboard, useLeaderboard } from '../net/leaderboard';
import { useLobby } from '../net/lobby';
import { Kit } from './kit';
import { TV } from './layout';
import { drawPixelText, textWidth, ADVANCE } from './pixelFont';
import { TV_CARDS, TV_ROWS, tvCard, tvCardKey, tvChannel, type TvCard, type TvFeatured, type TvInputs } from './tvCards';

const W = 160;
const H = 120;
/** Screen size on the set (4 : 3) and where it sits, in TV-local cm. */
export const TV_SCREEN = { w: 6.2, h: 4.65, x: -0.85, y: 5.05, z: TV.d / 2 + 0.32 };
/** Tip of the left aerial (TV-local), for the bunting from the Scoreboard. */
export const TV_AERIAL_TIP: [number, number, number] = [-2.4, 12.2, -1.0];
const SCREEN_BG = PALETTE.inkPurple;

function buildBody() {
  const k = new Kit();
  const P = PALETTE;
  const { w, d } = TV;
  const legH = 1.6;
  const bodyH = 6.8;
  // cabinet on four splayed legs
  k.block(w, bodyH, d, 0, legH + bodyH / 2, 0, P.coral, {}, 0.7);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl(0.26, 0.16, legH + 0.3, sx * (w / 2 - 1.1), legH / 2, sz * (d / 2 - 1), P.woodDark, 8, { rz: -sx * 0.12, rx: sz * 0.12 });
  // dark bezel round the screen, standing proud of the cabinet front
  k.block(TV_SCREEN.w + 0.7, TV_SCREEN.h + 0.7, 0.4, TV_SCREEN.x, TV_SCREEN.y, d / 2 + 0.02, P.ink, {}, 0.15);
  // control panel: two knobs and a speaker grille
  const px = w / 2 - 1.15;
  k.cyl(0.5, 0.5, 0.5, px, 6.6, d / 2 + 0.15, P.cream, 16, { rx: Math.PI / 2 });
  k.cyl(0.5, 0.5, 0.5, px, 5.1, d / 2 + 0.15, P.honey, 16, { rx: Math.PI / 2 });
  for (let i = 0; i < 4; i++) k.box(1.3, 0.14, 0.2, px, 3.9 - i * 0.38, d / 2 + 0.02, P.ink);
  // rabbit-ear aerial on a little dome
  k.ball(0.8, 0.4, legH + bodyH, -1.0, P.honey, 12, { s: [1, 0.55, 1] });
  k.rod([0.2, legH + bodyH + 0.2, -1.0], TV_AERIAL_TIP, 0.09, P.ink, 6);
  k.rod([0.6, legH + bodyH + 0.2, -1.0], [3.2, 11.8, -1.2], 0.09, P.ink, 6);
  k.ball(0.28, ...TV_AERIAL_TIP, P.honey, 8);
  k.ball(0.28, 3.2, 11.8, -1.2, P.honey, 8);
  return k.build();
}

/** Everything the cards need, read straight from the stores and the remote players' objects. */
function gatherInputs(featured: TvFeatured[]): TvInputs {
  const net = useNet.getState();
  const g = useGame.getState();
  // The online leaderboard card (refreshed at most every LEADERBOARD_TTL_MS while online).
  if (net.status === 'online') void fetchLeaderboard('blitz');
  const blitz = useLeaderboard.getState().boards.blitz;
  const players = net.players.map((p) => ({
    id: p.id,
    name: p.name,
    // the TV is in the hub, so this player is in the hub too while they can see it
    activity: p.id === net.selfId ? null : (remotes.get(p.id)?.activity ?? null),
  }));
  return {
    status: net.status,
    room: net.room,
    selfId: net.selfId,
    players,
    records: g.records,
    tournamentWins: Object.values(g.tournamentWins).reduce((a, b) => a + (b ?? 0), 0),
    secrets: g.secretsFound.length,
    secretTotal: SECRET_IDS.length,
    featured,
    leaders: blitz?.data ? { board: 'blitz', entries: blitz.data.entries } : null,
    lobbies: useLobby.getState().list.length,
  };
}

function drawCard(g: CanvasRenderingContext2D, card: TvCard, index: number) {
  g.fillStyle = SCREEN_BG;
  g.fillRect(0, 0, W, H);
  // title bar
  g.fillStyle = card.accent;
  g.fillRect(0, 0, W, 20);
  drawPixelText(g, card.title, Math.round((W - textWidth(card.title, 2)) / 2), 3, 2, PALETTE.ink);
  // body
  card.lines.slice(0, TV_ROWS).forEach((l, i) => drawPixelText(g, l.text, 5, 25 + i * 10, 1, l.color ?? PALETTE.cream));
  if (card.swatch) {
    // the featured item as a chunky pixel block with a highlight
    g.fillStyle = PALETTE.ink;
    g.fillRect(W - 46, 30, 38, 38);
    g.fillStyle = card.swatch;
    g.fillRect(W - 43, 33, 32, 32);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(W - 40, 36, 10, 4);
  }
  // channel dots
  TV_CARDS.forEach((_, i) => {
    g.fillStyle = i === index ? PALETTE.honey : 'rgba(244,232,206,0.3)';
    g.fillRect(W - 6 - (TV_CARDS.length - i) * (ADVANCE + 1), H - 7, 4, 4);
  });
  // scanlines
  g.fillStyle = 'rgba(0,0,0,0.16)';
  for (let y = 1; y < H; y += 2) g.fillRect(0, y, W, 1);
}

export function HubTV() {
  const body = useMemo(buildBody, []);
  const featured = useMemo<TvFeatured[]>(
    () => [
      ...HATS.filter((h) => h.id !== 'none').map((h) => ({ name: h.name, blurb: h.blurb, swatch: h.swatch, kind: 'Hat' })),
      ...KEY_SKINS.filter((k) => k.id !== 'classic').map((k) => ({ name: k.name, blurb: k.blurb, swatch: k.swatch, kind: 'Wind-up key' })),
    ],
    [],
  );
  const screen = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    // unlit and just under white, so the picture never trips the bloom (threshold 1.0)
    const mat = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(0.9, 0.9, 0.9), toneMapped: false });
    return { canvas, ctx: canvas.getContext('2d')!, tex, mat };
  }, []);
  const mats = useMemo(() => ({ solid: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }) }), []);

  useEffect(() => {
    const t0 = performance.now();
    const st = { key: '', drawnAt: -Infinity, skip: 0, draws: 0, card: null as TvCard | null, index: 0 };
    const tick = (force = false) => {
      const now = performance.now();
      const { index, cycle } = tvChannel((now - t0) / 1000, st.skip);
      const card = tvCard(TV_CARDS[index], gatherInputs(featured), cycle);
      const key = `${index}#${tvCardKey(card)}`;
      if (key === st.key) return;
      if (!force && now - st.drawnAt < 2000) return; // at most every couple of seconds
      drawCard(screen.ctx, card, index);
      screen.tex.needsUpdate = true;
      st.key = key;
      st.drawnAt = now;
      st.card = card;
      st.index = index;
      st.draws++;
    };
    tick(true);
    const id = window.setInterval(() => tick(), 1000);
    const off = events.on('tv:next', () => {
      st.skip++;
      tick(true);
    });
    exposeDebug({ tv: () => ({ card: st.card?.id ?? null, title: st.card?.title ?? '', lines: st.card?.lines.map((l) => l.text) ?? [], draws: st.draws, index: st.index }) });
    return () => {
      window.clearInterval(id);
      off();
    };
  }, [featured, screen]);

  useEffect(
    () => () => {
      Object.values(body).forEach((g) => g?.dispose());
      screen.tex.dispose();
      screen.mat.dispose();
      mats.solid.dispose();
    },
    [body, screen, mats],
  );

  return (
    <group position={[TV.x, 0, TV.z]} rotation={[0, TV.rot, 0]}>
      {body.solid && <mesh geometry={body.solid} material={mats.solid} castShadow receiveShadow ref={camBlock} />}
      <mesh position={[TV_SCREEN.x, TV_SCREEN.y, TV_SCREEN.z]} material={screen.mat}>
        <planeGeometry args={[TV_SCREEN.w, TV_SCREEN.h]} />
      </mesh>
    </group>
  );
}
