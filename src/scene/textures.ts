/**
 * Procedural, hand-painted-looking material textures generated on a canvas at startup.
 * Small (256–512 px), tileable, and cached — zero network cost, consistent toy look.
 */
import * as THREE from 'three';

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

/** Window sky: soft afternoon gradient with blurred clouds and a tree line. */
export function skyTexture() {
  return memo('sky', () => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const g = c.getContext('2d')!;
    const grd = g.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, '#9CC6E4');
    grd.addColorStop(0.65, '#E9E4D2');
    grd.addColorStop(1, '#F6D9A6');
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
    const r = rng(21);
    g.filter = 'blur(6px)';
    for (let i = 0; i < 7; i++) {
      g.fillStyle = 'rgba(255,255,255,0.7)';
      g.beginPath();
      g.ellipse(r() * 256, 40 + r() * 80, 30 + r() * 30, 10 + r() * 8, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = 'rgba(110,140,100,0.85)';
    for (let x = -10; x < 270; x += 18) {
      g.beginPath();
      g.ellipse(x, 230, 16, 30 + r() * 20, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.filter = 'none';
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

/** Big flat graphic for the scoreboard card / gate signs (pips, laurels). */
export function cardFaceTexture(title: string, sub: string, accent: string) {
  return memo(`cardface:${title}:${sub}:${accent}`, () => {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 320;
    const g = c.getContext('2d')!;
    g.fillStyle = '#F4E8CE';
    g.fillRect(0, 0, 512, 320);
    g.strokeStyle = accent;
    g.lineWidth = 14;
    g.strokeRect(14, 14, 484, 292);
    g.strokeStyle = 'rgba(87,77,105,0.35)';
    g.lineWidth = 3;
    g.strokeRect(34, 34, 444, 252);
    g.fillStyle = '#574D69';
    g.textAlign = 'center';
    g.font = '700 64px Fredoka, "Trebuchet MS", sans-serif';
    g.fillText(title, 256, 150);
    g.font = '600 30px Nunito, "Trebuchet MS", sans-serif';
    g.fillStyle = accent;
    g.fillText(sub, 256, 215);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  });
}
