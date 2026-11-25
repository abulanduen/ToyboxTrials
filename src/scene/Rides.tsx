/**
 * The rides between the Hub's levels (docs/ARCADE_PLAN.md phase 2; paths and timing:
 * src/game/hubRides.ts): the toy-car track off the spawn table's front edge, down a drop, round a
 * loop on the rug and into the arcade; and the toy lift beside it, a wind-up tower whose platform
 * runs out of the arcade, climbs and slides in over the table top.
 *
 * Original toys, code-built: a teal track with honey rails on thin struts, a chunky coral wind-up
 * car with a golden key, a sage lift platform on a honey tower with a crank wheel.
 * A car waits at the top and a platform at the bottom; everyone on a ride (you, and other players
 * online) gets their own car or platform, placed from the ride's clock like the toy riding it.
 * No lights are added, and nothing here has a collider.
 */
import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PALETTE } from '../game/palette';
import { CAR, LIFT, RIDES, TABLE_FRONT, TRACK_Y, ridePose, type RideKind, type RidePose } from '../game/hubRides';
import { ride, rideTime } from '../game/rideState';
import { remotes } from '../net/remotes';
import { netLink } from '../net/link';
import { INTERP_DELAY_MS } from '../net/protocol';
import { FLOOR_Y } from './layout';

/** At most this many cars (and platforms) moving at once, besides the ones waiting. */
const POOL = 6;

// ------------------------------------------------------------------ the track

/** Cross-section of the track (x across, y up; the running surface at y = 0), counter-clockwise. */
const TRACK_PROFILE: [number, number][] = [
  [-2.7, -0.5],
  [2.7, -0.5],
  [2.7, 0.6],
  [2.2, 0.6],
  [2.2, 0],
  [-2.2, 0],
  [-2.2, 0.6],
  [-2.7, 0.6],
];
/** Edge i runs from profile point i to i + 1: the running surface (edge 4) is teal, the rest honey. */
const DECK_EDGE = 4;

/**
 * Sweep a closed 2D profile along a ride's path (every `every` cm), with crisp edges (each edge has
 * its own vertices and normal) and vertex colours.
 */
function sweep(kind: RideKind, profile: [number, number][], colour: (edge: number) => THREE.Color, every = 1): THREE.BufferGeometry {
  const { samples } = RIDES[kind];
  const frames: { p: THREE.Vector3; r: THREE.Vector3; u: THREE.Vector3; f: THREE.Vector3 }[] = [];
  let last = -Infinity;
  samples.forEach((sm, i) => {
    if (sm.s - last < every && i !== samples.length - 1) return;
    last = sm.s;
    const f = new THREE.Vector3(...sm.f);
    const u = new THREE.Vector3(...sm.u);
    const r = new THREE.Vector3().crossVectors(u, f).normalize();
    frames.push({ p: new THREE.Vector3(sm.x, sm.y, sm.z), r, u, f });
  });
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const n = profile.length;
  const a0 = new THREE.Vector3();
  const a1 = new THREE.Vector3();
  const b0 = new THREE.Vector3();
  const b1 = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  const tri = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const at = (fr: (typeof frames)[number], q: [number, number], out: THREE.Vector3) => out.copy(fr.p).addScaledVector(fr.r, q[0]).addScaledVector(fr.u, q[1]);
  for (let i = 0; i + 1 < frames.length; i++) {
    const A = frames[i];
    const B = frames[i + 1];
    for (let e = 0; e < n; e++) {
      const q0 = profile[e];
      const q1 = profile[(e + 1) % n];
      // outward normal of this edge in the profile plane: (dy, -dx)
      const nx = q1[1] - q0[1];
      const ny = -(q1[0] - q0[0]);
      const c = colour(e);
      at(A, q0, a0);
      at(A, q1, a1);
      at(B, q0, b0);
      at(B, q1, b1);
      const quad = [a0, b0, a1, a1, b0, b1];
      // keep the winding facing the way the edge's normal points
      nrm.copy(A.r).multiplyScalar(nx).addScaledVector(A.u, ny).normalize();
      tri.crossVectors(e1.subVectors(b0, a0), e2.subVectors(a1, a0));
      if (tri.dot(nrm) < 0) quad.reverse();
      const nB = new THREE.Vector3().copy(B.r).multiplyScalar(nx).addScaledVector(B.u, ny).normalize();
      for (const v of quad) {
        pos.push(v.x, v.y, v.z);
        const nn = v === b0 || v === b1 ? nB : nrm;
        nor.push(nn.x, nn.y, nn.z);
        col.push(c.r, c.g, c.b);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

/** Struts from the track down to the floor (every ~12 cm where it runs high), skipping the loop. */
function strutSpots(): { x: number; z: number; top: number }[] {
  const out: { x: number; z: number; top: number }[] = [];
  let last = -Infinity;
  for (const sm of RIDES.car.samples) {
    const inLoop = sm.z > CAR.loopZ - CAR.loopR - 1 && sm.z < CAR.loopZ + CAR.loopR + 1 && sm.x > CAR.x - 0.1 && sm.x < CAR.x + CAR.loopShift + 0.1 && sm.y > TRACK_Y + 0.3;
    if (sm.z <= TABLE_FRONT + 3 || inLoop || sm.y < TRACK_Y + 3 || sm.u[1] < 0.5) continue;
    if (sm.s - last < 12) continue;
    last = sm.s;
    out.push({ x: sm.x, z: sm.z, top: sm.y - 0.5 });
  }
  return out;
}

// ------------------------------------------------------------------ vehicles

/** The wind-up car: a chunky open tub on four wheels with a golden key at the back. Origin: on the track, facing +z. */
function carGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const paint = (g: THREE.BufferGeometry, hex: string) => {
    const c = new THREE.Color(hex);
    const n = g.attributes.position.count;
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    g.deleteAttribute('uv');
    return g.index ? g.toNonIndexed() : g;
  };
  // tub: floor at 1.1 (the rider's feet), sides up to 2.1
  const floor = new RoundedBoxGeometry(3.6, 0.6, 4.6, 2, 0.25);
  floor.translate(0, 0.8, 0);
  parts.push(paint(floor, PALETTE.coral));
  for (const sx of [-1, 1]) {
    const side = new RoundedBoxGeometry(0.4, 1.2, 4.6, 2, 0.18);
    side.translate(sx * 1.6, 1.5, 0);
    parts.push(paint(side, PALETTE.coral));
  }
  for (const sz of [-1, 1]) {
    const end = new RoundedBoxGeometry(3.6, sz > 0 ? 1.0 : 1.4, 0.4, 2, 0.18);
    end.translate(0, sz > 0 ? 1.4 : 1.6, sz * 2.1);
    parts.push(paint(end, PALETTE.coral));
  }
  // a cream stripe along each side
  for (const sx of [-1, 1]) {
    const stripe = new THREE.BoxGeometry(0.06, 0.28, 3.8);
    stripe.translate(sx * 1.83, 1.55, 0);
    parts.push(paint(stripe, PALETTE.cream));
  }
  // wheels, with honey hubs
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const w = new THREE.CylinderGeometry(0.62, 0.62, 0.5, 14);
      w.rotateZ(Math.PI / 2);
      w.translate(sx * 1.95, 0.62, sz * 1.45);
      parts.push(paint(w, PALETTE.ink));
      const hub = new THREE.CylinderGeometry(0.26, 0.26, 0.54, 10);
      hub.rotateZ(Math.PI / 2);
      hub.translate(sx * 1.97, 0.62, sz * 1.45);
      parts.push(paint(hub, PALETTE.honey));
    }
  // the wind-up key at the back
  const stem = new THREE.CylinderGeometry(0.12, 0.12, 0.8, 8);
  stem.rotateX(Math.PI / 2);
  stem.translate(0, 1.5, -2.7);
  parts.push(paint(stem, PALETTE.brass));
  for (const sx of [-1, 1]) {
    const bow = new THREE.TorusGeometry(0.36, 0.11, 6, 12);
    bow.rotateX(Math.PI / 2);
    bow.translate(sx * 0.38, 1.5, -3.1);
    parts.push(paint(bow, PALETTE.brass));
  }
  return mergeGeometries(parts, false)!;
}

/** The lift's platform: a sage deck with a honey rim and a little rail at the back. Origin: under the deck, centred. */
function deckGeometry(): THREE.BufferGeometry {
  const deck = new RoundedBoxGeometry(5, 0.5, 5, 2, 0.15);
  deck.translate(0, 0.25, 0);
  return deck;
}

/** Where the lift's top rails end, short of the platform's climb (it is 5 cm deep, centred on the tower's z). */
const TOP_RAIL_END = LIFT.towerZ - 2.9;

function towerGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const h = -FLOOR_Y + 5; // floor to just above the table top
  for (const sx of [-1, 1]) {
    const post = new THREE.BoxGeometry(0.9, h, 0.9);
    post.translate(LIFT.x + sx * 3.2, FLOOR_Y + h / 2, LIFT.towerZ + 3.2);
    parts.push(post);
  }
  // cross braces up the tower
  const rungs = 9;
  for (let i = 1; i <= rungs; i++) {
    const y = FLOOR_Y + (h * i) / (rungs + 1);
    const rung = new THREE.BoxGeometry(6.4, 0.35, 0.35);
    rung.translate(LIFT.x, y, LIFT.towerZ + 3.2);
    parts.push(rung);
  }
  // the top bar the crank wheel hangs from
  const top = new THREE.BoxGeometry(7.4, 0.7, 1.2);
  top.translate(LIFT.x, FLOOR_Y + h, LIFT.towerZ + 3.2);
  parts.push(top);
  // rails: along the floor from the arcade to the tower, and over the table from the tower to the landing
  for (const sx of [-1, 1]) {
    const floorRail = new THREE.BoxGeometry(0.35, 0.3, LIFT.towerZ - LIFT.boardZ + 4);
    floorRail.translate(LIFT.x + sx * 2.2, FLOOR_Y + 0.15, (LIFT.towerZ + LIFT.boardZ) / 2);
    parts.push(floorRail);
    // (they stop short of the tower, so the platform climbs clear of them)
    const topRail = new THREE.BoxGeometry(0.35, 0.3, TOP_RAIL_END - LIFT.landZ + 3);
    topRail.translate(LIFT.x + sx * 2.2, 0.15, (TOP_RAIL_END + LIFT.landZ - 3) / 2);
    parts.push(topRail);
  }
  // the bracket that holds the top rails out past the table's edge
  const bracket = new THREE.BoxGeometry(6, 0.5, TOP_RAIL_END - TABLE_FRONT + 1);
  bracket.translate(LIFT.x, -0.35, (TOP_RAIL_END + TABLE_FRONT - 1) / 2);
  parts.push(bracket);
  return mergeGeometries(parts.map((g) => g.toNonIndexed()), false)!;
}

// ------------------------------------------------------------------ who is riding

interface Rider {
  kind: RideKind;
  t: number;
}

const riders: Rider[] = [];
/** Everyone on a ride right now: the local toy, and online, everyone else (drawn as far behind as their toys). */
function collectRiders(): Rider[] {
  riders.length = 0;
  if (ride.kind) riders.push({ kind: ride.kind, t: rideTime() });
  const serverNow = remotes.size ? netLink.serverTime() : null;
  if (serverNow !== null) {
    for (const r of remotes.values()) {
      if (!r.ride) continue;
      const t = (serverNow - INTERP_DELAY_MS) / 1000 - r.ride.t0;
      if (t >= 0 && t < RIDES[r.ride.kind].duration) riders.push({ kind: r.ride.kind, t });
    }
  }
  return riders;
}

const basis = { x: new THREE.Vector3(), y: new THREE.Vector3(), z: new THREE.Vector3(), m: new THREE.Matrix4() };
/** Place an object on a ride's path at a pose: at the path point, standing on its up direction. */
function place(o: THREE.Object3D, p: RidePose) {
  o.position.set(p.x, p.y, p.z);
  basis.z.set(p.f[0], p.f[1], p.f[2]);
  basis.y.set(p.u[0], p.u[1], p.u[2]);
  basis.x.crossVectors(basis.y, basis.z).normalize();
  basis.y.crossVectors(basis.z, basis.x);
  o.quaternion.setFromRotationMatrix(basis.m.makeBasis(basis.x, basis.y, basis.z));
}

export function Rides() {
  const track = useMemo(
    () =>
      sweep('car', TRACK_PROFILE, (e) => new THREE.Color(e === DECK_EDGE ? PALETTE.toyBlue : PALETTE.honey), 1),
    [],
  );
  const trackMat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45 }), []);
  const struts = useMemo(strutSpots, []);
  const strutRef = useRef<THREE.InstancedMesh>(null!);
  const strutMat = useMemo(() => new THREE.MeshStandardMaterial({ color: PALETTE.cream, roughness: 0.6 }), []);
  const carGeo = useMemo(carGeometry, []);
  const carMat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4 }), []);
  const deckGeo = useMemo(deckGeometry, []);
  const deckMat = useMemo(() => new THREE.MeshStandardMaterial({ color: PALETTE.sage, roughness: 0.5 }), []);
  const towerGeo = useMemo(towerGeometry, []);
  const towerMat = useMemo(() => new THREE.MeshStandardMaterial({ color: PALETTE.honey, roughness: 0.5 }), []);
  const crank = useRef<THREE.Mesh>(null!);
  const cars = useRef<THREE.InstancedMesh>(null!);
  const decks = useRef<THREE.InstancedMesh>(null!);

  useLayoutEffect(() => {
    const o = new THREE.Object3D();
    struts.forEach((s, i) => {
      const h = s.top - FLOOR_Y;
      o.position.set(s.x, FLOOR_Y + h / 2, s.z);
      o.scale.set(1, h, 1);
      o.updateMatrix();
      strutRef.current.setMatrixAt(i, o.matrix);
    });
    strutRef.current.instanceMatrix.needsUpdate = true;
  }, [struts]);

  const tmp = useMemo(() => ({ o: new THREE.Object3D(), pose: { x: 0, y: 0, z: 0, f: [0, 0, 1], u: [0, 1, 0], yaw: 0, h: 0 } as RidePose }), []);
  useFrame((_, dt) => {
    const list = collectRiders();
    const o = tmp.o;
    let nCar = 0;
    let nDeck = 0;
    let lifting = false;
    // the ones waiting: a car at the top of the track, a platform at the bottom of the lift
    place(o, ridePose('car', 0, tmp.pose));
    o.updateMatrix();
    cars.current.setMatrixAt(nCar++, o.matrix);
    place(o, ridePose('lift', 0, tmp.pose));
    o.updateMatrix();
    decks.current.setMatrixAt(nDeck++, o.matrix);
    for (const r of list) {
      place(o, ridePose(r.kind, r.t, tmp.pose));
      o.updateMatrix();
      if (r.kind === 'car' && nCar < POOL + 1) cars.current.setMatrixAt(nCar++, o.matrix);
      if (r.kind === 'lift' && nDeck < POOL + 1) {
        decks.current.setMatrixAt(nDeck++, o.matrix);
        lifting = true;
      }
    }
    cars.current.count = nCar;
    decks.current.count = nDeck;
    cars.current.instanceMatrix.needsUpdate = true;
    decks.current.instanceMatrix.needsUpdate = true;
    // the crank wheel turns while someone is going up or down
    if (lifting) crank.current.rotation.z -= dt * 3;
  });

  return (
    <group name="rides">
      <mesh geometry={track} material={trackMat} castShadow receiveShadow />
      <instancedMesh ref={strutRef} args={[undefined, strutMat, struts.length]} castShadow>
        <cylinderGeometry args={[0.35, 0.45, 1, 6]} />
      </instancedMesh>
      {/* the clamp holding the track to the table's edge */}
      <mesh position={[CAR.x, -1.75, TABLE_FRONT + 0.6]} material={towerMat}>
        <boxGeometry args={[6.4, 4.4, 1.2]} />
      </mesh>
      {/* the loop's base plate on the rug */}
      <mesh position={[CAR.x + CAR.loopShift / 2, TRACK_Y - 0.9, CAR.loopZ]} material={strutMat} receiveShadow>
        <boxGeometry args={[CAR.loopShift + 8, 0.5, CAR.loopR * 2 + 6]} />
      </mesh>
      <instancedMesh ref={cars} args={[carGeo, carMat, POOL + 1]} castShadow frustumCulled={false} />
      <mesh geometry={towerGeo} material={towerMat} castShadow receiveShadow />
      <mesh ref={crank} position={[LIFT.x, 6.6, LIFT.towerZ + 3.9]}>
        <torusGeometry args={[1.5, 0.3, 6, 16]} />
        <meshStandardMaterial color={PALETTE.coral} roughness={0.5} />
      </mesh>
      <instancedMesh ref={decks} args={[deckGeo, deckMat, POOL + 1]} castShadow receiveShadow frustumCulled={false} />
    </group>
  );
}
