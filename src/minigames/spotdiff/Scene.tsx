/**
 * Odd Page Out — the backdrop: a big hardback picture book lying open on the table, seen from
 * straight above, with a few desk things round it (pencils, crayons, an eraser, a magnifying
 * glass, a toy block). The camera is fitted every frame so the 3D book sits exactly under the DOM
 * book the Hud draws (layout.ts); the pages themselves are DOM/SVG for crisp, exact pictures.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { PALETTE } from '../../game/palette';
import { paintMat, woodMat } from '../../scene/props';
import type { MinigameSceneProps } from '../types';
import { bookLayout, readInsets } from './layout';
import type { SpotState } from './rules';

/** The 3D book's model size (cm, open, before it is scaled to fit the screen). */
const BOOK_W = 46;
const FOV = 30;
/** The camera's height above the pages (cm). Fixed, so it never rises into the room's lamp. */
const CAM_D = 62;
const COVER_T = 0.9;
const PAGES_T = 1.3;

export function SpotScene(_: MinigameSceneProps<SpotState>) {
  const { camera, size } = useThree();
  const insets = useMemo(() => readInsets(), [size.width, size.height]);
  const book = useRef<THREE.Group>(null!);
  const props = useRef<THREE.Group>(null!);
  const mats = useMemo(
    () => ({
      cover: paintMat('#4C7E9C', 0.75),
      paper: paintMat(PALETTE.white, 0.95),
      edge: paintMat('#E6D8BB', 0.95),
      pencil: paintMat(PALETTE.honey, 0.5),
      pencilB: paintMat(PALETTE.coral, 0.5),
      wood: woodMat(PALETTE.woodLight),
      lead: paintMat(PALETTE.ink, 0.6),
      crayonA: paintMat(PALETTE.toyBlue, 0.6),
      crayonB: paintMat(PALETTE.sage, 0.6),
      crayonC: paintMat(PALETTE.inkPurple, 0.6),
      eraser: paintMat('#E59A97', 0.9),
      brass: paintMat(PALETTE.brass, 0.35, 0.8),
      glass: new THREE.MeshStandardMaterial({ color: '#DCEFFA', roughness: 0.05, metalness: 0, transparent: true, opacity: 0.35 }),
      block: paintMat(PALETTE.honey, 0.6),
    }),
    [],
  );
  useEffect(
    () => () => {
      for (const m of Object.values(mats)) m.dispose();
    },
    [mats],
  );

  // Restore the shared camera's lens when the trial ends (the results lineup sets its own pose).
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const fov = cam.fov;
    return () => {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    };
  }, [camera]);

  useFrame(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const W = size.width;
    const H = size.height;
    const lay = bookLayout(W, H, insets);
    if (Math.abs(cam.fov - FOV) > 0.01) {
      cam.fov = FOV;
      cam.updateProjectionMatrix();
    }
    // Table cm per CSS px at the height of the pages; the book is sized to match the DOM book.
    const wpp = (2 * CAM_D * Math.tan((FOV * Math.PI) / 360)) / H;
    const longSide = (lay.portrait ? lay.book.h : lay.book.w) * wpp; // the book is turned in portrait
    const shortSide = (lay.portrait ? lay.book.w : lay.book.h) * wpp;
    const top = COVER_T + PAGES_T;
    // Screen offset of the book's centre from the screen's centre, in table cm (screen up = −z).
    const ox = (lay.book.x + lay.book.w / 2 - W / 2) * wpp;
    const oz = (lay.book.y + lay.book.h / 2 - H / 2) * wpp;
    cam.position.set(-ox, top + CAM_D, -oz);
    cam.rotation.set(-Math.PI / 2, 0, 0);
    cam.updateMatrixWorld();

    const g = book.current;
    g.rotation.y = lay.portrait ? Math.PI / 2 : 0;
    g.scale.set(longSide / BOOK_W, 1, shortSide / 30);
    // Desk things round the book: just outside its edges, whichever way it is turned.
    const hw = (lay.book.w * wpp) / 2;
    const hh = (lay.book.h * wpp) / 2;
    const [pencil, pencil2, crayons, eraser, glass, block] = props.current.children;
    pencil.position.set(-hw - 3.2, 0.75, -hh * 0.2);
    pencil2.position.set(hw + 3.4, 0.75, hh * 0.25);
    crayons.position.set(-hw * 0.55, 0.55, -hh - 3.0);
    eraser.position.set(hw * 0.6, 0.6, hh + 3.2);
    glass.position.set(hw + 6.5, 0.45, -hh - 4.5);
    block.position.set(-hw - 5, 1.5, hh + 4.5);
  });

  return (
    <group>
      {/* the book: cover boards, page blocks and a soft shadow, 46 × 30 cm before scaling */}
      <group ref={book}>
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[BOOK_W + 6, 36]} />
          <meshBasicMaterial color="#3A2A1E" transparent opacity={0.22} depthWrite={false} />
        </mesh>
        <mesh position={[0, COVER_T / 2, 0]} castShadow receiveShadow material={mats.cover}>
          <boxGeometry args={[BOOK_W, COVER_T, 30]} />
        </mesh>
        {[-1, 1].map((side) => (
          <group key={side}>
            <mesh position={[(side * (BOOK_W / 2 - 1.2)) / 2, COVER_T + PAGES_T / 2, 0]} receiveShadow material={mats.edge}>
              <boxGeometry args={[BOOK_W / 2 - 1.6, PAGES_T, 28.4]} />
            </mesh>
            <mesh position={[(side * (BOOK_W / 2 - 1.2)) / 2, COVER_T + PAGES_T + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mats.paper}>
              <planeGeometry args={[BOOK_W / 2 - 1.6, 28.4]} />
            </mesh>
          </group>
        ))}
      </group>

      <group ref={props}>
        {/* a yellow pencil */}
        <group rotation={[0, 0.25, Math.PI / 2]}>
          <mesh castShadow material={mats.pencil}>
            <cylinderGeometry args={[0.6, 0.6, 14, 6]} />
          </mesh>
          <mesh position={[0, -7.8, 0]} rotation={[Math.PI, 0, 0]} material={mats.wood}>
            <coneGeometry args={[0.6, 1.6, 6]} />
          </mesh>
          <mesh position={[0, 7.4, 0]} material={mats.eraser}>
            <cylinderGeometry args={[0.6, 0.6, 1, 8]} />
          </mesh>
        </group>
        {/* a coral pencil */}
        <group rotation={[0, -0.4, Math.PI / 2]}>
          <mesh castShadow material={mats.pencilB}>
            <cylinderGeometry args={[0.6, 0.6, 11, 6]} />
          </mesh>
          <mesh position={[0, 6.3, 0]} material={mats.wood}>
            <coneGeometry args={[0.6, 1.6, 6]} />
          </mesh>
        </group>
        {/* three crayons */}
        <group rotation={[0, 0.1, 0]}>
          {[mats.crayonA, mats.crayonB, mats.crayonC].map((m, i) => (
            <group key={i} position={[i * 1.6, 0, i * 0.4]} rotation={[0, 0, Math.PI / 2]}>
              <mesh castShadow material={m}>
                <cylinderGeometry args={[0.55, 0.55, 6, 10]} />
              </mesh>
              <mesh position={[0, 3.4, 0]} material={m}>
                <coneGeometry args={[0.55, 0.9, 10]} />
              </mesh>
            </group>
          ))}
        </group>
        {/* an eraser */}
        <mesh rotation={[0, 0.5, 0]} castShadow material={mats.eraser}>
          <boxGeometry args={[4, 1.2, 2.2]} />
        </mesh>
        {/* a magnifying glass */}
        <group rotation={[0, -0.6, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} castShadow material={mats.brass}>
            <torusGeometry args={[3, 0.35, 8, 32]} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} material={mats.glass}>
            <circleGeometry args={[2.8, 32]} />
          </mesh>
          <mesh position={[0, 0, 5.6]} rotation={[Math.PI / 2, 0, 0]} castShadow material={mats.wood}>
            <cylinderGeometry args={[0.45, 0.55, 5, 10]} />
          </mesh>
        </group>
        {/* a toy block */}
        <mesh rotation={[0, 0.4, 0]} castShadow material={mats.block}>
          <boxGeometry args={[3, 3, 3]} />
        </mesh>
      </group>
    </group>
  );
}
