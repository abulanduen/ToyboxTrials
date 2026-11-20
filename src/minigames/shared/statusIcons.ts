/**
 * Status icons: one shared, code-drawn badge per debuff, shown over affected units in Toy Tower
 * Tumble (enemies) and Toy Squad (fighters), and in their HUD legends.
 *
 * Each badge is defined once as SVG path data on a 24 × 24 grid. The DOM draws it as inline SVG
 * (`StatusIcon.tsx`); the 3D layer draws the same paths into one small canvas texture per kind
 * (`Path2D` takes SVG path strings) and shows every badge of that kind with one InstancedMesh of
 * camera-facing quads. So a board full of slowed, burning enemies costs at most one draw call per
 * status kind on screen, and nothing is allocated per frame. Original artwork; no icon packs.
 *
 * The kinds cover every debuff the two rules cores have:
 *   - Tower Tumble: slow, burn (damage over time), stun, mark, shred (armour stripped).
 *   - Toy Squad: poison (damage over time), stun, mark, silence, and negative buffs: slow (haste
 *     below zero), shred (armour below zero) and weaken (damage, spell power or range below zero).
 */
import * as THREE from 'three';
import { PALETTE } from '../../game/palette';

import { STATUS_KINDS, type StatusKind } from './statusKinds';
export { STATUS_BIT, STATUS_KINDS, statusList, type StatusKind } from './statusKinds';

const mix = (a: string, b: string, t: number) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, '0')).join('');

export interface StatusDef {
  /** Short name (legends, aria labels). */
  name: string;
  /** What it does, in one line. */
  blurb: string;
  /** Badge fill. */
  colour: string;
  /** Glyph paths on a 24 × 24 grid, drawn in `glyph` colour; `stroke` paths are outlined instead of filled. */
  fill: string[];
  stroke?: string[];
  glyph: string;
}

/** Badge colours stay inside the palette (or blends of two palette colours). */
export const STATUS_DEFS: Record<StatusKind, StatusDef> = {
  burn: {
    name: 'Burning', blurb: 'On fire: takes damage every second.', colour: mix(PALETTE.honey, PALETTE.coral, 0.55), glyph: PALETTE.white,
    fill: ['M12 4.2c2.2 2.7 5.2 5 5.2 9.1a5.2 5.2 0 0 1-10.4 0c0-2.2 1-3.8 2.4-5 .1 1.7.9 2.9 2.1 3.3.2-2.8-.3-5.1.7-7.4Z'],
  },
  poison: {
    name: 'Poisoned', blurb: 'Takes damage every tick until it wears off.', colour: mix(PALETTE.sage, PALETTE.feltDark, 0.45), glyph: PALETTE.white,
    fill: ['M12 4.5c2.4 3.4 5 6.2 5 9.3a5 5 0 0 1-10 0c0-3.1 2.6-5.9 5-9.3Z'],
    stroke: ['M9.6 14.2a2.4 2.4 0 0 0 2.4 2.3'],
  },
  slow: {
    name: 'Slowed', blurb: 'Moves or acts more slowly for a while.', colour: PALETTE.toyBlue, glyph: PALETTE.white,
    // An hourglass.
    fill: ['M7.5 5h9v1.6c0 2.3-1.6 3.9-3.2 5.4 1.6 1.5 3.2 3.1 3.2 5.4V19h-9v-1.6c0-2.3 1.6-3.9 3.2-5.4C9.1 10.5 7.5 8.9 7.5 6.6Z'],
  },
  stun: {
    name: 'Stunned', blurb: 'Cannot move or act for a moment.', colour: PALETTE.honey, glyph: PALETTE.ink,
    // A four-point star over a swirl.
    fill: ['M12 3.8l1.6 4.4 4.4 1.6-4.4 1.6-1.6 4.4-1.6-4.4L6 9.8l4.4-1.6Z'],
    stroke: ['M7.2 17.2c1.5 1.6 8.1 1.6 9.6 0'],
  },
  mark: {
    name: 'Marked', blurb: 'Takes extra damage from every attacker.', colour: PALETTE.coral, glyph: PALETTE.white,
    // Crosshairs.
    fill: ['M11.1 4h1.8v4.2h-1.8ZM11.1 15.8h1.8V20h-1.8ZM4 11.1h4.2v1.8H4ZM15.8 11.1H20v1.8h-4.2Z'],
    stroke: ['M12 7.4a4.6 4.6 0 1 0 0 9.2 4.6 4.6 0 1 0 0-9.2Z'],
  },
  shred: {
    name: 'Armour broken', blurb: 'Its armour has been stripped away.', colour: PALETTE.inkPurple, glyph: PALETTE.white,
    // A shield with a crack.
    fill: ['M12 4.2 18 6.6v4.6c0 4.1-2.7 7-6 8.6-3.3-1.6-6-4.5-6-8.6V6.6Z'],
  },
  silence: {
    name: 'Silenced', blurb: 'Cannot cast its spell.', colour: mix(PALETTE.inkPurple, PALETTE.white, 0.35), glyph: PALETTE.white,
    // A music note, struck through.
    fill: ['M13.4 5.2 17.6 4v3.4l-2.6.8v7.6a2.7 2.2 0 1 1-1.6-2Z'],
    stroke: ['M5.6 5.6 18.4 18.4'],
  },
  weaken: {
    name: 'Weakened', blurb: 'Hits less hard (or reaches less far) for a while.', colour: mix(PALETTE.inkPurple, PALETTE.ink, 0.35), glyph: PALETTE.white,
    // A down arrow.
    fill: ['M10.4 4.8h3.2v7.6h3.6L12 19.2l-5.2-6.8h3.6Z'],
  },
};
/** The crack drawn over the shred shield (in the badge colour, so it reads as a gap). */
export const SHRED_CRACK = 'M12.6 6.2 10.6 10.4l2.4 1.4-1.8 4.6';

// ─────────────────────────────────────────── canvas drawing ───────────────────────────────────────────

/** Draw one badge into a 2D context at (x, y), `size` pixels across. Shared by the textures and any canvas HUD. */
export function drawStatusBadge(ctx: CanvasRenderingContext2D, kind: StatusKind, x: number, y: number, size: number) {
  const d = STATUS_DEFS[kind], k = size / 24;
  ctx.save();
  ctx.translate(x, y); ctx.scale(k, k);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(12, 12, 10.6, 0, Math.PI * 2);
  ctx.fillStyle = d.colour; ctx.fill();
  ctx.lineWidth = 1.8; ctx.strokeStyle = PALETTE.ink; ctx.stroke();
  ctx.fillStyle = d.glyph; ctx.strokeStyle = d.glyph; ctx.lineWidth = 1.9;
  for (const p of d.fill) ctx.fill(new Path2D(p));
  for (const p of d.stroke ?? []) ctx.stroke(new Path2D(p));
  if (kind === 'shred') { ctx.strokeStyle = d.colour; ctx.lineWidth = 1.6; ctx.stroke(new Path2D(SHRED_CRACK)); }
  ctx.restore();
}

const TEX = 64;
let textures: Partial<Record<StatusKind, THREE.CanvasTexture>> | null = null;
function textureFor(kind: StatusKind) {
  textures ??= {};
  let t = textures[kind];
  if (!t) {
    const c = document.createElement('canvas'); c.width = c.height = TEX;
    drawStatusBadge(c.getContext('2d')!, kind, 2, 2, TEX - 4);
    t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = true; t.anisotropy = 1;
    textures[kind] = t;
  }
  return t;
}

// ─────────────────────────────────────────── the 3D layer ───────────────────────────────────────────

const QUAD = new THREE.PlaneGeometry(1, 1);

/**
 * Every status badge on one board. Use from one `useFrame`: `begin()`, then `add(mask, x, y, z)` per
 * unit (badges sit side by side, centred on the point, facing the camera), then `end(camera)`.
 * Add `group` to the scene once. Capacity is per kind; extra badges are skipped, never allocated.
 */
export class StatusIconBatch {
  readonly group = new THREE.Group();
  private readonly meshes: THREE.InstancedMesh[];
  private readonly counts = new Array<number>(STATUS_KINDS.length).fill(0);
  private readonly pending: number[] = [];
  private n = 0;
  private readonly o = new THREE.Object3D();
  private readonly right = new THREE.Vector3();
  constructor(capacity = 96, private readonly size = 1.2) {
    this.pending = new Array<number>(capacity * 4).fill(0);
    this.meshes = STATUS_KINDS.map((kind) => {
      const mat = new THREE.MeshBasicMaterial({ map: textureFor(kind), transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
      const m = new THREE.InstancedMesh(QUAD, mat, capacity);
      m.count = 0; m.visible = false; m.frustumCulled = false; m.raycast = () => {}; m.renderOrder = 20; m.name = `status-${kind}`;
      this.group.add(m); return m;
    });
  }
  begin() { this.n = 0; }
  /** Queue the badges of `mask` for a unit whose badge row is centred at (x, y, z). */
  add(mask: number, x: number, y: number, z: number) {
    if (!mask || this.n * 4 + 4 > this.pending.length) return;
    const i = this.n++ * 4; this.pending[i] = mask; this.pending[i + 1] = x; this.pending[i + 2] = y; this.pending[i + 3] = z;
  }
  end(camera: THREE.Camera) {
    this.counts.fill(0);
    this.right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    const o = this.o, s = this.size;
    o.quaternion.copy(camera.quaternion); o.scale.set(s, s, 1);
    for (let u = 0; u < this.n; u++) {
      const mask = this.pending[u * 4], x = this.pending[u * 4 + 1], y = this.pending[u * 4 + 2], z = this.pending[u * 4 + 3];
      let shown = 0; for (let k = 0; k < STATUS_KINDS.length; k++) if (mask & (1 << k)) shown++;
      let slot = 0;
      for (let k = 0; k < STATUS_KINDS.length; k++) {
        if (!(mask & (1 << k))) continue;
        const mesh = this.meshes[k];
        if (this.counts[k] >= mesh.instanceMatrix.count) { slot++; continue; }
        const off = (slot++ - (shown - 1) / 2) * s * 1.05;
        o.position.set(x + this.right.x * off, y + this.right.y * off, z + this.right.z * off); o.updateMatrix();
        mesh.setMatrixAt(this.counts[k]++, o.matrix);
      }
    }
    for (let k = 0; k < this.meshes.length; k++) {
      const m = this.meshes[k], n = this.counts[k];
      m.count = n; m.visible = n > 0; if (n) m.instanceMatrix.needsUpdate = true;
    }
  }
  /** Badges drawn last frame (for tests). */
  get shown() { return this.counts.reduce((a, b) => a + b, 0); }
  /** Badges drawn last frame by kind (for tests). */
  shownByKind(): Partial<Record<StatusKind, number>> { return Object.fromEntries(STATUS_KINDS.map((k, i) => [k, this.counts[i]]).filter(([, n]) => n)); }
  dispose() { for (const m of this.meshes) { (m.material as THREE.Material).dispose(); m.dispose(); } }
}
