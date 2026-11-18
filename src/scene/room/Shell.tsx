/**
 * The room shell: walls with wainscoting, the thick window wall (it casts the real sun shadow
 * onto the table), window frame, sill, drapes, floor, ceiling, skirting and the door.
 *
 * Everything is baked (see bake.ts) and merged: 4 draw calls for the whole shell. No two faces are
 * coplanar: trim pieces are solid boxes that straddle the wall plane, so there is nothing to z-fight.
 */
import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ROOM } from '../../game/palette';
import { woodTexture } from '../textures';
import { Builder, SHELL, WINDOW, bakeGeometry, bakedMaterial } from './bake';

/** Height (world y) of the dado rail: tall panelling, so its colour shows above the table top. */
const RAIL_Y = 40;

function buildWindowWall() {
  const b = new Builder();
  const { minX, maxX, floorY, ceilY } = SHELL;
  const W = WINDOW;
  const zc = (W.zIn + W.zOut) / 2;
  const th = W.zIn - W.zOut;
  // Wall slabs around the opening, split at the rail so each has one colour.
  const slab = (x0: number, x1: number, y0: number, y1: number) => {
    const cut = Math.min(Math.max(RAIL_Y, y0), y1);
    if (cut > y0) b.box(x1 - x0, cut - y0, th, (x0 + x1) / 2, (y0 + cut) / 2, zc, ROOM.wainscot);
    if (y1 > cut) b.box(x1 - x0, y1 - cut, th, (x0 + x1) / 2, (cut + y1) / 2, zc, ROOM.wallUpper);
  };
  slab(minX - 2, W.x0, floorY, ceilY);
  slab(W.x1, maxX + 2, floorY, ceilY);
  slab(W.x0, W.x1, floorY, W.y0);
  slab(W.x0, W.x1, W.y1, ceilY);

  // Window frame, set into the reveal.
  const fz = W.zIn - 6;
  const fw = W.frame;
  const cx = (W.x0 + W.x1) / 2;
  const cy = (W.y0 + W.y1) / 2;
  b.box(W.x1 - W.x0, fw, 5, cx, W.y0 + fw / 2, fz, ROOM.windowFrame);
  b.box(W.x1 - W.x0, fw, 5, cx, W.y1 - fw / 2, fz, ROOM.windowFrame);
  b.box(fw, W.y1 - W.y0 - fw * 2, 5, W.x0 + fw / 2, cy, fz, ROOM.windowFrame);
  b.box(fw, W.y1 - W.y0 - fw * 2, 5, W.x1 - fw / 2, cy, fz, ROOM.windowFrame);
  b.box(W.bar, W.y1 - W.y0 - fw * 2, 3.5, W.mullionX, cy, fz, ROOM.windowFrame);
  b.box(W.x1 - W.x0 - fw * 2, W.bar, 3.5, cx, W.transomY, fz, ROOM.windowFrame);
  // Sill board (pokes into the room) and the architrave around the opening.
  b.box(W.x1 - W.x0 + 16, 3, 20, cx, W.y0 - 0.9, W.zIn + 1, ROOM.windowFrame);
  b.box(7, W.y1 - W.y0 + 7, 3, W.x0 - 3.5, cy + 3.5, W.zIn, ROOM.trim);
  b.box(7, W.y1 - W.y0 + 7, 3, W.x1 + 3.5, cy + 3.5, W.zIn, ROOM.trim);
  b.box(W.x1 - W.x0 + 20, 8, 4, cx, W.y1 + 4, W.zIn, ROOM.trim);

  // Dado rail + battens on this wall (either side of the window).
  for (const [x0, x1] of [
    [minX, W.x0 - 7],
    [W.x1 + 7, maxX],
  ]) {
    b.box(x1 - x0, 4, 3, (x0 + x1) / 2, RAIL_Y, W.zIn, ROOM.trim);
    for (let x = x0 + 22; x < x1 - 10; x += 44) b.box(3, RAIL_Y - floorY - 12, 2, x, (RAIL_Y + floorY + 12) / 2, W.zIn, ROOM.wainscot);
  }
  b.box(maxX - minX, 12, 3, (minX + maxX) / 2, floorY + 6, W.zIn, ROOM.trim); // skirting
  return b.build();
}

function buildShell() {
  const b = new Builder();
  const { minX, maxX, minZ, maxZ, floorY, ceilY } = SHELL;
  const dx = maxX - minX;
  const dz = maxZ - minZ;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const plane = (w: number, h: number, x: number, y: number, z: number, ry: number, color: string) =>
    b.add(new THREE.PlaneGeometry(w, h, Math.ceil(w / 28), Math.ceil(h / 28)), color, x, y, z, { ry });
  const wall = (len: number, x: number, z: number, ry: number) => {
    plane(len, RAIL_Y - floorY, x, (RAIL_Y + floorY) / 2, z, ry, ROOM.wainscot);
    plane(len, ceilY - RAIL_Y, x, (ceilY + RAIL_Y) / 2, z, ry, ROOM.wallUpper);
  };
  wall(dz, minX, cz, Math.PI / 2); // left
  wall(dz, maxX, cz, -Math.PI / 2); // right
  wall(dx, cx, maxZ, Math.PI); // behind the usual camera
  b.add(new THREE.PlaneGeometry(dx, dz, 14, 12), ROOM.ceiling, cx, ceilY, cz, { rx: Math.PI / 2 });

  // Trim: rails, skirting, cornice. Solid boxes straddling the wall planes.
  const trim = (y: number, h: number, t: number, color: string) => {
    b.box(t, h, dz, minX, y, cz, color);
    b.box(t, h, dz, maxX, y, cz, color);
    b.box(dx, h, t, cx, y, maxZ, color);
  };
  trim(RAIL_Y, 4, 3, ROOM.trim);
  trim(floorY + 6, 12, 3, ROOM.trim);
  trim(ceilY - 4, 8, 10, ROOM.trim);
  b.box(dx, 8, 10, cx, ceilY - 4, minZ, ROOM.trim);
  // Wainscot battens.
  const bh = RAIL_Y - floorY - 12;
  const by = (RAIL_Y + floorY + 12) / 2;
  for (let z = minZ + 22; z < maxZ - 10; z += 44) {
    if (!(z > 14 && z < 122)) b.box(2, bh, 3, minX, by, z, ROOM.wainscot); // skip the doorway
    b.box(2, bh, 3, maxX, by, z, ROOM.wainscot);
  }
  for (let x = minX + 22; x < maxX - 10; x += 44) b.box(3, bh, 2, x, by, maxZ, ROOM.wainscot);

  // Door in the left wall.
  {
    const z0 = 24;
    const z1 = 112;
    const top = floorY + 206;
    const zc = (z0 + z1) / 2;
    const h = top - floorY;
    b.box(4, h, z1 - z0, minX, floorY + h / 2, zc, ROOM.door); // leaf
    for (const [py, ph] of [
      [floorY + 52, 70],
      [floorY + 142, 86],
    ])
      for (const pz of [zc - 20, zc + 20]) b.box(5.2, ph, 30, minX, py, pz, ROOM.door);
    b.box(6, h + 8, 9, minX, floorY + h / 2 + 4, z0 - 4.5, ROOM.trim);
    b.box(6, h + 8, 9, minX, floorY + h / 2 + 4, z1 + 4.5, ROOM.trim);
    b.box(6, 9, z1 - z0 + 18, minX, top + 4.5, zc, ROOM.trim);
    b.cyl(1.3, 1.3, 7, minX + 5, floorY + 100, z1 - 9, ROOM.curtainRod, 8, { rz: Math.PI / 2 });
    b.ball(2.6, minX + 9, floorY + 100, z1 - 9, ROOM.curtainRod, 8);
  }
  return b.build();
}

function buildFloor() {
  const { minX, maxX, minZ, maxZ, floorY } = SHELL;
  const g = new THREE.PlaneGeometry(maxX - minX, maxZ - minZ, 22, 18);
  g.rotateX(-Math.PI / 2);
  g.translate((minX + maxX) / 2, floorY, (minZ + maxZ) / 2);
  return bakeGeometry(g, '#FFFFFF');
}

/** Pleated drapes either side of the window, hanging from a rod. */
function buildDrapes() {
  const b = new Builder();
  const W = WINDOW;
  const top = W.y1 + 13;
  const bottom = W.y0 - 34;
  const z = W.zIn + 8;
  const drape = (x0: number, x1: number) => {
    const w = x1 - x0;
    const h = top - bottom;
    const g = new THREE.PlaneGeometry(w, h, 30, 5);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) / w + 0.5;
      const v = p.getY(i) / h + 0.5; // 1 at the rod
      p.setZ(i, Math.sin(u * Math.PI * 2 * 5.5) * (1.6 + (1 - v) * 1.4) + Math.sin(u * 9 + v * 3) * 0.6);
    }
    g.computeVertexNormals();
    b.add(g, ROOM.curtain, (x0 + x1) / 2, (top + bottom) / 2, z, { glow: 0.22 });
  };
  drape(W.x0 - 36, W.x0 + 5);
  drape(W.x1 - 5, W.x1 + 36);
  // rod, finials and rings
  b.rod([W.x0 - 46, top + 2.5, z], [W.x1 + 46, top + 2.5, z], 1.3, ROOM.curtainRod, 8);
  b.ball(2.8, W.x0 - 47, top + 2.5, z, ROOM.curtainRod, 8);
  b.ball(2.8, W.x1 + 47, top + 2.5, z, ROOM.curtainRod, 8);
  return { geo: b.build(), top, height: top - bottom };
}

export function RoomShell({ animate }: { animate: boolean }) {
  const parts = useMemo(() => {
    const drapes = buildDrapes();
    const sway = { value: 0 };
    const drapeMat = bakedMaterial({ side: THREE.DoubleSide });
    if (animate) {
      // A slow breath of air through the window: the hems drift a little, the rod end stays put.
      drapeMat.onBeforeCompile = (shader) => {
        shader.uniforms.uSway = sway;
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nuniform float uSway;')
          .replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
             float hang = clamp((${drapes.top.toFixed(1)} - position.y) / ${drapes.height.toFixed(1)}, 0.0, 1.0);
             hang *= hang;
             transformed.z += sin(uSway * 0.7 + position.x * 0.05) * 2.2 * hang;
             transformed.x += sin(uSway * 0.45 + position.y * 0.03) * 1.0 * hang;`,
          );
      };
    }
    return {
      wall: buildWindowWall(),
      shell: buildShell(),
      floor: buildFloor(),
      drapes: drapes.geo,
      sway,
      mat: bakedMaterial(),
      drapeMat,
      floorMat: bakedMaterial({ map: woodTexture(ROOM.floorWood, [5, 9], 19) }),
    };
  }, [animate]);

  useEffect(
    () => () => {
      parts.wall.dispose();
      parts.shell.dispose();
      parts.floor.dispose();
      parts.drapes.dispose();
      parts.mat.dispose();
      parts.drapeMat.dispose();
      parts.floorMat.dispose();
    },
    [parts],
  );

  useFrame((s) => {
    parts.sway.value = s.clock.elapsedTime;
  });

  return (
    <group>
      {/* The window wall is the shadow caster that shapes the sun patch on the table. */}
      <mesh geometry={parts.wall} material={parts.mat} castShadow />
      <mesh geometry={parts.shell} material={parts.mat} />
      <mesh geometry={parts.floor} material={parts.floorMat} />
      <mesh geometry={parts.drapes} material={parts.drapeMat} castShadow />
    </group>
  );
}
