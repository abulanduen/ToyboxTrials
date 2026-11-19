/**
 * The Toybox Trials contender (working name: "Ticker").
 *
 * An original chunky wind-up robot: rounded tin/plastic body, single big eye on a turret,
 * toothy grille grin, chest pressure gauge (the needle shows how wound-up it is), stubby
 * limbs and a brass wind-up key on its back. ~3.5 cm tall (1 unit = 1 cm).
 *
 * All motion is procedural (no skeleton): idle, walk/run, turn-lean, jump squash-and-stretch,
 * interact hop, elimination ("sproing" + topple) and respawn pop.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '../scene/RoundedBox';
import * as THREE from 'three';
import { PALETTE, type PaintJob } from '../game/palette';
import { ELIM_DURATION, INTERACT_DURATION, RESPAWN_DURATION, type ToyAnim } from './anim';
import { NO_ACCESSORIES, type Accessories, type HatId, type KeySkinId } from '../game/cosmetics';
import { HAT_HIDES_ANTENNA, Hat, KeyBow } from './Cosmetics';
import { BackItem, FaceItem, KEY_BACK_OFFSET, NeckItem } from './Accessories';
import { EMOTE_DURATION } from '../game/emotes';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const damp = (cur: number, target: number, lambda: number, dt: number) =>
  THREE.MathUtils.lerp(cur, target, 1 - Math.exp(-lambda * dt));
const easeOutBack = (x: number) => {
  const c1 = 1.9;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

interface Props {
  anim: React.RefObject<ToyAnim>;
  paint: PaintJob;
  hat?: HatId;
  keySkin?: KeySkinId;
  /** Back / face / neck accessories (minigame scenes may leave them out). */
  accessories?: Accessories;
}

/** Juggling beads: colours and phase offsets (the juggle gesture). */
const JUGGLE_BALLS = [PALETTE.coral, PALETTE.honey, PALETTE.toyBlue];

export function WindupBot({ anim, paint, hat = 'none', keySkin = 'classic', accessories = NO_ACCESSORIES }: Props) {
  const mats = useMemo(() => {
    const plastic = (c: string, rough = 0.42) => new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: 0.02 });
    return {
      body: plastic(paint.body),
      bodyDark: plastic(new THREE.Color(paint.body).multiplyScalar(0.78).getStyle(), 0.5),
      trim: plastic(paint.trim, 0.5),
      accent: plastic(paint.accent, 0.45),
      cream: plastic(PALETTE.white, 0.35),
      ink: plastic(PALETTE.ink, 0.6),
      brass: new THREE.MeshStandardMaterial({ color: PALETTE.brass, roughness: 0.32, metalness: 0.85 }),
      eyeWhite: new THREE.MeshStandardMaterial({ color: '#FFFDF6', roughness: 0.2 }),
      highlight: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
      balls: JUGGLE_BALLS.map((c) => plastic(c, 0.3)),
    };
  }, [paint]);
  const keyBack = KEY_BACK_OFFSET[accessories.back] ?? 0;

  // Rig nodes
  const visual = useRef<THREE.Group>(null!);
  const torso = useRef<THREE.Group>(null!);
  const head = useRef<THREE.Group>(null!);
  const eyeLid = useRef<THREE.Group>(null!);
  const pupil = useRef<THREE.Group>(null!);
  const xEyes = useRef<THREE.Group>(null!);
  const legL = useRef<THREE.Group>(null!);
  const legR = useRef<THREE.Group>(null!);
  const armL = useRef<THREE.Group>(null!);
  const armR = useRef<THREE.Group>(null!);
  const key = useRef<THREE.Group>(null!);
  const keyPivot = useRef<THREE.Group>(null!);
  const needle = useRef<THREE.Group>(null!);
  const antenna = useRef<THREE.Group>(null!);
  const balls = useRef<THREE.Group>(null!);

  const st = useRef({ keyAngle: 0, lean: 0, headYaw: 0, walkAmt: 0, blinkAt: 2, lookX: 0, lookY: 0, lookAt: 1, needle: -1.2 });

  useFrame((state, rawDt) => {
    const a = anim.current;
    if (!a) return;
    const dt = Math.min(rawDt, 1 / 20);
    const t = state.clock.elapsedTime;
    const s = st.current;

    const speedN = clamp(a.speed / a.maxSpeed, 0, 1.4);
    s.walkAmt = damp(s.walkAmt, a.grounded ? Math.min(1, speedN * 1.6) : 0.3, 12, dt);
    const w = s.walkAmt;
    const p = a.stepPhase;

    // ---------- defaults (idle + walk blend) ----------
    let rootY = 0;
    let scaleY = 1;
    let pitch = 0;
    let roll = 0;
    let yawSpin = 0;

    // idle breathing bob
    const idle = 1 - w;
    rootY += Math.sin(t * 2.4) * 0.025 * idle;
    // walk: hop-step bob + waddle
    rootY += Math.abs(Math.sin(p)) * 0.16 * w;
    roll += Math.sin(p) * 0.09 * w;
    pitch += 0.12 * w * Math.min(1, speedN); // lean forward when moving

    // lean into turns
    s.lean = damp(s.lean, clamp(-a.turnRate * 0.07, -0.3, 0.3) * Math.min(1, speedN + 0.2), 10, dt);
    roll += s.lean;
    s.headYaw = damp(s.headYaw, clamp(a.turnRate * 0.09, -0.45, 0.45), 8, dt);

    // legs
    const legSwing = 0.65 * w;
    legL.current.rotation.x = Math.sin(p) * legSwing;
    legR.current.rotation.x = -Math.sin(p) * legSwing;
    legL.current.position.y = 0.62 + Math.max(0, Math.sin(p)) * 0.12 * w;
    legR.current.position.y = 0.62 + Math.max(0, -Math.sin(p)) * 0.12 * w;

    // arms
    let armLX = -Math.sin(p) * 0.8 * w + Math.sin(t * 2.4) * 0.05 * idle;
    let armRX = Math.sin(p) * 0.8 * w - Math.sin(t * 2.4) * 0.05 * idle;
    let armLZ = 0.12;
    let armRZ = -0.12;

    // ---------- airborne ----------
    if (!a.grounded) {
      const rising = a.vy > 0;
      scaleY *= rising ? 1.1 : 1.03;
      armLZ = rising ? 1.1 : 0.7;
      armRZ = -armLZ;
      armLX = armRX = -0.3;
      legL.current.rotation.x = 0.35;
      legR.current.rotation.x = -0.2;
    }

    // ---------- landing squash (damped spring) ----------
    if (a.landT < 0.6) {
      const k = a.landImpact * Math.exp(-a.landT * 9) * Math.cos(a.landT * 26);
      scaleY *= 1 - clamp(k, -0.6, 1) * 0.2;
    }

    // ---------- interact: happy hop + wave ----------
    let eyeSquint = 0;
    if (a.interactT >= 0 && a.interactT < INTERACT_DURATION) {
      const k = a.interactT / INTERACT_DURATION;
      rootY += Math.sin(Math.PI * Math.min(1, k * 1.6)) * 0.7;
      scaleY *= 1 + Math.sin(Math.PI * k) * 0.08;
      armRZ = -2.4 + Math.sin(a.interactT * 28) * 0.35;
      armRX = 0;
      armLZ = 0.9;
      eyeSquint = Math.sin(Math.PI * k);
    }

    // ---------- emotes (hub social gestures) ----------
    // Blend in over ~0.18 s and out over the last ~0.3 s. Whole-body moves (hop, twirl, bow) fade
    // while walking so a moving toy doesn't fold in half; the arms always play. Arms swing out to
    // the sides (armL negative z, armR positive z) so they stay clear of the head.
    let headTilt = 0;
    let headNod = 0;
    let swayX = 0;
    let fainted = false;
    let juggling = 0;
    if (a.emote && a.elimT < 0) {
      const e = a.emoteT;
      const k = clamp(Math.min(e / 0.18, (EMOTE_DURATION - e) / 0.3), 0, 1);
      const body = k * (1 - w * 0.75);
      switch (a.emote) {
        case 'wave': {
          // Right arm up high, hand swinging side to side; a friendly head tilt.
          armRZ = THREE.MathUtils.lerp(armRZ, 2.5 + Math.sin(e * 13) * 0.4, k);
          armRX = THREE.MathUtils.lerp(armRX, -0.15, k);
          headTilt = 0.16 * k;
          eyeSquint = Math.max(eyeSquint, 0.45 * k);
          break;
        }
        case 'cheer': {
          // Three springy hops with both arms thrown up.
          const hop = Math.abs(Math.sin(e * Math.PI * 1.6));
          rootY += hop * 0.85 * body;
          scaleY *= 1 + (hop - 0.5) * 0.12 * body;
          const shake = Math.sin(e * 22) * 0.18;
          armLZ = THREE.MathUtils.lerp(armLZ, -2.45 - shake, k);
          armRZ = THREE.MathUtils.lerp(armRZ, 2.45 + shake, k);
          armLX = THREE.MathUtils.lerp(armLX, 0, k);
          armRX = THREE.MathUtils.lerp(armRX, 0, k);
          eyeSquint = Math.max(eyeSquint, 0.7 * k);
          break;
        }
        case 'spin': {
          // One full twirl (eased) in the first 1.3 s, arms out like a top.
          const f = clamp(e / 1.3, 0, 1);
          const eased = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
          yawSpin += eased * Math.PI * 2 * (1 - w * 0.75);
          rootY += Math.sin(Math.PI * f) * 0.35 * body;
          armLZ = THREE.MathUtils.lerp(armLZ, -1.4, k);
          armRZ = THREE.MathUtils.lerp(armRZ, 1.4, k);
          break;
        }
        case 'bow': {
          // Lean forward from the hips, one arm across the belly, head dipped; hold, then rise.
          const f = clamp(e / 0.45, 0, 1);
          const lean = Math.sin((Math.PI / 2) * f) * k;
          pitch += 0.62 * lean * (1 - w * 0.75);
          headNod = 0.25 * lean;
          armRX = THREE.MathUtils.lerp(armRX, -1.15, lean);
          armRZ = THREE.MathUtils.lerp(armRZ, 0.35, lean);
          armLX = THREE.MathUtils.lerp(armLX, 0.5, lean);
          eyeSquint = Math.max(eyeSquint, 0.6 * lean);
          break;
        }
        case 'dance': {
          // A clockwork shuffle: sway side to side on the beat, bob, arms pumping in turn.
          const beat = e * Math.PI * 4;
          swayX = Math.sin(beat / 2) * 0.28 * body;
          roll += Math.sin(beat / 2) * 0.16 * body;
          rootY += Math.abs(Math.sin(beat)) * 0.28 * body;
          armLZ = THREE.MathUtils.lerp(armLZ, -1.5 - Math.sin(beat) * 0.7, k);
          armRZ = THREE.MathUtils.lerp(armRZ, 1.5 - Math.sin(beat) * 0.7, k);
          armLX = THREE.MathUtils.lerp(armLX, -0.3, k);
          armRX = THREE.MathUtils.lerp(armRX, -0.3, k);
          legL.current.rotation.x += Math.max(0, Math.sin(beat / 2)) * -0.5 * body;
          legR.current.rotation.x += Math.max(0, -Math.sin(beat / 2)) * -0.5 * body;
          headTilt = Math.sin(beat / 2) * 0.18 * k;
          eyeSquint = Math.max(eyeSquint, 0.5 * k);
          break;
        }
        case 'laugh': {
          // Head thrown back, hands on the belly, the whole tin body rattling.
          pitch -= 0.14 * body;
          headNod = -0.3 * k;
          scaleY *= 1 + Math.sin(e * 38) * 0.035 * k;
          rootY += Math.abs(Math.sin(e * 19)) * 0.1 * body;
          roll += Math.sin(e * 27) * 0.04 * body;
          armLX = THREE.MathUtils.lerp(armLX, -0.85, k);
          armRX = THREE.MathUtils.lerp(armRX, -0.85, k);
          armLZ = THREE.MathUtils.lerp(armLZ, 0.55, k);
          armRZ = THREE.MathUtils.lerp(armRZ, -0.55, k);
          eyeSquint = Math.max(eyeSquint, 0.9 * k);
          break;
        }
        case 'sit': {
          // Plonk down: legs out in front, hands on the knees, a contented sigh.
          const down = clamp(Math.min(e / 0.35, (EMOTE_DURATION - e) / 0.3), 0, 1);
          const sit = down * down * (3 - 2 * down) * (1 - w * 0.75);
          rootY -= 0.6 * sit;
          legL.current.rotation.x = THREE.MathUtils.lerp(legL.current.rotation.x, -1.45, sit);
          legR.current.rotation.x = THREE.MathUtils.lerp(legR.current.rotation.x, -1.4, sit);
          armLX = THREE.MathUtils.lerp(armLX, -0.75, sit);
          armRX = THREE.MathUtils.lerp(armRX, -0.75, sit);
          pitch -= 0.06 * sit;
          headTilt = 0.12 * sit;
          eyeSquint = Math.max(eyeSquint, 0.5 * sit);
          break;
        }
        case 'salute': {
          // Snap to attention: stand tall, right hand to the brow, left arm straight.
          const snap = clamp(e / 0.14, 0, 1) * k;
          scaleY *= 1 + 0.05 * snap;
          rootY += Math.sin(Math.PI * clamp(e / 0.25, 0, 1)) * 0.18 * body;
          // (The stubby arm can't reach the brow, so the head tips to meet the raised hand.)
          armRZ = THREE.MathUtils.lerp(armRZ, 2.8, snap);
          armRX = THREE.MathUtils.lerp(armRX, -0.5, snap);
          armLZ = THREE.MathUtils.lerp(armLZ, 0.04, snap);
          armLX = THREE.MathUtils.lerp(armLX, 0, snap);
          headTilt = -0.14 * snap;
          headNod = -0.06 * snap;
          break;
        }
        case 'juggle': {
          // Arms forward, bouncing in turn, three beads looping above (see the balls group below).
          const bounce = Math.sin(e * 15);
          armLX = THREE.MathUtils.lerp(armLX, -1.15 + bounce * 0.3, k);
          armRX = THREE.MathUtils.lerp(armRX, -1.15 - bounce * 0.3, k);
          armLZ = THREE.MathUtils.lerp(armLZ, 0.3, k);
          armRZ = THREE.MathUtils.lerp(armRZ, -0.3, k);
          headNod = -0.22 * k;
          juggling = k;
          break;
        }
        case 'faint': {
          // A wobble, a dramatic topple onto one side with X eyes, a pause, then pop back up.
          const tip = clamp((e - 0.18) / 0.42, 0, 1);
          const rise = clamp((e - 1.45) / 0.35, 0, 1);
          const lie = easeOutBack(tip) * (1 - rise * rise * (3 - 2 * rise));
          const amt = lie * (1 - w * 0.75);
          roll += Math.sin(e * 30) * 0.06 * (1 - tip) * k - amt * 1.42;
          rootY += amt * 0.78 + Math.sin(Math.PI * rise) * 0.45 * body;
          armLZ = THREE.MathUtils.lerp(armLZ, -0.6, lie);
          armRZ = THREE.MathUtils.lerp(armRZ, 1.2, lie);
          legL.current.rotation.x += 0.3 * lie;
          fainted = lie > 0.5;
          break;
        }
      }
    }
    balls.current.visible = juggling > 0.02;
    if (juggling > 0.02) {
      // A three-bead cascade in front of the face, scaled in and out with the gesture.
      const e = a.emoteT;
      for (let i = 0; i < 3; i++) {
        const ph = e * 5.2 + (i * Math.PI * 2) / 3;
        const b = balls.current.children[i];
        b.position.set(Math.cos(ph) * 0.62, 2.55 + Math.sin(ph) * 0.95, 1.05);
        b.scale.setScalar(juggling);
      }
    }

    // ---------- elimination ----------
    let dead = false;
    let keyPopY = 0;
    let keyPopSpin = 0;
    if (a.elimT >= 0) {
      dead = true;
      const e = a.elimT;
      if (e < 0.18) {
        scaleY *= 1 - (e / 0.18) * 0.35; // compress like a spring
      } else {
        const f = clamp((e - 0.18) / 0.7, 0, 1);
        scaleY *= 0.65 + 0.35 * easeOutBack(Math.min(1, f * 1.5));
        rootY += Math.sin(Math.PI * f) * 2.2; // sproing up
        yawSpin = f * Math.PI * 4; // spin
        pitch = -easeOutBack(f) * (Math.PI / 2) * 0.98; // topple backwards
        rootY += f * 0.55; // rests on its back
        if (e > 0.88) {
          const b = e - 0.88; // little settling bounces
          rootY += Math.abs(Math.sin(b * 14)) * 0.3 * Math.exp(-b * 5);
        }
        armLZ = 1.4 + Math.sin(e * 30) * 0.3 * Math.exp(-e * 2);
        armRZ = -armLZ;
        legL.current.rotation.x = 0.6 + Math.sin(e * 25) * 0.4 * Math.exp(-e * 2);
        legR.current.rotation.x = 0.6 - Math.sin(e * 25) * 0.4 * Math.exp(-e * 2);
      }
      // the wind-up key pops off and flies
      const kf = clamp((e - 0.15) / 1.1, 0, 1);
      keyPopY = Math.sin(Math.PI * kf) * 5 + kf * -0.5;
      keyPopSpin = kf * 18;
      if (e > ELIM_DURATION - 0.25) {
        // fade-out scale before respawn
        const q = clamp((ELIM_DURATION - e) / 0.25, 0, 1);
        scaleY *= Math.max(q, 0.01); // never exactly flat: a zero scale breaks the lighting (NaN → black screen through bloom)
      }
    }

    // ---------- respawn pop ----------
    let uniform = 1;
    if (a.respawnT >= 0 && a.respawnT < RESPAWN_DURATION) {
      uniform = easeOutBack(clamp(a.respawnT / RESPAWN_DURATION, 0, 1));
    }

    // ---------- apply ----------
    const v = visual.current;
    v.position.x = swayX;
    v.position.y = rootY;
    v.rotation.set(pitch, yawSpin, roll, 'YXZ');
    const sy = scaleY * uniform;
    const sxz = (1 / Math.sqrt(Math.max(0.2, scaleY))) * uniform; // preserve volume
    v.scale.set(sxz, sy, sxz);

    torso.current.rotation.y = Math.sin(p) * 0.08 * w;
    head.current.rotation.y = s.headYaw + Math.sin(t * 0.7) * 0.08 * idle;
    head.current.rotation.z = Math.sin(p + 0.6) * 0.05 * w + (a.interactT >= 0 && a.interactT < INTERACT_DURATION ? 0.18 : 0) + headTilt;
    head.current.rotation.x = headNod;
    head.current.position.y = 1.95 + Math.sin(p * 2 + 0.8) * 0.03 * w;

    armL.current.rotation.set(armLX, 0, armLZ);
    armR.current.rotation.set(armRX, 0, armRZ);

    // Wind-up key: always turning, faster with speed & boost
    const keyRate = dead ? 0 : 1.3 + speedN * 7 + (a.boosted ? 8 : 0);
    s.keyAngle += keyRate * dt;
    key.current.rotation.z = s.keyAngle + keyPopSpin;
    keyPivot.current.position.set(0, 1.3 + keyPopY, -0.62 - keyBack - keyPopY * 0.25);
    keyPivot.current.rotation.x = keyPopSpin * 0.4;

    // Chest gauge: needle shows wind level (speed / boost), with mechanical jitter
    const target = dead ? -1.4 : -1.15 + speedN * 1.9 + (a.boosted ? 0.6 : 0);
    s.needle = damp(s.needle, clamp(target, -1.4, 1.4), 6, dt);
    needle.current.rotation.z = -s.needle + Math.sin(t * 40) * 0.02 * (speedN + 0.2);

    // Antenna springs around
    antenna.current.rotation.z = Math.sin(t * 9) * 0.12 * (w + 0.2) + s.lean * -1.2;
    antenna.current.rotation.x = -pitch * 0.6 + Math.sin(p * 2) * 0.12 * w;

    // Eye: blink, glance, squint, X when eliminated
    if (t > s.blinkAt) s.blinkAt = t + 2 + Math.random() * 3;
    const blinking = s.blinkAt - t > 0 && s.blinkAt - t < 0.11;
    if (t > s.lookAt) {
      s.lookAt = t + 1.2 + Math.random() * 2.5;
      s.lookX = (Math.random() - 0.5) * 0.12 * idle;
      s.lookY = (Math.random() - 0.5) * 0.08 * idle;
    }
    eyeLid.current.scale.y = blinking ? 0.1 : 1 - eyeSquint * 0.55;
    pupil.current.position.x = damp(pupil.current.position.x, s.lookX, 10, dt);
    pupil.current.position.y = damp(pupil.current.position.y, s.lookY, 10, dt);
    pupil.current.visible = !dead && !fainted;
    xEyes.current.visible = dead || fainted;
  });

  return (
    <group ref={visual}>
      {/* juggling beads (the juggle gesture) */}
      <group ref={balls} visible={false}>
        {mats.balls.map((m, i) => (
          <mesh key={i} material={m} castShadow>
            <sphereGeometry args={[0.17, 12, 10]} />
          </mesh>
        ))}
      </group>
      {/* ---- legs + feet (pivot at hip) ---- */}
      {[-1, 1].map((side) => (
        <group key={side} ref={side < 0 ? legL : legR} position={[side * 0.4, 0.62, 0]}>
          <mesh position={[0, -0.25, 0]} material={mats.bodyDark} castShadow>
            <boxGeometry args={[0.36, 0.42, 0.36]} />
          </mesh>
          <RoundedBox args={[0.6, 0.26, 0.86]} radius={0.1} smoothness={2} position={[0, -0.5, 0.1]} material={mats.body} castShadow />
        </group>
      ))}

      <group ref={torso}>
        {/* ---- belt / skirt with trim stripes ---- */}
        <RoundedBox args={[1.62, 0.34, 1.2]} radius={0.12} smoothness={3} position={[0, 0.78, 0]} material={mats.body} castShadow />
        {[-0.08, 0.04].map((y) => (
          <mesh key={y} position={[0, 0.78 + y, 0.605]} material={mats.trim}>
            <boxGeometry args={[0.9, 0.045, 0.01]} />
          </mesh>
        ))}

        {/* ---- body ---- */}
        <RoundedBox args={[1.5, 1.05, 1.08]} radius={0.2} smoothness={3} position={[0, 1.42, 0]} material={mats.body} castShadow />

        {/* chest plate + gauge */}
        <group position={[0, 1.47, 0.545]}>
          <RoundedBox args={[1.02, 0.7, 0.06]} radius={0.05} smoothness={2} material={mats.cream} />
          <group position={[0, -0.12, 0.035]}>
            <mesh material={mats.ink}>
              <circleGeometry args={[0.39, 24, 0, Math.PI]} />
            </mesh>
            <mesh position={[0, 0, 0.002]} material={mats.trim}>
              <circleGeometry args={[0.34, 24, 0, Math.PI]} />
            </mesh>
            {/* tick marks */}
            {Array.from({ length: 7 }, (_, i) => {
              const ang = (i / 6) * Math.PI;
              return (
                <mesh key={i} position={[Math.cos(ang) * 0.28, Math.sin(ang) * 0.28, 0.004]} rotation={[0, 0, ang]} material={mats.ink}>
                  <boxGeometry args={[0.08, 0.018, 0.002]} />
                </mesh>
              );
            })}
            <group ref={needle} position={[0, 0, 0.006]}>
              <mesh position={[0, 0.14, 0]} material={mats.accent}>
                <boxGeometry args={[0.035, 0.28, 0.004]} />
              </mesh>
            </group>
            <mesh position={[0, 0, 0.01]} material={mats.ink}>
              <circleGeometry args={[0.06, 12]} />
            </mesh>
          </group>
          {/* rivets */}
          {[
            [-0.43, 0.27],
            [0.43, 0.27],
            [-0.43, -0.27],
            [0.43, -0.27],
          ].map(([x, y]) => (
            <mesh key={`${x}${y}`} position={[x, y, 0.035]} material={mats.trim}>
              <sphereGeometry args={[0.04, 8, 6]} />
            </mesh>
          ))}
        </group>

        {/* ---- arms (pivot at shoulder) ---- */}
        {[-1, 1].map((side) => (
          <group key={side} ref={side < 0 ? armL : armR} position={[side * 0.82, 1.68, 0]}>
            <mesh position={[side * 0.08, -0.32, 0]} material={mats.bodyDark} castShadow>
              <capsuleGeometry args={[0.15, 0.4, 4, 8]} />
            </mesh>
            <mesh position={[side * 0.1, -0.66, 0]} material={mats.accent} castShadow>
              <sphereGeometry args={[0.17, 12, 10]} />
            </mesh>
          </group>
        ))}

        {/* ---- accessories: back and neck ---- */}
        <BackItem id={accessories.back} />
        <NeckItem id={accessories.neck} />

        {/* ---- wind-up key (pops off on elimination) ---- */}
        <group ref={keyPivot} position={[0, 1.3, -0.62]}>
          <group ref={key}>
            <mesh position={[0, 0, -0.15]} rotation={[Math.PI / 2, 0, 0]} material={mats.brass} castShadow>
              <cylinderGeometry args={[0.07, 0.07, 0.34, 8]} />
            </mesh>
            <KeyBow skin={keySkin} />
          </group>
        </group>

        {/* ---- head ---- */}
        <group ref={head} position={[0, 1.95, 0]}>
          <RoundedBox args={[1.18, 0.82, 0.98]} radius={0.18} smoothness={3} position={[0, 0.42, 0]} material={mats.body} castShadow />
          {/* grille grin */}
          <group position={[0, 0.33, 0.495]}>
            <RoundedBox args={[0.78, 0.36, 0.04]} radius={0.04} smoothness={2} material={mats.ink} />
            {[-0.27, -0.09, 0.09, 0.27].map((x) => (
              <group key={x}>
                <mesh position={[x, 0.1, 0.025]} material={mats.cream}>
                  <boxGeometry args={[0.15, 0.1, 0.02]} />
                </mesh>
                <mesh position={[x, -0.1, 0.025]} material={mats.cream}>
                  <boxGeometry args={[0.15, 0.1, 0.02]} />
                </mesh>
              </group>
            ))}
          </group>
          <FaceItem id={accessories.face} />
          {/* side bolts / ears */}
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * 0.62, 0.45, 0]} rotation={[0, 0, Math.PI / 2]} material={mats.accent} castShadow>
              <cylinderGeometry args={[0.16, 0.16, 0.14, 12]} />
            </mesh>
          ))}

          {/* eye turret */}
          <group position={[0, 1.02, 0.02]}>
            <mesh rotation={[Math.PI / 2, 0, 0]} material={mats.body} castShadow>
              <cylinderGeometry args={[0.4, 0.42, 0.5, 20]} />
            </mesh>
            <mesh position={[0, 0, 0.255]} material={mats.trim}>
              <torusGeometry args={[0.36, 0.045, 8, 24]} />
            </mesh>
            <group ref={eyeLid} position={[0, 0, 0.26]}>
              <mesh material={mats.eyeWhite}>
                <circleGeometry args={[0.32, 24]} />
              </mesh>
              <group ref={pupil} position={[0, 0, 0.004]}>
                <mesh material={mats.ink}>
                  <circleGeometry args={[0.16, 20]} />
                </mesh>
                <mesh position={[0.06, 0.07, 0.003]} material={mats.highlight}>
                  <circleGeometry args={[0.045, 10]} />
                </mesh>
              </group>
              <group ref={xEyes} position={[0, 0, 0.006]} visible={false}>
                <mesh rotation={[0, 0, Math.PI / 4]} material={mats.ink}>
                  <boxGeometry args={[0.42, 0.07, 0.004]} />
                </mesh>
                <mesh rotation={[0, 0, -Math.PI / 4]} material={mats.ink}>
                  <boxGeometry args={[0.42, 0.07, 0.004]} />
                </mesh>
              </group>
            </group>
            {/* hat (sits on the turret) */}
            <Hat id={hat} />
            {/* springy antenna */}
            <group ref={antenna} position={[0, 0.38, -0.05]} visible={!HAT_HIDES_ANTENNA[hat]}>
              <mesh position={[0, 0.18, 0]} material={mats.ink}>
                <cylinderGeometry args={[0.025, 0.025, 0.36, 6]} />
              </mesh>
              <mesh position={[0, 0.4, 0]} material={mats.accent} castShadow>
                <sphereGeometry args={[0.1, 12, 10]} />
              </mesh>
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}
