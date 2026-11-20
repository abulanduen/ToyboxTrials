/* Build selection (no host countdown before the draft), Blink, real keyboard/mouse/touch casting, damage knockback, audio cues, ring-out and host lifecycle. */
const{chromium}=require('playwright');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const out=path.join(__dirname,'output');fs.mkdirSync(out,{recursive:true});
/** Push the touch joystick (CDP touch events) in a direction until `until(arg)` holds, then let go. */
async function stickUntil(page,[dx,dy],until,arg){const cdp=await page.context().newCDPSession(page);const zone=await page.locator('.touch-stick-zone').boundingBox();const x=zone.x+zone.width*0.4,y=zone.y+zone.height*0.55;
  const send=(type,pts)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts.map(([px,py])=>({x:px,y:py,id:1}))});
  await send('touchStart',[[x,y]]);await send('touchMove',[[x+dx*20,y+dy*20]]);await send('touchMove',[[x+dx*60,y+dy*60]]);
  try{await page.waitForFunction(until,arg);}finally{await send('touchEnd',[]);await cdp.detach();}}
(async()=>{const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{for(const layout of(process.env.SPELLBOX_LAYOUTS||'desktop,portrait,landscape').split(',')){
  const mobile=layout!=='desktop',viewport=layout==='portrait'?{width:390,height:844}:layout==='landscape'?{width:844,height:390}:{width:1280,height:800};
  const page=await browser.newPage({viewport,hasTouch:mobile,isMobile:mobile});page.setDefaultTimeout(90000);const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.addInitScript(()=>localStorage.setItem('toybox-trials:prototype:v1',JSON.stringify({state:{tourSeen:true,quality:'low',tutorials:false},version:0})));
  const state=()=>page.evaluate(()=>window.__toybox.match.state());const click=async id=>mobile?page.getByTestId(id).tap():page.getByTestId(id).click();
  const aim=async(x,z)=>{const p=await page.evaluate(v=>window.__toybox.spellbox.point(v.x,v.z),{x,z});if(mobile)await page.touchscreen.tap(p.x,p.y);else await page.mouse.move(p.x,p.y);};
  const cast=async slot=>{if(mobile)await click(`spellbox-cast-${slot}`);else await page.keyboard.press(['KeyQ','KeyE','KeyR'][slot]);};
  await page.goto((process.env.BASE_URL||'http://localhost:4173/')+'?debug#play');await page.waitForSelector('.loading',{state:'detached'});await page.evaluate(()=>window.__toybox.hub.goTo('pavilion'));await page.waitForSelector('.prompt');if(mobile)await page.locator('.prompt').tap();else await page.keyboard.press('KeyE');
  await click('practice-group-party');await click('practice-spellbox-showdown');await page.getByTestId('match-start').waitFor({state:'visible'});await page.waitForTimeout(900);await page.getByRole('button',{name:'7 bots',exact:true}).click();// The host's 3-2-1 is skipped for Spellbox: Start opens the untimed draft at once. Watch for any countdown element appearing.
  await page.evaluate(()=>{window.__sawCountdown=false;new MutationObserver(()=>{if(document.querySelector('.countdown'))window.__sawCountdown=true;}).observe(document.body,{childList:true,subtree:true});});
  await click('match-start');await page.waitForFunction(()=>window.__toybox.match.phase()!=='intro');
  assert.equal(await page.evaluate(()=>window.__toybox.match.phase()),'playing','Start goes straight to playing');
  await page.getByTestId('spellbox-draft').waitFor({state:'visible'});
  {const v=await page.evaluate(()=>({saw:window.__sawCountdown,phase:window.__toybox.match.state().phase}));assert.equal(v.saw,false,'no host countdown before the draft');assert.equal(v.phase,'draft');}
  await page.evaluate(()=>window.__toybox.match.timeScale(.25));await click('spellbox-slot-2');await click('spellbox-equip-blink');await click('spellbox-slot-1');await click('spellbox-equip-pinwheel-storm');
  await page.waitForFunction(()=>window.__toybox.match.state().players[0].build.join(',')==='pop-rocket,pinwheel-storm,blink');
  await click('spellbox-slot-2');assert.match(await page.getByTestId('spellbox-stats-blink').textContent(),/7 cm blink · 5 damage · 11 push wave · 4\.2s cooldown · 0\.12s cast/);
  assert.equal(await page.getByTestId('spellbox-equip-blink').getAttribute('aria-pressed'),'true');
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('.spellbox-icon')).every(img=>img.complete&&img.naturalWidth===512));
  await page.screenshot({path:path.join(out,`spellbox-${layout}-draft-blink.png`),timeout:240000});
  const iconFiles=new Set();
  for(let slot=0;slot<3;slot++){
    await click(`spellbox-slot-${slot}`);
    await page.waitForFunction(()=>Array.from(document.querySelectorAll('.spellbox-icon')).every(img=>img.complete&&img.naturalWidth===512));
    (await page.locator('.spellbox-icon').evaluateAll(images=>images.map(img=>img.src))).forEach(src=>iconFiles.add(src));
  }
  assert.equal(iconFiles.size,9,'all nine production icons decode');assert.ok([...iconFiles].some(src=>src.endsWith('/blink.webp')),'Blink icon shown');await click('spellbox-slot-1');
  assert.equal(await page.locator('.spellbox-catalogue button').count(),3);assert.equal((await state()).radius,39);
  // No deadline: every bot locks in, yet the draft waits for the human well past the old 20-second limit.
  await page.evaluate(()=>window.__toybox.match.timeScale(10));
  await page.waitForFunction(()=>{const s=window.__toybox.match.state();if(s.t>=30000){window.__toybox.match.timeScale(0);return true;}return false;},null,{timeout:240000,polling:100});
  {const s=await state();assert.equal(s.phase,'draft');assert.equal(s.fightAt,-1);assert.equal(s.players[0].ready,false);assert.ok(s.players.slice(1).every(p=>p.ready),'bots lock in without a timer');}
  await page.waitForFunction(()=>document.querySelectorAll('[data-testid^="spellbox-lockin-"]').length===8&&document.querySelectorAll('[data-testid^="spellbox-lockin-"].ready').length===7);
  // A compact card centred over a blurred, dimmed arena; it never scrolls the page sideways or covers Pause.
  {const g=await page.evaluate(()=>{const card=document.querySelector('[data-testid=spellbox-draft]'),back=getComputedStyle(document.querySelector('[data-testid=spellbox-draft-backdrop]')),r=card.getBoundingClientRect(),pause=document.querySelector('.match-pause').getBoundingClientRect();
    return{l:r.left,r:r.right,t:r.top,b:r.bottom,w:r.width,h:r.height,vw:innerWidth,vh:innerHeight,blur:back.backdropFilter||back.webkitBackdropFilter,bg:back.backgroundColor,pageW:document.documentElement.scrollWidth,cardX:card.scrollWidth-card.clientWidth,
      pauseOnTop:document.elementFromPoint(pause.left+pause.width/2,pause.top+pause.height/2)?.closest('.match-pause')!==null,
      targets:[...card.querySelectorAll('button')].map(b=>{const q=b.getBoundingClientRect();return Math.min(q.width,q.height);})};});
   assert.match(g.blur,/blur\(\d/,'backdrop blurs the arena');assert.match(g.bg,/rgba\(.*0\.\d+\)/,'backdrop dims the arena');
   assert.ok(g.pageW<=g.vw&&g.cardX<=1,`no horizontal scroll (${g.pageW}/${g.vw}, card ${g.cardX})`);assert.ok(g.l>=0&&g.r<=g.vw&&g.t>=0&&g.b<=g.vh,'card inside the viewport');
   assert.ok(g.pauseOnTop,'Pause stays reachable above the draft');assert.ok(g.targets.every(n=>n>=56),`draft touch targets >= 56 px (${g.targets})`);
   if(!mobile){assert.ok(g.w<=724&&g.w<g.vw*.6,`desktop card is compact (${g.w}px)`);assert.ok(Math.abs((g.l+g.r)/2-g.vw/2)<2&&Math.abs((g.t+g.b)/2-g.vh/2)<g.vh*.08,'desktop card is centred');}}
  await page.screenshot({path:path.join(out,`spellbox-${layout}-draft.png`),timeout:240000});
  await page.evaluate(()=>window.__toybox.match.timeScale(.25));await click('spellbox-ready');
  await page.waitForFunction(()=>{const s=window.__toybox.match.state();if(s.fightAt>=0){window.__toybox.match.timeScale(0);return true;}return false;});
  assert.match(await page.getByTestId('spellbox-countdown').textContent(),/Fight in [123]/);assert.equal(await page.getByTestId('spellbox-ready').isDisabled(),true);
  await page.screenshot({path:path.join(out,`spellbox-${layout}-countdown.png`),timeout:240000});
  await page.evaluate(()=>window.__toybox.match.timeScale(1));await page.waitForFunction(()=>window.__toybox.match.state().phase==='arena');await page.waitForSelector('[data-testid=spellbox-draft-backdrop]',{state:'detached'});
  // Keep a visible target stationary while real input adapters launch and resolve a rocket.
  await page.evaluate(()=>{const s=window.__toybox.match.state();Object.assign(s.players[0],{x:-4,z:0,vx:0,vz:0,moveX:0,moveZ:0,angle:Math.PI/2});s.players.slice(1).forEach((p,i)=>Object.assign(p,{x:i===0?4:-10,z:i===0?0:i*5-8,vx:0,vz:0,moveX:0,moveZ:0,cast:null,stunnedUntil:1e9,nextAction:1e9,cooldowns:[1e9,1e9,1e9]}));});
  const x=(await state()).players[0].x;if(mobile){assert.equal(await page.getByRole('button',{name:'Up',exact:true}).count(),0,'no direction pads');await stickUntil(page,[1,0],x=>window.__toybox.match.state().players[0].x>x,x);}else await page.keyboard.press('KeyD');await page.waitForFunction(x=>window.__toybox.match.state().players[0].x>x,x);
  await aim(11,0);await cast(0);await page.waitForFunction(()=>{const s=window.__toybox.match.state();if(s.players[1].damage>0){window.__toybox.match.timeScale(0);return true;}return false;});
  let s=await state();assert.equal(s.players[1].damage,14);assert.ok(s.players[1].vx>0);assert.equal(s.players[0].casts,1);assert.equal(await page.getByTestId('spellbox-cast-0').isDisabled(),true);
  const sizes=await page.locator('.spellbox-casts button').evaluateAll(buttons=>buttons.map(b=>b.getBoundingClientRect().height));assert.ok(sizes.every(h=>h>=56));
  await page.screenshot({path:path.join(out,`spellbox-${layout}-hit.png`),timeout:240000});
  await page.evaluate(()=>window.__toybox.match.timeScale(1));await page.getByRole('button',{name:'Pause',exact:true}).click();await page.waitForSelector('.pause');const t=(await state()).t;await page.waitForTimeout(250);assert.equal((await state()).t,t);await page.keyboard.press('Escape');await page.waitForSelector('.pause',{state:'detached'});
  // Blink (R): place a bot just ahead, aim through it, cast with the real adapter. The toy teleports, stops beside the bot, and the shockwave pushes it away.
  await page.evaluate(()=>{const s=window.__toybox.match.state();s.projectiles=[];s.mines=[];Object.assign(s.players[0],{x:-6,z:0,vx:0,vz:0,moveX:0,moveZ:0,angle:Math.PI/2,cast:null,cooldowns:[1e9,1e9,0],nextAction:0,stunnedUntil:0});Object.assign(s.players[1],{x:3,z:0,vx:0,vz:0,moveX:0,moveZ:0,damage:30,cast:null,stunnedUntil:1e9});window.__toybox.match.timeScale(.25);});
  const heard=await page.evaluate(()=>window.__toybox.spellbox.audio());
  await aim(10,0);await cast(2);
  await page.waitForFunction(()=>{const s=window.__toybox.match.state(),w=s.effects.find(e=>e.kind==='wave');if(w&&s.t-w.at>=180){window.__toybox.match.timeScale(0);return true;}return false;},null,{timeout:240000,polling:'raf'});
  s=await state();{const me=s.players[0],bot=s.players[1];
   assert.ok(me.x>-1.5&&me.x<=3-2*s.config.bodyRadius+1e-6&&Math.abs(me.z)<.3,`Blink moved the toy ~7 cm toward the aim and stopped beside the bot (${me.x.toFixed(2)},${me.z.toFixed(2)})`);
   assert.equal(bot.damage,35,'shockwave damage');assert.ok(bot.vx>5,`shockwave pushed the bot outward (${bot.vx})`);assert.equal(me.damage,0);
   assert.deepEqual(['depart','trail','wave'].filter(k=>s.effects.some(e=>e.kind===k)),['depart','trail','wave']);assert.ok(me.cooldowns[2]>s.t,'Blink is on cooldown');}
  await page.screenshot({path:path.join(out,`spellbox-${layout}-blink.png`),timeout:240000});
  {const now=await page.evaluate(()=>window.__toybox.spellbox.audio()),n=c=>(now.byCue[c]??0)-(heard.byCue[c]??0);
   assert.ok(n('zip')>=1&&n('thump')>=1&&n('impact')>=1,`audio bus got zip/thump/impact (${JSON.stringify(now.byCue)})`);assert.equal(now.loudest.zip,1,'own Blink zip at full level');}
  // Repair (set on R through the debug state) still casts through the real adapter.
  await page.evaluate(()=>{const p=window.__toybox.match.state().players[0];p.build[2]='repair-stitches';p.damage=80;p.cooldowns[2]=0;p.nextAction=0;p.stunnedUntil=0;p.vx=p.vz=0;window.__toybox.match.timeScale(1);});await cast(2);await page.waitForFunction(()=>window.__toybox.match.state().players[0].damage===60);
  // Cast slot E as an AoE shot, then finish with a high-damage ring-out through the actual rules.
  await page.evaluate(()=>{const s=window.__toybox.match.state();const p=s.players[0];p.cooldowns[1]=0;p.nextAction=0;p.cast=null;p.stunnedUntil=0;s.players[1].stunnedUntil=1e9;});await aim(10,0);await cast(1);await page.waitForFunction(()=>window.__toybox.match.state().players[0].casts>=4);
  // Removing six contestants starts a full countdown to the two-player radius.
  await page.evaluate(()=>{const s=window.__toybox.match.state();s.projectiles=[];s.mines=[];s.players.slice(2).forEach(p=>{p.alive=false;p.outAt=s.t;});s.players.slice(0,2).forEach((p,i)=>Object.assign(p,{x:i?4:-4,z:0,vx:0,vz:0,moveX:0,moveZ:0,cast:null,stunnedUntil:1e9}));});
  await page.waitForFunction(()=>{if(window.__toybox.match.state().shrink){window.__toybox.match.timeScale(0);return true;}return false;});
  s=await state();assert.equal(s.radius,39);assert.equal(s.shrink.to,15);assert.ok(s.shrink.startsAt-s.t>=9800);await page.waitForSelector('[data-testid="spellbox-shrink"]');
  await page.screenshot({path:path.join(out,`spellbox-${layout}-shrink-warning.png`),timeout:240000});
  await aim(8,8);const aimScreen=await page.evaluate(()=>window.__toybox.spellbox.point(8,8));
  await page.evaluate(()=>window.__toybox.match.timeScale(5));
  await page.waitForFunction(()=>{const s=window.__toybox.match.state();if(s.shrink&&s.t>=s.shrink.startsAt-1000){window.__toybox.match.timeScale(0);return true;}return false;},null,{timeout:300000,polling:100});
  assert.equal((await state()).radius,39);const oldAngle=(await state()).players[0].angle;
  await page.evaluate(()=>window.__toybox.match.timeScale(10));
  await page.waitForFunction(()=>{const s=window.__toybox.match.state();if(s.radius===15&&!s.shrink){window.__toybox.match.timeScale(0);return true;}return false;});
  await page.waitForSelector('[data-testid="spellbox-shrink"]',{state:'detached'});
  const newAngle=(await state()).players[0].angle;
  // Mouse aim re-targets the ground point now under the (unmoved) cursor; touch keeps its chosen world point.
  {const me=(await state()).players[0],dAng=(a,b)=>Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)));
   if(!mobile){const g=await page.evaluate(c=>window.__toybox.spellbox.ground(c.x,c.y),aimScreen);assert.ok(g&&dAng(newAngle,Math.atan2(g.x-me.x,g.z-me.z))<.05,'mouse aim follows the pointer through the zoom');}
   else assert.ok(dAng(newAngle,Math.atan2(8-me.x,8-me.z))<.05&&Math.abs(newAngle-oldAngle)<.03,'touch keeps its chosen world target');}
  await page.screenshot({path:path.join(out,`spellbox-${layout}-duel-size.png`),timeout:240000});
  await page.evaluate(()=>{const s=window.__toybox.match.state(),p=s.players[0],q=s.players[1];Object.assign(p,{x:8,z:0,vx:0,vz:0,moveX:0,moveZ:0,angle:Math.PI/2,cast:null,nextAction:0,stunnedUntil:0,cooldowns:[0,0,0]});Object.assign(q,{x:14.3,z:0,vx:0,vz:0,moveX:0,moveZ:0,damage:100,cast:null,stunnedUntil:1e9});s.projectiles=[];window.__toybox.match.timeScale(1);});
  await aim(14.8,0);if(mobile)await cast(0);else{const p=await page.evaluate(()=>window.__toybox.spellbox.point(14.8,0));await page.mouse.click(p.x,p.y);}
  await page.waitForFunction(()=>!window.__toybox.match.state().players[1].alive);assert.equal((await state()).players[0].alive,true);await page.waitForSelector('.results');
  const record=await page.evaluate(()=>JSON.parse(localStorage.getItem('toybox-trials:prototype:v1')).state.records['spellbox-showdown']);assert.equal(record.plays,1);
  {const a=await page.evaluate(()=>window.__toybox.spellbox.audio());assert.ok(a.byCue.ringout>=1&&a.byCue.alarm>=1&&a.byCue.rocket>=1&&a.byCue.go>=1,`ring-out, shrink alarm, release and fight cues reached the bus (${JSON.stringify(a.byCue)})`);}
  await page.waitForTimeout(800);await page.evaluate(()=>{window.__sawCountdown=false;});await click('results-again');await page.waitForFunction(()=>window.__toybox.match.phase()==='playing');await page.getByTestId('spellbox-draft').waitFor({state:'visible'});assert.equal(await page.evaluate(()=>window.__sawCountdown),false,'Play again: no host countdown either');assert.equal((await state()).phase,'draft');assert.equal((await state()).players[0].damage,0);
  await page.getByRole('button',{name:'Pause',exact:true}).click();await page.waitForTimeout(800);await page.locator('.pause__actions .toy-btn').nth(1).click();await page.waitForSelector('.hud-sign');
  assert.deepEqual(errors,[]);console.log(`PASS Spellbox ${layout}: no host countdown before the draft (start and play again), nine icons, Blink picked and cast (teleport, stop beside a bot, shockwave push, trail/puff/wave effects, zip/thump/impact cues), three offers per button, untimed draft with centred blurred card, lock-in markers and fight countdown, eight-player arena, ten-second shrink warning, two-player arena, movement/aim, Q/E/R and click/touch casts, projectile damage/knockback, cooldowns, repair, ring-out, pause, results, record, restart, hub return; no console/page errors`);await page.close();
}}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
