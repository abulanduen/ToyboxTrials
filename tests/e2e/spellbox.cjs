/* Build selection and actual keyboard/mouse/touch casting, damage knockback, ring-out and host lifecycle. */
const{chromium}=require('playwright');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const out=path.join(__dirname,'output');fs.mkdirSync(out,{recursive:true});
(async()=>{const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{for(const layout of(process.env.SPELLBOX_LAYOUTS||'desktop,portrait,landscape').split(',')){
  const mobile=layout!=='desktop',viewport=layout==='portrait'?{width:390,height:844}:layout==='landscape'?{width:844,height:390}:{width:1280,height:800};
  const page=await browser.newPage({viewport,hasTouch:mobile,isMobile:mobile});page.setDefaultTimeout(90000);const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.addInitScript(()=>localStorage.setItem('toybox-trials:prototype:v1',JSON.stringify({state:{quality:'low'},version:0})));
  const state=()=>page.evaluate(()=>window.__toybox.match.state());const click=async id=>mobile?page.getByTestId(id).tap():page.getByTestId(id).click();
  const aim=async(x,z)=>{const p=await page.evaluate(v=>window.__toybox.spellbox.point(v.x,v.z),{x,z});if(mobile)await page.touchscreen.tap(p.x,p.y);else await page.mouse.move(p.x,p.y);};
  const cast=async slot=>{if(mobile)await click(`spellbox-cast-${slot}`);else await page.keyboard.press(['KeyQ','KeyE','KeyR'][slot]);};
  await page.goto((process.env.BASE_URL||'http://127.0.0.1:4174/')+'?debug#play');await page.waitForSelector('.loading',{state:'detached'});await page.evaluate(()=>window.__toybox.teleport(0,-12.6,Math.PI));await page.waitForSelector('.prompt');if(mobile)await page.locator('.prompt').tap();else await page.keyboard.press('KeyE');
  await click('practice-spellbox-showdown');await page.waitForTimeout(800);await click('match-start');await page.waitForFunction(()=>window.__toybox.match.phase()==='playing');
  await page.evaluate(()=>window.__toybox.match.timeScale(.25));await click('spellbox-slot-2');await click('spellbox-equip-repair-stitches');await click('spellbox-slot-1');await click('spellbox-equip-marble-burst');
  await page.waitForFunction(()=>window.__toybox.match.state().players[0].build.join(',')==='pop-rocket,marble-burst,repair-stitches');
  await page.screenshot({path:path.join(out,`spellbox-${layout}-draft.png`)});await click('spellbox-ready');await page.evaluate(()=>window.__toybox.match.timeScale(1));await page.waitForFunction(()=>window.__toybox.match.state().phase==='arena');
  // Keep a visible target stationary while real input adapters launch and resolve a rocket.
  await page.evaluate(()=>{const s=window.__toybox.match.state();Object.assign(s.players[0],{x:-4,z:0,vx:0,vz:0,moveX:0,moveZ:0,angle:Math.PI/2});s.players.slice(1).forEach((p,i)=>Object.assign(p,{x:i===0?4:-10,z:i===0?0:i*5-8,vx:0,vz:0,moveX:0,moveZ:0,cast:null,stunnedUntil:1e9,nextAction:1e9,cooldowns:[1e9,1e9,1e9]}));});
  const x=(await state()).players[0].x;if(mobile)await page.getByRole('button',{name:'Right',exact:true}).tap();else await page.keyboard.press('KeyD');await page.waitForFunction(x=>window.__toybox.match.state().players[0].x>x,x);
  await aim(11,0);await cast(0);await page.waitForFunction(()=>{const s=window.__toybox.match.state();if(s.players[1].damage>0){window.__toybox.match.timeScale(0);return true;}return false;});
  let s=await state();assert.equal(s.players[1].damage,14);assert.ok(s.players[1].vx>0);assert.equal(s.players[0].casts,1);assert.equal(await page.getByTestId('spellbox-cast-0').isDisabled(),true);
  const sizes=await page.locator('.spellbox-casts button').evaluateAll(buttons=>buttons.map(b=>b.getBoundingClientRect().height));assert.ok(sizes.every(h=>h>=56));
  await page.screenshot({path:path.join(out,`spellbox-${layout}-hit.png`)});
  await page.evaluate(()=>window.__toybox.match.timeScale(1));await page.getByRole('button',{name:'Pause',exact:true}).click();await page.waitForSelector('.pause');const t=(await state()).t;await page.waitForTimeout(250);assert.equal((await state()).t,t);await page.keyboard.press('Escape');await page.waitForSelector('.pause',{state:'detached'});
  await page.evaluate(()=>{const p=window.__toybox.match.state().players[0];p.damage=80;p.cooldowns[2]=0;p.nextAction=0;p.stunnedUntil=0;p.vx=p.vz=0;});await cast(2);await page.waitForFunction(()=>window.__toybox.match.state().players[0].damage===60);
  // Cast slot E as an AoE shot, then finish with a high-damage ring-out through the actual rules.
  await page.evaluate(()=>{const s=window.__toybox.match.state();const p=s.players[0];p.cooldowns[1]=0;p.nextAction=0;p.cast=null;p.stunnedUntil=0;s.players[1].stunnedUntil=1e9;});await aim(10,0);await cast(1);await page.waitForFunction(()=>window.__toybox.match.state().players[0].casts>=3);
  await page.evaluate(()=>{const s=window.__toybox.match.state(),p=s.players[0],q=s.players[1];Object.assign(p,{x:8,z:0,vx:0,vz:0,moveX:0,moveZ:0,angle:Math.PI/2,cast:null,nextAction:0,stunnedUntil:0,cooldowns:[0,0,0]});Object.assign(q,{x:14.3,z:0,vx:0,vz:0,moveX:0,moveZ:0,damage:100,cast:null,stunnedUntil:1e9});s.projectiles=[];s.players.slice(2).forEach(p=>{p.alive=false;p.outAt=s.t;});});
  await aim(14.8,0);if(mobile)await cast(0);else{const p=await page.evaluate(()=>window.__toybox.spellbox.point(14.8,0));await page.mouse.click(p.x,p.y);}
  await page.waitForFunction(()=>!window.__toybox.match.state().players[1].alive);assert.equal((await state()).players[0].alive,true);await page.waitForSelector('.results');
  const record=await page.evaluate(()=>JSON.parse(localStorage.getItem('toybox-trials:prototype:v1')).state.records['spellbox-showdown']);assert.equal(record.plays,1);
  await page.waitForTimeout(800);await click('results-again');await page.waitForFunction(()=>window.__toybox.match.phase()==='playing');assert.equal((await state()).phase,'draft');assert.equal((await state()).players[0].damage,0);
  await page.getByRole('button',{name:'Pause',exact:true}).click();await page.waitForTimeout(800);await page.locator('.pause__actions .toy-btn').nth(1).click();await page.waitForSelector('.hud-sign');
  assert.deepEqual(errors,[]);console.log(`PASS Spellbox ${layout}: draft/equip, movement/aim, Q/E/R and click/touch casts, projectile damage/knockback, cooldowns, repair, ring-out, pause, results, record, restart, hub return; no console/page errors`);await page.close();
}}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
