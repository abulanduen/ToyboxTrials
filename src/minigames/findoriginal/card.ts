/**
 * The reference card ("BALDWYN"), drawn on its own small canvas on top of the game canvas.
 *
 * Why not in the 3D scene: the card used to be drawn there, 40 cm in front of the camera, so the
 * hub's focus effects (Balanced tilt-shift, High depth of field, both focused on the crowd) blurred
 * it, and the Low tier — the default on phones — renders the whole scene at ≤ 1.25× device pixels
 * without antialiasing, which looks soft on a 3× phone screen. (Minigames now skip the focus
 * effects anyway, see PlayroomScene.) Here the figure gets its own antialiased canvas at the
 * screen's full pixel ratio (up to 3×) with no post effects, so it is crisp on every tier. The
 * card's frame and name are plain DOM, so they are as sharp as the HUD text.
 *
 * Same model, same light: the figure is built from the crowd's own parts table (figure.ts), lit by
 * copies of the room's lights and environment, tone-mapped like the main canvas, and seen from the
 * crowd camera's elevation.
 */
import * as THREE from 'three';
import { PALETTE } from '../../game/palette';
import { SUN_DIR } from '../../scene/room/bake';
import { LAMP_HEAD } from '../../scene/room/Tabletop';
import { lookKey, type Look } from './looks';
import { createFigure, disposeFigure, spinFigureKey } from './figure';

/** Card proportions (fractions of the card's height). */
const ASPECT = 0.8;
/** The figure's canvas covers the card above the name ticket. */
const FIG = { top: 0.035, side: 0.04, bottom: 0.2 };

export interface CardRect {
  cx: number;
  cy: number;
  h: number;
}

/**
 * The room's image-based light, rebuilt in this canvas's own WebGL context: the same light
 * panels as PlayroomScene's <Environment> (keep the two in step), rendered once into a cube map.
 */
function roomEnvironment(gl: THREE.WebGLRenderer) {
  const scene = new THREE.Scene();
  const panel = (geo: THREE.BufferGeometry, color: string, intensity: number, pos: [number, number, number], scale: [number, number, number], rotation?: [number, number, number]) => {
    const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, toneMapped: false });
    mat.color.multiplyScalar(intensity);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(...pos);
    mesh.scale.set(...scale);
    if (rotation) mesh.rotation.set(...rotation);
    else mesh.lookAt(0, 0, 0);
    scene.add(mesh);
  };
  const rect = new THREE.PlaneGeometry(1, 1);
  const ring = new THREE.RingGeometry(0.25, 0.5, 64);
  panel(rect, '#FFE7C2', 2.2, [30, 40, -60], [60, 40, 1]);
  panel(rect, '#BFD6EA', 0.7, [-60, 20, 40], [60, 30, 1]);
  panel(ring, PALETTE.honey, 1.4, [-30, 50, -40], [8, 8, 8]);
  panel(rect, '#8A6A4E', 0.5, [0, -30, 0], [200, 200, 1], [Math.PI / 2, 0, 0]);
  const target = new THREE.WebGLCubeRenderTarget(64);
  target.texture.type = THREE.HalfFloatType;
  new THREE.CubeCamera(0.1, 1000, target).update(gl, scene);
  scene.traverse((o) => ((o as THREE.Mesh).material as THREE.Material | undefined)?.dispose());
  rect.dispose();
  ring.dispose();
  return target;
}

export class ReferenceCard {
  readonly el: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private gl: THREE.WebGLRenderer;
  private env: THREE.WebGLCubeRenderTarget;
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  private figure: THREE.Group | null = null;
  private key = '';
  /** Box size (CSS px) and backing-store size the canvas currently has. */
  private boxH = 0;
  private px = { w: 0, h: 0, dpr: 0 };
  private last = { tx: -1e9, ty: -1e9, s: -1e9, o: -1 };

  constructor(parent: HTMLElement, private elevation: number) {
    this.el = document.createElement('div');
    this.el.className = 'fo-card';
    this.el.setAttribute('aria-hidden', 'true');
    this.el.dataset.testid = 'fo-card';
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'fo-card__figure';
    const name = document.createElement('div');
    name.className = 'fo-card__name';
    name.textContent = 'Baldwyn';
    this.el.append(this.canvas, name);
    parent.appendChild(this.el);

    this.gl = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
    this.gl.setClearColor(0x000000, 0);
    this.gl.toneMapping = THREE.ACESFilmicToneMapping; // as PlayroomScene sets on the main canvas
    this.gl.toneMappingExposure = 1.05;
    this.env = roomEnvironment(this.gl);
    this.scene.environment = this.env.texture;

    // The room's lights, by direction (the crowd stands at the middle of the table, which is the origin).
    const light = (l: THREE.DirectionalLight, from: THREE.Vector3) => {
      l.position.copy(from);
      this.scene.add(l, l.target);
    };
    this.scene.add(new THREE.HemisphereLight('#FFF1DA', '#8A6A50', 1.05));
    light(new THREE.DirectionalLight('#FFDDAE', 2.5), SUN_DIR.clone().multiplyScalar(-100));
    light(new THREE.DirectionalLight(PALETTE.honey, 2.0), LAMP_HEAD.clone()); // the desk lamp's spot, centred on the stage
    light(new THREE.DirectionalLight('#E6DCEA', 0.75), new THREE.Vector3(-70, 60, 110));
  }

  /** Show this look (rebuilt only when it changes). */
  setLook(look: Look) {
    const key = lookKey(look);
    if (key === this.key) return;
    this.key = key;
    if (this.figure) {
      this.scene.remove(this.figure);
      disposeFigure(this.figure);
    }
    this.figure = createFigure(look);
    this.scene.add(this.figure);
    this.frameFigure();
  }

  /** Fit the camera to the figure, allowing for the sway on the big card and the turning key. */
  private frameFigure() {
    const fig = this.figure!;
    const e = this.elevation;
    const dir = new THREE.Vector3(0, Math.sin(e), Math.cos(e));
    this.cam.position.copy(dir).multiplyScalar(30);
    this.cam.up.set(0, 1, 0);
    this.cam.lookAt(0, 0, 0);
    this.cam.updateMatrixWorld();
    const view = this.cam.matrixWorldInverse;
    const box = new THREE.Box3();
    const corner = new THREE.Vector3();
    const bounds = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
    for (const yaw of [-0.32, 0, 0.32]) {
      for (const spin of [0, 0.8, 1.6, 2.4]) {
        fig.rotation.y = yaw;
        spinFigureKey(fig, spin);
        fig.updateMatrixWorld(true);
        for (const child of fig.children) {
          const mesh = child as THREE.Mesh;
          if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
          box.copy(mesh.geometry.boundingBox!).applyMatrix4(mesh.matrixWorld);
          for (let i = 0; i < 8; i++) {
            corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).applyMatrix4(view);
            bounds.x0 = Math.min(bounds.x0, corner.x);
            bounds.x1 = Math.max(bounds.x1, corner.x);
            bounds.y0 = Math.min(bounds.y0, corner.y);
            bounds.y1 = Math.max(bounds.y1, corner.y);
          }
        }
      }
    }
    fig.rotation.y = 0;
    // Centre on the figure; the frustum's size is set from the canvas aspect in `fit`.
    const cx = (bounds.x0 + bounds.x1) / 2;
    const cy = (bounds.y0 + bounds.y1) / 2;
    this.cam.position.add(new THREE.Vector3(1, 0, 0).multiplyScalar(cx)).add(new THREE.Vector3(0, Math.cos(e), -Math.sin(e)).multiplyScalar(cy));
    this.cam.updateMatrixWorld();
    this.cam.userData.half = { w: (bounds.x1 - bounds.x0) / 2, h: (bounds.y1 - bounds.y0) / 2 };
    this.fit();
  }

  private fit() {
    const half = this.cam.userData.half as { w: number; h: number } | undefined;
    if (!half || !this.px.w) return;
    const aspect = this.px.w / this.px.h;
    let h = half.h * 1.04;
    if (half.w * 1.04 > h * aspect) h = (half.w * 1.04) / aspect;
    this.cam.left = -h * aspect;
    this.cam.right = h * aspect;
    this.cam.top = h;
    this.cam.bottom = -h;
    this.cam.updateProjectionMatrix();
  }

  /**
   * Size the card for where it is heading (`target`, CSS px), so it is pixel-exact once it gets
   * there; on the way it is scaled with a CSS transform (only for a fraction of a second).
   */
  private size(targetH: number) {
    const H = Math.round(targetH);
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    if (H === this.boxH && dpr === this.px.dpr) return;
    this.boxH = H;
    const W = Math.round(H * ASPECT);
    const st = this.el.style;
    st.width = `${W}px`;
    st.height = `${H}px`;
    st.setProperty('--card-h', `${H}px`);
    // Whole device pixels throughout, so the canvas maps 1:1 onto the screen's pixels.
    const dev = (css: number) => Math.round(css * dpr);
    this.px = { w: dev(W * (1 - 2 * FIG.side)), h: dev(H * (1 - FIG.top - FIG.bottom)), dpr };
    this.canvas.style.left = `${dev(W * FIG.side) / dpr}px`;
    this.canvas.style.top = `${dev(H * FIG.top) / dpr}px`;
    this.canvas.style.width = `${this.px.w / dpr}px`;
    this.canvas.style.height = `${this.px.h / dpr}px`;
    this.gl.setPixelRatio(1);
    this.gl.setSize(this.px.w, this.px.h, false);
    this.fit();
  }

  /**
   * Place and draw the card. `rect` is where it is now (centre and height, CSS px), `target` where
   * it is heading, `show` 0..1 fades/scales it in, `sway` turns the figure, `spin` its key.
   */
  update(rect: CardRect, target: CardRect, show: number, sway: number, spin: number) {
    this.size(target.h);
    const visible = show > 0.02 && !!this.figure;
    let k = (rect.h / this.boxH) * (0.85 + 0.15 * show);
    let tx = rect.cx - Math.round(this.boxH * ASPECT) / 2;
    let ty = rect.cy - this.boxH / 2;
    if (Math.abs(rect.h - target.h) < 0.75 && show > 0.99) {
      // Arrived: no scaling and whole device pixels, so nothing resamples the card.
      const d = this.px.dpr;
      k = 1;
      tx = Math.round(tx * d) / d;
      ty = Math.round(ty * d) / d;
    }
    const o = visible ? Math.min(1, show * 1.4) : 0;
    const l = this.last;
    if (Math.abs(tx - l.tx) > 0.05 || Math.abs(ty - l.ty) > 0.05 || Math.abs(k - l.s) > 0.0005) {
      this.el.style.transform = `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${k.toFixed(4)})`;
      l.tx = tx;
      l.ty = ty;
      l.s = k;
    }
    if (o !== l.o) {
      this.el.style.opacity = o.toFixed(3);
      this.el.style.visibility = o > 0 ? 'visible' : 'hidden';
      l.o = o;
    }
    if (!visible) return;
    const fig = this.figure!;
    fig.rotation.y = sway;
    spinFigureKey(fig, spin);
    this.gl.render(this.scene, this.cam);
  }

  /** For tests: where the card is and how many device pixels its figure gets. */
  info() {
    const r = this.el.getBoundingClientRect();
    return {
      visible: this.el.style.visibility === 'visible',
      rect: { x: r.x, y: r.y, w: r.width, h: r.height },
      canvas: { w: this.canvas.width, h: this.canvas.height, cssW: parseFloat(this.canvas.style.width), cssH: parseFloat(this.canvas.style.height) },
      dpr: this.px.dpr,
      boxH: this.boxH,
      look: this.key,
    };
  }

  dispose() {
    if (this.figure) disposeFigure(this.figure);
    this.env.dispose();
    this.gl.dispose();
    this.gl.forceContextLoss();
    this.el.remove();
  }
}
