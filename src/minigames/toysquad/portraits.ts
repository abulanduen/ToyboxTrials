/**
 * Small toy pictures for the shop cards. Presentation only.
 *
 * Each picture is the toy's own baked geometry, rendered once with the game's existing renderer
 * into one shared off-screen target and kept as a PNG data URL per roster id. No extra WebGL
 * context is created, at most one picture is drawn per frame, and a kind is never drawn twice.
 */
import * as THREE from 'three';
import { TOY_MATERIAL, toyGeometry } from './toys';

export const PORTRAIT_SIZE = 144;
const urls = new Map<string, string>(), queue: string[] = [], listeners = new Set<() => void>();
/** For `useSyncExternalStore`: re-render when another picture is ready. */
export const subscribePortraits = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const portraitCount = () => urls.size;
/** The picture for a roster id, or undefined until it has been drawn. Asking queues it. */
export function toyPortrait(kind: string): string | undefined {
  const url = urls.get(kind);
  if (!url && !queue.includes(kind)) queue.push(kind);
  return url;
}

let stage: { scene: THREE.Scene; camera: THREE.OrthographicCamera; mesh: THREE.Mesh; target: THREE.WebGLRenderTarget; pixels: Uint8Array; canvas: HTMLCanvasElement } | null = null;
function setUp() {
  const scene = new THREE.Scene(), mesh = new THREE.Mesh(toyGeometry('soldier'), TOY_MATERIAL);
  const sun = new THREE.DirectionalLight('#FFFFFF', 2.4); sun.position.set(3, 6, 5);
  scene.add(mesh, new THREE.HemisphereLight('#FFFFFF', '#B9824A', 1.5), sun);
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = PORTRAIT_SIZE;
  return { scene, mesh, camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 40), canvas,
    target: new THREE.WebGLRenderTarget(PORTRAIT_SIZE, PORTRAIT_SIZE, { samples: 4 }), pixels: new Uint8Array(PORTRAIT_SIZE * PORTRAIT_SIZE * 4) };
}
/** Render targets hold linear colour; the picture needs sRGB. */
const toSrgb = Uint8Array.from({ length: 256 }, (_, i) => { const c = i / 255; return Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055)); });
const view = new THREE.Vector3(0.55, 0.62, 1).normalize(), clear = new THREE.Color();

/** Draw at most one queued picture. Call once per frame from the scene; cheap when the queue is empty. */
export function drawQueuedPortrait(gl: THREE.WebGLRenderer) {
  const kind = queue.shift(); if (!kind || urls.has(kind)) return;
  const s = stage ??= setUp(), geometry = toyGeometry(kind), size = PORTRAIT_SIZE;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const box = geometry.boundingBox!, centre = box.getCenter(new THREE.Vector3()), half = box.getSize(new THREE.Vector3()).length() * 0.5 * 0.92;
  s.mesh.geometry = geometry;
  s.camera.left = -half; s.camera.right = half; s.camera.top = half; s.camera.bottom = -half; s.camera.updateProjectionMatrix();
  s.camera.position.copy(centre).addScaledVector(view, 12); s.camera.lookAt(centre);
  const previous = gl.getRenderTarget(), alpha = gl.getClearAlpha(); gl.getClearColor(clear);
  gl.setRenderTarget(s.target); gl.setClearColor('#000000', 0); gl.clear(); gl.render(s.scene, s.camera);
  gl.readRenderTargetPixels(s.target, 0, 0, size, size, s.pixels);
  gl.setRenderTarget(previous); gl.setClearColor(clear, alpha);
  const ctx = s.canvas.getContext('2d'); if (!ctx) return;
  const image = ctx.createImageData(size, size), out = image.data, px = s.pixels;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const from = ((size - 1 - y) * size + x) * 4, to = (y * size + x) * 4, a = px[from + 3];
    // Edge pixels come back blended with the transparent clear colour; undo that before encoding.
    for (let c = 0; c < 3; c++) out[to + c] = a ? toSrgb[Math.min(255, Math.round(px[from + c] * 255 / a))] : 0;
    out[to + 3] = a;
  }
  ctx.putImageData(image, 0, 0); urls.set(kind, s.canvas.toDataURL('image/png'));
  listeners.forEach(listener => listener());
}
