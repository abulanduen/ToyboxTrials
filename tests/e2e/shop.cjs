/* Odds & Ends shop and the cog economy, end to end: desktop (keyboard + mouse), then emulated phones
   (real touch) in portrait and landscape.
     npx vite build --outDir /tmp/shop-dist && npx vite preview --outDir /tmp/shop-dist --port 4194 --strictPort &
     BASE_URL=http://localhost:4194/ node tests/e2e/shop.cjs        (ONLY=desktop|portrait|landscape runs one)
   Each run starts from an old (version 0) save that has found all four secrets and wears the acorn
   cap and star key, so the save migration is checked too: the profile must keep them and be paid
   the one-off secret cogs (4 × 40). Then: finish a practice trial (sped up with the ?debug
   match.timeScale hook) and see the cogs on the results screen; walk up to Odds & Ends (teleport
   next to its prompt) and press E / tap the prompt; try on, buy and equip an accessory and see it
   on the toy; buy a gesture, put it on key 4 and play it; reload and check it all persisted.
   Desktop also takes a gallery of accessories and gesture poses on the turntable. */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const OUT = process.env.OUT_DIR || path.join(__dirname, 'output');
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL || 'http://localhost:4173/';
const ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const T = +process.env.E2E_TIMEOUT || 240000;
const LOAD_T = +process.env.LOAD_TIMEOUT || 600000;
const KEY = 'toybox-trials:prototype:v1';
const res = [];
const check = (n, ok, d = '') => {
  res.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`);
  console.log(res[res.length - 1]);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const num = (s) => Number(String(s ?? '').replace(/[^0-9-]/g, ''));

const phone = (w, h) => ({ viewport: { width: w, height: h }, screen: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36' });
const DEVICES = {
  desktop: { opts: { viewport: { width: 1280, height: 720 } }, touch: false },
  portrait: { opts: phone(390, 844), touch: true },
  landscape: { opts: phone(844, 390), touch: true },
};

async function run(browser, dev) {
  const { opts, touch } = DEVICES[dev];
  const ctx = await browser.newContext(opts);
  // An old save (before profiles): all four secrets found, acorn cap and star key on, paint #1.
  await ctx.addInitScript((key) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem(key, JSON.stringify({ state: { tourSeen: true, quality: 'low', tutorials: false, contenderName: 'Shopper', paintIndex: 1, hat: 'acorn', keySkin: 'star', secretsFound: ['musicbox', 'marble', 'jack', 'key'] }, version: 0 }));
  }, KEY);
  const page = await ctx.newPage();
  page.setDefaultTimeout(T);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  const press = async (sel) => (touch ? page.tap(sel) : page.click(sel));
  const shot = (file, clip) => page.screenshot({ path: path.join(OUT, file), timeout: T, ...(clip ? { clip } : {}) });
  const cogs = async () => num(await page.textContent('[data-testid=hud-cogs]'));
  const wearing = (name) => page.evaluate((n) => !!window.__toybox.three().scene.getObjectByName(n), name);
  const saved = () => page.evaluate((k) => JSON.parse(localStorage.getItem(k)).state, KEY);
  const settle = (sel) => page.waitForFunction((s) => [...document.querySelectorAll(s)].every((el) => el.getAnimations({ subtree: true }).every((a) => a.playState === 'finished')), sel, { timeout: 30000 }).catch(() => null);

  await page.goto(BASE + '?debug#play');
  await page.waitForSelector('.loading', { state: 'detached', timeout: LOAD_T });
  await page.waitForSelector('[data-testid=hud-cogs]');
  // ------------------------------------------------------------ migration of the old save
  const start = await cogs();
  check(`${dev}: old save migrates: the 4 secrets pay 160 cogs once`, start === 160, `wallet ${start}`);
  const migrated = (await saved()).profile ?? {};
  check(
    `${dev}: old save keeps its look and unlocks (coral paint, acorn cap, star key; secret items owned)`,
    migrated.loadout?.paint === 'coral-clank' && migrated.loadout?.hat === 'acorn' && migrated.loadout?.keySkin === 'star' && ['paperboat', 'acorn', 'star', 'golden'].every((id) => migrated.owned?.[id]?.source === 'secret'),
    JSON.stringify(migrated.loadout),
  );

  // ------------------------------------------------------------ 1. earn cogs in a practice trial
  await page.evaluate(() => {
    window.__toybox.match.timeScale(40);
    window.__toybox.match.practice('copycat-conductor');
  });
  await page.waitForSelector('.match-intro', { timeout: T });
  await page.waitForSelector('[data-testid=match-start]');
  await sleep(900); // match buttons ignore taps for 0.7 s after appearing
  await page.locator('[data-testid=match-start]').scrollIntoViewIfNeeded();
  await press('[data-testid=match-start]');
  await page.waitForSelector('.results', { timeout: LOAD_T });
  await page.evaluate(() => window.__toybox.match.timeScale(1));
  await page.waitForSelector('[data-testid=results-cogs]', { timeout: 30000 }).catch(() => null);
  const line = (await page.textContent('[data-testid=results-cogs]').catch(() => '')) ?? '';
  const earned = num(/\+(\d+) cogs/.exec(line)?.[1]);
  check(`${dev}: results screen shows the cogs earned with a breakdown`, earned > 0 && /Finished the trial \+10/.test(line), line.replace(/\s+/g, ' ').slice(0, 120));
  await settle('.modal-layer');
  if (dev === 'desktop' || dev === 'portrait') await shot(`shop-01-${dev}-results-cogs.png`);
  await sleep(900);
  await page.locator('[data-testid=results-leave]').scrollIntoViewIfNeeded();
  await press('[data-testid=results-leave]');
  await page.waitForSelector('[data-testid=hud-cogs]');
  const afterGame = await cogs();
  check(`${dev}: the wallet grows by exactly what the results promised`, afterGame === start + earned, `${start} + ${earned} → ${afterGame}`);

  // ------------------------------------------------------------ 2. Odds & Ends: walk up, E / tap
  const spot = await page.evaluate(() => window.__toybox.interactables().find((i) => i.id === 'shop'));
  await page.evaluate(({ x, z }) => window.__toybox.teleport(x, z), spot);
  await page.waitForFunction(() => document.querySelector('.prompt')?.textContent.includes('Odds'), null, { timeout: T }).catch(() => null);
  check(`${dev}: standing at Odds & Ends shows "Browse Odds & Ends Shop"`, ((await page.textContent('.prompt').catch(() => '')) ?? '').includes('Browse'));
  if (touch) await page.tap('.prompt--touch');
  else await page.keyboard.press('KeyE');
  await page.waitForSelector('[data-testid=shop]', { timeout: T });
  await settle('.workshop-panel');
  check(`${dev}: the prompt opens the shop (address #shop)`, (await page.evaluate(() => location.hash)) === '#shop');
  check(`${dev}: shop wallet shows the balance`, num(await page.textContent('[data-testid=wallet]')) === afterGame);
  const feat = await page.$$('[data-testid^=featured-]');
  check(`${dev}: a daily featured row of 3 items`, feat.length === 3);
  const layout = await page.evaluate(() => {
    const panel = document.querySelector('[data-testid=shop]');
    const small = [...panel.querySelectorAll('button')].filter((b) => b.offsetParent).map((b) => ({ t: (b.textContent || '').trim().slice(0, 14), w: b.offsetWidth, h: b.offsetHeight })).filter((b) => b.w < 56 || b.h < 56);
    const r = panel.getBoundingClientRect();
    return { docScroll: document.scrollingElement.scrollWidth - innerWidth, panelScroll: panel.scrollWidth - panel.clientWidth, small, inside: r.left >= 0 && r.right <= innerWidth + 0.5 && r.top >= 0 && r.bottom <= innerHeight + 0.5 };
  });
  check(`${dev}: no horizontal scroll (page or panel)`, layout.docScroll <= 0 && layout.panelScroll <= 0, JSON.stringify({ doc: layout.docScroll, panel: layout.panelScroll }));
  check(`${dev}: every shop button is at least 56 × 56 px`, layout.small.length === 0, JSON.stringify(layout.small.slice(0, 4)));
  check(`${dev}: the shop panel fits inside the screen`, layout.inside);
  await shot(`shop-02-${dev}-shop.png`);

  // ------------------------------------------------------------ 3. try on, buy, equip an accessory
  await press('[data-testid=shop-tab-accessory]');
  await page.locator('[data-testid=shop-item-scarf]').scrollIntoViewIfNeeded();
  await press('[data-testid=shop-item-scarf]');
  await page.waitForSelector('[data-testid=shop-buy]');
  // Buy sits beside the catalogue (a pinned bar on portrait phones): on screen with no scrolling.
  const buyInView = await page.evaluate(() => {
    const b = document.querySelector('[data-testid=shop-buy]').getBoundingClientRect();
    const side = document.querySelector('.shop-side');
    const sr = side.getBoundingClientRect();
    return b.top >= 0 && b.bottom <= innerHeight && b.left >= 0 && b.right <= innerWidth && b.top >= sr.top - 1 && b.bottom <= sr.bottom + 1 && side.scrollTop === 0;
  });
  check(`${dev}: Buy is on screen beside the catalogue, no scrolling needed`, buyInView);
  await shot(`shop-02b-${dev}-buy-in-view.png`);
  await page.waitForFunction(() => !!window.__toybox.three().scene.getObjectByName('accessory:scarf'), null, { timeout: T }).catch(() => null);
  check(`${dev}: picking the scarf tries it on the toy before buying`, await wearing('accessory:scarf'));
  const price = num(await page.textContent('[data-testid=shop-buy]'));
  await page.locator('[data-testid=shop-buy]').scrollIntoViewIfNeeded();
  await press('[data-testid=shop-buy]');
  await page.waitForFunction(() => /Bought/.test(document.querySelector('[data-testid=shop-note]')?.textContent ?? ''), null, { timeout: T }).catch(() => null);
  const afterBuy = num(await page.textContent('[data-testid=wallet]'));
  check(`${dev}: Buy takes the price off the wallet`, price > 0 && afterBuy === afterGame - price, `${afterGame} − ${price} → ${afterBuy}`);
  check(`${dev}: the scarf card now says Owned`, ((await page.textContent('[data-testid=shop-item-scarf]')) ?? '').includes('Owned'));
  check(`${dev}: Buy is gone (can't buy twice)`, !(await page.isVisible('[data-testid=shop-buy]')));
  await page.locator('[data-testid=shop-equip]').scrollIntoViewIfNeeded();
  await press('[data-testid=shop-equip]');
  await page.waitForFunction(() => document.querySelector('[data-testid=shop-item-scarf]')?.textContent.includes('Equipped'), null, { timeout: T }).catch(() => null);
  check(`${dev}: Equip puts it on (card says Equipped, the toy wears it)`, ((await page.textContent('[data-testid=shop-item-scarf]')) ?? '').includes('Equipped') && (await wearing('accessory:scarf')));
  // A locked item can't be bought without the cogs: pick the most expensive accessory.
  await page.locator('[data-testid=shop-item-wings]').scrollIntoViewIfNeeded();
  await press('[data-testid=shop-item-wings]');
  await page.waitForSelector('[data-testid=shop-buy]');
  await press('[data-testid=shop-buy]');
  await page.waitForFunction(() => /Not enough cogs/.test(document.querySelector('[data-testid=shop-note]')?.textContent ?? ''), null, { timeout: 30000 }).catch(() => null);
  check(`${dev}: too few cogs: the purchase is refused and the wallet unchanged`, ((await page.textContent('[data-testid=shop-note]').catch(() => '')) ?? '').includes('Not enough') && num(await page.textContent('[data-testid=wallet]')) === afterBuy);

  // ------------------------------------------------------------ 4. buy a gesture, equip it, play it
  await page.locator('[data-testid=shop-tab-gesture]').scrollIntoViewIfNeeded();
  await press('[data-testid=shop-tab-gesture]');
  await page.locator('[data-testid=shop-item-laugh]').scrollIntoViewIfNeeded();
  await press('[data-testid=shop-item-laugh]');
  await page.waitForFunction(() => window.__toybox.state().anim.emote === 'laugh', null, { timeout: T, polling: 100 }).catch(() => null);
  check(`${dev}: picking a gesture plays it on the toy as a preview`, (await page.evaluate(() => window.__toybox.state().anim.emote)) === 'laugh');
  const gPrice = num(await page.textContent('[data-testid=shop-buy]'));
  await page.locator('[data-testid=shop-buy]').scrollIntoViewIfNeeded();
  await press('[data-testid=shop-buy]');
  await page.waitForSelector('[data-testid=gesture-slot-4]', { timeout: T });
  check(`${dev}: bought Laugh`, num(await page.textContent('[data-testid=wallet]')) === afterBuy - gPrice, `${afterBuy} − ${gPrice}`);
  await page.locator('[data-testid=gesture-slot-4]').scrollIntoViewIfNeeded();
  await press('[data-testid=gesture-slot-4]');
  await page.waitForFunction(() => /key 4/.test(document.querySelector('[data-testid=shop-note]')?.textContent ?? ''), null, { timeout: 30000 }).catch(() => null);
  check(`${dev}: Laugh goes on key 4`, ((await page.textContent('[data-testid=gesture-slot-4]')) ?? '').includes('Laugh'));
  if (dev !== 'desktop') await shot(`shop-03-${dev}-gesture-slots.png`);
  await page.locator('[data-testid=shop-done]').scrollIntoViewIfNeeded();
  await press('[data-testid=shop-done]');
  await page.waitForSelector('.hud-sign');
  await sleep(1600); // emote cooldown since the preview
  if (touch) {
    await page.tap('[data-testid=emote-button]');
    await page.waitForSelector('[data-testid=emote-menu]');
    const labels = await page.$$eval('.emote-menu__btn', (els) => els.map((e) => e.textContent.trim()));
    check(`${dev}: the touch Emote menu lists the four equipped gestures`, labels.join() === 'Wave,Cheer,Spin,Laugh', labels.join());
    await settle('.emote-menu');
    await page.tap('[data-testid=emote-laugh]');
  } else {
    await page.keyboard.press('Digit4');
  }
  await page.waitForFunction(() => window.__toybox.state().anim.emote === 'laugh', null, { timeout: T, polling: 100 }).catch(() => null);
  check(`${dev}: ${touch ? 'the Emote menu' : 'key 4'} plays the bought gesture in the hub`, (await page.evaluate(() => window.__toybox.state().anim.emote)) === 'laugh');
  if (dev === 'desktop') {
    await page.evaluate(() => window.__toybox.pose('laugh', 0.8));
    await shot('shop-04-desktop-hub-laugh-scarf.png');
    await page.evaluate(() => window.__toybox.pose(null));
  }

  // ------------------------------------------------------------ 5. reload: everything persists
  await page.reload();
  await page.waitForSelector('.loading', { state: 'detached', timeout: LOAD_T });
  await page.waitForSelector('[data-testid=hud-cogs]');
  const st = await saved();
  const p = st.profile ?? {};
  check(`${dev}: after reload the wallet is the same`, (await cogs()) === afterBuy - gPrice && p.wallet?.cogs === afterBuy - gPrice, `hud ${await cogs()}, saved ${p.wallet?.cogs}`);
  check(`${dev}: the save holds a versioned profile and no legacy fields`, p.schema === 1 && st.hat === undefined && st.paintIndex === undefined, JSON.stringify({ schema: p.schema, hat: st.hat }));
  check(`${dev}: owned items keep their unlock source`, p.owned?.scarf?.source === 'shop' && p.owned?.laugh?.source === 'shop' && p.owned?.acorn?.source === 'secret');
  check(`${dev}: loadout persists (scarf on, Laugh on key 4, acorn cap, star key)`, p.loadout?.neck === 'scarf' && p.loadout?.gestures?.[3] === 'laugh' && p.loadout?.hat === 'acorn' && p.loadout?.keySkin === 'star', JSON.stringify(p.loadout));
  await page.waitForFunction(() => !!window.__toybox.three().scene.getObjectByName('accessory:scarf'), null, { timeout: T }).catch(() => null);
  check(`${dev}: the toy still wears the scarf after reload`, await wearing('accessory:scarf'));

  if (dev === 'desktop') await gallery(page, shot);
  if (dev === 'portrait') {
    // Pause → Shop works on touch too, and the Workshop shows the accessory and gesture loadout.
    await page.tap('.touch-pause');
    await page.waitForSelector('[data-testid=pause-shop]');
    await page.tap('[data-testid=pause-shop]');
    await page.waitForSelector('[data-testid=shop]');
    await page.tap('[data-testid=shop-to-workshop]');
    await page.waitForSelector('.workshop-panel');
    await page.tap('[data-testid=workshop-tab-gesture]');
    await page.waitForSelector('[data-testid=gesture-slot-4]');
    check('portrait: the Workshop shows the gesture loadout', ((await page.textContent('[data-testid=gesture-slot-4]')) ?? '').includes('Laugh'));
    await page.tap('[data-testid=workshop-tab-accessory]');
    await page.waitForSelector('[data-testid=swatch-scarf]');
    check('portrait: the Workshop lists accessories by slot with the scarf selected', (await page.getAttribute('[data-testid=swatch-scarf]', 'aria-selected')) === 'true');
    await settle('.workshop-panel');
    await shot('shop-05-portrait-workshop-accessories.png');
  }
  check(`${dev}: no page errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

/** Desktop: try on sets of accessories and hold gesture poses on the shop turntable, for the record. */
async function gallery(page, shot) {
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-testid=pause-shop]');
  await page.click('[data-testid=pause-shop]');
  await page.waitForSelector('[data-testid=shop]');
  await page.waitForFunction(() => [...document.querySelectorAll('.workshop-panel')].every((el) => el.getAnimations().every((a) => a.playState === 'finished')), null, { timeout: 30000 }).catch(() => null);
  const clip = { x: 160, y: 40, width: 560, height: 640 };
  const sets = [
    ['cape', 'monocle', 'bowtie', 'propeller'],
    ['backpack', 'goggles', 'bellcollar', 'reeltop'],
    ['balloon', 'moustache', 'medal', 'partycone'],
    ['wings', 'beadnose', 'scarf', 'laurel'],
  ];
  const tabFor = { propeller: 'hat', reeltop: 'hat', partycone: 'hat', laurel: 'hat' };
  for (let i = 0; i < sets.length; i++) {
    for (const id of sets[i]) {
      await page.click(`[data-testid=shop-tab-${tabFor[id] ?? 'accessory'}]`);
      await page.click(`[data-testid=shop-item-${id}]`);
    }
    await page.waitForTimeout(2500);
    await shot(`shop-06-accessories-${i + 1}-${sets[i].join('-')}.png`, clip);
    // Picking the back item again turns the turntable round to show it.
    await page.click('[data-testid=shop-tab-accessory]');
    await page.click(`[data-testid=shop-item-${sets[i][0]}]`);
    await page.waitForTimeout(3000);
    await shot(`shop-06-accessories-${i + 1}-back.png`, clip);
  }
  check('desktop: accessory gallery captured (try-on of 16 items)', true);
  // Start the poses from a bare toy: leaving for the Workshop and back clears the try-on.
  await page.click('[data-testid=shop-to-workshop]');
  await page.click('[data-testid=workshop-to-shop]');
  await page.waitForSelector('[data-testid=shop]');
  await page.click('[data-testid=shop-tab-gesture]');
  for (const [id, t] of [
    ['dance', 0.55],
    ['laugh', 0.8],
    ['sit', 1.0],
    ['salute', 0.9],
    ['juggle', 0.7],
    ['faint', 1.1],
  ]) {
    await page.click(`[data-testid=shop-item-${id}]`); // plays it and turns the toy to the front
    await page.evaluate(([g, tt]) => window.__toybox.pose(g, tt), [id, t]);
    await page.waitForTimeout(2500);
    await shot(`shop-07-gesture-${id}.png`, clip);
  }
  await page.evaluate(() => window.__toybox.pose(null));
  check('desktop: gesture pose gallery captured (6 gestures)', true);
}

(async () => {
  const browser = await chromium.launch({ args: ARGS });
  const only = process.env.ONLY;
  try {
    for (const dev of Object.keys(DEVICES)) {
      if (only && only !== dev) continue;
      try {
        await run(browser, dev);
      } catch (e) {
        check(`${dev}: shop e2e ran to the end`, false, e.stack || String(e));
      }
    }
  } finally {
    await browser.close();
    console.log('\n' + res.join('\n'));
    const failed = res.filter((r) => r.startsWith('FAIL')).length;
    console.log(`\n${res.length - failed}/${res.length} passed`);
    process.exit(failed ? 1 : 0);
  }
})();
