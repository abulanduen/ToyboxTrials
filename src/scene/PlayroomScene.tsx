/**
 * Canvas, lighting, atmosphere and post-processing for the Playroom.
 * Quality tiers trade shadows/post-processing/resolution for frame rate.
 */
import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { AdaptiveDpr, Environment, Lightformer } from '@react-three/drei';
import { Bloom, DepthOfField, EffectComposer, TiltShift2, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { useGame, type Quality } from '../game/store';
import { PALETTE } from '../game/palette';
import { player } from '../game/player';
import { PlayerController } from '../character/PlayerController';
import { Room, LAMP_HEAD, LAMP_AIM } from './Room';
import { exposeDebug } from '../game/debug';
import { MatchStage } from '../minigames/MatchStage';
import { Village } from './Village';

const QUALITY: Record<Quality, { dpr: [number, number]; shadowMap: number; post: 'none' | 'tilt' | 'dof'; aa: boolean }> = {
  low: { dpr: [1, 1.25], shadowMap: 0, post: 'none', aa: false },
  balanced: { dpr: [1, 1.5], shadowMap: 1024, post: 'tilt', aa: true },
  high: { dpr: [1, 2], shadowMap: 2048, post: 'dof', aa: true },
};

function Lights({ quality }: { quality: Quality }) {
  const q = QUALITY[quality];
  const sun = useRef<THREE.DirectionalLight>(null!);
  const spot = useRef<THREE.SpotLight>(null!);
  const { scene } = useThree();

  useEffect(() => {
    // Lights' targets must be in the scene graph to update. Capture them now: the refs are
    // cleared before this cleanup runs when the canvas remounts (quality change) or unmounts.
    const sunTarget = sun.current.target;
    const spotTarget = spot.current.target;
    scene.add(sunTarget);
    scene.add(spotTarget);
    spotTarget.position.copy(LAMP_AIM);
    return () => {
      scene.remove(sunTarget);
      scene.remove(spotTarget);
    };
  }, [scene]);

  // Keep the shadow frustum centred on the player so the map resolution goes where it matters.
  useFrame(() => {
    const s = sun.current;
    if (!s) return;
    const cx = THREE.MathUtils.clamp(player.pos.x, -20, 20);
    const cz = THREE.MathUtils.clamp(player.pos.z, -15, 15);
    s.position.set(cx + 70, 110, cz - 60);
    s.target.position.set(cx, 0, cz);
  });

  return (
    <>
      <hemisphereLight args={['#FFF1DA', '#7A5A44', 1.15]} />
      {/* afternoon sun through the window (key light, casts shadows) */}
      <directionalLight
        ref={sun}
        color="#FFE3B8"
        intensity={2.3}
        castShadow={q.shadowMap > 0}
        shadow-mapSize-width={q.shadowMap || 512}
        shadow-mapSize-height={q.shadowMap || 512}
        shadow-camera-left={-55}
        shadow-camera-right={55}
        shadow-camera-top={55}
        shadow-camera-bottom={-55}
        shadow-camera-near={10}
        shadow-camera-far={320}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
      />
      {/* the desk lamp: a warm honey pool over the square */}
      <spotLight ref={spot} position={LAMP_HEAD} color={PALETTE.honey} intensity={2.4} angle={0.85} penumbra={0.9} decay={0} distance={0} />
      {/* cool bounce from the window side to separate silhouettes */}
      <directionalLight position={[-80, 40, 90]} color="#BFD6EA" intensity={0.45} />
    </>
  );
}

function Effects({ quality, sharp }: { quality: Quality; sharp: boolean }) {
  const q = QUALITY[quality];
  const target = useMemo(() => new THREE.Vector3(), []);
  const dofRef = useRef<{ target?: THREE.Vector3 } | null>(null);
  const tiltRef = useRef<unknown>(null);
  useFrame(() => {
    target.set(player.pos.x, player.pos.y + 1.8, player.pos.z);
    if (dofRef.current) dofRef.current.target = target;
  });
  useEffect(() => { exposeDebug({ postprocessing: { state: () => ({ quality, focusBlur: !sharp && q.post !== 'none', focusBlurMounted: !!dofRef.current || !!tiltRef.current }) } }); }, [quality, sharp, q.post]);
  if (q.post === 'none') return null;
  return (
    <EffectComposer multisampling={q.aa ? 4 : 0} enableNormalPass={false}>
      {!sharp && (q.post === 'dof' ? (
        <DepthOfField ref={dofRef as never} target={target} worldFocusRange={38} bokehScale={4.5} resolutionScale={0.5} />
      ) : (
        <TiltShift2 ref={tiltRef as never} blur={0.22} taper={0.42} start={[0, 0.42]} end={[1, 0.42]} samples={8} direction={[1, 1]} />
      ))}
      <Bloom intensity={0.35} luminanceThreshold={0.92} luminanceSmoothing={0.15} mipmapBlur />
      <Vignette offset={0.28} darkness={0.55} eskil={false} />
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
      shadows={q.shadowMap > 0 ? 'soft' : false}
      dpr={q.dpr}
      gl={{ antialias: q.post === 'none' && quality !== 'low', powerPreference: 'high-performance', stencil: false }}
      // near/far tuned for depth precision: nothing gets closer than ~0.6 cm to the camera, and
      // the room fits inside 900 cm. A tighter range means less z-fighting on phone GPUs.
      camera={{ fov: 50, near: 0.6, far: 900, position: [0, 30, 70] }}
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
    </Canvas>
  );
}

/** Publishes a smoothed FPS value for the HUD (no React re-render per frame). */
export const frameStats = { fps: 0, frameMs: 0 };
function FrameStats() {
  const acc = useRef({ t: 0, n: 0 });
  const { gl, scene } = useThree();
  useEffect(() => {
    exposeDebug({
      renderInfo: () => {
        let meshes = 0;
        scene.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) meshes++;
        });
        return { calls: gl.info.render.calls, triangles: gl.info.render.triangles, geometries: gl.info.memory.geometries, textures: gl.info.memory.textures, meshes, programs: gl.info.programs?.length };
      },
    });
  }, [gl, scene]);
  const frames = useRef(0);
  useFrame((_, dt) => {
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
