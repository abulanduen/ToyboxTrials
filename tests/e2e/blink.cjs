/* Real keyboard/mouse and touch adapters, visible wind-up/cancel/dodge, records and host cleanup. */
const {chromium}=require('playwright');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const out=path.join(__dirname,'output');fs.mkdirSync(out,{recursive:true});
(async()=>{
  const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try {for(const layout of (process.env.BLINK_LAYOUTS||'desktop,portrait,landscape').split(',')){
    const mobile=layout!=='desktop',viewport=layout==='portrait'?{width:390,height:844}:layout==='landscape'?{width:844,height:390}:{width:1280,height:800};
    const page=await browser.newPage({viewport,hasTouch:mobile,isMobile:mobile});page.setDefaultTimeout(90000);
    const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.addInitScript(()=>localStorage.setItem('toybox-trials:prototype:v1',JSON.stringify({state:{quality:'low',tutorials:false},version:0})));
    const state=()=>page.evaluate(()=>window.__toybox.match.state());
    const click=async id=>mobile?page.getByTestId(id).tap():page.getByTestId(id).click();
    const aim=async(x,z)=>{const p=await page.evaluate(v=>window.__toybox.blink.point(v.x,v.z),{x,z});if(mobile)await page.touchscreen.tap(p.x,p.y);else await page.mouse.move(p.x,p.y);};
    await page.goto((process.env.BASE_URL||'http://localhost:4173/')+'?debug#play');await page.waitForSelector('.loading',{state:'detached'});
    await page.evaluate(()=>window.__toybox.hub.goTo('pavilion'));await page.waitForSelector('.prompt');if(mobile)await page.locator('.prompt').tap();else await page.keyboard.press('KeyE');
    await click('practice-blink-duel');await page.getByTestId('match-start').waitFor({state:'visible'});await page.waitForTimeout(900);await click('match-start');await page.waitForFunction(()=>window.__toybox.match.phase()==='countdown');await page.evaluate(()=>window.__toybox.match.timeScale(10));await page.waitForFunction(()=>window.__toybox.match.phase()==='playing');await page.evaluate(()=>window.__toybox.match.timeScale(1));
    await page.evaluate(()=>{const s=window.__toybox.match.state();Object.assign(s.players[0],{x:0,z:0,angle:Math.PI/2,aimX:1,aimZ:0});s.players.slice(1).forEach((p,i)=>Object.assign(p,{x:-12,z:-12+i*4,moveX:0,moveZ:0,attack:{x:-12,z:-12+i*4,angle:Math.PI,start:s.t,until:1e9}}));});
    if(mobile)await page.getByRole('button',{name:'Right',exact:true}).tap();else await page.keyboard.press('KeyD');
    await page.waitForFunction(()=>Math.abs(window.__toybox.match.state().players[0].angle-Math.PI/2)<.1);
    for(let n=1;n<=2;n++){if(mobile)await click('blink-blink');else await page.keyboard.press('Space');await page.waitForFunction(n=>window.__toybox.match.state().players[0].blinks===n,n);}
    assert.ok((await state()).players[0].x>14);assert.equal(await page.getByTestId('blink-blink').isDisabled(),false);
    await page.getByRole('button',{name:'Pause',exact:true}).click();await page.waitForSelector('.pause');const t=(await state()).t;await page.waitForTimeout(250);assert.equal((await state()).t,t);await page.keyboard.press('Escape');await page.waitForSelector('.pause',{state:'detached'});
    await page.evaluate(()=>{const s=window.__toybox.match.state(),p=s.players[0];Object.assign(p,{x:0,z:0,moveX:0,moveZ:0,angle:0,aimX:0,aimZ:1,nextAttack:0,attack:null});});
    await aim(0,10);if(mobile)await click('blink-attack');else await page.keyboard.press('KeyJ');
    await page.waitForFunction(()=>!!window.__toybox.match.state().players[0].attack);await page.evaluate(()=>window.__toybox.match.timeScale(0));
    assert.equal((await state()).players.filter(p=>p.alive).length,(await state()).players.length);
    await page.screenshot({path:path.join(out,`blink-${layout}-windup.png`)});
    // Steer a cancel blink sideways while the attack cone stays locked.
    await aim(-10,0);if(mobile)await click('blink-blink');else await page.keyboard.press('Space');await page.evaluate(()=>window.__toybox.match.timeScale(1));
    await page.waitForFunction(()=>{const p=window.__toybox.match.state().players[0];return !p.attack&&p.x<-7;});
    await page.evaluate(()=>window.__toybox.match.timeScale(0));await page.screenshot({path:path.join(out,`blink-${layout}-blink.png`)});
    // A corner target with a harmless outward wind-up cannot leave its endpoint. Real input lands one hit.
    await page.evaluate(()=>{const s=window.__toybox.match.state(),p=s.players[0],q=s.players[1];Object.assign(p,{x:14.95,z:10.8,angle:0,aimX:0,aimZ:1,moveX:0,moveZ:0,nextAttack:0,attack:null});Object.assign(q,{x:14.95,z:14.95,angle:0,moveX:0,moveZ:0,attack:{x:14.95,z:14.95,angle:0,start:s.t,until:1e9}});s.players.slice(2).forEach(p=>{p.alive=false;p.outAt=s.t;});window.__toybox.match.timeScale(1);});
    await aim(14.95,15.5);
    if(mobile)await click('blink-attack');else {const p=await page.evaluate(()=>window.__toybox.blink.point(14.95,15.5));await page.mouse.click(p.x,p.y);}
    await page.waitForFunction(()=>!window.__toybox.match.state().players[1].alive);assert.equal((await state()).players[0].alive,true);assert.equal((await state()).players[0].kills,1);
    await page.waitForSelector('.results');const record=await page.evaluate(()=>JSON.parse(localStorage.getItem('toybox-trials:prototype:v1')).state.records['blink-duel']);assert.equal(record.plays,1);
    await page.waitForTimeout(800);await click('results-again');await page.waitForFunction(()=>window.__toybox.match.phase()==='countdown');await page.evaluate(()=>window.__toybox.match.timeScale(10));await page.waitForFunction(()=>window.__toybox.match.phase()==='playing');await page.evaluate(()=>window.__toybox.match.timeScale(1));assert.equal((await state()).players[0].blinks,0);
    await page.getByRole('button',{name:'Pause',exact:true}).click();await page.waitForTimeout(800);await page.locator('.pause__actions .toy-btn').nth(1).click();await page.waitForSelector('.hud-sign');
    assert.deepEqual(errors,[]);console.log(`PASS Blink ${layout}: entry, movement, consecutive no-cooldown blinks, pause, locked wind-up, sideways cancel, one-hit elimination, results, record, restart, hub return; no console/page errors`);await page.close();
  }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
