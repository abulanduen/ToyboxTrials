/**
 * Match-state snapshots on the wire: a JSON-safe copy of a rules state (`wireCopy`), the patch
 * between two copies (`diff`), and applying a patch on the client (`applyPatch`). Pure: no DOM,
 * no Node APIs; shared by the game server and the browser client.
 *
 * Every patch node is wrapped, so a patch can never be confused with a value:
 *   { $: value }                          replace with `value`
 *   { o: { key: Patch }, x?: [keys] }     patch an object's keys; `x` lists deleted keys
 *   { a: { index: Patch }, n: length }    patch an array's elements; `n` is the new length
 *
 * The server keeps the last copy it sent each player and sends only the difference, so a game
 * whose state is mostly static (a course, a chart, config) costs little after the first keyframe.
 * Objects and arrays the patch doesn't touch keep their identity on the client.
 */

export type Patch = { $: unknown } | { o: Record<string, Patch>; x?: string[] } | { a: Record<string, Patch>; n: number };

/** Numbers that aren't integers are rounded to this many decimals on the wire. */
export const WIRE_DECIMALS = 3;
const SCALE = 10 ** WIRE_DECIMALS;

type Obj = Record<string, unknown>;
const isPlain = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Keys never copied or applied (prototype pollution). */
const UNSAFE = new Set(['__proto__', 'prototype', 'constructor']);

/**
 * A deep, JSON-safe copy: non-integer numbers rounded to WIRE_DECIMALS, non-finite numbers become
 * null (as JSON would), undefined fields and functions are dropped, Maps and Sets don't occur in
 * rules states (they would come out as empty objects).
 */
export function wireCopy(v: unknown): unknown {
  if (typeof v === 'number') return Number.isFinite(v) ? (Number.isInteger(v) ? v : Math.round(v * SCALE) / SCALE) + 0 : null; // + 0: no -0 on the wire
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
  if (Array.isArray(v)) return v.map((x) => (x === undefined || typeof x === 'function' ? null : wireCopy(x)));
  if (typeof v === 'object') {
    const out: Obj = {};
    for (const k of Object.keys(v as Obj)) {
      const x = (v as Obj)[k];
      if (x === undefined || typeof x === 'function' || UNSAFE.has(k)) continue;
      out[k] = wireCopy(x);
    }
    return out;
  }
  return null;
}

/** The patch that turns `prev` into `next` (both wire copies), or undefined when they are equal. */
export function diff(prev: unknown, next: unknown): Patch | undefined {
  if (prev === next) return undefined;
  if (Array.isArray(prev) && Array.isArray(next)) {
    const a: Record<string, Patch> = {};
    let changed = prev.length !== next.length;
    for (let i = 0; i < next.length; i++) {
      const d = i < prev.length ? diff(prev[i], next[i]) : { $: next[i] };
      if (d) {
        a[i] = d;
        changed = true;
      }
    }
    return changed ? { a, n: next.length } : undefined;
  }
  if (isPlain(prev) && isPlain(next)) {
    const o: Record<string, Patch> = {};
    let changed = false;
    for (const k of Object.keys(next)) {
      const d = k in prev ? diff(prev[k], next[k]) : { $: next[k] };
      if (d) {
        o[k] = d;
        changed = true;
      }
    }
    const x = Object.keys(prev).filter((k) => !(k in next));
    if (!changed && !x.length) return undefined;
    return x.length ? { o, x } : { o };
  }
  return { $: next };
}

/**
 * Apply a patch to `target`, changing objects and arrays in place where the patch keeps their
 * shape, and return the result (a new value where the patch replaces one). Throws on a malformed
 * patch; never writes an unsafe key.
 */
export function applyPatch(target: unknown, patch: unknown): unknown {
  if (!isPlain(patch)) throw new Error('bad patch');
  if ('$' in patch) return patch.$;
  if (isPlain(patch.o)) {
    const out: Obj = isPlain(target) ? target : {};
    for (const k of Object.keys(patch.o)) {
      if (UNSAFE.has(k)) continue;
      out[k] = applyPatch(out[k], patch.o[k]);
    }
    if (patch.x !== undefined) {
      if (!Array.isArray(patch.x)) throw new Error('bad patch');
      for (const k of patch.x) if (typeof k === 'string' && !UNSAFE.has(k)) delete out[k];
    }
    return out;
  }
  if (isPlain(patch.a)) {
    const n = patch.n;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > 1_000_000) throw new Error('bad patch');
    const out: unknown[] = Array.isArray(target) ? target : [];
    for (const k of Object.keys(patch.a)) {
      const i = Number(k);
      if (!Number.isInteger(i) || i < 0 || i >= n) throw new Error('bad patch');
      out[i] = applyPatch(out[i], patch.a[k]);
    }
    out.length = n;
    return out;
  }
  throw new Error('bad patch');
}
