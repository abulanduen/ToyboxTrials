/**
 * The local player's side of Hoop Hustle's input: the aim they are turning (A/D, the mouse or the
 * joystick) and the charge they are holding (Space, E, the left mouse button or the Throw button,
 * all the `slot1` action). Plain module state read by `readLocalInput` once a frame, the Scene
 * (arc preview, aim marker, mouse aim) and the HUD (charge meter); never React state.
 *
 * The charge is timed on the match clock (the rules' `t`, smoothed online), so a paused or
 * sped-up match charges with it, and the throw carries the power the meter showed and the
 * moment it was let go: the rules honour both, so the gold arc you saw is the throw you get.
 * The meter winds up and back down while held (src/minigames/shared/shotMeter.ts). The `cancel`
 * action (X, the right mouse button, or sliding off the Throw button) drops the charge without a
 * throw; the throw button must then come up before it can charge again.
 */
import { getMoveAxis, isDown } from '../../game/input';
import { holdForPower, shotPower, shotRising } from '../shared/shotMeter';
import { canShoot, type HoopInput, type HoopState, type Shooter } from './rules';

/** Turning speed with A/D or the arrow keys (rad/s). */
export const TURN_RATE = 1.7;
/** The joystick aims once pushed this far. */
const STICK_DEAD = 0.35;

const local = {
  yaw: null as number | null,
  spot: -1,
  sentYaw: NaN,
  /** Match time the throw button went down, while charging. */
  chargeT0: null as number | null,
  /** Tell the rules to drop a charge (pause, focus lost). */
  cancel: false,
  /** The player cancelled: no new charge until the throw button comes up. */
  cancelled: false,
  /** Where the mouse points on the court (yaw from the toy), set by the Scene. */
  mouseYaw: null as number | null,
  /** The camera's horizontal facing (yaw), set by the Scene: the joystick aims relative to it. */
  viewYaw: null as number | null,
  lastFrame: 0,
};

export function resetHoopLocal() {
  local.yaw = null;
  local.spot = -1;
  local.sentYaw = NaN;
  local.chargeT0 = null;
  local.cancel = false;
  local.cancelled = false;
  local.mouseYaw = null;
  local.lastFrame = 0;
}

/** Drop a charge in progress (pause, blur): the ball is not thrown. */
export function cancelHoopCharge() {
  if (local.chargeT0 !== null) local.cancel = true;
  local.chargeT0 = null;
}

export const setHoopMouseYaw = (yaw: number | null) => {
  local.mouseYaw = yaw;
};
export const setHoopViewYaw = (yaw: number) => {
  local.viewYaw = yaw;
};

/** The aim the local toy shows (before the assist), or null before the first frame. */
export const localAim = () => local.yaw;

/** Power 0..1 on the back-and-forth meter (match clock), or null when not charging. */
export function localCharge(s: HoopState): number | null {
  return local.chargeT0 === null ? null : shotPower(s.t - local.chargeT0, s.config.chargeMs);
}
/** The meter is winding up (true) or back down (false). */
export function localChargeRising(s: HoopState): boolean {
  return local.chargeT0 === null ? true : shotRising(s.t - local.chargeT0, s.config.chargeMs);
}

/** This frame's inputs for the local toy. */
export function readHoopInput(s: HoopState | null, me: Shooter | undefined, presses: readonly string[]): HoopInput[] {
  const now = performance.now();
  const dt = local.lastFrame ? Math.min(0.1, Math.max(0, (now - local.lastFrame) / 1000)) : 0;
  local.lastFrame = now;
  if (!s || s.kind !== 'hoop-hustle' || !me) return [];
  const out: HoopInput[] = [];
  if (local.cancel) {
    local.cancel = false;
    out.push({ type: 'cancel' });
  }
  const sp = s.spots[me.spot];
  // A new spot (or the first frame): face the hoop, as the rules do.
  if (local.yaw === null || local.spot !== me.spot) {
    local.yaw = me.yaw;
    local.spot = me.spot;
    local.mouseYaw = null;
  }
  const turn = (isDown('right') ? 1 : 0) - (isDown('left') ? 1 : 0);
  if (turn) {
    // Screen-right while looking at the hoop is a smaller yaw.
    local.yaw -= turn * TURN_RATE * dt;
    local.mouseYaw = null;
  } else {
    const axis = getMoveAxis();
    if (axis.magnitude > STICK_DEAD) {
      // Up on the stick is where the camera looks (from behind the toy, towards the hoop).
      const view = local.viewYaw ?? Math.atan2(-sp.x, -sp.z);
      const ux = Math.sin(view);
      const uz = Math.cos(view);
      const rx = -uz;
      const rz = ux;
      local.yaw = Math.atan2(rx * axis.x + ux * axis.y, rz * axis.x + uz * axis.y);
      local.mouseYaw = null;
    } else if (local.mouseYaw !== null) local.yaw = local.mouseYaw;
  }
  local.yaw = Math.atan2(Math.sin(local.yaw), Math.cos(local.yaw));
  if (!(Math.abs(local.yaw - local.sentYaw) < 0.002)) {
    local.sentYaw = local.yaw;
    out.push({ type: 'aim', yaw: local.yaw });
  }

  const held = isDown('slot1');
  const tapped = presses.includes('slot1');
  const ready = canShoot(s, me);
  const cancel = presses.includes('cancel') || isDown('cancel');
  if (local.cancelled && !held && !tapped) local.cancelled = false;
  if (local.chargeT0 !== null && cancel) {
    // Cancelled: the charge drops, no throw; let go of the button before charging again.
    local.chargeT0 = null;
    local.cancelled = true;
    out.push({ type: 'cancel' });
  } else if (local.cancelled) {
    // (still holding the button after a cancel)
  } else if (local.chargeT0 !== null && !ready) {
    // The buzzer went (or the ball went away): drop the charge.
    local.chargeT0 = null;
    out.push({ type: 'cancel' });
  } else if (local.chargeT0 === null && ready && (held || tapped)) {
    local.chargeT0 = s.t;
    out.push({ type: 'charge' });
    if (!held) out.push(throwNow(s));
  } else if (local.chargeT0 !== null && !held) out.push(throwNow(s));
  return out;
}

/**
 * ?debug only (tutorial photos, thumbnails): show a charge of `power` already held, as if the
 * throw button had been down that long. The caller holds `slot1` down too.
 */
export function stageHoopCharge(s: HoopState, power: number | null) {
  local.chargeT0 = power === null ? null : s.t - holdForPower(power, s.config.chargeMs);
}

function throwNow(s: HoopState): HoopInput {
  const power = localCharge(s) ?? 0;
  local.chargeT0 = null;
  return { type: 'throw', power, yaw: local.yaw ?? 0, at: s.t };
}
