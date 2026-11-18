/* Full ten-round shop/merge/passive loop, with actual 3D mouse or touch dragging. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict'); const fs = require('node:fs'); const path = require('node:path');
const out = path.join(__dirname,'output'); fs.mkdirSync(out,{recursive:true});
(async () => {
  const browser = await chromium.launch({ args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  try {
    for (const layout of (process.env.SQUAD_LAYOUTS || 'desktop,portrait,landscape').split(',')) {
      const mobile = layout !== 'desktop', viewport = layout === 'portrait' ? {width:390,height:844} : layout === 'landscape' ? {width:844,height:390} : {width:1280,height:800};
      const page = await browser.newPage({viewport,hasTouch:mobile,isMobile:mobile}); page.setDefaultTimeout(120000);
      const errors = []; page.on('pageerror',e=>errors.push(e.message)); page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
      await page.addInitScript(()=>localStorage.setItem('toybox-trials:prototype:v1',JSON.stringify({state:{quality:'low'},version:0})));
      const state = () => page.evaluate(()=>window.__toybox.match.state());
      const click = async id => {const b=page.getByTestId(id); if(mobile) await b.tap(); else await b.click();};
      const drag = async (from,toX,toZ) => {
        const a=await page.evaluate(c=>c<0?window.__toybox.squad.point(-c-1,8.65,1.4):window.__toybox.squad.point(c%8,4+Math.floor(c/8),1.4),from);
        const b=await page.evaluate(c=>window.__toybox.squad.point(c.x,c.z),{x:toX,z:toZ});
        if(mobile) {
          const cdp=await page.context().newCDPSession(page);
          await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...a,id:1}]});
          await page.waitForFunction(()=>document.querySelector('canvas').style.cursor==='grabbing').catch(async e=>{await page.screenshot({path:path.join(out,`toysquad-${layout}-drag-failure.png`)}); console.error('drag state',await state(),a,b);throw e;});
          for(let i=1;i<=6;i++) await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:a.x+(b.x-a.x)*i/6,y:a.y+(b.y-a.y)*i/6,id:1}]});
          await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); await cdp.detach();
        } else {
          await page.mouse.move(a.x,a.y); await page.mouse.down(); await page.waitForFunction(()=>document.querySelector('canvas').style.cursor==='grabbing').catch(async e=>{await page.screenshot({path:path.join(out,`toysquad-${layout}-drag-failure.png`)}); console.error('drag state',await state(),a,b);throw e;});
          await page.mouse.move(b.x,b.y,{steps:8}); await page.mouse.up();
        }
      };
      await page.goto((process.env.BASE_URL||'http://127.0.0.1:4174/')+'?debug#play');
      await page.waitForSelector('.loading',{state:'detached'}); await page.evaluate(()=>window.__toybox.teleport(0,-12.6,Math.PI));
      await page.waitForSelector('.prompt'); if(mobile) await page.locator('.prompt').tap(); else await page.keyboard.press('KeyE');
      await click('practice-toy-squad'); await page.waitForTimeout(800); await click('match-start');
      await page.waitForFunction(()=>window.__toybox.match.phase()==='playing');
      assert.equal((await state()).config.rounds,10); assert.equal((await state()).players[0].level,1);
      assert.equal((await state()).players[0].shop.length,5);
      // Stocked purchases automatically pair and chain to three stars.
      await page.evaluate(()=>{window.__toybox.match.state().players[0].shop=['soldier','soldier','soldier','soldier','robot'];});
      await page.waitForFunction(()=>document.querySelector('[data-testid="squad-buy-0"]').textContent.includes('Tin Volley'));
      await click('squad-buy-0'); await page.waitForFunction(()=>window.__toybox.match.state().players[0].units.length===1);
      if(!mobile) { await page.getByTestId('squad-buy-1').hover(); await page.waitForSelector('[data-testid="squad-kit"]'); assert.match(await page.getByTestId('squad-kit').textContent(),/Parade Discipline/); }
      await page.waitForFunction(()=>document.querySelector('[data-testid="squad-buy-1"]').textContent.includes('Auto-upgrade'));
      await page.screenshot({path:path.join(out,`toysquad-${layout}-upgrade.png`)});
      if(layout==='landscape') {
        const dock=await page.locator('.squad-workbench').boundingBox(), label=await page.getByTestId('squad-buy-1').locator('strong').boundingBox();
        assert.ok(label.y>=dock.y && label.y+label.height<=dock.y+dock.height,'shop names remain visible in landscape');
        const reserve=await page.evaluate(()=>window.__toybox.squad.point(0,8.65));
        assert.ok(reserve.y<dock.y,'physical reserves remain above the shop');
      }
      await click('squad-buy-1'); await page.waitForFunction(()=>window.__toybox.match.state().players[0].units[0].tier===2);
      await click('squad-buy-2'); await page.waitForFunction(()=>window.__toybox.match.state().players[0].units.length===2);
      await click('squad-buy-3'); await page.waitForFunction(()=>window.__toybox.match.state().players[0].units[0].tier===3);
      assert.equal((await state()).players[0].units.length,1);
      await click('squad-buy-4'); await page.waitForFunction(()=>window.__toybox.match.state().players[0].units.length===2);
      await page.evaluate(()=>{window.__toybox.match.state().players[0].shop=['hare','paper-medic',null,null,null];});
      await click('squad-buy-0'); await page.waitForFunction(()=>window.__toybox.match.state().players[0].units.length===3);
      await click('squad-buy-1'); await page.waitForFunction(()=>window.__toybox.match.state().players[0].units.length===4);
      assert.equal((await state()).players[0].units.filter(u=>u.cell<0).length,1);
      assert.equal(await page.getByText('Inspect shop passives & spells',{exact:true}).count(),0);
      // The physical reserve row supports real mouse/touch drags and full-board swaps.
      await drag(-1,7,7); await page.waitForTimeout(150); assert.equal((await state()).players[0].units.at(-1).cell,-1);
      await drag(-1,1,4); await page.waitForFunction(()=>window.__toybox.match.state().players[0].units.at(-1).cell===1);
      await drag(1,0,8.65); await page.waitForFunction(()=>window.__toybox.match.state().players[0].units.at(-1).cell===-1);
      // Select the reserve with touch/mouse; the shared Q shortcut sells that exact toy.
      const reserve=await page.evaluate(()=>window.__toybox.squad.point(0,8.65,1.4));
      if(mobile) await page.touchscreen.tap(reserve.x,reserve.y); else await page.mouse.click(reserve.x,reserve.y);
      await page.waitForSelector('[data-testid="squad-kit"]');
      assert.match(await page.getByTestId('squad-kit').textContent(),/Paper Medic/);
      await page.keyboard.press('KeyQ'); await page.waitForFunction(()=>window.__toybox.match.state().players[0].units.length===3);
      await drag(0,7,7); await page.waitForFunction(()=>window.__toybox.match.state().players[0].units[0].cell===31);
      await drag(31,2,2); await page.waitForTimeout(150); assert.equal((await state()).players[0].units[0].cell,31);
      await drag(31,0,4); await page.waitForFunction(()=>window.__toybox.match.state().players[0].units[0].cell===0);
      const gold=(await state()).players[0].coins; await page.keyboard.press('KeyR');
      await page.waitForFunction(g=>window.__toybox.match.state().players[0].coins===g-2,gold);
      if(!mobile) {
        await page.getByTestId('squad-buy-0').hover();
        await page.evaluate(()=>{window.__toybox.match.state().players[0].shop[0]='hare';});
        await page.waitForFunction(()=>document.querySelector('[data-testid="squad-kit"]')?.textContent.includes('Spring Hare'));
      }
      await page.getByRole('button',{name:'Pause',exact:true}).click(); await page.waitForSelector('.pause');
      const t=(await state()).t; await page.waitForTimeout(250); assert.equal((await state()).t,t); await page.keyboard.press('Escape');
      await page.waitForSelector('.pause',{state:'detached'}); await page.evaluate(()=>window.__toybox.match.timeScale(0));
      await page.screenshot({path:path.join(out,`toysquad-${layout}-build.png`)}); await page.evaluate(()=>window.__toybox.match.timeScale(1));
      await page.keyboard.press('KeyE'); await page.waitForFunction(()=>window.__toybox.match.state().phase==='battle');
      // Give the controlled battle durability and full mana to observe a real cast on all viewports.
      await page.evaluate(()=>{window.__toybox.match.timeScale(0); for(const u of window.__toybox.match.state().battles[0].fighters){u.hp=u.maxHp=500;u.shield=0;u.magic.mana=u.magic.maxMana;} window.__toybox.match.timeScale(1);});
      await page.waitForFunction(()=>window.__toybox.match.state().battles[0].attacks.some(a=>a.spell));
      await page.waitForFunction(()=>window.__toybox.match.state().battles[0].damages.length>0);
      await page.evaluate(()=>window.__toybox.match.timeScale(0));
      assert.ok((await state()).battles[0].fighters[0].magic.casts>0);
      await page.screenshot({path:path.join(out,`toysquad-${layout}-damage.png`)});
      if(process.env.SQUAD_SMOKE) {
        assert.deepEqual(errors,[]); console.log(`PASS Toy Squad ${layout} final interaction smoke: automatic merges, hover details, Q/R/E, reserve drags/swaps, upgrade highlights and spells; no console/page errors`);
        await page.close(); continue;
      }
      await page.evaluate(()=>window.__toybox.match.timeScale(30));
      for(let round=2;round<=10;round++) {
        await page.waitForFunction(r=>{const s=window.__toybox.match.state(); return s.round===r&&s.phase==='build';},round);
        await page.evaluate(()=>window.__toybox.match.timeScale(1)); const s=await state(),p=s.players[0]; assert.equal(p.level,round);
        assert.ok(p.units.filter(u=>u.cell>=0).length<=Math.min(10,round+2));
        if([3,6,9].includes(round)) {
          assert.equal(p.passiveOffers.length,3); assert.equal(await page.getByTestId('squad-ready').isDisabled(),true);
          await click(`squad-passive-${p.passiveOffers[0]}`);
          await page.waitForFunction(n=>window.__toybox.match.state().players[0].passives.length===n,round/3);
        }
        // The shop buttons validate costs/capacity in the real rules. Buy one legal visible offer.
        const enabled=await page.locator('.squad-shop button:not(:disabled)').all(); if(enabled[0]) {if(mobile) await enabled[0].tap(); else await enabled[0].click();}
        await click('squad-ready'); await page.waitForFunction(()=>window.__toybox.match.state().phase==='battle');
        await page.evaluate(()=>window.__toybox.match.timeScale(30));
      }
      await page.waitForSelector('.results'); assert.equal((await state()).players[0].passives.length,3);
      const rec=await page.evaluate(()=>JSON.parse(localStorage.getItem('toybox-trials:prototype:v1')).state.records['toy-squad']); assert.equal(rec.plays,1);
      await page.waitForTimeout(800); await click('results-again'); await page.waitForFunction(()=>window.__toybox.match.phase()==='playing');
      assert.equal((await state()).round,1); assert.equal((await state()).players[0].units.length,0);
      await page.getByRole('button',{name:'Pause',exact:true}).click(); await page.waitForTimeout(800); await page.locator('.pause__actions .toy-btn').nth(1).click(); await page.waitForSelector('.hud-sign');
      assert.deepEqual(errors,[]); console.log(`PASS Toy Squad ${layout}: hover kit explanations, Q/R/E shortcuts, physical reserve dragging/swaps, automatic 2→3-star merges, upgrade highlights, auto-cast mana/spell particles, five-slot shop, reroll, damage numbers, ten levels/rounds, passive choices 3/6/9, records, restart and hub return; no console/page errors`);
      await page.close();
    }
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
