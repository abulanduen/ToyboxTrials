/**
 * Local player: input → movement → planar collision → animation state, plus the
 * third-person follow camera (mouse orbit, pitch limits, camera collision).
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { WindupBot } from './WindupBot';
import { createToyAnim, ELIM_DURATION, INTERACT_DURATION, RESPAWN_DURATION, type ToyAnim } from './anim';
import { addMouseDelta, consumeMouseDelta, endFrame, getMoveAxis, isDown, stickRunning, wasPressed, clearInput } from '../game/input';
import { groundHeightAt, resolve } from '../game/collision';
import { inputBlocked, useGame } from '../game/store';
import { sfx } from '../game/audio';
import { events } from '../game/events';
import { INTERACTABLES, interact, interactablePos } from '../game/interactables';
import { cameraBlockers, player, SPAWN } from '../game/player';
import { PAINT_JOBS } from '../game/palette';
import { blobShadowTexture } from '../scene/textures';
import { exposeDebug } from '../game/debug';

const RADIUS = 0.85;
const WALK = 9;
const RUN = 14;
const BOOST = 1.45;
const JUMP_V = 16.5;
const GRAVITY = 56;
const TURN_RATE = 13;

const CAM_DIST = 14;
const CAM_MIN_DIST = 3;
const PITCH_MIN = -0.12;
const PITCH_MAX = 1.1;
const TARGET_H = 2.6;
/** Look slightly above the toy so the horizon (and the giant room) stays in frame. */
const LOOK_LIFT = 1.9;
const DEFAULT_PITCH = 0.3;

const damp = (a: number, b: number, l: number, dt: number) => THREE.MathUtils.lerp(a, b, 1 - Math.exp(-l * dt));
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export function PlayerController() {
  const { camera, gl } = useThree();
  const paintIndex = useGame((s) => s.paintIndex);
  const paint = PAINT_JOBS[paintIndex % PAINT_JOBS.length];
  const hat = useGame((s) => s.hat);
  const keySkin = useGame((s) => s.keySkin);

  const root = useRef<THREE.Group>(null!);
  const shadow = useRef<THREE.Mesh>(null!);
  const anim = useRef<ToyAnim>(createToyAnim());

  const sim = useRef({
    pos: new THREE.Vector3(SPAWN.x, 0, SPAWN.z),
    vel: new THREE.Vector2(),
    yaw: useGame.getState().screen === 'menu' ? 0 : SPAWN.yaw, // face the camera on the menu
    camYaw: 0,
    camPitch: DEFAULT_PITCH,
    camDist: CAM_DIST,
    camTarget: new THREE.Vector3(SPAWN.x, TARGET_H, SPAWN.z),
    camPos: new THREE.Vector3(0, 30, 70),
    lastStepIdx: 0,
    bumpCooldown: 0,
    boostUntil: 0,
    respawnAt: -1,
    lastPrompt: '' as string,
    /** Turn the toy to face this yaw (menu → play turnaround), or null. */
    yawTarget: null as number | null,
    /** Workshop turntable camera: current angle/distance orbit toward their targets. */
    wsYaw: 0,
    wsYawTarget: 0,
    wsDist: 10,
    /** Cut (rather than sweep) the camera on the next menu frame. */
    snapCam: false,
    /** Next idle wave on the main menu. */
    nextWave: 3,
  });

  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const tmp = useMemo(() => ({ dir: new THREE.Vector3(), desired: new THREE.Vector3(), look: new THREE.Vector3() }), []);

  // ---------- look: pointer lock (mouse), drag (mouse fallback), drag (touch) ----------
  useEffect(() => {
    const el = gl.domElement;
    let mouseDragging = false;
    // Touch: each finger that started on the canvas drags the camera. We compute deltas ourselves
    // because `movementX` is unreliable for touch pointers (always 0 on iOS Safari).
    const touches = new Map<number, { x: number; y: number }>();
    const TOUCH_LOOK_GAIN = 2.2;
    const canLook = () => {
      const s = useGame.getState();
      // Workshop: drag to spin the camera around the contender (no pointer lock).
      return (s.screen === 'playing' || s.screen === 'workshop') && !s.paused && !s.panel;
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        if (!useGame.getState().touchUI) useGame.getState().set({ touchUI: true });
        if (!canLook()) return;
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        return;
      }
      if (!canLook()) return;
      mouseDragging = true;
      if (e.pointerType === 'mouse' && !document.pointerLockElement && useGame.getState().screen === 'playing') {
        const p = el.requestPointerLock?.() as unknown as Promise<void> | undefined;
        p?.catch?.(() => {
          /* pointer lock refused (iframe/sandbox) — drag-to-look still works */
        });
      }
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerType === 'touch') touches.delete(e.pointerId);
      else mouseDragging = false;
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        const t = touches.get(e.pointerId);
        if (!t) return;
        if (canLook()) addMouseDelta((e.clientX - t.x) * TOUCH_LOOK_GAIN, (e.clientY - t.y) * TOUCH_LOOK_GAIN);
        t.x = e.clientX;
        t.y = e.clientY;
        return;
      }
      if (document.pointerLockElement === el || (mouseDragging && canLook())) addMouseDelta(e.movementX, e.movementY);
    };
    const onLockChange = () => {
      const locked = document.pointerLockElement === el;
      const s = useGame.getState();
      s.set({ pointerLocked: locked });
      // Browser consumes Escape to leave pointer lock — treat that as "pause".
      if (!locked && s.screen === 'playing' && !s.paused && !s.panel) {
        s.togglePause(true);
        clearInput();
      }
    };
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('pointermove', onMove);
    document.addEventListener('pointerlockchange', onLockChange);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerlockchange', onLockChange);
    };
  }, [gl]);

  // Release pointer lock whenever a menu/panel opens; choreograph screen changes.
  useEffect(
    () =>
      useGame.subscribe((s, p) => {
        if ((s.paused && !p.paused) || (s.panel && !p.panel) || (s.screen !== 'playing' && p.screen === 'playing')) {
          clearInput();
          if (document.pointerLockElement) document.exitPointerLock();
        }
        if (s.screen === p.screen) return;
        const sim0 = sim.current;
        if (s.screen === 'menu') {
          // Back on the menu: stand on the spawn tile, facing the camera; cut to the menu shot.
          sim0.pos.set(SPAWN.x, 0, SPAWN.z);
          sim0.vel.set(0, 0);
          sim0.yaw = 0;
          sim0.yawTarget = null;
          sim0.snapCam = true;
        } else if (s.screen === 'playing') {
          if (p.screen === 'menu') {
            // Turn round to face the village while the camera settles behind.
            sim0.yawTarget = SPAWN.yaw;
            sim0.camYaw = SPAWN.yaw + Math.PI;
          } else {
            sim0.camYaw = sim0.yaw + Math.PI;
            sim0.snapCam = true; // from the Workshop: cut behind the toy rather than sweep through it
          }
          sim0.camPitch = DEFAULT_PITCH;
        } else if (s.screen === 'workshop') {
          // Orbit (never cut through the toy) from wherever the camera is to a 3/4 front view.
          sim0.vel.set(0, 0);
          sim0.wsYaw = Math.atan2(sim0.camPos.x - sim0.pos.x, sim0.camPos.z - sim0.pos.z);
          sim0.wsDist = Math.max(4, Math.hypot(sim0.camPos.x - sim0.pos.x, sim0.camPos.z - sim0.pos.z));
          sim0.wsYawTarget = sim0.yaw + 0.55;
        }
      }),
    [],
  );

  // ---------- test hooks (?debug only) ----------
  useEffect(() => {
    exposeDebug({
      teleport: (x: number, z: number, yaw?: number) => {
        sim.current.pos.set(x, groundHeightAt(x, z, RADIUS, 99), z);
        sim.current.vel.set(0, 0);
        if (yaw !== undefined) sim.current.yaw = yaw;
      },
      aim: (camYaw: number, camPitch: number) => {
        sim.current.camYaw = camYaw;
        sim.current.camPitch = camPitch;
      },
      state: () => ({ x: sim.current.pos.x, y: sim.current.pos.y, z: sim.current.pos.z, yaw: sim.current.yaw, camYaw: sim.current.camYaw, camPitch: sim.current.camPitch, fov: (camera as THREE.PerspectiveCamera).fov, anim: { ...anim.current } }),
    });
  }, []);

  // ---------- gameplay events ----------
  useEffect(() => {
    const offs = [
      events.on('player:eliminate', () => {
        const a = anim.current;
        if (a.elimT >= 0) return;
        a.elimT = 0;
        a.interactT = -1;
        player.eliminated = true;
        sim.current.vel.set(0, 0);
        sfx.eliminate();
        useGame.getState().pushTicket({ title: 'Eliminated!', body: 'Sprung right out of the box. Rewinding…', tone: 'warning' });
      }),
      events.on('player:boost', ({ seconds }) => {
        sim.current.boostUntil = performance.now() + seconds * 1000;
      }),
      events.on('workshop:view', ({ back }) => {
        sim.current.wsYawTarget = sim.current.yaw + (back ? Math.PI + 0.6 : 0.55);
      }),
    ];
    return () => offs.forEach((o) => o());
  }, []);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    const s = sim.current;
    const a = anim.current;
    const g = useGame.getState();
    const playing = g.screen === 'playing';
    const blocked = inputBlocked(g);

    // ---------- pause toggle (Esc / P) ----------
    if (playing && wasPressed('pause')) {
      if (g.panel) g.closePanel();
      else g.togglePause();
    }

    // ---------- timers ----------
    a.landT += dt;
    if (a.interactT >= 0) a.interactT = a.interactT + dt > INTERACT_DURATION ? -1 : a.interactT + dt;
    if (a.respawnT >= 0) a.respawnT = a.respawnT + dt > RESPAWN_DURATION ? -1 : a.respawnT + dt;
    if (a.elimT >= 0) {
      a.elimT += dt;
      if (a.elimT >= ELIM_DURATION) {
        a.elimT = -1;
        a.respawnT = 0;
        s.pos.set(SPAWN.x, 0, SPAWN.z);
        s.vel.set(0, 0);
        s.yaw = SPAWN.yaw;
        a.vy = 0;
        player.eliminated = false;
        sfx.pop();
        events.emit('player:respawn');
      }
    }
    const eliminated = a.elimT >= 0;
    a.boosted = performance.now() < s.boostUntil;

    // ---------- camera orbit from mouse ----------
    const [mdx, mdy] = consumeMouseDelta();
    if (g.screen === 'workshop' && !g.paused) {
      s.wsYawTarget -= mdx * 0.006;
    } else if (playing && !blocked) {
      const sens = 0.0024 * g.mouseSensitivity;
      s.camYaw -= mdx * sens;
      s.camPitch = THREE.MathUtils.clamp(s.camPitch + mdy * sens * (g.invertY ? -1 : 1), PITCH_MIN, PITCH_MAX);
    }

    // ---------- movement ----------
    let ix = 0;
    let iz = 0;
    if (playing && !blocked && !eliminated) {
      // Keyboard and touch stick both arrive here as one analog vector (x = right, y = forward).
      const m = getMoveAxis();
      // camera-relative: forward = away from camera
      const fx = -Math.sin(s.camYaw);
      const fz = -Math.cos(s.camYaw);
      const rx = Math.cos(s.camYaw);
      const rz = -Math.sin(s.camYaw);
      ix = fx * m.y + rx * m.x;
      iz = fz * m.y + rz * m.x;
    }
    let maxSpeed = isDown('run') || stickRunning() ? RUN : WALK;
    if (a.boosted) maxSpeed *= BOOST;
    const targetVX = ix * maxSpeed;
    const targetVZ = iz * maxSpeed;
    const accel = a.grounded ? (ix || iz ? 70 : 55) : 22;
    const dvx = targetVX - s.vel.x;
    const dvz = targetVZ - s.vel.y;
    const dvl = Math.hypot(dvx, dvz);
    const step = Math.min(dvl, accel * dt);
    if (dvl > 1e-5) {
      s.vel.x += (dvx / dvl) * step;
      s.vel.y += (dvz / dvl) * step;
    }

    const prevX = s.pos.x;
    const prevZ = s.pos.z;
    s.pos.x += s.vel.x * dt;
    s.pos.z += s.vel.y * dt;
    const hit = resolve(s.pos, RADIUS, s.pos.y);
    // Remove velocity lost to collisions so we slide instead of pushing.
    if (dt > 0) {
      s.vel.x = (s.pos.x - prevX) / dt;
      s.vel.y = (s.pos.z - prevZ) / dt;
    }
    s.bumpCooldown -= dt;
    if (hit && s.bumpCooldown <= 0 && Math.hypot(targetVX, targetVZ) > 6 && Math.hypot(s.vel.x, s.vel.y) < 3) {
      sfx.bump();
      s.bumpCooldown = 0.6;
    }

    // ---------- facing & turn rate ----------
    const hSpeed = Math.hypot(s.vel.x, s.vel.y);
    const prevYaw = s.yaw;
    if (s.yawTarget !== null && hSpeed < 0.6) {
      const d = wrapAngle(s.yawTarget - s.yaw);
      if (Math.abs(d) < 0.01) s.yawTarget = null;
      else s.yaw += THREE.MathUtils.clamp(d, -7 * dt, 7 * dt);
    } else if (hSpeed > 0.6) {
      s.yawTarget = null;
    }
    if (hSpeed > 0.6 && !eliminated) {
      const targetYaw = Math.atan2(s.vel.x, s.vel.y);
      const d = wrapAngle(targetYaw - s.yaw);
      s.yaw += THREE.MathUtils.clamp(d, -TURN_RATE * dt, TURN_RATE * dt);
    }
    a.turnRate = damp(a.turnRate, dt > 0 ? wrapAngle(s.yaw - prevYaw) / dt : 0, 12, dt);
    a.speed = hSpeed;

    // ---------- vertical ----------
    if (playing && !blocked && !eliminated && a.grounded && wasPressed('jump')) {
      a.vy = JUMP_V;
      a.grounded = false;
      sfx.jump();
      events.emit('player:jump');
    }
    if (!a.grounded) a.vy -= GRAVITY * dt;
    s.pos.y += a.vy * dt;
    const ground = groundHeightAt(s.pos.x, s.pos.z, RADIUS, Math.max(s.pos.y, s.pos.y - a.vy * dt));
    if (s.pos.y <= ground) {
      if (!a.grounded && a.vy < -4) {
        a.landImpact = Math.min(2, -a.vy / 14);
        a.landT = 0;
        sfx.land(a.landImpact);
        events.emit('player:land', { impact: a.landImpact });
      }
      s.pos.y = ground;
      a.vy = 0;
      a.grounded = true;
    } else if (a.grounded && s.pos.y > ground + 0.05) {
      a.grounded = false; // walked off a ledge
    }

    // ---------- gait + footsteps ----------
    if (a.grounded) {
      a.stepPhase += hSpeed * dt * 1.35;
      const idx = Math.floor(a.stepPhase / Math.PI);
      if (idx !== s.lastStepIdx && hSpeed > 1.5) sfx.footstep(idx % 2 === 0);
      s.lastStepIdx = idx;
    }

    // ---------- interaction prompt ----------
    if (playing && !blocked && !eliminated) {
      let best: (typeof INTERACTABLES)[number] | null = null;
      let bestD = Infinity;
      for (const it of INTERACTABLES) {
        if (it.disabled?.()) continue;
        if (it.minY !== undefined && s.pos.y < it.minY) continue;
        const p = interactablePos(it);
        const d = Math.hypot(p.x - s.pos.x, p.z - s.pos.z);
        if (d < it.radius && d < bestD) {
          best = it;
          bestD = d;
        }
      }
      const id = best ? best.id : '';
      if (id !== s.lastPrompt) {
        s.lastPrompt = id;
        g.setPrompt(best ? { id: best.id, verb: best.verb, label: best.label } : null);
        if (best) sfx.promptIn();
      }
      if (best && wasPressed('interact')) {
        a.interactT = 0;
        interact(best.id, { x: Math.sin(s.yaw), z: Math.cos(s.yaw) });
      }
    } else {
      // Menus open / eliminated / title: hide the prompt (it re-appears when play resumes in range).
      s.lastPrompt = '';
      if (g.prompt) g.setPrompt(null);
    }

    // ---------- publish + apply transforms ----------
    player.pos.copy(s.pos);
    player.yaw = s.yaw;
    player.grounded = a.grounded;
    root.current.position.copy(s.pos);
    root.current.rotation.y = s.yaw;
    const groundBelow = groundHeightAt(s.pos.x, s.pos.z, RADIUS, s.pos.y);
    shadow.current.position.set(s.pos.x, groundBelow + 0.03, s.pos.z);
    const hAbove = s.pos.y - groundBelow;
    const sc = THREE.MathUtils.clamp(1 - hAbove * 0.12, 0.45, 1);
    shadow.current.scale.setScalar(sc * 3.2);
    (shadow.current.material as THREE.MeshBasicMaterial).opacity = sc;

    // ---------- camera ----------
    // Portrait phones: widen the vertical FOV so the horizontal view isn't a keyhole.
    const persp = camera as THREE.PerspectiveCamera;
    const wantFov = persp.aspect < 1 ? 50 + (1 - persp.aspect) * 40 : 50;
    if (Math.abs(persp.fov - wantFov) > 0.1) {
      persp.fov = wantFov;
      persp.updateProjectionMatrix();
    }
    const portrait = persp.aspect < 1;
    if (g.screen === 'menu') {
      // Main menu diorama: low, slowly drifting shot in front of the contender with the
      // village behind it (concept 01 composition). The toy sits right of the menu panel
      // in landscape, above it in portrait.
      const t = state.clock.elapsedTime;
      if (t > s.nextWave && a.interactT < 0) {
        a.interactT = 0; // occasional happy hop for the camera
        s.nextWave = t + 6 + Math.random() * 4;
      }
      const ang = 0.32 + Math.sin(t * 0.09) * 0.22;
      const dist = portrait ? 12.5 : 9.5;
      tmp.desired.set(s.pos.x + Math.sin(ang) * dist, s.pos.y + 3.0 + Math.sin(t * 0.13) * 0.4, s.pos.z + Math.cos(ang) * dist);
      if (s.snapCam) {
        s.camPos.copy(tmp.desired);
        s.snapCam = false;
      } else s.camPos.lerp(tmp.desired, 1 - Math.exp(-2.2 * dt));
      camera.position.copy(s.camPos);
      const rx = Math.cos(ang);
      const rz = -Math.sin(ang);
      const side = portrait ? 0 : -2.3; // shift look point left → toy appears on the right
      tmp.look.set(s.pos.x + rx * side, s.pos.y + 2.4 - (portrait ? 1.6 : 0), s.pos.z + rz * side);
      camera.lookAt(tmp.look);
      s.camTarget.set(s.pos.x, s.pos.y + TARGET_H, s.pos.z);
    } else if (g.screen === 'workshop') {
      // Workshop turntable: close orbit around the contender, drag to spin, gentle auto-spin.
      s.wsYawTarget += dt * 0.12;
      s.wsYaw += wrapAngle(s.wsYawTarget - s.wsYaw) * (1 - Math.exp(-6 * dt));
      s.wsDist = damp(s.wsDist, portrait ? 10 : 7.2, 4, dt);
      const ang = s.wsYaw;
      const dist = s.wsDist;
      tmp.desired.set(s.pos.x + Math.sin(ang) * dist, s.pos.y + 2.6, s.pos.z + Math.cos(ang) * dist);
      s.camPos.copy(tmp.desired); // the orbit itself is smoothed above
      camera.position.copy(s.camPos);
      const rx = Math.cos(ang);
      const rz = -Math.sin(ang);
      const side = portrait ? 0 : 1.9; // shift look point right → toy appears left of the panel
      tmp.look.set(s.pos.x + rx * side, s.pos.y + 1.9 - (portrait ? 2.3 : 0), s.pos.z + rz * side);
      camera.lookAt(tmp.look);
      s.camTarget.set(s.pos.x, s.pos.y + TARGET_H, s.pos.z);
    } else {
      s.camTarget.x = damp(s.camTarget.x, s.pos.x, 12, dt);
      s.camTarget.z = damp(s.camTarget.z, s.pos.z, 12, dt);
      s.camTarget.y = damp(s.camTarget.y, (eliminated ? 0 : s.pos.y) + TARGET_H, 6, dt);

      const cp = Math.cos(s.camPitch);
      tmp.dir.set(Math.sin(s.camYaw) * cp, Math.sin(s.camPitch), Math.cos(s.camYaw) * cp).normalize();

      // camera collision: shorten the boom when a big prop is in the way
      let want = CAM_DIST;
      if (cameraBlockers.size) {
        raycaster.set(s.camTarget, tmp.dir);
        raycaster.far = CAM_DIST + 1;
        const hits = raycaster.intersectObjects([...cameraBlockers], true);
        if (hits.length) want = Math.max(CAM_MIN_DIST, hits[0].distance - 1.0);
      }
      s.camDist = damp(s.camDist, want, want < s.camDist ? 18 : 2.5, dt);

      tmp.desired.copy(s.camTarget).addScaledVector(tmp.dir, s.camDist);
      tmp.desired.y = Math.max(tmp.desired.y, 0.8);
      if (s.snapCam) {
        s.camPos.copy(tmp.desired);
        s.camDist = want;
        s.snapCam = false;
      } else s.camPos.lerp(tmp.desired, 1 - Math.exp(-(g.paused ? 3 : 14) * dt));
      camera.position.copy(s.camPos);
      // look slightly ahead of the toy so the world opens up in front of it
      // Pitching down low turns into looking up at the giant room (worm's-eye view).
      const lift = LOOK_LIFT + Math.max(0, DEFAULT_PITCH - s.camPitch) * 11;
      tmp.look.set(s.camTarget.x + s.vel.x * 0.08, s.camTarget.y + lift, s.camTarget.z + s.vel.y * 0.08);
      camera.lookAt(tmp.look);
    }

    endFrame();
  });

  return (
    <>
      <group ref={root}>
        <WindupBot anim={anim} paint={paint} hat={hat} keySkin={keySkin} />
      </group>
      <mesh ref={shadow} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={blobShadowTexture()} transparent depthWrite={false} opacity={1} />
      </mesh>
    </>
  );
}
