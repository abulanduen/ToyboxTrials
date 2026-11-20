/**
 * The hub's solid props as pure data (src/game/hubSolids.ts) must match the layout's colliders
 * (src/scene/layout.ts hubColliders()). The online server can't import the layout (it pulls in
 * three.js and the minigame registry), so the shared marble and basketball physics use the copy.
 *
 * After moving or adding anything solid in the hub, regenerate the copy:
 *   UPDATE_HUB_SOLIDS=1 npx vitest run tests/unit/hub-solids.test.ts
 */
import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Collider } from '../../src/game/collision';
import { BRIDGE_DECK, rollFloorAt } from '../../src/game/hubPlay';
import { HUB_SOLIDS } from '../../src/game/hubSolids';
import { BRIDGE, hubColliders } from '../../src/scene/layout';

const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
function plain(c: Collider): Collider {
  return c.kind === 'circle'
    ? { kind: 'circle', id: c.id, x: r4(c.x), z: r4(c.z), r: r4(c.r), top: r4(c.top) }
    : { kind: 'box', id: c.id, x: r4(c.x), z: r4(c.z), hx: r4(c.hx), hz: r4(c.hz), rot: r4(c.rot), top: r4(c.top) };
}

describe('hub solids for the shared hub play physics', () => {
  const live = hubColliders().map(plain);

  if (process.env.UPDATE_HUB_SOLIDS) {
    it('writes src/game/hubSolids.ts', () => {
      const file = fileURLToPath(new URL('../../src/game/hubSolids.ts', import.meta.url));
      const body = live.map((c) => `  ${JSON.stringify(c)},`).join('\n');
      writeFileSync(
        file,
        `/**\n * The hub's solid props (every collider of src/scene/layout.ts hubColliders()), as pure data for the\n * shared hub play physics (src/game/hubPlaySim.ts), which the online server runs too.\n * GENERATED: do not edit. Regenerate after changing the layout:\n *   UPDATE_HUB_SOLIDS=1 npx vitest run tests/unit/hub-solids.test.ts\n */\nimport type { Collider } from './collision';\n\nexport const HUB_SOLIDS: readonly Collider[] = [\n${body}\n];\n`,
      );
    });
    return;
  }

  it('match the layout (regenerate with UPDATE_HUB_SOLIDS=1 if the hub changed)', () => {
    expect(HUB_SOLIDS.map(plain)).toEqual(live);
  });

  it("the bridge deck the marble rolls over is the layout's bridge", () => {
    expect(BRIDGE_DECK.x).toBe(BRIDGE.x);
    expect(BRIDGE_DECK.top).toBeCloseTo(BRIDGE.top, 9);
    expect(BRIDGE_DECK.deckA).toBeCloseTo(BRIDGE.deckA, 9);
    expect(BRIDGE_DECK.deckB).toBeCloseTo(BRIDGE.deckB, 9);
    expect(BRIDGE_DECK.ramp).toBeCloseTo(BRIDGE.ramp, 9);
    expect(BRIDGE_DECK.halfW).toBeCloseTo(BRIDGE.halfW, 9);
    expect(rollFloorAt(BRIDGE.x, (BRIDGE.deckA + BRIDGE.deckB) / 2)).toBeCloseTo(BRIDGE.top, 9);
    expect(rollFloorAt(BRIDGE.x, BRIDGE.deckA + BRIDGE.ramp + 0.1)).toBe(0);
    expect(rollFloorAt(BRIDGE.x, BRIDGE.deckA + BRIDGE.ramp / 2)).toBeCloseTo(BRIDGE.top / 2, 9);
  });
});
