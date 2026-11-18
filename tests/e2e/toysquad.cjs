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
        const a=await page.evaluate(c=>window.__toybox.squad.point(c%8,4+Math.floor(c/8),1.4),from);
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
      // Controlled duplicates still go through real stock slots, payment and reserve limits.
      await page.evaluate(()=>{window.__toybox.match.state().players[0].shop=['soldier','soldier','soldier','soldier','robot'];});
      await page.waitForFunction(()=>document.querySelector('[data-testid="squad-buy-0"]').textContent.includes('Tin Volley'));
      for(let slot=0;slot<4;slot++) {await click(`squad-buy-${slot}`); await page.waitForFunction(n=>window.__toybox.match.state().players[0].units.length===n,slot+1);}
      assert.equal((await state()).players[0].units.filter(u=>u.cell>=0).length,3);
      assert.equal((await state()).players[0].units.filter(u=>u.cell<0).length,1);
      await drag(1,0,4); await page.waitForFunction(()=>window.__toybox.match.state().players[0].units[0].tier===2);
      await click('squad-formation-toggle'); await click('squad-bench-0'); await click('squad-cell-2');
      await page.waitForFunction(()=>window.__toybox.match.state().players[0].units.filter(u=>u.tier===2).length===2);
      await click('squad-cell-0'); await page.waitForSelector('[data-testid="squad-kit"]');
      assert.match(await page.getByTestId('squad-kit').textContent(),/Parade Discipline/);
      assert.match(await page.getByTestId('squad-traits').textContent(),/Tin 1\/2/); // Duplicates do not activate traits.
      await click('squad-formation-toggle'); await drag(2,0,4);
      await page.waitForFunction(()=>window.__toybox.match.state().players[0].units[0].tier===3);
      assert.equal((await state()).players[0].units.length,1);
      await drag(0,7,7); await page.waitForFunction(()=>window.__toybox.match.state().players[0].units[0].cell===31);
      await drag(31,2,2); await page.waitForTimeout(150); assert.equal((await state()).players[0].units[0].cell,31);
      await drag(31,0,4); await page.waitForFunction(()=>window.__toybox.match.state().players[0].units[0].cell===0);
      const gold=(await state()).players[0].coins; await click('squad-reroll');
      await page.waitForFunction(g=>window.__toybox.match.state().players[0].coins===g-2,gold);
      await page.getByRole('button',{name:'Pause',exact:true}).click(); await page.waitForSelector('.pause');
      const t=(await state()).t; await page.waitForTimeout(250); assert.equal((await state()).t,t); await page.keyboard.press('Escape');
      await page.waitForSelector('.pause',{state:'detached'}); await page.evaluate(()=>window.__toybox.match.timeScale(0));
      await page.screenshot({path:path.join(out,`toysquad-${layout}-build.png`)}); await page.evaluate(()=>window.__toybox.match.timeScale(1));
      await click('squad-ready'); await page.waitForFunction(()=>window.__toybox.match.state().phase==='battle');
      // Give the controlled battle durability and full mana to observe a real cast on all viewports.
      await page.evaluate(()=>{window.__toybox.match.timeScale(0); for(const u of window.__toybox.match.state().battles[0].fighters){u.hp=u.maxHp=500;u.shield=0;u.magic.mana=u.magic.maxMana;} window.__toybox.match.timeScale(1);});
      await page.waitForFunction(()=>window.__toybox.match.state().battles[0].attacks.some(a=>a.spell));
      await page.waitForFunction(()=>window.__toybox.match.state().battles[0].damages.length>0);
      await page.evaluate(()=>window.__toybox.match.timeScale(0));
      assert.ok((await state()).battles[0].fighters[0].magic.casts>0);
      await page.screenshot({path:path.join(out,`toysquad-${layout}-damage.png`)});
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
      assert.deepEqual(errors,[]); console.log(`PASS Toy Squad ${layout}: unit kit explanations, distinct-kind traits, auto-cast mana/spell particles, five-slot shop, board/reserves, 2→3-star drag merges, reroll, damage numbers, ten levels/rounds, passive choices 3/6/9, records, restart and hub return; no console/page errors`);
      await page.close();
    }
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
