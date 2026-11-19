/* Actual effect mount checks at both blur-capable quality tiers, plus generated UI assets.
   One bot keeps the duel-size ring, which the camera centres (bigger rings follow the local toy). */
const{chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const out=path.join(__dirname,'output');fs.mkdirSync(out,{recursive:true});
(async()=>{const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{for(const quality of (process.env.ART_QUALITIES||'balanced,high').split(',')){const page=await browser.newPage({viewport:{width:1000,height:700},deviceScaleFactor:1});page.setDefaultTimeout(150000);const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.addInitScript(quality=>localStorage.setItem('toybox-trials:prototype:v1',JSON.stringify({state:{quality},version:0})),quality);
const effects=()=>page.evaluate(()=>window.__toybox.postprocessing.state());
await page.goto((process.env.BASE_URL||'http://localhost:4173/')+'?debug#play');await page.waitForSelector('.loading',{state:'detached'});await page.waitForFunction(()=>window.__toybox.postprocessing?.state().focusBlurMounted);assert.equal((await effects()).focusBlur,true);
await page.evaluate(()=>window.__toybox.hub.goTo('pavilion'));await page.waitForSelector('.prompt');await page.keyboard.press('KeyE');await page.getByTestId('practice-spellbox-showdown').click();await page.waitForTimeout(800);await page.getByRole('button',{name:'1 bot',exact:true}).click();await page.getByTestId('match-start').click();await page.waitForFunction(()=>window.__toybox.match.phase()==='playing');await page.evaluate(()=>window.__toybox.match.timeScale(0));
assert.equal((await effects()).focusBlur,false);assert.equal((await effects()).focusBlurMounted,false);
await page.waitForFunction(()=>Array.from(document.querySelectorAll('.spellbox-icon')).every(img=>img.complete&&img.naturalWidth===512));
await page.screenshot({path:path.join(out,`spellbox-${quality}-icon-draft.png`)});
await page.getByTestId('spellbox-ready').click();await page.evaluate(()=>window.__toybox.match.timeScale(1));await page.waitForFunction(()=>{if(window.__toybox.match.state().phase==='arena'){window.__toybox.match.timeScale(0);return true;}return false;});
// DOM/host state can advance before a software-rendered canvas has presented the new camera.
await page.waitForFunction(()=>{const p=window.__toybox.spellbox?.point(0,0);return p&&Math.abs(p.x-innerWidth/2)<5&&Math.abs(p.y-innerHeight/2)<30;});
await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
await page.waitForSelector('.spellbox-casts');await page.locator('.spellbox-casts img').evaluateAll(images=>Promise.all(images.map(img=>img.decode())));await page.screenshot({path:path.join(out,`spellbox-${quality}-sharp.png`)});
await page.getByRole('button',{name:'Pause',exact:true}).click();await page.waitForTimeout(800);await page.locator('.pause__actions .toy-btn').nth(1).click();await page.waitForSelector('.hud-sign');await page.waitForFunction(()=>window.__toybox.postprocessing.state().focusBlurMounted);assert.equal((await effects()).focusBlur,true);
assert.deepEqual(errors,[]);await page.close();console.log(`PASS ${quality}: icons decode, minigame focus blur unmounted, hub blur restored; no console/page errors`);}
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
