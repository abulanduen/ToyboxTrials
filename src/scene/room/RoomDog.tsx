/**
 * TEMPORARY stand-in for the family dog (room layer). A chunky, low-poly, code-built brown pit
 * bull that walks the floor route in roomLayout.ts (DOG_PATH) at an amble, stops to sniff, sit,
 * lie in the sun on the rug and sleep in its bed, and loops. The generated, rigged GLB
 * (asset manifest `room-dog-pitbull`, GLB_SLOTS.dog) replaces it later and follows the same path.
 *
 * Cheap on purpose (about 1k triangles, four draw calls: body, head, tail and the four legs as one
 * instanced mesh), so it stays on every tier. It is about 54 cm tall at the head on a floor 75 cm
 * below the table tops, so it never rises into the toys' view of the hub; it is seen over the
 * table edges and from the room. Unlit like the baked room: its colours carry a little form
 * shading and are tinted by the room's light model (bake.ts irradiance) where it stands.
 * The pose comes from dogPose(time), which is pure; only transforms and the tint change per frame.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ROOM } from '../../game/palette';
import { exposeDebug } from '../../game/debug';
import { FLOOR_Y } from '../layout';
import { DOG_SPOTS, dogArrivalTime, dogPose } from './roomLayout';
import { irradiance } from './bake';
import { DOG_VISIT, dogVisit, endVisit, perchStay } from '../../game/dogVisit';
import { player } from '../../game/player';

/** Stand-in dimensions (cm): height at the shoulder and of the head's top when standing. */
export const DOG_SIZE = { shoulder: 42, head: 54, length: 72 };

type Part = [THREE.BufferGeometry, string, [number, number, number], [number, number, number]?];

/** Merge flat-coloured parts into one geometry with vertex colours. */
function merged(parts: Part[]) {
  const geos = parts.map(([g, color, pos, rot]) => {
    const x = (g.index ? g.toNonIndexed() : g).clone();
    x.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...(rot ?? [0, 0, 0]))), new THREE.Vector3(1, 1, 1)));
    for (const name of Object.keys(x.attributes)) if (name !== 'position' && name !== 'normal') x.deleteAttribute(name);
    const c = new THREE.Color(color);
    const n = x.attributes.position.count;
    const nor = x.attributes.normal;
    const col = new Float32Array(n * 3);
    // a little form shading baked in (lit from above and the window side), like the room layer
    for (let i = 0; i < n; i++) {
      const k = 0.62 + 0.3 * Math.max(0, nor.getY(i)) + 0.12 * Math.max(0, -nor.getZ(i)) - 0.1 * Math.max(0, -nor.getY(i));
      col.set([c.r * k, c.g * k, c.b * k], i * 3);
    }
    x.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.dispose();
    return x;
  });
  const out = mergeGeometries(geos, false)!;
  geos.forEach((g) => g.dispose());
  out.computeBoundingSphere();
  return out;
}

function buildDog() {
  const D = ROOM.dog;
  const Lt = ROOM.dogLight;
  const K = ROOM.dogDark;
  // body: local origin at the hips' height on the floor; +z is the front
  const body = merged([
    [new RoundedBoxGeometry(24, 22, 52, 2, 7), D, [0, 0, 0]],
    [new RoundedBoxGeometry(20, 14, 18, 2, 6), Lt, [0, -5, 20]], // pale chest
    [new RoundedBoxGeometry(14, 14, 14, 2, 5), D, [0, 9, 26], [-0.5, 0, 0]], // neck
  ]);
  // head: origin at the back of the skull
  const head = merged([
    [new RoundedBoxGeometry(19, 17, 18, 2, 6), D, [0, 0, 6]],
    [new RoundedBoxGeometry(12, 9, 12, 2, 3.5), Lt, [0, -3.5, 18]], // muzzle
    [new THREE.BoxGeometry(5, 3.2, 2.5), K, [0, -0.5, 24]], // nose
    [new THREE.BoxGeometry(2.2, 2.2, 1), K, [-5, 3, 15.2]], // eyes
    [new THREE.BoxGeometry(2.2, 2.2, 1), K, [5, 3, 15.2]],
    [new THREE.BoxGeometry(6, 7, 2), D, [-8, 9, 2], [0.2, 0, 0.6]], // ears, folded
    [new THREE.BoxGeometry(6, 7, 2), D, [8, 9, 2], [0.2, 0, -0.6]],
  ]);
  const tail = merged([[new RoundedBoxGeometry(3.6, 3.6, 20, 2, 1.6), D, [0, 0, -10]]]);
  // a leg hangs down from its hip/shoulder pivot
  const leg = merged([
    [new RoundedBoxGeometry(7.5, 28, 8, 2, 2.6), D, [0, -14, 0]],
    [new RoundedBoxGeometry(8, 4, 10, 2, 1.8), Lt, [0, -27, 1.5]], // paw
  ]);
  return { body, head, tail, leg };
}

/**
 * Standing up at the table (the perch): torso pitch (rad), hip height, where the head sits on the
 * stretched neck (torso space), how far it looks down over the table, and the front legs' swing
 * (forward, paws on the table top).
 */
const PERCH = { pitch: 1.05, hip: 48, headY: 28, headZ: 36, look: 0.4, front: -1.5 };

/** A heart (code-built), about 5 cm across, for the dog's "love" emote when petted. */
function heartGeometry() {
  const h = new THREE.Shape();
  h.moveTo(0, -2.6);
  h.bezierCurveTo(-1.2, -1.6, -3, -0.6, -3, 0.9);
  h.bezierCurveTo(-3, 2.2, -1.8, 2.8, -0.9, 2.8);
  h.bezierCurveTo(-0.3, 2.8, 0, 2.3, 0, 1.9);
  h.bezierCurveTo(0, 2.3, 0.3, 2.8, 0.9, 2.8);
  h.bezierCurveTo(1.8, 2.8, 3, 2.2, 3, 0.9);
  h.bezierCurveTo(3, -0.6, 1.2, -1.6, 0, -2.6);
  const g = new THREE.ExtrudeGeometry(h, { depth: 1, bevelEnabled: true, bevelThickness: 0.35, bevelSize: 0.35, bevelSegments: 2, curveSegments: 8 });
  g.translate(0, 0, -0.5);
  return g;
}
const HEART_LIFE = 1.6;
/** The lick: the tongue comes out and back over this long (s). */
const LICK_S = 1.3;

const LEGS: [number, number][] = [
  [-8, 20], // front left
  [8, 20],
  [-8, -20], // hind left
  [8, -20],
];

export function RoomDog() {
  const parts = useMemo(buildDog, []);
  // Unlit like the rest of the room layer; tinted by the room's baked light where the dog stands
  // (so it is dim under the tables and warm in the sun patch on the rug).
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ vertexColors: true }), []);
  const root = useRef<THREE.Group>(null!);
  const torso = useRef<THREE.Group>(null!);
  const head = useRef<THREE.Group>(null!);
  const tail = useRef<THREE.Group>(null!);
  const legs = useMemo(() => {
    const m = new THREE.InstancedMesh(parts.leg, mat, 4);
    m.castShadow = false;
    m.frustumCulled = false;
    return m;
  }, [parts, mat]);
  const st = useRef({ offset: 0, blend: { sit: 0, lie: 0, sniff: 0, perch: 0 }, tmp: new THREE.Object3D(), headAt: new THREE.Vector3(), lookYaw: 0, faceX: 0, faceZ: 1, perchSince: -1 });
  const hearts = useMemo(() => {
    const m = new THREE.InstancedMesh(heartGeometry(), new THREE.MeshBasicMaterial({ color: ROOM.dogHeart }), 8);
    m.frustumCulled = false;
    m.count = 0;
    m.name = 'dog:hearts';
    return m;
  }, []);
  const tongue = useRef<THREE.Mesh>(null!);
  const tongueGeo = useMemo(() => {
    const g = new RoundedBoxGeometry(7, 2.2, 18, 2, 0.9);
    g.translate(0, 0, 9); // grows out from the mouth along +z
    return g;
  }, []);
  const tongueMat = useMemo(() => new THREE.MeshBasicMaterial({ color: ROOM.dogTongue }), []);

  useEffect(() => {
    exposeDebug({
      dog: {
        pose: () => ({ ...dogPose(performance.now() / 1000 + st.current.offset), y: FLOOR_Y }),
        /** Jump the stand-in to `t` seconds into its loop (screenshots). */
        at: (t: number) => {
          st.current.offset = t - performance.now() / 1000;
        },
        /** Jump to just before the dog stands up at the spawn table (its perch). */
        perch: (early = 0.5) => {
          st.current.offset = dogArrivalTime('perch')! - early - performance.now() / 1000;
        },
        visit: () => ({ ...dogVisit, hearts: dogVisit.hearts.length }),
        /** Tests on a slow software renderer: how long it waits after the last pet (s; normally 10). */
        patience: (sec: number) => {
          DOG_VISIT.stay = sec;
        },
        /** Screenshots: show the lick `into` seconds in (it lasts LICK_S). */
        lickAt: (into = LICK_S / 2) => {
          dogVisit.lickAt = performance.now() / 1000 - into;
        },
      },
    });
    return () => {
      Object.values(parts).forEach((g) => g.dispose());
      mat.dispose();
      legs.dispose();
      hearts.geometry.dispose();
      (hearts.material as THREE.Material).dispose();
      hearts.dispose();
      tongueGeo.dispose();
      tongueMat.dispose();
    };
  }, [parts, mat, legs, hearts, tongueGeo, tongueMat]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const s = st.current;
    const nowS = performance.now() / 1000;
    let t = nowS + s.offset;
    let p = dogPose(t);
    // Up at the table: it stays while it's being petted (10 s after the last pet), then strolls on.
    // A long frame can step the clock past the end of the perch: if a pet still keeps it, step back.
    if (p.action !== 'perch' && dogVisit.perched && nowS - dogVisit.lastPetAt < DOG_VISIT.stay) {
      const end = dogArrivalTime('perch')! + DOG_SPOTS.perch.hold;
      const k = ((t % p.loop) + p.loop) % p.loop;
      if (k > end) {
        s.offset -= k - end + 0.01;
        t = nowS + s.offset;
        p = dogPose(t);
      }
    }
    if (p.action === 'perch') {
      // (never wind back past its arrival: a longer stay is held a frame at a time)
      const stay = Math.min(DOG_SPOTS.perch.hold, perchStay(nowS, p.holdLeft));
      if (stay > p.holdLeft) {
        s.offset -= stay - p.holdLeft;
        t = nowS + s.offset;
        p = dogPose(t);
      }
    }
    const k = 1 - Math.exp(-4 * dt);
    const b = s.blend;
    b.sit += ((p.action === 'sit' ? 1 : 0) - b.sit) * k;
    b.lie += ((p.action === 'lie' || p.action === 'sleep' ? 1 : 0) - b.lie) * k;
    b.sniff += ((p.action === 'sniff' ? 1 : 0) - b.sniff) * k;
    b.perch += ((p.action === 'perch' ? 1 : 0) - b.perch) * (1 - Math.exp(-3 * dt));
    // ready to pet half a second after arriving (by the clock, so a slow frame rate doesn't delay it)
    if (p.action !== 'perch') s.perchSince = -1;
    else if (s.perchSince < 0) s.perchSince = nowS;
    const perched = p.action === 'perch' && nowS - s.perchSince > 0.5;
    if (dogVisit.perched && !perched) endVisit();
    dogVisit.perched = perched;
    const happy = Math.max(0, 1 - (nowS - dogVisit.lastPetAt) / 2.5);
    const walk = p.moving ? Math.sin(t * 7.5) : 0;

    root.current.position.set(p.x, FLOOR_Y, p.z);
    irradiance(p.x, FLOOR_Y + 40, p.z, 0, 1, 0, mat.color);
    // keep even the pale muzzle under the bloom threshold in the sun patch
    const peak = Math.max(mat.color.r, mat.color.g, mat.color.b);
    if (peak > 1.15) mat.color.multiplyScalar(1.15 / peak);
    // turn smoothly towards the heading
    const r = root.current.rotation;
    const dYaw = Math.atan2(Math.sin(p.heading - r.y), Math.cos(p.heading - r.y));
    r.y += dYaw * (1 - Math.exp(-5 * dt));

    // torso: standing at hip height 34; sitting tips it up at the front; lying lowers it; perching
    // stands it up on the hind legs against the table
    const pr = b.perch;
    const hipY = 34 - b.lie * 22 - b.sit * 12 + pr * (PERCH.hip - 34);
    torso.current.position.set(0, hipY + Math.abs(walk) * 0.8, 0);
    torso.current.rotation.x = -0.5 * b.sit - PERCH.pitch * pr;
    // head: up and alert, nose down to sniff, resting on the paws asleep; perched, it peers over the
    // table, sniffing, and looks at you when you're near (else round at the toys)
    const sleep = p.action === 'sleep' ? 1 : 0;
    head.current.position.set(0, 13 + b.sit * 2 + pr * (PERCH.headY - 13), 30 + pr * (PERCH.headZ - 30));
    const sniffPerch = pr * (PERCH.look + Math.sin(t * 7) * 0.06 * (1 - happy));
    head.current.rotation.order = 'YXZ';
    head.current.rotation.x = b.sniff * (0.7 + Math.sin(t * 9) * 0.1) + b.lie * sleep * 0.5 + b.sit * 0.45 + PERCH.pitch * pr + sniffPerch - pr * 0.25 * happy;
    let wantYaw = Math.sin(t * 0.6) * 0.55;
    if (Math.hypot(player.pos.x - p.x, player.pos.z - p.z) < 70) {
      const a = Math.atan2(player.pos.x - p.x, player.pos.z - p.z) - r.y;
      wantYaw = Math.max(-0.7, Math.min(0.7, Math.atan2(Math.sin(a), Math.cos(a))));
    }
    s.lookYaw += (wantYaw * pr - s.lookYaw) * (1 - Math.exp(-3 * dt));
    head.current.rotation.y = s.lookYaw;
    s.faceX = Math.sin(r.y + s.lookYaw);
    s.faceZ = Math.cos(r.y + s.lookYaw);
    const wag = p.moving ? 9 : 5 + happy * 9;
    tail.current.rotation.set(0.5 - b.lie * 0.4 - pr * 0.6, Math.sin(t * wag) * (0.5 + happy * 0.3 - b.lie * sleep * 0.45), 0);

    // legs: swing when walking, fold forward lying down, hind legs tucked when sitting; perched,
    // the front paws rest on the table and the hind legs stand straight
    const tiltSit = 0.5 * b.sit; // sitting raises the front of the torso
    const tiltPerch = PERCH.pitch * pr;
    LEGS.forEach(([lx, lz], i) => {
      const front = lz > 0;
      const phase = (i === 0 || i === 3 ? 1 : -1) * walk;
      const o = s.tmp;
      // pivot at the shoulder / hip, following the torso's tilt
      const tilt = (front ? tiltSit : 0) + tiltPerch;
      o.position.set(lx, hipY - 4 * Math.cos(tiltPerch) + lz * Math.sin(tilt), lz * Math.cos(tilt) + 4 * Math.sin(tiltPerch));
      const lieRot = front ? -1.45 : 1.35; // lying: front legs forward, hind legs back
      const sitRot = front ? 0.1 : -1.2; // sitting: hind legs folded under
      o.rotation.set(phase * 0.45 * (1 - b.lie) + b.lie * lieRot + b.sit * sitRot + (front ? pr * PERCH.front : 0), 0, 0);
      o.updateMatrix();
      legs.setMatrixAt(i, o.matrix);
    });
    legs.instanceMatrix.needsUpdate = true;

    // the lick: the tongue slides out and back; hearts float up from the head after each pet
    const lk = (nowS - dogVisit.lickAt) / LICK_S;
    const out = lk >= 0 && lk < 1 ? Math.sin(Math.PI * lk) : 0;
    tongue.current.visible = out > 0.01;
    tongue.current.scale.set(1, 1, Math.max(0.01, out));
    head.current.getWorldPosition(s.headAt);
    let n = 0;
    for (const h of dogVisit.hearts) {
      const age = nowS - h;
      if (age < 0 || age > HEART_LIFE) continue;
      const o = s.tmp;
      const f = age / HEART_LIFE;
      // in front of its face (towards the toys), drifting up
      o.position.set(s.headAt.x + s.faceX * 8 + Math.sin(h * 13.7) * 9, s.headAt.y + 4 + f * 12, s.headAt.z + s.faceZ * 8 + Math.cos(h * 7.3) * 2);
      o.rotation.set(0, Math.sin(age * 3) * 0.5, Math.sin(h * 5.1) * 0.25);
      o.scale.setScalar(Math.max(0.001, Math.min(1, age * 6) * (1 - f * f) * 1.2));
      o.updateMatrix();
      hearts.setMatrixAt(n++, o.matrix);
    }
    hearts.count = n;
    if (n) hearts.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <group ref={root}>
        <group ref={torso}>
          <mesh geometry={parts.body} material={mat} />
          <group ref={head}>
            <mesh geometry={parts.head} material={mat} />
            {/* the tongue, out only for the lick */}
            <mesh ref={tongue} name="dog:tongue" geometry={tongueGeo} material={tongueMat} position={[0, -6.5, 20]} rotation={[0.25, 0, 0]} visible={false} />
          </group>
          <group ref={tail} position={[0, 7, -25]}>
            <mesh geometry={parts.tail} material={mat} />
          </group>
        </group>
        <primitive object={legs} />
      </group>
      <primitive object={hearts} />
    </>
  );
}
