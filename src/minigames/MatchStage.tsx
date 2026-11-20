/**
 * In-canvas side of the minigame host: drives the session clock and shows either the active
 * game's Scene or a contestant lineup / tournament podium on the tabletop.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { endFrame } from '../game/input';
import { PALETTE } from '../game/palette';
import { useGame } from '../game/store';
import { WindupBot } from '../character/WindupBot';
import { createToyAnim, type ToyAnim } from '../character/anim';
import { MiniContender, createMiniAnim, type MiniAnim } from '../character/MiniContender';
import { feltMat, woodMat } from '../scene/props';
import { getMatchState, tickMatch, useMatch } from './session';
import { rankStandings } from './scoring';

export function MatchStage() {
  const module = useMatch((s) => s.module);
  const contestants = useMatch((s) => s.contestants);
  const phase = useMatch((s) => s.phase);
  const localId = useMatch((s) => s.localId);

  useFrame((_, dt) => {
    tickMatch(dt * 1000);
    endFrame(); // the hub controller isn't mounted, so the host owns the input frame boundary
  });

  const showGame = !!module && phase !== 'final' && phase !== 'reveal' && phase !== 'loading';
  const gameId = useMatch((s) => s.gameId);
  useWarmShaders(showGame ? `${gameId}:${localId}` : null, phase === 'playing');
  if (showGame) {
    const Scene = module.Scene;
    // Remounted per trial and per viewer, so a spectator switching toys starts from a clean Scene.
    return <Scene key={localId} getState={getMatchState} contestants={contestants} localId={localId} />;
  }
  return <Lineup podium={phase === 'final'} />;
}

/**
 * Compile the trial's shaders up front, while its intro card is up, instead of the first time each
 * effect, enemy or flash appears mid-play (on Windows a compile can stall a frame for tens to
 * hundreds of ms: felt as stutter). three's compile covers hidden objects too, so pooled effects
 * are included. Once when the trial's scene mounts and again as play begins (some games mount
 * more of their set then). compileAsync uses parallel compiling where the browser offers it.
 */
function useWarmShaders(key: string | null, playing: boolean) {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    if (!key) return;
    const id = requestAnimationFrame(() => {
      // With post-processing on, the scene draws into the composer's buffer, whose shaders differ
      // from drawing to the screen (linear output, no tone mapping): compile for that target.
      const g = useGame.getState();
      const post = g.quality !== 'low' && g.perfStep < 2;
      const prev = gl.getRenderTarget();
      const rt = post ? new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType }) : null;
      try {
        if (rt) gl.setRenderTarget(rt);
        void gl.compileAsync(scene, camera).catch(() => {});
      } catch {
        /* a context that can't precompile just compiles on first draw, as before */
      } finally {
        if (rt) {
          gl.setRenderTarget(prev);
          rt.dispose();
        }
      }
    });
    return () => cancelAnimationFrame(id);
  }, [key, playing, gl, scene, camera]);
}

/** Contestants lined up on a felt mat (between rounds), or on a block podium (final). */
function Lineup({ podium }: { podium: boolean }) {
  const contestants = useMatch((s) => s.contestants);
  const standings = useMatch((s) => s.tournament?.standings);
  const { camera } = useThree();
  const localAnim = useRef<ToyAnim>(createToyAnim());
  const minis = useRef(new Map<string, MiniAnim>());

  const order = useMemo(() => {
    if (podium && standings) {
      const ranked = rankStandings(standings);
      return ranked.map((r) => ({ c: contestants.find((c) => c.id === r.contestantId)!, place: r.place })).filter((x) => x.c);
    }
    return contestants.map((c, i) => ({ c, place: i + 1 }));
  }, [podium, standings, contestants]);

  // Positions: podium (2nd left, 1st centre, 3rd right, others behind) or a straight line.
  const placed = useMemo(() => {
    const out: { c: (typeof order)[number]['c']; x: number; y: number; z: number; place: number }[] = [];
    if (podium) {
      const slots = [
        { x: 0, y: 4.2 },
        { x: -6, y: 2.8 },
        { x: 6, y: 1.6 },
      ];
      order.forEach((o, i) => {
        if (i < 3) out.push({ ...o, ...slots[i], z: 0 });
        else out.push({ ...o, x: -9 + (i - 3) * 3.6, y: 0, z: -6 });
      });
    } else {
      const n = order.length;
      order.forEach((o, i) => out.push({ ...o, x: (i - (n - 1) / 2) * 4.2, y: 0, z: 0 }));
    }
    return out;
  }, [order, podium]);

  useFrame((s, dt) => {
    const t = s.clock.elapsedTime;
    const portrait = (camera as THREE.PerspectiveCamera).aspect < 1;
    camera.position.set(Math.sin(t * 0.1) * 2, portrait ? 14 : 9, portrait ? 40 : 26);
    camera.lookAt(0, 3, 0);
    const a = localAnim.current;
    if (a.interactT >= 0) a.interactT = a.interactT + dt > 0.75 ? -1 : a.interactT + dt;
    else if (podium && Math.sin(t * 1.3) > 0.97) a.interactT = 0; // celebratory hops
  });

  return (
    <group>
      <mesh position={[0, 0.1, -1]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={feltMat(PALETTE.felt)}>
        <circleGeometry args={[18, 40]} />
      </mesh>
      {podium &&
        [
          { x: 0, h: 4.2, c: PALETTE.honey, n: '1' },
          { x: -6, h: 2.8, c: '#C9C7C2', n: '2' },
          { x: 6, h: 1.6, c: '#C98E57', n: '3' },
        ].map((b) => (
          <mesh key={b.n} position={[b.x, b.h / 2, 0]} castShadow receiveShadow material={woodMat(b.c)}>
            <boxGeometry args={[5, b.h, 4]} />
          </mesh>
        ))}
      {placed.map(({ c, x, y, z }) =>
        c.isLocal ? (
          <group key={c.id} position={[x, y, z]}>
            <WindupBot anim={localAnim} paint={c.paint} hat={c.hat} keySkin={c.keySkin} accessories={c.accessories} />
          </group>
        ) : (
          <group key={c.id} position={[x, y, z]}>
            <MiniContender paint={c.paint} anim={{ current: minis.current.get(c.id) ?? minis.current.set(c.id, createMiniAnim()).get(c.id)! }} />
          </group>
        ),
      )}
    </group>
  );
}
