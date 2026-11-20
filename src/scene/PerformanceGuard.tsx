/**
 * Lowers the graphics by itself when this device can't keep up (Settings: "Lower quality
 * automatically", on by default). The rule is in src/game/perfGuard.ts; this applies it, a step
 * at a time, without reloading the scene mid-trial:
 *   1. render at 1× pixels (no extra resolution on high-density screens);
 *   2. no post-processing (focus blur, bloom, vignette, grading);
 *   3. no shadows; and the next time you're back in the Hub, Low quality is saved for next time
 *      (with a ticket saying so).
 * The steps last for this visit; picking a quality in Settings starts again from that tier.
 * Automated test browsers are never judged (they render in software); tests use ?debug perfGuard.
 */
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useGame } from '../game/store';
import { guardFrame, guardStart, nextStep } from '../game/perfGuard';
import { exposeDebug } from '../game/debug';

const automated = typeof navigator !== 'undefined' && navigator.webdriver === true;

export function PerformanceGuard({ post, shadows }: { post: boolean; shadows: boolean }) {
  const { gl, scene, setDpr } = useThree();
  const g = useRef(guardStart());

  // Apply the current step (also after the canvas remounts, e.g. when Low is saved).
  const step = useGame((s) => s.perfStep);
  useEffect(() => {
    if (step >= 1 && gl.getPixelRatio() > 1) setDpr(1);
    if (step >= 3 && gl.shadowMap.enabled) {
      gl.shadowMap.enabled = false;
      // Shadow receiving is compiled into each material: rebuild them once, now.
      scene.traverse((o) => {
        const m = (o as THREE.Mesh).material;
        if (Array.isArray(m)) m.forEach((x) => (x.needsUpdate = true));
        else if (m) m.needsUpdate = true;
      });
    }
  }, [step, gl, scene, setDpr]);

  // Save Low once the guard has gone all the way, but only outside a trial (it reloads the scene).
  useEffect(
    () =>
      useGame.subscribe((s) => {
        if (s.perfStep < 3 || s.quality === 'low' || s.screen === 'minigame') return;
        s.set({ quality: 'low' });
        s.pushTicket({
          title: 'Graphics set to Low',
          body: 'The game was running slowly on this device, so it now uses Low quality. You can change it in Settings.',
          tone: 'info',
        });
      }),
    [],
  );

  useEffect(() => {
    exposeDebug({
      perfGuard: {
        state: () => ({ step: useGame.getState().perfStep, dpr: gl.getPixelRatio(), shadows: gl.shadowMap.enabled, ...g.current }),
        /** Tests: step down as if the device had been slow. */
        stepDown: () => stepDown(),
      },
    });
  });

  const stepDown = () => {
    const s = useGame.getState();
    const next = nextStep(s.perfStep, { hiDpr: gl.getPixelRatio() > 1, post, shadows: shadows && gl.shadowMap.enabled });
    if (next !== s.perfStep) s.set({ perfStep: next });
  };

  useFrame((_, dt) => {
    const s = useGame.getState();
    // Automated test browsers (navigator.webdriver) render in software at a few fps: never judged.
    const watching = !automated && s.autoQuality && s.ready && !s.paused && !document.hidden && (s.screen === 'playing' || s.screen === 'minigame') && s.perfStep < 3;
    if (guardFrame(g.current, dt, watching)) stepDown();
  });
  return null;
}
