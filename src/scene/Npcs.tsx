/**
 * The Hub's NPC toys (scripts: src/game/npcs.ts): MiniContenders that walk their routes on the
 * room's clock, play the arcade's machines (a little hop as they press), watch, cheer, chat (a "…"
 * bubble) and sit in the stands. They turn to look at a player who comes close while they stand.
 *
 * Budget: only the toys on the player's own level are drawn (the arcade's while you are down there,
 * the plaza's and the stands' up on the tables), and the Low tier keeps only the ones marked `low`.
 * The per-frame work is a pose from the clock and a turn.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { MiniContender, createMiniAnim, type MiniAnim } from '../character/MiniContender';
import { PAINT_JOBS, PALETTE } from '../game/palette';
import { NPCS, NPC_LOOK_R, npcPose, type NpcDef, type NpcPose } from '../game/npcs';
import { dogNow } from '../game/dogVisit';
import { player } from '../game/player';
import { useGame } from '../game/store';
import { exposeDebug } from '../game/debug';

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** A "…" speech bubble (one shared texture). */
let bubbleTex: THREE.CanvasTexture | null = null;
function bubbleTexture() {
  if (bubbleTex) return bubbleTex;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 96;
  const g = c.getContext('2d')!;
  g.fillStyle = '#FFFDF6';
  g.strokeStyle = PALETTE.ink;
  g.lineWidth = 6;
  g.beginPath();
  g.roundRect(6, 6, 116, 62, 24);
  g.moveTo(44, 66);
  g.lineTo(40, 90);
  g.lineTo(64, 66);
  g.fill();
  g.stroke();
  g.fillStyle = PALETTE.ink;
  for (const x of [38, 64, 90]) {
    g.beginPath();
    g.arc(x, 37, 7, 0, Math.PI * 2);
    g.fill();
  }
  bubbleTex = new THREE.CanvasTexture(c);
  bubbleTex.colorSpace = THREE.SRGBColorSpace;
  return bubbleTex;
}

function Npc({ def }: { def: NpcDef }) {
  const root = useRef<THREE.Group>(null!);
  const bubble = useRef<THREE.Sprite>(null!);
  const anim = useRef<MiniAnim>(createMiniAnim());
  const st = useRef({ pose: { x: 0, y: 0, z: 0, yaw: 0, action: 'stroll', walking: false, into: 0 } as NpcPose, yaw: NaN, lastAction: '', nextHop: 0 });
  const paint = PAINT_JOBS[def.paint % PAINT_JOBS.length];
  const bubbleMat = useMemo(() => new THREE.SpriteMaterial({ map: bubbleTexture(), depthWrite: false }), []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    const s = st.current;
    const g = root.current;
    const here = player.level === def.level && useGame.getState().screen !== 'minigame';
    g.visible = here;
    if (!here) return;
    const p = npcPose(def, dogNow(), s.pose);
    g.position.set(p.x, p.y, p.z);
    // facing: the way it walks, or its stop's; an idle toy looks at a player close by
    let want = p.yaw;
    const d = Math.hypot(player.pos.x - p.x, player.pos.z - p.z);
    if (!p.walking && p.action !== 'play' && d < NPC_LOOK_R) want = Math.atan2(player.pos.x - p.x, player.pos.z - p.z);
    if (Number.isNaN(s.yaw)) s.yaw = want;
    s.yaw += wrap(want - s.yaw) * Math.min(1, dt * (p.walking ? 10 : 5));
    g.rotation.y = s.yaw;
    // what it is doing
    const a = anim.current;
    if (p.action !== s.lastAction) {
      s.lastAction = p.action;
      if (p.action === 'cheer') a.cheerT = 0;
      else a.cheerT = -1;
      s.nextHop = 0;
    }
    if (p.action === 'play' && p.into >= s.nextHop) {
      a.hopT = 0; // pressing a button
      s.nextHop = p.into + 0.6 + ((p.into * 7.3) % 0.5);
    }
    if (p.action === 'sit') {
      // a fan in the stands cheers for a couple of seconds every so often
      const cheering = p.into % 9 < 1.8;
      if (cheering && a.cheerT < 0) a.cheerT = 0;
      if (!cheering) a.cheerT = -1;
    }
    if (p.walking && p.into >= s.nextHop) {
      a.hopT = 0.12; // a small waddle
      s.nextHop = p.into + 0.42;
    }
    bubble.current.visible = p.action === 'chat' && p.into % 3 < 2.2;
  });

  return (
    <group ref={root} visible={false}>
      {/* scaled to a wind-up toy's 3.5 cm */}
      <MiniContender paint={paint} anim={anim} scale={1.2} />
      <sprite ref={bubble} position={[1.1, 4.8, 0]} scale={[1.8, 1.35, 1]} material={bubbleMat} visible={false} />
    </group>
  );
}

export function Npcs() {
  const low = useGame((s) => s.quality) === 'low';
  const list = useMemo(() => NPCS.filter((n) => !low || n.low), [low]);
  useMemo(
    () =>
      // ?debug only (tests): where every NPC is now, and which are drawn on this tier
      exposeDebug({
        npcs: {
          list: () => list.map((n) => ({ id: n.id, level: n.level, ...npcPose(n, dogNow()) })),
        },
      }),
    [list],
  );
  return (
    <group name="npcs">
      {list.map((n) => (
        <Npc key={n.id} def={n} />
      ))}
    </group>
  );
}
