/**
 * Everything that makes the window read as a source of sunlight (apart from the real-time sun,
 * which lives in PlayroomScene):
 *  - the garden backdrop seen through the glass (over-bright so it clips/blooms like daylight),
 *  - a soft additive halo around the opening (a stand-in for bloom on the Low tier),
 *  - light shafts: a few additive sheets lying along the sun direction, with drifting streaks.
 *    They fade out near the camera, when seen edge-on and before they reach the table, so they
 *    never clip or draw hard lines. No ray-marching, one draw call,
 *  - dust catching the light inside the beam (Balanced and High only).
 */
import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ROOM } from '../../game/palette';
import type { Quality } from '../../game/store';
import { gardenTexture, windowGlowTexture } from '../textures';
import { SUN_DIR, WINDOW } from './bake';

const SHAFT_VERT = /* glsl */ `
  attribute float aSeed;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vPlaneN;
  varying float vSeed;
  void main() {
    vUv = uv;
    vWorld = position;
    vPlaneN = normal;
    vSeed = aSeed;
    gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
  }
`;
const SHAFT_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uStrength;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vPlaneN;
  varying float vSeed;
  void main() {
    vec3 v = vWorld - cameraPosition;
    float dist = max(length(v), 1e-3);
    float facing = abs(dot(v / dist, normalize(vPlaneN)));
    float a = smoothstep(0.02, 0.4, facing);                 // sheets seen edge-on vanish
    a *= smoothstep(22.0, 90.0, dist);                       // never clip through the camera
    a *= smoothstep(0.0, 0.2, vUv.y) * smoothstep(1.0, 0.8, vUv.y);
    // pow() of a negative base is NaN on Direct3D (and allowed to be on any GPU): at the shaft's tip vUv.x
    // can interpolate a hair past 1.0, and one NaN pixel is enough for bloom to smear a black flash.
    a *= smoothstep(0.0, 0.24, vUv.x) * pow(max(1.0 - vUv.x, 0.0), 1.25); // swells in past the glass, then fades
    a *= smoothstep(1.0, 34.0, vWorld.y);                    // dissolve before the table top
    float streak = 0.6 + 0.4 * sin(vUv.y * 21.0 + vSeed * 6.3 + sin(uTime * 0.07 + vSeed) * 1.6);
    streak *= 0.84 + 0.16 * sin(vUv.y * 57.0 - uTime * 0.05 + vSeed * 3.1);
    gl_FragColor = vec4(uColor * (a * streak * uStrength), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const DUST_VERT = /* glsl */ `
  attribute vec4 aSeed;
  uniform float uTime;
  uniform float uScale;
  varying float vAlpha;
  void main() {
    float ph = aSeed.x * 40.0;
    vec3 p = position + vec3(sin(uTime * 0.11 + ph), sin(uTime * 0.07 + ph * 1.7), cos(uTime * 0.09 + ph)) * (2.0 + aSeed.y * 5.0);
    vec4 mv = viewMatrix * vec4(p, 1.0);
    float dist = -mv.z;
    gl_PointSize = clamp((0.45 + aSeed.z * 0.7) * uScale / max(dist, 1e-3), 1.0, 9.0);
    float twinkle = 0.55 + 0.45 * sin(uTime * (0.6 + aSeed.w) + ph);
    vAlpha = twinkle * smoothstep(20.0, 70.0, dist) * (1.0 - smoothstep(260.0, 420.0, dist));
    gl_Position = projectionMatrix * mv;
  }
`;
const DUST_FRAG = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = smoothstep(1.0, 0.1, d) * vAlpha;
    gl_FragColor = vec4(uColor * a, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Sheets of light: quads that contain the sun direction, starting at the glass. */
function buildShafts(vertical: number[], horizontal: number[]) {
  const W = WINDOW;
  const L = 300;
  const pos: number[] = [];
  const uv: number[] = [];
  const nor: number[] = [];
  const seed: number[] = [];
  const d = SUN_DIR;
  const quad = (a: THREE.Vector3, b: THREE.Vector3, s: number) => {
    // a → b is the edge on the glass; the quad is that edge swept along the sun direction.
    const a2 = a.clone().addScaledVector(d, L);
    const b2 = b.clone().addScaledVector(d, L);
    const n = b.clone().sub(a).cross(d).normalize();
    const push = (p: THREE.Vector3, u: number, v: number) => {
      pos.push(p.x, p.y, p.z);
      uv.push(u, v);
      nor.push(n.x, n.y, n.z);
      seed.push(s);
    };
    push(a, 0, 0);
    push(b, 0, 1);
    push(b2, 1, 1);
    push(a, 0, 0);
    push(b2, 1, 1);
    push(a2, 1, 0);
  };
  const z = W.zOut;
  vertical.forEach((x, i) => quad(new THREE.Vector3(x, W.y0 + 6, z), new THREE.Vector3(x, W.y1 - 4, z), 0.37 + i * 1.13));
  horizontal.forEach((y, i) => quad(new THREE.Vector3(W.x0 + 4, y, z), new THREE.Vector3(W.x1 - 4, y, z), 5.2 + i * 0.77));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
  return g;
}

function buildDust(n: number) {
  const W = WINDOW;
  const pos = new Float32Array(n * 3);
  const seed = new Float32Array(n * 4);
  let s = 9173;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < n; i++) {
    const wx = W.x0 + 8 + r() * (W.x1 - W.x0 - 16);
    const wy = W.y0 + 10 + r() * (W.y1 - W.y0 - 18);
    const tMax = Math.min(250, (wy - 8) / -SUN_DIR.y);
    const t = 14 + r() * Math.max(0, tMax - 14);
    pos[i * 3] = wx + SUN_DIR.x * t;
    pos[i * 3 + 1] = wy + SUN_DIR.y * t;
    pos[i * 3 + 2] = W.zIn + SUN_DIR.z * t;
    seed.set([r(), r(), r(), r()], i * 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 60, -90), 400);
  return g;
}

export function WindowLight({ quality }: { quality: Quality }) {
  const low = quality === 'low';
  const W = WINDOW;
  const o = useMemo(() => {
    const mid = (a: number, b: number, k: number) => a + (b - a) * k;
    const vertical = low
      ? [mid(W.x0, W.mullionX, 0.5), mid(W.mullionX, W.x1, 0.5)]
      : [0.2, 0.5, 0.8].flatMap((k) => [mid(W.x0, W.mullionX, k), mid(W.mullionX, W.x1, k)]);
    const horizontal = low ? [mid(W.transomY, W.y1, 0.5)] : [mid(W.y0, W.transomY, 0.6), mid(W.transomY, W.y1, 0.3), mid(W.transomY, W.y1, 0.75)];
    const time = { value: 0 };
    const shaftColor = new THREE.Color(ROOM.shaft);
    return {
      time,
      scale: { value: 600 },
      shafts: buildShafts(vertical, horizontal),
      shaftMat: new THREE.ShaderMaterial({
        vertexShader: SHAFT_VERT,
        fragmentShader: SHAFT_FRAG,
        uniforms: { uTime: time, uColor: { value: shaftColor }, uStrength: { value: low ? 0.22 : 0.4 } },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
      dust: low ? null : buildDust(quality === 'high' ? 420 : 240),
      dustMat: new THREE.ShaderMaterial({
        vertexShader: DUST_VERT,
        fragmentShader: DUST_FRAG,
        uniforms: { uTime: time, uScale: { value: 600 }, uColor: { value: new THREE.Color(ROOM.shaft).multiplyScalar(0.7) } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
      // Brighter than white: daylight outside should clip and bloom, not look like a poster.
      skyMat: new THREE.MeshBasicMaterial({ map: gardenTexture(), color: new THREE.Color(1.1, 1.08, 1.04), fog: false }),
      glowMat: new THREE.MeshBasicMaterial({
        map: windowGlowTexture(),
        color: new THREE.Color(ROOM.shaft).multiplyScalar(low ? 0.1 : 0.13),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    };
  }, [low, quality, W]);

  useEffect(
    () => () => {
      o.shafts.dispose();
      o.shaftMat.dispose();
      o.dust?.dispose();
      o.dustMat.dispose();
      o.skyMat.dispose();
      o.glowMat.dispose();
    },
    [o],
  );

  useFrame((s) => {
    o.time.value = s.clock.elapsedTime;
    const cam = s.camera as THREE.PerspectiveCamera;
    // world size → pixels at distance 1 (for point sprites)
    o.dustMat.uniforms.uScale.value = (s.size.height * s.viewport.dpr) / (2 * Math.tan((cam.fov * Math.PI) / 360));
  });

  const cx = (W.x0 + W.x1) / 2;
  const cy = (W.y0 + W.y1) / 2;
  return (
    <group>
      <mesh position={[30, 110, W.zOut - 70]} material={o.skyMat}>
        <planeGeometry args={[440, 300]} />
      </mesh>
      <mesh position={[cx, cy + 4, W.zIn + 4]} material={o.glowMat} renderOrder={2}>
        <planeGeometry args={[W.x1 - W.x0 + 150, W.y1 - W.y0 + 130]} />
      </mesh>
      <mesh geometry={o.shafts} material={o.shaftMat} frustumCulled={false} renderOrder={3} />
      {o.dust && <points geometry={o.dust} material={o.dustMat} renderOrder={4} />}
    </group>
  );
}
