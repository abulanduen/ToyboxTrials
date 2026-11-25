/**
 * Procedural, hand-painted-looking material textures generated on a canvas at startup.
 * Small (256–512 px), tileable, and cached — zero network cost, consistent toy look.
 */
import * as THREE from 'three';
import { PALETTE } from '../game/palette';

const cache = new Map<string, THREE.Texture>();

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function finish(canvas: HTMLCanvasElement, repeat: [number, number], srgb = true): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.anisotropy = 4;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function memo(key: string, make: () => THREE.Texture): THREE.Texture {
  let t = cache.get(key);
  if (!t) cache.set(key, (t = make()));
  return t;
}

/** Long-grain planks for the table top. */
export function woodTexture(base = '#C8925A', repeat: [number, number] = [1, 1], seed = 7) {
  return memo(`wood:${base}:${repeat}:${seed}`, () => {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 512;
    const g = c.getContext('2d')!;
    const r = rng(seed);
    g.fillStyle = base;
    g.fillRect(0, 0, 512, 512);
    const plankH = 128;
    for (let p = 0; p < 4; p++) {
      const y0 = p * plankH;
      // per-plank tint
      g.fillStyle = `rgba(${r() > 0.5 ? '255,235,200' : '90,50,20'},${0.04 + r() * 0.08})`;
      g.fillRect(0, y0, 512, plankH);
      // grain lines
      for (let i = 0; i < 46; i++) {
        const y = y0 + r() * plankH;
        const amp = 2 + r() * 5;
        const freq = 0.004 + r() * 0.012;
        const ph = r() * 10;
        g.strokeStyle = `rgba(80,45,20,${0.05 + r() * 0.12})`;
        g.lineWidth = 0.6 + r() * 1.6;
        g.beginPath();
        for (let x = 0; x <= 512; x += 8) {
          const yy = y + Math.sin(x * freq + ph) * amp;
          if (x === 0) g.moveTo(x, yy);
          else g.lineTo(x, yy);
        }
        g.stroke();
      }
      // a knot now and then
      if (r() > 0.4) {
        const kx = r() * 512;
        const ky = y0 + 20 + r() * (plankH - 40);
        for (let k = 0; k < 6; k++) {
          g.strokeStyle = `rgba(70,38,15,${0.18 - k * 0.025})`;
          g.lineWidth = 1.4;
          g.beginPath();
          g.ellipse(kx, ky, 4 + k * 4, 2 + k * 2, 0, 0, Math.PI * 2);
          g.stroke();
        }
      }
      // plank seam
      g.fillStyle = 'rgba(50,28,12,0.55)';
      g.fillRect(0, y0, 512, 2);
      g.fillStyle = 'rgba(255,230,190,0.18)';
      g.fillRect(0, y0 + 2, 512, 1);
    }
    return finish(c, repeat);
  });
}

/** Fuzzy felt with fibre speckle and a faint weave. */
export function feltTexture(base = '#7FA878', repeat: [number, number] = [1, 1], seed = 3) {
  return memo(`felt:${base}:${repeat}:${seed}`, () => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const g = c.getContext('2d')!;
    const r = rng(seed);
    g.fillStyle = base;
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 6000; i++) {
      const light = r() > 0.5;
      g.fillStyle = light ? `rgba(255,255,230,${r() * 0.09})` : `rgba(20,30,10,${r() * 0.1})`;
      const x = r() * 256;
      const y = r() * 256;
      const a = r() * Math.PI;
      const l = 1 + r() * 3;
      g.save();
      g.translate(x, y);
      g.rotate(a);
      g.fillRect(-l / 2, -0.4, l, 0.8);
      g.restore();
    }
    return finish(c, repeat);
  });
}

/** Corrugated cardboard with print-registration flecks. */
export function cardboardTexture(base = '#C9A57A', repeat: [number, number] = [1, 1], seed = 11) {
  return memo(`card:${base}:${repeat}:${seed}`, () => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const g = c.getContext('2d')!;
    const r = rng(seed);
    g.fillStyle = base;
    g.fillRect(0, 0, 256, 256);
    for (let x = 0; x < 256; x += 8) {
      const grd = g.createLinearGradient(x, 0, x + 8, 0);
      grd.addColorStop(0, 'rgba(90,60,30,0.10)');
      grd.addColorStop(0.5, 'rgba(255,240,210,0.08)');
      grd.addColorStop(1, 'rgba(90,60,30,0.10)');
      g.fillStyle = grd;
      g.fillRect(x, 0, 8, 256);
    }
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(70,45,20,${r() * 0.12})`;
      g.fillRect(r() * 256, r() * 256, 1 + r() * 2, 1 + r() * 2);
    }
    return finish(c, repeat);
  });
}

/** Painted stripes (pavilion canvas, awnings). */
export function stripeTexture(a: string, b: string, stripes = 8) {
  return memo(`stripe:${a}:${b}:${stripes}`, () => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 16;
    const g = c.getContext('2d')!;
    const w = 256 / stripes;
    for (let i = 0; i < stripes; i++) {
      g.fillStyle = i % 2 ? b : a;
      g.fillRect(i * w, 0, w, 16);
    }
    // soft paint wobble at stripe edges
    g.fillStyle = 'rgba(0,0,0,0.04)';
    for (let i = 1; i < stripes; i++) g.fillRect(i * w - 1, 0, 2, 16);
    return finish(c, [1, 1]);
  });
}

/** Radial soft shadow used as a cheap contact-shadow blob under characters and props. */
export function blobShadowTexture() {
  return memo('blob', () => {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const g = c.getContext('2d')!;
    const grd = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    grd.addColorStop(0, 'rgba(30,20,35,0.55)');
    grd.addColorStop(0.55, 'rgba(30,20,35,0.22)');
    grd.addColorStop(1, 'rgba(30,20,35,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

/** Big flat graphic for the scoreboard card / gate signs (pips, laurels). */
export function cardFaceTexture(title: string, sub: string, accent: string, aspect = 1.6) {
  return memo(`cardface:${title}:${sub}:${accent}:${aspect}`, () => {
    const c = document.createElement('canvas');
    const H = Math.round(512 / aspect);
    c.width = 512;
    c.height = H;
    const g = c.getContext('2d')!;
    g.fillStyle = '#F4E8CE';
    g.fillRect(0, 0, 512, H);
    g.strokeStyle = accent;
    g.lineWidth = 14;
    g.strokeRect(14, 14, 484, H - 28);
    g.strokeStyle = 'rgba(87,77,105,0.35)';
    g.lineWidth = 3;
    g.strokeRect(34, 34, 444, H - 68);
    g.fillStyle = '#574D69';
    g.textAlign = 'center';
    g.font = '700 64px Fredoka, "Trebuchet MS", sans-serif';
    g.fillText(title, 256, H * 0.47, 430);
    g.font = '600 30px Nunito, "Trebuchet MS", sans-serif';
    g.fillStyle = accent;
    g.fillText(sub, 256, H * 0.67);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  });
}

// ---------------------------------------------------------------------------------------------
// Room layer
// ---------------------------------------------------------------------------------------------

/** Soft elliptical blob drawn with a radial gradient (no ctx.filter: Safari's canvas lacks it). */
function blob(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rgb: string, alpha: number, hard = 0) {
  g.save();
  g.translate(x, y);
  g.scale(1, ry / rx);
  const grd = g.createRadialGradient(0, 0, rx * hard, 0, 0, rx);
  grd.addColorStop(0, `rgba(${rgb},${alpha})`);
  grd.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grd;
  g.beginPath();
  g.arc(0, 0, rx, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/**
 * What you see through the window: afternoon sky with a hazy sun, soft clouds, a big garden tree,
 * a hedge line and a neighbour's roof. Painted soft on purpose: it always sits far out of focus.
 * `sun` is the sun's position in texture space (u, v from the top-left).
 */
export function gardenTexture(sun: [number, number] = [0.58, 0.23]) {
  return memo(`garden:${sun}`, () => {
    const W = 512;
    const H = 384;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d')!;
    const r = rng(77);
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#86B9E2');
    sky.addColorStop(0.45, '#BFDDEE');
    sky.addColorStop(0.72, '#F3E6C6');
    sky.addColorStop(1, '#EBD3A4');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    // hazy sun
    blob(g, sun[0] * W, sun[1] * H, 300, 300, '255,236,196', 0.75);
    blob(g, sun[0] * W, sun[1] * H, 110, 110, '255,250,232', 0.8);
    blob(g, sun[0] * W, sun[1] * H, 46, 46, '255,255,250', 1, 0.5);
    // clouds
    for (let i = 0; i < 9; i++) {
      const x = r() * W;
      const y = 30 + r() * 170;
      for (let k = 0; k < 4; k++) blob(g, x + (r() - 0.5) * 90, y + (r() - 0.5) * 16, 46 + r() * 40, 15 + r() * 10, '255,252,244', 0.42);
    }
    // far hills, then the hedge line
    for (let x = -20; x < W + 40; x += 26) blob(g, x, H * 0.8, 44, 30 + r() * 16, '150,178,160', 0.9, 0.5);
    // neighbour's roof
    g.fillStyle = '#C79A7E';
    g.beginPath();
    g.moveTo(330, H * 0.82);
    g.lineTo(392, H * 0.66);
    g.lineTo(458, H * 0.82);
    g.closePath();
    g.fill();
    g.fillStyle = '#E9DCC6';
    g.fillRect(340, H * 0.82 - 1, 108, 40);
    for (let x = -20; x < W + 40; x += 18) blob(g, x, H * 0.93, 30, 26 + r() * 22, '104,140,98', 0.95, 0.55);
    // the big tree on the left, lit from the right
    for (let i = 0; i < 46; i++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r());
      const x = 78 + Math.cos(a) * d * 112;
      const y = H * 0.52 + Math.sin(a) * d * 120;
      const lit = (x - 78) / 112 > 0.1 && y < H * 0.52;
      blob(g, x, y, 22 + r() * 22, 20 + r() * 18, lit ? '150,182,112' : '84,122,84', 0.9, 0.45);
    }
    g.fillStyle = 'rgba(96,74,56,0.9)';
    g.fillRect(70, H * 0.7, 16, H * 0.3);
    // warm haze over everything near the horizon
    const haze = g.createLinearGradient(0, H * 0.5, 0, H);
    haze.addColorStop(0, 'rgba(255,236,200,0)');
    haze.addColorStop(1, 'rgba(255,236,200,0.28)');
    g.fillStyle = haze;
    g.fillRect(0, 0, W, H);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

/** Soft halo for the window: stands in for bloom on tiers without post-processing. */
export function windowGlowTexture() {
  return memo('winglow', () => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = '#000';
    g.fillRect(0, 0, 128, 128);
    blob(g, 64, 64, 64, 64, '255,255,255', 0.55);
    blob(g, 74, 46, 40, 40, '255,255,255', 0.55);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

/** A woven rug: field colour, border bands and rows of diamonds. */
export function rugTexture(field: string, accent: string) {
  return memo(`rug:${field}:${accent}`, () => {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 384;
    const g = c.getContext('2d')!;
    const r = rng(41);
    g.fillStyle = field;
    g.fillRect(0, 0, 512, 384);
    g.strokeStyle = accent;
    g.lineWidth = 10;
    g.strokeRect(22, 22, 468, 340);
    g.lineWidth = 3;
    g.strokeRect(40, 40, 432, 304);
    g.fillStyle = accent;
    for (let i = 0; i < 7; i++) {
      const x = 76 + i * 60;
      for (const y of [112, 192, 272]) {
        const s = y === 192 ? 22 : 12;
        g.beginPath();
        g.moveTo(x, y - s);
        g.lineTo(x + s, y);
        g.lineTo(x, y + s);
        g.lineTo(x - s, y);
        g.closePath();
        g.fill();
      }
    }
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = r() > 0.5 ? `rgba(255,250,235,${r() * 0.08})` : `rgba(20,20,35,${r() * 0.1})`;
      g.fillRect(r() * 512, r() * 384, 1 + r() * 2, 1);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  });
}

/** Number of cells per row / column in the room picture atlas. */
export const ATLAS = { cols: 4, rows: 2 };
/**
 * One small atlas for everything flat that hangs on the walls: four framed pictures, a clock
 * face, a child's drawing, a rocket poster and a height chart. All original doodles.
 */
export function roomAtlasTexture() {
  return memo('roomatlas', () => {
    const S = 256;
    const c = document.createElement('canvas');
    c.width = S * ATLAS.cols;
    c.height = S * ATLAS.rows;
    const g = c.getContext('2d')!;
    const r = rng(5);
    const cell = (i: number, paint: () => void) => {
      g.save();
      g.translate((i % ATLAS.cols) * S, Math.floor(i / ATLAS.cols) * S);
      g.beginPath();
      g.rect(0, 0, S, S);
      g.clip();
      paint();
      g.restore();
    };
    // 0: hills at dusk
    cell(0, () => {
      const sky = g.createLinearGradient(0, 0, 0, S);
      sky.addColorStop(0, '#9CC0D8');
      sky.addColorStop(1, '#F2D7A6');
      g.fillStyle = sky;
      g.fillRect(0, 0, S, S);
      g.fillStyle = '#F6E7B8';
      g.beginPath();
      g.arc(176, 84, 30, 0, Math.PI * 2);
      g.fill();
      for (const [y, col] of [
        [150, '#8FAE96'],
        [182, '#6E947C'],
        [214, '#587B66'],
      ] as const) {
        g.fillStyle = col;
        g.beginPath();
        g.moveTo(0, S);
        for (let x = 0; x <= S; x += 16) g.lineTo(x, y + Math.sin(x * 0.03 + y) * 16);
        g.lineTo(S, S);
        g.fill();
      }
    });
    // 1: abstract shapes
    cell(1, () => {
      g.fillStyle = '#EFE6D2';
      g.fillRect(0, 0, S, S);
      g.fillStyle = '#D9805F';
      g.beginPath();
      g.arc(96, 104, 58, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#5E86A3';
      g.fillRect(118, 112, 96, 96);
      g.fillStyle = '#E3B55A';
      g.beginPath();
      g.moveTo(40, 220);
      g.lineTo(110, 130);
      g.lineTo(170, 220);
      g.fill();
    });
    // 2: little sailing boat
    cell(2, () => {
      g.fillStyle = '#CFE2EA';
      g.fillRect(0, 0, S, S);
      g.fillStyle = '#7FA9C0';
      g.fillRect(0, 170, S, 86);
      g.fillStyle = '#F6F0E2';
      g.beginPath();
      g.moveTo(128, 50);
      g.lineTo(128, 160);
      g.lineTo(60, 160);
      g.fill();
      g.fillStyle = '#D9805F';
      g.beginPath();
      g.moveTo(136, 70);
      g.lineTo(136, 160);
      g.lineTo(190, 160);
      g.fill();
      g.fillStyle = '#6E4C33';
      g.beginPath();
      g.moveTo(54, 168);
      g.lineTo(202, 168);
      g.lineTo(180, 196);
      g.lineTo(76, 196);
      g.fill();
    });
    // 3: botanical print
    cell(3, () => {
      g.fillStyle = '#F1EADB';
      g.fillRect(0, 0, S, S);
      g.strokeStyle = '#5F8A5C';
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(128, 236);
      g.quadraticCurveTo(120, 140, 132, 36);
      g.stroke();
      g.fillStyle = '#7FA878';
      for (let i = 0; i < 6; i++) {
        const y = 200 - i * 28;
        for (const s of [-1, 1]) {
          g.save();
          g.translate(128, y);
          g.rotate(s * 0.9);
          g.beginPath();
          g.ellipse(0, -30, 13, 34, 0, 0, Math.PI * 2);
          g.fill();
          g.restore();
        }
      }
    });
    // 4: clock face (ten past ten)
    cell(4, () => {
      g.fillStyle = '#6E4C33';
      g.fillRect(0, 0, S, S);
      g.fillStyle = '#F6F0E2';
      g.beginPath();
      g.arc(128, 128, 112, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#574D69';
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        g.beginPath();
        g.arc(128 + Math.sin(a) * 92, 128 - Math.cos(a) * 92, i % 3 === 0 ? 8 : 4, 0, Math.PI * 2);
        g.fill();
      }
      g.strokeStyle = '#2B2433';
      g.lineCap = 'round';
      g.lineWidth = 10;
      g.beginPath();
      g.moveTo(128, 128);
      g.lineTo(128 - 48, 128 - 30);
      g.stroke();
      g.lineWidth = 7;
      g.beginPath();
      g.moveTo(128, 128);
      g.lineTo(128 + 66, 128 - 44);
      g.stroke();
      g.fillStyle = '#E76B62';
      g.beginPath();
      g.arc(128, 128, 9, 0, Math.PI * 2);
      g.fill();
    });
    // 5: a child's crayon drawing
    cell(5, () => {
      g.fillStyle = '#FBF6EA';
      g.fillRect(0, 0, S, S);
      g.lineCap = 'round';
      const scribble = (col: string, pts: number[][], w = 7) => {
        g.strokeStyle = col;
        g.lineWidth = w;
        g.beginPath();
        pts.forEach(([x, y], i) => (i ? g.lineTo(x + (r() - 0.5) * 5, y + (r() - 0.5) * 5) : g.moveTo(x, y)));
        g.stroke();
      };
      scribble('#E76B62', [[70, 200], [70, 120], [128, 70], [186, 120], [186, 200], [70, 200]]);
      scribble('#6BA7C8', [[112, 200], [112, 152], [144, 152], [144, 200]]);
      scribble('#EFAE45', [[206, 52], [222, 60], [218, 42], [206, 52], [200, 36]], 9);
      scribble('#89B78A', [[20, 214], [70, 206], [128, 216], [190, 206], [240, 214]], 10);
    });
    // 6: rocket poster
    cell(6, () => {
      g.fillStyle = '#3F4A66';
      g.fillRect(0, 0, S, S);
      g.fillStyle = '#F4E8CE';
      for (let i = 0; i < 26; i++) g.fillRect(r() * S, r() * S, 3, 3);
      g.save();
      g.translate(128, 132);
      g.rotate(0.5);
      g.fillStyle = '#F4E8CE';
      g.beginPath();
      g.ellipse(0, 0, 30, 74, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#E76B62';
      g.beginPath();
      g.moveTo(-30, 30);
      g.lineTo(-56, 76);
      g.lineTo(-18, 58);
      g.moveTo(30, 30);
      g.lineTo(56, 76);
      g.lineTo(18, 58);
      g.fill();
      g.fillStyle = '#6BA7C8';
      g.beginPath();
      g.arc(0, -22, 13, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#EFAE45';
      g.beginPath();
      g.moveTo(-14, 70);
      g.lineTo(0, 112);
      g.lineTo(14, 70);
      g.fill();
      g.restore();
    });
    // 7: height chart
    cell(7, () => {
      g.fillStyle = '#EFE2C4';
      g.fillRect(0, 0, S, S);
      g.fillStyle = '#89B78A';
      g.fillRect(96, 0, 64, S);
      g.fillStyle = '#574D69';
      for (let i = 0; i < 16; i++) g.fillRect(96, 8 + i * 16, i % 4 === 0 ? 40 : 22, 3);
      g.fillStyle = '#E76B62';
      g.fillRect(96, 116, 64, 5);
    });
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  });
}

/**
 * Wooden ruler face with centimetre ticks and numbers, `cm` long (the canvas maps onto the whole
 * face, 0 at the left). Used for the 30 cm ruler on the gates table and the bridge's rails.
 */
export function rulerTexture(cm = 30) {
  return memo(`ruler:${cm}`, () => {
    const pxPerCm = cm > 40 ? 32 : 33;
    const c = document.createElement('canvas');
    c.width = Math.min(2048, Math.round((cm + 1) * pxPerCm));
    c.height = 96;
    const k = c.width / (cm + 1); // px per cm (half a centimetre of blank wood at each end)
    const g = c.getContext('2d')!;
    g.fillStyle = '#E9CF9A';
    g.fillRect(0, 0, c.width, 96);
    g.fillStyle = 'rgba(120,80,40,0.10)';
    for (let i = 0; i < 40; i++) g.fillRect(0, (i * 37) % 96, c.width, 1);
    g.fillStyle = PALETTE.ink;
    g.font = `700 ${cm > 40 ? 19 : 26}px Nunito, "Trebuchet MS", sans-serif`;
    g.textAlign = 'center';
    const step = cm > 40 ? 5 : 1; // millimetre ticks would alias on the long rails: half-centimetres instead
    for (let i = 0; i <= cm * 10; i += step) {
      const x = k * 0.5 + (i / 10) * k;
      const major = i % 10 === 0;
      g.fillRect(x - (major ? 1.5 : 0.75), 0, major ? 3 : 1.5, major ? 34 : i % 5 === 0 ? 24 : 14);
      if (major && i > 0 && i < cm * 10) g.fillText(String(i / 10), x, 66);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  });
}

// ---------------------------------------------------------------------------------------------
// The arcade under the spawn table (src/scene/Arcade.tsx)
// ---------------------------------------------------------------------------------------------

/**
 * Arcade carpet: deep ink-blue with scattered confetti (rings, stars, zigzags, dots) in the toy
 * palette, the kind that glows under a black light. Tileable (shapes wrap round the edges).
 * Returns the colour map; `glow` is the same pattern on black, for an emissive map.
 */
export function arcadeCarpetTexture(glow = false) {
  return memo(`arcade-carpet:${glow}`, () => {
    const S = 512;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d')!;
    g.fillStyle = glow ? '#000000' : '#1E2140';
    g.fillRect(0, 0, S, S);
    if (!glow) {
      // a faint woven speckle
      const r0 = rng(41);
      for (let i = 0; i < 2600; i++) {
        g.fillStyle = r0() < 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.12)';
        g.fillRect(r0() * S, r0() * S, 2, 2);
      }
    }
    const cols = [PALETTE.honey, PALETTE.coral, PALETTE.toyBlue, PALETTE.sage, '#C9A7E8', '#7FE0D6'];
    const r = rng(97);
    const shape = (x: number, y: number, col: string, kind: number, sz: number, rot: number) => {
      g.save();
      g.translate(x, y);
      g.rotate(rot);
      g.strokeStyle = col;
      g.fillStyle = col;
      g.lineWidth = 4;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.beginPath();
      if (kind === 0) {
        g.arc(0, 0, sz * 0.6, 0, Math.PI * 2);
        g.stroke();
      } else if (kind === 1) {
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * Math.PI * 2;
          const rr = k % 2 ? sz * 0.32 : sz * 0.75;
          if (k === 0) g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
          else g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        g.closePath();
        g.fill();
      } else if (kind === 2) {
        g.moveTo(-sz, 0);
        for (let k = 1; k <= 4; k++) g.lineTo(-sz + (k * sz) / 2, k % 2 ? -sz * 0.4 : sz * 0.4);
        g.stroke();
      } else {
        g.arc(0, 0, sz * 0.28, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
    };
    for (let i = 0; i < 70; i++) {
      const x = r() * S;
      const y = r() * S;
      const col = cols[Math.floor(r() * cols.length)];
      const kind = Math.floor(r() * 4);
      const sz = 10 + r() * 14;
      const rot = r() * Math.PI * 2;
      // the same shape again a tile away wherever it overhangs an edge, so the carpet repeats seamlessly
      for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) if (x + dx > -30 && x + dx < S + 30 && y + dy > -30 && y + dy < S + 30) shape(x + dx, y + dy, col, kind, sz, rot);
    }
    return finish(c, [1, 1]);
  });
}

/** A hanging sign's face: `text` in chunky cream letters on ink, with a row of bulbs round the edge. */
export function arcadeSignTexture(text: string) {
  return memo(`arcade-sign:${text}`, () => {
    const W = 512;
    const H = 160;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d')!;
    g.fillStyle = '#2B2433';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = PALETTE.honey;
    g.lineWidth = 8;
    g.strokeRect(10, 10, W - 20, H - 20);
    for (let i = 0; i < 26; i++) {
      const x = 22 + (i * (W - 44)) / 25;
      for (const y of [22, H - 22]) {
        g.fillStyle = i % 2 ? PALETTE.coral : PALETTE.cream;
        g.beginPath();
        g.arc(x, y, 5, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.fillStyle = PALETTE.cream;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '700 84px Fredoka, "Trebuchet MS", sans-serif';
    g.fillText(text, W / 2, H / 2 + 4, W - 70);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  });
}
