/**
 * The enormous real-world room around the toy village.
 *
 * Two kinds of thing live here (see docs/03-visual-design-guide.md, "Two scales, one world"):
 *  - the table and the objects on it (`room/Tabletop`): lit in real time with the toys;
 *  - the room itself (`room/Shell`, `room/Furniture`, `room/WindowLight`): static, so its
 *    lighting is baked into vertex colours at build time (`room/bake`) and it renders unlit.
 *    That is both the cheapest option for phones and the reason the room can have soft bounce
 *    light and corner shading at all.
 *
 * Furniture is a lazy chunk mounted once the hub is interactive. Nothing here is interactive
 * or has a collider.
 */
import { Suspense, lazy } from 'react';
import { useGame } from '../game/store';
import { RoomShell } from './room/Shell';
import { Tabletop } from './room/Tabletop';
import { WindowLight } from './room/WindowLight';
import { importFresh } from '../game/staleBuild';

export { LAMP_AIM, LAMP_HEAD, Pencil, usePencilMaterials } from './room/Tabletop';

const RoomFurniture = lazy(() => importFresh(() => import('./room/Furniture')));

export function Room() {
  const quality = useGame((s) => s.quality);
  const ready = useGame((s) => s.ready);
  const detail = quality !== 'low';
  return (
    <group>
      <Tabletop detail={detail} />
      <RoomShell animate={detail} />
      <WindowLight quality={quality} />
      {ready && (
        <Suspense fallback={null}>
          <RoomFurniture detail={detail} />
        </Suspense>
      )}
    </group>
  );
}
