/**
 * Canvas, lighting, atmosphere and post-processing for the Playroom.
 * Quality tiers trade shadows/post-processing/resolution for frame rate.
 */
import { DEFAULT_FOV } from './cameraDefaults';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { AdaptiveDpr, Environment, Lightformer } from '@react-three/drei';
import { Bloom, DepthOfField, EffectComposer, TiltShift2, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import { PerformanceGuard } from './PerformanceGuard';
import { useGame, type Quality } from '../game/store';
import { PALETTE } from '../game/palette';
import { player } from '../game/player';
import { PlayerController } from '../character/PlayerController';
import { RemotePlayers } from '../character/RemotePlayers';
import { VoiceProximity } from '../character/VoiceProximity';
import { Room, LAMP_HEAD, LAMP_AIM } from './Room';
import { sunRig } from './room/bake';
import { exposeDebug } from '../game/debug';
import { MatchStage } from '../minigames/MatchStage';
import { Village } from './Village';

/**
 * Quality tiers. `shadow` is the sun's shadow-map size (null = no shadow maps): the fixed shadow
 * frustum covering both tables is about 1.24 : 1 in light space (sunRig), so texels stay square.
 * Low (the default on touch devices) has no shadow maps and no post-processing: the toys keep
 * their blob shadows and the room's lighting is baked, so it still reads as a sunlit room.
 *
 * Fill cost: with post-processing every frame is drawn into a multisampled half-float buffer and
 * then through the bloom chain, the focus blur and the final grade, all at the canvas's pixel
 * size. That is most of the GPU time on laptops, and it grows with the square of the pixel ratio,
 * so the post tiers cap the ratio (`dpr`) and the multisample count (`msaa`) rather than render a
 * high-DPI screen at full density: Balanced (the desktop default) at 1.25× with 2 samples, High
 * at 1.5× with 4. On a 2× laptop screen that is about a third (Balanced) and a half (High) of the
 * samples per frame they used to cost.
 */
const QUALITY: Record<Quality, { dpr: [number, number]; shadow: [number, number] | null; post: 'none' | 'tilt' | 'dof'; msaa: number }> = {
  low: { dpr: [1, 1.25], shadow: null, post: 'none', msaa: 0 },
  balanced: { dpr: [1, 1.25], shadow: [2048, 1664], post: 'tilt', msaa: 2 },
  high: { dpr: [1, 1.5], shadow: [4096, 3328], post: 'dof', msaa: 4 },
};
/** Bloom's mip chain: 5 levels instead of the default 8 (the glow is a soft rim, not a wide haze). */
const BLOOM_LEVELS = 5;

function Lights({ quality }: { quality: Quality }) {
  const q = QUALITY[quality];
  const sun = useRef<THREE.DirectionalLight>(null!);
  const spot = useRef<THREE.SpotLight>(null!);
  const { scene } = useThree();
  const rig = useMemo(sunRig, []);

  useEffect(() => {
    // Lights' targets must be in the scene graph to update. Capture them now: the refs are
    // cleared before this cleanup runs when the canvas remounts (quality change) or unmounts.
    const sunTarget = sun.current.target;
    const spotTarget = spot.current.target;
    scene.add(sunTarget);
    scene.add(spotTarget);
    sunTarget.position.copy(rig.target);
    // The frustum props above only set fields: three never rebuilds a shadow camera's projection
    // by itself, so without this the map would cover the default 10 × 10 cm around the target.
    sun.current.shadow.camera.updateProjectionMatrix();
    spotTarget.position.copy(LAMP_AIM);
    return () => {
      scene.remove(sunTarget);
      scene.remove(spotTarget);
    };
  }, [scene, rig]);

  return (
    <>
      {/* sky + room bounce: warm from above, wood/felt from below */}
      <hemisphereLight args={['#FFF1DA', '#8A6A50', 1.05]} />
      {/* afternoon sun through the window (key light, casts shadows on Balanced/High) */}
      <directionalLight
        ref={sun}
        position={rig.position}
        color="#FFDDAE"
        intensity={2.5}
        castShadow={!!q.shadow}
        shadow-mapSize-width={q.shadow?.[0] ?? 512}
        shadow-mapSize-height={q.shadow?.[1] ?? 512}
        shadow-camera-left={rig.l}
        shadow-camera-right={rig.r}
        shadow-camera-top={rig.t}
        shadow-camera-bottom={rig.b}
        shadow-camera-near={rig.near}
        shadow-camera-far={rig.far}
        shadow-bias={-0.0005}
        shadow-normalBias={0.05}
        shadow-radius={2.5}
      />
      {/* the desk lamp: a warm honey pool over the square */}
      <spotLight ref={spot} position={LAMP_HEAD} color={PALETTE.honey} intensity={2.0} angle={0.85} penumbra={0.9} decay={0} distance={0} />
      {/* soft fill from the room side (the camera's usual side) so sun-backlit toys keep readable faces */}
      <directionalLight position={[-70, 60, 110]} color="#E6DCEA" intensity={0.75} />
    </>
  );
}

function Effects({ quality, sharp }: { quality: Quality; sharp: boolean }) {
  const perfStep = useGame((st) => st.perfStep);
  const q = QUALITY[quality];
  const target = useMemo(() => new THREE.Vector3(), []);
  const dofRef = useRef<{ target?: THREE.Vector3 } | null>(null);
  const tiltRef = useRef<unknown>(null);
  useFrame(() => {
    target.set(player.pos.x, player.pos.y + 1.8, player.pos.z);
    if (dofRef.current) dofRef.current.target = target;
  });
  useEffect(() => { exposeDebug({ postprocessing: { state: () => ({ quality, focusBlur: !sharp && q.post !== 'none', focusBlurMounted: !!dofRef.current || !!tiltRef.current }) } }); }, [quality, sharp, q.post]);
  // The performance guard's second step drops post-processing on a device that can't keep up.
  if (q.post === 'none' || perfStep >= 2) return null;
  return (
    // Recreate the pass chain when removing DOF so High never keeps the previous scene buffer.
    <EffectComposer key={sharp ? 'minigame' : 'hub'} multisampling={q.msaa} enableNormalPass={false}>
      {!sharp && (q.post === 'dof' ? (
        <DepthOfField ref={dofRef as never} target={target} worldFocusRange={38} bokehScale={4.5} resolutionScale={0.5} />
      ) : (
        <TiltShift2 ref={tiltRef as never} blur={0.22} taper={0.42} start={[0, 0.42]} end={[1, 0.42]} samples={6} direction={[1, 1]} />
      ))}
      {/* Threshold stays at 1.0: lower let pixel-sized highlights on glossy props flash (hub flicker). */}
      <Bloom intensity={0.35} luminanceThreshold={1.0} luminanceSmoothing={0.2} mipmapBlur levels={BLOOM_LEVELS} />
      <Vignette offset={0.28} darkness={0.55} eskil={false} />
      {/* The composer renders the scene in linear HDR and switches the renderer's own tone
          mapping off, so apply the same ACES curve here: every tier then shares one grade. */}
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}

function SceneContents() {
  const quality = useGame((s) => s.quality);
  // The giant room is shared; the tabletop shows either the village hub or the active trial's set.
  const inMatch = useGame((s) => s.screen === 'minigame');
  return (
    <>
      <color attach="background" args={['#CDB79C']} />
      <fog attach="fog" args={['#D4BFA2', 140, 560]} />
      {/* Local, network-free environment map for soft reflections on plastic and brass */}
      <Environment resolution={64} frames={1}>
        <Lightformer form="rect" intensity={2.2} color="#FFE7C2" position={[30, 40, -60]} scale={[60, 40, 1]} />
        <Lightformer form="rect" intensity={0.7} color="#BFD6EA" position={[-60, 20, 40]} scale={[60, 30, 1]} />
        <Lightformer form="ring" intensity={1.4} color={PALETTE.honey} position={[-30, 50, -40]} scale={8} />
        <Lightformer form="rect" intensity={0.5} color="#8A6A4E" position={[0, -30, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[200, 200, 1]} />
      </Environment>
      <Lights quality={quality} />
      <Room />
      {inMatch ? (
        <MatchStage />
      ) : (
        <>
          <Village />
          <PlayerController />
          <RemotePlayers />
          <VoiceProximity />
        </>
      )}
      <Effects quality={quality} sharp={inMatch} />
    </>
  );
}

export function PlayroomScene() {
  const quality = useGame((s) => s.quality);
  const q = QUALITY[quality];
  return (
    <Canvas
      key={quality /* remount on tier change: shadow maps & composer are created up front */}
      shadows={q.shadow ? 'soft' : false}
      dpr={q.dpr}
      gl={{ antialias: q.post === 'none' && quality !== 'low', powerPreference: 'high-performance', stencil: false }}
      // near/far tuned for depth precision: nothing gets closer than ~0.6 cm to the camera, and
      // the room fits inside 900 cm. A tighter range means less z-fighting on phone GPUs.
      camera={{ fov: DEFAULT_FOV, near: 0.6, far: 900, position: [0, 30, 70] }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
      }}
    >
      <Suspense fallback={null}>
        <SceneContents />
      </Suspense>
      <AdaptiveDpr pixelated={false} />
      <FrameStats />
      <PerformanceGuard post={q.post !== 'none'} shadows={!!q.shadow} />
    </Canvas>
  );
}

/** Publishes a smoothed FPS value for the HUD (no React re-render per frame). */
export const frameStats = { fps: 0, frameMs: 0 };
function FrameStats() {
  const acc = useRef({ t: 0, n: 0 });
  const { gl, scene, camera } = useThree();
  // Whole-frame renderer totals (shadow passes + scene + post passes). With a composer the
  // renderer's own counters only describe the last pass, so accumulate manually.
  const totals = useRef({ calls: 0, triangles: 0 });
  useEffect(() => {
    gl.info.autoReset = false;
    exposeDebug({
      /** Raw renderer + scene, for visual tests and debugging only. */
      three: () => ({ gl, scene, camera }),
      renderInfo: () => {
        let meshes = 0;
        scene.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) meshes++;
        });
        return { calls: totals.current.calls, triangles: totals.current.triangles, geometries: gl.info.memory.geometries, textures: gl.info.memory.textures, meshes, programs: gl.info.programs?.length };
      },
    });
  }, [gl, scene, camera]);
  const frames = useRef(0);
  useFrame((_, dt) => {
    // Runs before this frame renders: bank the previous frame's totals, then reset.
    totals.current.calls = gl.info.render.calls;
    totals.current.triangles = gl.info.render.triangles;
    gl.info.reset();
    // A few frames in, textures exist and shaders have compiled: hide the loading card.
    if (++frames.current === 4) useGame.getState().set({ ready: true });
    acc.current.t += dt;
    acc.current.n++;
    if (acc.current.t > 0.5) {
      frameStats.fps = acc.current.n / acc.current.t;
      frameStats.frameMs = (acc.current.t / acc.current.n) * 1000;
      acc.current.t = 0;
      acc.current.n = 0;
    }
  });
  return null;
}
