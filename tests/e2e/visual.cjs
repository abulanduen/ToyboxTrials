/* Visual capture of the hub + main menu at each quality tier, plus renderer stats (draw calls / triangles).
 * Not a pass/fail test: it writes screenshots for a human (or an agent) to look at.
 *
 *   BASE_URL=http://localhost:4177/ node tests/e2e/visual.cjs [tag] [tiers] [shots]
 *     tag    file-name prefix, e.g. "before" / "after" (default "visual")
 *     tiers  comma list of low,balanced,high (default all)
 *     shots  comma list of shot names (default all)
 *
 * Output: tests/e2e/output/<tag>-<tier>-<shot>.png and <tag>-renderinfo.json.
 * This runs on SwiftShader (no GPU), so frame *rates* here mean nothing; draw calls and
 * triangle counts are the only performance proxy this script reports.
 */
const { chromium, devices } = require('playwright');
const path = require('path');
const fs = require('fs');
const OUT = process.env.OUT_DIR || path.join(__dirname, 'output');
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL || 'http://localhost:4173/';
const TAG = process.argv[2] || 'visual';
const TIERS = (process.argv[3] || 'low,balanced,high').split(',');
const ONLY = process.argv[4] ? process.argv[4].split(',') : null;

/** Hub viewpoints: toy position/yaw + camera orbit (camYaw 0 = camera south of the toy, looking at the window wall). */
const HUB_SHOTS = [
  { name: 'hub-window', x: 0, z: 22, yaw: Math.PI, camYaw: -0.12, camPitch: 0.16 },
  { name: 'hub-spawn', x: 0, z: 20, yaw: Math.PI, camYaw: 0.35, camPitch: 0.3 },
  { name: 'hub-worm', x: -6, z: 6, yaw: Math.PI, camYaw: -0.25, camPitch: -0.05 },
  { name: 'hub-left', x: 14, z: 4, yaw: Math.PI / 2, camYaw: Math.PI / 2 - 0.2, camPitch: 0.18 },
  { name: 'hub-right', x: -18, z: 8, yaw: -Math.PI / 2, camYaw: -Math.PI / 2 + 0.25, camPitch: 0.18 },
  { name: 'hub-back', x: 0, z: -8, yaw: 0, camYaw: Math.PI + 0.3, camPitch: 0.2 },
  { name: 'hub-high', x: 0, z: 10, yaw: Math.PI, camYaw: 0.5, camPitch: 0.75 },
];

const want = (n) => !ONLY || ONLY.includes(n);
const info = {};

async function settle(page, frames) {
  // Wait for N animation frames (SwiftShader is slow, so wall-clock waits are unreliable), capped.
  await page.evaluate(
    (n) =>
      new Promise((res) => {
        let i = 0;
        const t0 = performance.now();
        const tick = () => (++i >= n || performance.now() - t0 > 45000 ? res() : requestAnimationFrame(tick));
        requestAnimationFrame(tick);
      }),
    frames,
  );
}

async function open(browser, tier, opts, hash) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[${tier}] pageerror: ${e.message}`));
  await page.addInitScript((q) => localStorage.setItem('toybox-trials:prototype:v1', JSON.stringify({ state: { tourSeen: true, quality: q }, version: 0 })), tier);
  await page.goto(`${BASE}?debug${hash}`);
  await page.waitForFunction(() => window.__toybox && window.__toybox.renderInfo, null, { timeout: 120000 });
  await settle(page, 12);
  return { ctx, page };
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const tier of TIERS) {
    info[tier] = {};
    const desktop = { viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 };

    // ---- hub ----
    if (HUB_SHOTS.some((s) => want(s.name)) || want('match')) {
      const { ctx, page } = await open(browser, tier, desktop, '#play');
      await page.addStyleTag({ content: '.hud-hint,.ticket-stack{display:none!important}' }).catch(() => {});
      for (const s of HUB_SHOTS) {
        if (!want(s.name)) continue;
        await page.evaluate((v) => { window.__toybox.teleport(v.x, v.z, v.yaw); window.__toybox.aim(v.camYaw, v.camPitch); }, s);
        await settle(page, 16);
        await page.screenshot({ path: `${OUT}/${TAG}-${tier}-${s.name}.png`, timeout: 180000 });
        info[tier][s.name] = await page.evaluate(() => window.__toybox.renderInfo());
        console.log(tier, s.name, JSON.stringify(info[tier][s.name]));
      }
      // ---- a minigame set on the same table (Copycat Conductor practice), to check the room behind it ----
      if (want('match')) {
        await page.evaluate(() => { const g = window.__toybox.hub.gates().find((x) => x.game === 'copycat-conductor'); window.__toybox.teleport(g.standX, g.standZ, g.yaw); window.__toybox.aim(g.rot, 0.3); });
        await settle(page, 10);
        await page.keyboard.press('KeyE');
        const intro = await page.waitForSelector('.match-intro', { timeout: 120000 }).catch(() => null);
        if (intro) {
          await page.waitForTimeout(1200); // match buttons ignore input briefly after appearing
          await page.click('[data-testid=match-start]').catch(() => {});
          await settle(page, 20);
          await page.screenshot({ path: `${OUT}/${TAG}-${tier}-match.png`, timeout: 180000 });
          info[tier].match = await page.evaluate(() => window.__toybox.renderInfo());
          console.log(tier, 'match', JSON.stringify(info[tier].match));
        } else console.log(tier, 'match: intro did not open');
      }
      await ctx.close();
    }

    // ---- main menu ----
    if (want('menu')) {
      const { ctx, page } = await open(browser, tier, desktop, '');
      await settle(page, 12);
      await page.screenshot({ path: `${OUT}/${TAG}-${tier}-menu.png`, timeout: 180000 });
      info[tier].menu = await page.evaluate(() => window.__toybox.renderInfo());
      console.log(tier, 'menu', JSON.stringify(info[tier].menu));
      await ctx.close();
    }

    // ---- phone portrait (touch, real device metrics; the tier is forced so tiers can be compared) ----
    if (want('phone') || want('phone-menu')) {
      const phone = { ...devices['iPhone 13'], deviceScaleFactor: 1 };
      if (want('phone')) {
        const { ctx, page } = await open(browser, tier, phone, '#play');
        await page.evaluate(() => { window.__toybox.teleport(0, 22, Math.PI); window.__toybox.aim(-0.12, 0.2); });
        await settle(page, 16);
        await page.screenshot({ path: `${OUT}/${TAG}-${tier}-phone.png`, timeout: 180000 });
        info[tier].phone = await page.evaluate(() => window.__toybox.renderInfo());
        console.log(tier, 'phone', JSON.stringify(info[tier].phone));
        await ctx.close();
      }
      if (want('phone-menu')) {
        const { ctx, page } = await open(browser, tier, phone, '');
        await settle(page, 12);
        await page.screenshot({ path: `${OUT}/${TAG}-${tier}-phone-menu.png`, timeout: 180000 });
        await ctx.close();
      }
    }
  }
  fs.writeFileSync(`${OUT}/${TAG}-renderinfo.json`, JSON.stringify(info, null, 2));
  await browser.close();
})();
