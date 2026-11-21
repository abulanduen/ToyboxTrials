/**
 * Drawing the shared shot meter (src/minigames/shared/shotMeter.ts) in a HUD: the fill, a needle at
 * the current power with a chevron pointing the way it is travelling, and an `is-falling` class on
 * the meter while it winds back down. Written straight to the DOM by each HUD's frame loop (never
 * React state). Styles: shotMeter.css, imported here so every meter gets them.
 */
import './shotMeter.css';

export interface ShotMeterEls {
  /** The meter (gets `is-falling`, and `data-power` / `data-dir` for tests). */
  wrap: HTMLElement | null;
  /** The fill, scaled from its left edge. */
  fill: HTMLElement | null;
  /** The needle (`<i className="shot-needle" />` inside the bar). */
  needle?: HTMLElement | null;
}

export function paintShotMeter(els: ShotMeterEls, power: number | null, rising: boolean) {
  const p = power === null ? 0 : Math.max(0, Math.min(1, power));
  if (els.fill) els.fill.style.transform = `scaleX(${p.toFixed(3)})`;
  if (els.needle) {
    els.needle.style.left = `${(p * 100).toFixed(2)}%`;
    els.needle.style.display = power === null ? 'none' : '';
  }
  if (els.wrap) {
    const falling = power !== null && !rising;
    if (els.wrap.classList.contains('is-falling') !== falling) els.wrap.classList.toggle('is-falling', falling);
    els.wrap.dataset.power = p.toFixed(3);
    els.wrap.dataset.dir = power === null ? '' : rising ? 'up' : 'down';
  }
}
