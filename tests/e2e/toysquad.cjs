/* Full ten-round shop/merge/passive loop, with actual 3D mouse or touch dragging: shop pictures and rarity colours,
   the Sell button, drag-to-sell, keyboard placement and the blocking passive choice. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict'); const fs = require('node:fs'); const path = require('node:path');
const out = path.join(__dirname,'output'); fs.mkdirSync(out,{recursive:true});
(async () => {
  const browser = await chromium.launch({ args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  try {
    for (const layout of (process.env.SQUAD_LAYOUTS || 'desktop,portrait,landscape').split(',')) {
      const mobile = layout !== 'desktop', viewport = layout === 'portrait' ? {width:390,height:844} : layout === 'landscape' ? {width:844,height:390} : {width:1280,height:800};
      const page = await browser.newPage({viewport,hasTouch:mobile,isMobile:mobile}); page.setDefaultTimeout(300000);
      const errors = []; page.on('pageerror',e=>errors.push(e.message)); page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
      await page.addInitScript(()=>localStorage.setItem('toybox-trials:prototype:v1',JSON.stringify({state:{tourSeen:true,quality:'low',tutorials:false},version:0})));
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
      // Drag a toy from its square onto the shop dock: the dock becomes the sell target, and releasing there sells.
      const dragToShop = async (from,shot) => {
        const a=await page.evaluate(c=>c<0?window.__toybox.squad.point(-c-1,8.65,1.4):window.__toybox.squad.point(c%8,4+Math.floor(c/8),1.4),from);
        const box=await page.getByTestId('squad-workbench').boundingBox(), b={x:box.x+box.width/2,y:box.y+box.height/2};
        const over=()=>page.waitForFunction(()=>document.querySelector('[data-testid="squad-sell-drop"]')?.dataset.over==='true');
        if(mobile) {
          const cdp=await page.context().newCDPSession(page);
          await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...a,id:1}]});
          await page.waitForFunction(()=>document.querySelector('canvas').style.cursor==='grabbing');
          for(let i=1;i<=6;i++) await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:a.x+(b.x-a.x)*i/6,y:a.y+(b.y-a.y)*i/6,id:1}]});
          await over(); await page.screenshot({path:path.join(out,shot)});
          await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); await cdp.detach();
        } else {
          await page.mouse.move(a.x,a.y); await page.mouse.down(); await page.waitForFunction(()=>document.querySelector('canvas').style.cursor==='grabbing');
          await page.mouse.move(b.x,b.y,{steps:8}); await over(); await page.screenshot({path:path.join(out,shot)}); await page.mouse.up();
        }
        await page.waitForSelector('[data-testid="squad-sell-drop"]',{state:'detached'});
      };
      const card = slot => page.evaluate(n=>{const b=document.querySelector(`[data-testid="squad-buy-${n}"]`); return {rarity:b.dataset.rarity,border:getComputedStyle(b).borderTopColor};},slot);
      // A shop picture is a real rendered toy: partly transparent, partly solid, several colours.
      const picture = async slot => {
        await page.waitForFunction(n=>{const i=document.querySelector(`[data-testid="squad-buy-${n}"] img`); return !!i&&i.complete&&i.naturalWidth>0;},slot);
        return page.evaluate(n=>{const i=document.querySelector(`[data-testid="squad-buy-${n}"] img`),c=document.createElement('canvas'); c.width=i.naturalWidth; c.height=i.naturalHeight;
          const x=c.getContext('2d'); x.drawImage(i,0,0); const d=x.getImageData(0,0,c.width,c.height).data, colours=new Set(); let solid=0;
          for(let k=0;k<d.length;k+=4) if(d[k+3]>200){solid++; colours.add((d[k]>>5)+','+(d[k+1]>>5)+','+(d[k+2]>>5));}
          return {src:i.src.slice(0,22),share:solid/(d.length/4),colours:colours.size};},slot);
      };
      // All five offers fit side by side: no sideways scrolling, every card on screen and at least 56 px.
      const shopFits = () => page.evaluate(()=>{const shop=document.querySelector('[data-testid="squad-shop"]'),dock=document.querySelector('[data-testid="squad-workbench"]'),r=shop.getBoundingClientRect();
        const cards=[...shop.children].map(c=>c.getBoundingClientRect());
        return {cards:cards.length,shop:shop.scrollWidth<=shop.clientWidth,dock:dock.scrollWidth<=dock.clientWidth,page:document.documentElement.scrollWidth<=innerWidth,
          inside:cards.every(c=>c.left>=r.left-1&&c.right<=r.right+1&&c.left>=0&&c.right<=innerWidth),big:cards.every(c=>c.width>=56&&c.height>=56)};});
      const FITS={cards:5,shop:true,dock:true,page:true,inside:true,big:true};
      const size56 = async id => {const r=await page.getByTestId(id).boundingBox(); assert.ok(r.width>=56&&r.height>=56,`${id} is at least 56 px: ${r.width}x${r.height}`);};
      await page.goto((process.env.BASE_URL||'http://localhost:4173/')+'?debug#play');
      await page.waitForSelector('.loading',{state:'detached'}); await page.evaluate(()=>window.__toybox.hub.goTo('pavilion'));
      await page.waitForSelector('.prompt'); if(mobile) await page.locator('.prompt').tap(); else await page.keyboard.press('KeyE');
      await click('practice-group-strategy'); // the practice list opens by section
      await click('practice-toy-squad');
      // Lazy module load + 0.7 s tap guard on match buttons; then fast-forward the countdown (slow software GL).
      await page.getByTestId('match-start').waitFor({state:'visible'}); await page.waitForTimeout(900);
      // Three bot squads, so the player rail has boards to show.
      { const three=page.locator('.intro-options .segmented button',{hasText:'3 bots'}); if(mobile) await three.tap(); else await three.click(); }
      await click('match-start');
      await page.waitForFunction(()=>window.__toybox.match.phase()==='countdown');
      await page.evaluate(()=>window.__toybox.match.timeScale(10));
      // The first frames compile shaders and draw the first shop pictures; on a loaded software-GL machine that can take minutes.
      await page.waitForFunction(()=>window.__toybox.match.phase()==='playing',null,{timeout:600000});
      await page.evaluate(()=>window.__toybox.match.timeScale(1));
      // This first build phase carries every interaction check, so give it far more than its 35 seconds (test hook only).
      await page.evaluate(()=>{window.__toybox.match.state().phaseEnds+=900000;});
      assert.equal((await state()).config.rounds,10); assert.equal((await state()).players[0].level,1);
      assert.equal((await state()).players[0].shop.length,5);
      // Stocked purchases automatically pair and chain to three stars.
      await page.evaluate(()=>{window.__toybox.match.state().players[0].shop=['soldier','soldier','soldier','soldier','robot'];});
      await page.waitForFunction(()=>document.querySelector('[data-testid="squad-buy-0"]').textContent.includes('Tin Volley'));
      await click('squad-buy-0'); await page.waitForFunction(()=>window.__toybox.match.state().players[0].units.length===1);
      // Nothing is selected yet, so Sell (between Reroll and Ready) is disabled. The old Formation & traits drawer is gone.
      assert.equal(await page.getByTestId('squad-sell').isDisabled(),true);
      assert.deepEqual(await page.locator('.squad-shop-actions button').evaluateAll(bs=>bs.map(b=>b.dataset.testid)),['squad-reroll','squad-sell','squad-ready']);
      for(const b of await page.locator('.squad-shop-actions button').all()) {const r=await b.boundingBox(); assert.ok(r.width>=56&&r.height>=56,`action button is at least 56 px: ${r.width}x${r.height}`);}
      assert.equal(await page.locator('.squad-formation,[data-testid="squad-formation-toggle"]').count(),0);
      // Shop cards carry a small picture of the toy and its rarity colour (common = grey).
      const tin=await picture(1), bot=await picture(4);
      assert.equal(tin.src,'data:image/png;base64,'); assert.ok(tin.share>0.08&&tin.share<0.9&&tin.colours>=4,`toy picture looks rendered: ${JSON.stringify(tin)}`);
      assert.ok(bot.share>0.08&&bot.colours>=3); assert.notEqual(await page.locator('[data-testid="squad-buy-1"] img').getAttribute('src'),await page.locator('[data-testid="squad-buy-4"] img').getAttribute('src'));
      assert.deepEqual(await card(1),{rarity:'Common',border:'rgb(169, 166, 174)'});
      assert.deepEqual(await shopFits(),FITS);
      // Trait symbols: on the shop card, and for the deployed soldier in the column at the side. Tapping one opens its details.
      assert.deepEqual(await page.locator('[data-testid="squad-buy-1"] svg[data-trait]').evaluateAll(a=>a.map(e=>e.dataset.trait)),['Tin','Vanguard']);
      assert.deepEqual(await page.locator('[data-testid="squad-traits"] button').evaluateAll(a=>a.map(e=>e.dataset.testid+' '+e.textContent).sort()),['squad-trait-Tin 1/2','squad-trait-Vanguard 1/2']);
      const column=await page.getByTestId('squad-traits').boundingBox(); assert.ok(column.x<80,'trait column sits at the left edge'); await size56('squad-trait-Tin');
      await click('squad-trait-Tin'); await page.getByTestId('squad-trait-detail').waitFor({state:'visible'});
      assert.match(await page.getByTestId('squad-trait-detail').textContent(),/Tin.*armour.*1 different Tin toy.*Tin Soldier.*Bottle-cap Captain/s); await size56('squad-trait-close');
      await page.screenshot({path:path.join(out,`toysquad-${layout}-trait.png`)});
      await click('squad-trait-close'); await page.getByTestId('squad-trait-detail').waitFor({state:'detached'});
      if(!mobile) { // Escape closes the panel instead of pausing.
        await click('squad-trait-Vanguard'); await page.getByTestId('squad-trait-detail').waitFor({state:'visible'});
        await page.keyboard.press('Escape'); await page.getByTestId('squad-trait-detail').waitFor({state:'detached'}); assert.equal(await page.locator('.pause').count(),0);
      }
      // Toy Handbook: all 62 toys, filters, and a star that is saved and then shown on the shop card.
      await size56('squad-handbook-open'); await click('squad-handbook-open'); await page.getByTestId('squad-handbook').waitFor({state:'visible'});
      assert.equal(await page.locator('.squad-handbook__list li').count(),62);
      await click('squad-filter-rarity-Legendary'); await page.waitForFunction(()=>document.querySelectorAll('.squad-handbook__list li').length===7);
      await click('squad-filter-trait-Clockwork'); await page.waitForFunction(()=>document.querySelectorAll('.squad-handbook__list li').length===2);
      assert.match(await page.locator('.squad-handbook__list').textContent(),/Grandfather Gear.*Infinity Jack/s);
      await click('squad-filter-trait-Clockwork'); await click('squad-filter-rarity-Legendary'); await click('squad-filter-rarity-Common');
      await page.waitForFunction(()=>document.querySelectorAll('.squad-handbook__list li').length===16);
      await page.waitForFunction(()=>{const i=document.querySelector('[data-testid="squad-handbook-hare"] img'); return !!i&&i.complete&&i.naturalWidth>0;});
      assert.deepEqual(await page.locator('[data-testid="squad-handbook-hare"] svg[data-trait]').evaluateAll(a=>a.map(e=>e.dataset.trait)),['Felt','Ranger']);
      await size56('squad-star-hare'); await size56('squad-handbook-close');
      assert.equal(await page.getByTestId('squad-star-hare').getAttribute('aria-pressed'),'false');
      await click('squad-star-hare'); await page.waitForFunction(()=>document.querySelector('[data-testid="squad-star-hare"]').getAttribute('aria-pressed')==='true');
      await page.waitForFunction(()=>JSON.parse(localStorage.getItem('toybox-trials:prototype:v1')).state.squadFavourites?.join()==='hare');
      await page.screenshot({path:path.join(out,`toysquad-${layout}-handbook.png`)});
      await click('squad-handbook-close'); await page.getByTestId('squad-handbook').waitFor({state:'detached'});
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
      // The remaining soldier offers show the copy now owned at two stars.
      await page.waitForFunction(()=>document.querySelector('[data-testid="squad-owned-2"]')?.dataset.owned==='2:1');
      await click('squad-buy-2'); await page.waitForFunction(()=>window.__toybox.match.state().players[0].units.length===2);
      await page.waitForFunction(()=>document.querySelector('[data-testid="squad-owned-3"]')?.dataset.owned==='1:1,2:1');
      assert.match(await page.getByTestId('squad-buy-3').textContent(),/Owned.*1 at 1 star, 1 at 2 stars.*Auto-upgrade → 3 stars/);
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
      // Tapping a toy selects it: Sell names it and shows the refund.
      assert.equal(await page.getByTestId('squad-sell').isDisabled(),false); assert.match(await page.getByTestId('squad-sell').textContent(),/\+1c.*Paper Medic/);
      await page.keyboard.press('KeyQ'); await page.waitForFunction(()=>window.__toybox.match.state().players[0].units.length===3);
      await page.waitForFunction(()=>document.querySelector('[data-testid="squad-sell"]').disabled);
      // Rarity colours on the cards: grey, green, blue, purple, yellow.
      await page.evaluate(()=>{window.__toybox.match.state().players[0].shop=['hare','cap-captain','clockwork-bear','brass-behemoth','infinity-jack'];});
      await page.waitForFunction(()=>document.querySelector('[data-testid="squad-buy-4"]').dataset.rarity==='Legendary');
      assert.deepEqual([await card(0),await card(1),await card(2),await card(3),await card(4)],[{rarity:'Common',border:'rgb(169, 166, 174)'},{rarity:'Uncommon',border:'rgb(137, 183, 138)'},
        {rarity:'Rare',border:'rgb(107, 167, 200)'},{rarity:'Epic',border:'rgb(154, 120, 201)'},{rarity:'Legendary',border:'rgb(239, 174, 69)'}]);
      for(const slot of [0,1,2,3,4]) assert.ok((await picture(slot)).share>0.08);
      assert.deepEqual(await shopFits(),FITS);
      // The hare starred in the handbook carries a star on its card; the hare already on the board shows as owned.
      assert.equal(await page.getByTestId('squad-fav-0').count(),1); assert.equal(await page.locator('[data-testid^="squad-fav-"]').count(),1);
      assert.equal(await page.getByTestId('squad-owned-0').getAttribute('data-owned'),'1:1');
      await page.screenshot({path:path.join(out,`toysquad-${layout}-shop.png`)});
      // Two more toys land in the reserves (the board is full at level 1).
      await page.evaluate(()=>{window.__toybox.match.state().players[0].shop=['felt-fox','rubber-frog',null,null,null];});
      await page.waitForFunction(()=>document.querySelector('[data-testid="squad-buy-1"]').textContent.includes('Rubber Frog'));
      await click('squad-buy-0'); await page.waitForFunction(()=>window.__toybox.match.state().players[0].units.length===4);
      await click('squad-buy-1'); await page.waitForFunction(()=>window.__toybox.match.state().players[0].units.length===5);
      assert.deepEqual((await state()).players[0].units.slice(-2).map(u=>[u.kind,u.cell]),[['felt-fox',-1],['rubber-frog',-2]]);
      // Sell button: select the fox, sell it for the quoted refund.
      const fox=await page.evaluate(()=>window.__toybox.squad.point(0,8.65,1.4)), purse=(await state()).players[0].coins;
      if(mobile) await page.touchscreen.tap(fox.x,fox.y); else await page.mouse.click(fox.x,fox.y);
      await page.waitForFunction(()=>/\+1c.*Felt Fox/.test(document.querySelector('[data-testid="squad-sell"]').textContent));
      // The details of the selected toy have a Close button; closing clears the selection.
      await page.waitForFunction(()=>document.querySelector('[data-testid="squad-kit"]')?.textContent.includes('Felt Fox')); await size56('squad-kit-close');
      assert.deepEqual(await page.locator('[data-testid="squad-kit"] svg[data-trait]').evaluateAll(a=>a.map(e=>e.dataset.trait)),['Felt','Trickster']);
      await page.screenshot({path:path.join(out,`toysquad-${layout}-details.png`)});
      await click('squad-kit-close'); await page.getByTestId('squad-kit').waitFor({state:'detached'});
      await page.waitForFunction(()=>document.querySelector('[data-testid="squad-sell"]').disabled);
      if(mobile) await page.touchscreen.tap(fox.x,fox.y); else await page.mouse.click(fox.x,fox.y);
      await page.waitForFunction(()=>/\+1c.*Felt Fox/.test(document.querySelector('[data-testid="squad-sell"]').textContent));
      await click('squad-sell'); await page.waitForFunction(()=>window.__toybox.match.state().players[0].units.length===4);
      assert.equal((await state()).players[0].coins,purse+1); assert.equal((await state()).players[0].units.some(u=>u.kind==='felt-fox'),false);
      await page.waitForFunction(()=>document.querySelector('[data-testid="squad-sell"]').disabled);
      // Drag-to-sell: the frog is dragged from its reserve slot onto the shop dock.
      await dragToShop(-2,`toysquad-${layout}-selldrop.png`); await page.waitForFunction(()=>window.__toybox.match.state().players[0].units.length===3);
      assert.equal((await state()).players[0].coins,purse+2); assert.equal((await state()).players[0].units.some(u=>u.kind==='rubber-frog'),false);
      await drag(0,7,7); await page.waitForFunction(()=>window.__toybox.match.state().players[0].units[0].cell===31);
      await drag(31,2,2); await page.waitForTimeout(150); assert.equal((await state()).players[0].units[0].cell,31);
      await drag(31,0,4); await page.waitForFunction(()=>window.__toybox.match.state().players[0].units[0].cell===0);
      if(!mobile) {
        // Keyboard play without the old drawer: F picks the next toy, the arrow keys move it one square.
        const cells=()=>page.evaluate(()=>window.__toybox.match.state().players[0].units.map(u=>u.cell).join());
        const before=await cells(); await page.keyboard.press('KeyF');
        await page.waitForFunction(()=>!document.querySelector('[data-testid="squad-sell"]').disabled);
        await page.keyboard.press('ArrowDown'); await page.waitForFunction(b=>window.__toybox.match.state().players[0].units.map(u=>u.cell).join()!==b,before);
        const moved=await cells(); await page.keyboard.press('ArrowUp'); await page.waitForFunction(b=>window.__toybox.match.state().players[0].units.map(u=>u.cell).join()!==b,moved);
        assert.equal(await cells(),before);
      }
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
      await page.evaluate(()=>{window.__toybox.match.timeScale(0); for(const u of window.__toybox.match.state().battles.find(b=>b.owner==='you').fighters){u.hp=u.maxHp=500;u.shield=0;u.magic.mana=u.magic.maxMana;} window.__toybox.match.timeScale(1);});
      // Damage overview, on the right: open on desktop, folded into a tab on phones so it never covers the board.
      if(mobile) { await page.getByTestId('squad-damage-open').waitFor({state:'visible'}); assert.equal(await page.getByTestId('squad-damage').count(),0); await size56('squad-damage-open'); await click('squad-damage-open'); }
      await page.getByTestId('squad-damage').waitFor({state:'visible'});
      await page.waitForFunction(()=>window.__toybox.match.state().battles.find(b=>b.owner==='you').attacks.some(a=>a.spell));
      await page.waitForFunction(()=>window.__toybox.match.state().battles.find(b=>b.owner==='you').damages.length>0);
      // A row flashes when that toy lands a hit.
      await page.waitForSelector('[data-testid="squad-damage"] li.is-hit');
      await page.evaluate(()=>window.__toybox.match.timeScale(0));
      assert.ok((await state()).battles.find(b=>b.owner==='you').fighters[0].magic.casts>0);
      const damageRowsShown = () => page.evaluate(()=>[...document.querySelectorAll('[data-testid="squad-damage"] li')].map(li=>Number(li.dataset.value)));
      const tally = mode => page.evaluate(m=>window.__toybox.match.state().battles.find(b=>b.owner==='you').fighters.filter(u=>u.side===0).map(u=>u.stats[m]).sort((a,b)=>b-a),mode);
      await page.waitForFunction(()=>{const s=window.__toybox.match.state().battles.find(b=>b.owner==='you').fighters.filter(u=>u.side===0).map(u=>u.stats.dealt).sort((a,b)=>b-a).join(); return [...document.querySelectorAll('[data-testid="squad-damage"] li')].map(li=>li.dataset.value).join()===s;});
      const dealt=await damageRowsShown(); assert.deepEqual(dealt,await tally('dealt')); assert.ok(dealt[0]>0,'the overview lists real damage, highest first');
      const panel=await page.getByTestId('squad-damage').boundingBox(), railBox=await page.getByTestId('player-rail').boundingBox();
      assert.ok(panel.x+panel.width<=railBox.x+2&&panel.x+panel.width>=railBox.x-24,'damage overview sits at the right, beside the player rail');
      await page.screenshot({path:path.join(out,`toysquad-${layout}-damage.png`)});
      await click('squad-damage-taken'); await page.waitForFunction(()=>document.querySelector('[data-testid="squad-damage"]').dataset.mode==='taken');
      await page.waitForFunction(()=>{const s=window.__toybox.match.state().battles.find(b=>b.owner==='you').fighters.filter(u=>u.side===0).map(u=>u.stats.taken).sort((a,b)=>b-a).join(); return [...document.querySelectorAll('[data-testid="squad-damage"] li')].map(li=>li.dataset.value).join()===s;});
      await page.screenshot({path:path.join(out,`toysquad-${layout}-damage-taken.png`)});
      await click('squad-damage-dealt'); await size56('squad-damage-close');
      if(mobile) { await click('squad-damage-close'); await page.getByTestId('squad-damage-open').waitFor({state:'visible'}); }

      // ── debuff badges over fighters (the shared status icons) ──
      await page.evaluate(()=>{window.__toybox.match.timeScale(0); const b=window.__toybox.match.state().battles.find(x=>x.owner==='you'); const [a,c]=b.fighters.filter(u=>u.side===1&&u.hp>0); a.poison=3; a.stunnedUntil=b.tick+3; if(c) c.magic.markedUntil=b.tick+3;});
      await page.waitForFunction(()=>{const k=window.__toybox.squadStatus.byKind(); return k.poison>=1&&k.stun>=1;});
      const sq=await page.evaluate(()=>window.__toybox.squadStatus.byKind()); assert.ok(sq.poison>=1&&sq.stun>=1,`badges: ${JSON.stringify(sq)}`);
      await page.screenshot({path:path.join(out,`toysquad-${layout}-badges.png`)});
      // ── the player rail: standings order, compact on phones, tap a player to view their battle ──
      const railOrder=()=>page.evaluate(()=>[...document.querySelectorAll('[data-testid="player-rail"] li button')].map(b=>b.dataset.testid.slice(5)));
      const standing=await page.evaluate(()=>window.__toybox.match.state().players.slice().sort((a,b)=>b.points-a.points||b.health-a.health).map(p=>p.id));
      assert.deepEqual(await railOrder(),standing);
      assert.equal(await page.locator('.squad-scoreboard').count(),0,'the old standings box is gone');
      const other=standing.find(id=>id!=='you'); await size56(`rail-${other}`);
      if(mobile) assert.ok(railBox.width<=80,`the rail is compact on phones: ${railBox.width}px`);
      if(layout==='desktop') { await page.getByTestId(`rail-${other}`).focus(); await page.keyboard.press('Enter'); } else await click(`rail-${other}`);
      await page.getByTestId('watch-banner').waitFor(); await size56('watch-back');
      if(mobile) await click('squad-damage-open');
      // The damage overview now lists the viewed player's squad.
      await page.waitForFunction(o=>{const s=window.__toybox.match.state().battles.find(b=>b.owner===o).fighters.filter(u=>u.side===0).map(u=>u.stats.dealt).sort((a,b)=>b-a).join(); return [...document.querySelectorAll('[data-testid="squad-damage"] li')].map(li=>li.dataset.value).join()===s;},other);
      await page.screenshot({path:path.join(out,`toysquad-${layout}-rail-view.png`)});
      if(mobile) await click('squad-damage-close');
      if(layout==='desktop') await page.keyboard.press('Escape'); else await click('watch-back');
      await page.getByTestId('watch-banner').waitFor({state:'detached'});
      // After the battle, every row marks how that player's match went.
      await page.evaluate(()=>window.__toybox.match.timeScale(30));
      await page.waitForFunction(()=>window.__toybox.match.state().phase==='recap'||window.__toybox.match.state().round>1);
      await page.evaluate(()=>window.__toybox.match.timeScale(0));
      await page.waitForFunction(()=>[...document.querySelectorAll('[data-testid="player-rail"] li button')].every(b=>['win','loss','draw'].includes(b.dataset.result)));
      await page.screenshot({path:path.join(out,`toysquad-${layout}-rail-results.png`)});
      await page.evaluate(()=>window.__toybox.match.timeScale(1));
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
          // The choice is a centred modal over a blurred board, and it blocks everything else until one is picked.
          const modal=page.getByTestId('squad-passive-modal'); await modal.waitFor({state:'visible'});
          assert.equal(await modal.locator('button').count(),3);
          if(round===3) {
            await page.screenshot({path:path.join(out,`toysquad-${layout}-passive.png`)});
            const look=await page.evaluate(()=>{const m=document.querySelector('[data-testid="squad-passive-modal"]'),c=m.firstElementChild.getBoundingClientRect(),st=getComputedStyle(m);
              const covered=[...document.querySelectorAll('.squad-workbench button')].every(b=>{const r=b.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2); return !hit||!!hit.closest('[data-testid="squad-passive-modal"]');});
              return {blur:(st.backdropFilter||st.webkitBackdropFilter||''),dx:Math.abs(c.x+c.width/2-innerWidth/2),dy:Math.abs(c.y+c.height/2-innerHeight/2),inside:c.x>=0&&c.y>=0&&c.right<=innerWidth&&c.bottom<=innerHeight,covered,
                small:[...m.querySelectorAll('button')].some(b=>{const r=b.getBoundingClientRect(); return r.width<56||r.height<56;})};});
            assert.match(look.blur,/blur/); assert.ok(look.dx<3&&look.dy<3&&look.inside,`modal is centred and on screen: ${JSON.stringify(look)}`); assert.equal(look.covered,true); assert.equal(look.small,false);
            await page.keyboard.press('KeyR'); await page.keyboard.press('KeyE'); await page.keyboard.press('KeyQ');
            await page.waitForFunction(t=>window.__toybox.match.state().t>=t+400,s.t);
            const held=(await state()).players[0]; assert.equal(held.coins,p.coins); assert.equal(held.ready,false); assert.equal(held.units.length,p.units.length); assert.equal(held.passives.length,0);
          }
          await click(`squad-passive-${p.passiveOffers[0]}`);
          await page.waitForFunction(n=>window.__toybox.match.state().players[0].passives.length===n,round/3);
          await modal.waitFor({state:'detached'});
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
      assert.deepEqual(errors,[]); console.log(`PASS Toy Squad ${layout}: five offers fit without scrolling, shop pictures, rarity colours, trait symbols and trait details, Toy Handbook stars, owned 1/2-star copies, details Close, Sell button, drag-to-sell, keyboard placement, blocking passive modal, hover kit explanations, Q/R/E shortcuts, physical reserve dragging/swaps, automatic 2→3-star merges, upgrade highlights, auto-cast mana/spell particles, five-slot shop, reroll, damage numbers, ten levels/rounds, passive choices 3/6/9, records, restart and hub return; no console/page errors`);
      await page.close();
    }
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
