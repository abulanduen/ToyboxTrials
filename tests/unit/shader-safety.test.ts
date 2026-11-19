import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Every .ts/.tsx file under src. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? sources(p) : /\.tsx?$/.test(f) ? [p] : [];
  });
}

describe('custom GLSL stays NaN-free (one NaN pixel turns into a black flash through bloom)', () => {
  it('pow() bases are clamped non-negative', () => {
    const bad: string[] = [];
    for (const file of sources('src')) {
      const text = readFileSync(file, 'utf8');
      if (!text.includes('glsl')) continue;
      for (const m of text.matchAll(/\bpow\(\s*([^,]+),/g)) {
        const base = m[1].trim();
        const safe = /^(max|clamp|abs|exp|smoothstep|saturate)\(/.test(base) || /^[0-9.]+$/.test(base);
        if (!safe) bad.push(`${file}: pow(${base}, …)`);
      }
    }
    expect(bad).toEqual([]);
  });
});
