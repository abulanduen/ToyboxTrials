/* Real keyboard/mouse and touch adapters, visible wind-up/cancel/dodge, records and host cleanup. */
const {chromium}=require('playwright');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const out=path.join(__dirname,'output');fs.mkdirSync(out,{recursive:true});
/** Hold the touch joystick (CDP touch point 1) pushed in a direction. While it is held, `tap(testId)` taps a
 *  button with a second finger (touch point 2), the way a phone player casts without letting go of the stick. */
async function holdStick(page,[dx,dy]){const cdp=await page.context().newCDPSession(page);const zone=await page.locator('.touch-stick-zone').boundingBox();const x=zone.x+zone.width*0.4,y=zone.y+zone.height*0.55;
  const stick=[x+dx*60,y+dy*60],send=(type,pts)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts.map(([px,py,id])=>({x:px,y:py,id}))});
  await send('touchStart',[[x,y,1]]);await send('touchMove',[[x+dx*20,y+dy*20,1]]);await send('touchMove',[[...stick,1]]);
  return{async tap(testId){const b=await page.getByTestId(testId).boundingBox(),bx=b.x+b.width/2,by=b.y+b.height/2;
      await send('touchStart',[[...stick,1],[bx,by,2]]);
      // touchEnd lifts only the fingers it lists: the stick stays down.
      await send('touchEnd',[[bx,by,2]]);},
    async release(){await send('touchEnd',[]);await cdp.detach();}};}
(async()=>{
  const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try {for(const layout of (process.env.BLINK_LAYOUTS||'desktop,portrait,landscape').split(',')){
    const mobile=layout!=='desktop',viewport=layout==='portrait'?{width:390,height:844}:layout==='landscape'?{width:844,height:390}:{width:1280,height:800};
    const page=await browser.newPage({viewport,hasTouch:mobile,isMobile:mobile});page.setDefaultTimeout(90000);
    const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.addInitScript(()=>localStorage.setItem('toybox-trials:prototype:v1',JSON.stringify({state:{tourSeen:true,quality:'low',tutorials:false},version:0})));
    const state=()=>page.evaluate(()=>window.__toybox.match.state());
    const click=async id=>mobile?page.getByTestId(id).tap():page.getByTestId(id).click();
    const aim=async(x,z)=>{const p=await page.evaluate(v=>window.__toybox.blink.point(v.x,v.z),{x,z});if(mobile)await page.touchscreen.tap(p.x,p.y);else await page.mouse.move(p.x,p.y);};
    await page.goto((process.env.BASE_URL||'http://localhost:4173/')+'?debug#play');await page.waitForSelector('.loading',{state:'detached'});
    await page.evaluate(()=>window.__toybox.hub.goTo('pavilion'));await page.waitForSelector('.prompt');if(mobile)await page.locator('.prompt').tap();else await page.keyboard.press('KeyE');
    await click('practice-group-party');await click('practice-blink-duel');await page.getByTestId('match-start').waitFor({state:'visible'});await page.waitForTimeout(900);await click('match-start');await page.waitForFunction(()=>window.__toybox.match.phase()==='countdown');await page.evaluate(()=>window.__toybox.match.timeScale(10));await page.waitForFunction(()=>window.__toybox.match.phase()==='playing');await page.evaluate(()=>window.__toybox.match.timeScale(1));
    await page.evaluate(()=>{const s=window.__toybox.match.state();Object.assign(s.players[0],{x:0,z:0,angle:Math.PI/2,aimX:1,aimZ:0});s.players.slice(1).forEach((p,i)=>Object.assign(p,{x:-12,z:-12+i*4,moveX:0,moveZ:0,attack:{x:-12,z:-12+i*4,angle:Math.PI,start:s.t,until:1e9}}));});
    if(mobile){
      // The floating joystick steers (no direction pads), and Blink fires with a second finger while the stick is held.
      assert.equal(await page.getByRole('button',{name:'Up',exact:true}).count(),0,'no direction pads');
      const stick=await holdStick(page,[1,0]);
      try{await page.waitForFunction(()=>Math.abs(window.__toybox.match.state().players[0].angle-Math.PI/2)<.1);
        for(let n=1;n<=2;n++){await stick.tap('blink-blink');await page.waitForFunction(n=>window.__toybox.match.state().players[0].blinks===n,n);}
        assert.ok((await state()).players[0].moveX>0,'still steering right after both blinks');}
      finally{await stick.release();}
    }else{
      await page.keyboard.press('KeyD');
      await page.waitForFunction(()=>Math.abs(window.__toybox.match.state().players[0].angle-Math.PI/2)<.1);
      for(let n=1;n<=2;n++){await page.keyboard.press('Space');await page.waitForFunction(n=>window.__toybox.match.state().players[0].blinks===n,n);}
    }
    assert.ok((await state()).players[0].x>14);assert.equal(await page.getByTestId('blink-blink').isDisabled(),false);
    await page.getByRole('button',{name:'Pause',exact:true}).click();await page.waitForSelector('.pause');const t=(await state()).t;await page.waitForTimeout(250);assert.equal((await state()).t,t);await page.keyboard.press('Escape');await page.waitForSelector('.pause',{state:'detached'});
    // Re-pin the bots too: their own AI has had a few seconds (longer on phones, holding the stick) to blink out of their locked swings.
    await page.evaluate(()=>{const s=window.__toybox.match.state(),p=s.players[0];Object.assign(p,{x:0,z:0,moveX:0,moveZ:0,angle:0,aimX:0,aimZ:1,nextAttack:0,attack:null});s.players.slice(1).forEach((q,i)=>Object.assign(q,{alive:true,outAt:-1,x:-12,z:-12+i*4,moveX:0,moveZ:0,nextAttack:1e9,attack:{x:-12,z:-12+i*4,angle:Math.PI,start:s.t,until:1e9}}));});
    await aim(0,10);if(mobile)await click('blink-attack');else await page.keyboard.press('KeyJ');
    await page.waitForFunction(()=>!!window.__toybox.match.state().players[0].attack);await page.evaluate(()=>window.__toybox.match.timeScale(0));
    {const st=await state();assert.equal(st.players.filter(p=>p.alive).length,st.players.length,JSON.stringify(st.players.map(p=>({id:p.id,alive:p.alive,x:+p.x.toFixed(1),z:+p.z.toFixed(1),outAt:p.outAt,kills:p.kills})))+' t='+st.t);}
    await page.screenshot({path:path.join(out,`blink-${layout}-windup.png`)});
    // Owner request, 21 Nov 2026: no hint box floats just above the Swing / Blink buttons (the controls are in How to play and on hover).
    assert.equal(await page.locator('.blink-hint').count(),0);
    assert.deepEqual(await page.evaluate(()=>{const c=document.querySelector('.blink-actions').getBoundingClientRect();return[...document.querySelectorAll('.blink-hud *')].filter(e=>!e.closest('.blink-actions,.blink-stick')).filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.bottom>c.top-140&&r.top<c.top&&r.right>c.left&&r.left<c.right;}).map(e=>e.className);}),[],'nothing over the band above the action buttons');
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
    assert.deepEqual(errors,[]);console.log(`PASS Blink ${layout}: entry, movement${mobile?' (joystick, blink with a second finger)':''}, consecutive no-cooldown blinks, pause, locked wind-up, sideways cancel, one-hit elimination, results, record, restart, hub return; no console/page errors`);await page.close();
  }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
