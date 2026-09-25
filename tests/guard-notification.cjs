const assert=require('node:assert/strict'),fs=require('node:fs'),{spawn}=require('node:child_process');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require('C:/Users/ouan-dev/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const server=spawn(process.execPath,['server.cjs'],{env:{...process.env,PORT:'4190'},windowsHide:true,stdio:'pipe'});let browser;
(async()=>{
 await new Promise((ok,no)=>{server.stdout.once('data',ok);server.stderr.once('data',d=>no(Error(d)));});browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:4190/#home');await page.evaluate(()=>document.fonts.ready);
 fs.mkdirSync('.work/guard-notification',{recursive:true});
 for(const width of [320,390,460,1280]){await page.setViewportSize({width,height:844});const card=page.locator('#guard-notification');assert.equal(await card.locator('button').count(),4);assert(await card.evaluate(el=>el.scrollWidth<=el.clientWidth));for(const button of await card.locator('button').all()){const rect=await button.boundingBox();assert(rect.width>=44&&rect.height>=44);}await card.screenshot({path:'.work/guard-notification/notification-'+width+'.png'});}
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'ปิดการแจ้งเตือนสายเข้า',exact:true}).click();assert.equal(await page.locator('#guard-notification').count(),0);assert.match(page.url(),/#home$/);
 // Use commit to reset only the test call fixture.
 const ring=()=>page.evaluate(()=>{commit(()=>currentGuardCall().status='ringing');guardBannerDismissed=false;go('home');});
 await ring();await page.locator('#guard-notification [data-value="allow"]').click();assert.equal(await page.evaluate(()=>currentGuardCall().status),'allow');assert.match(page.url(),/#home$/);assert.equal(await page.locator('#guard-notification').count(),0);await page.reload();assert.equal(await page.evaluate(()=>currentGuardCall().status),'allow');
 await ring();await page.locator('#guard-notification [data-value="deny"]').click();assert.equal(await page.evaluate(()=>currentGuardCall().status),'deny');assert.match(page.url(),/#home$/);
 await ring();await page.getByRole('button',{name:'เปิดกล้อง',exact:true}).click();await page.waitForURL('**/#guard-call');assert.equal(await page.evaluate(()=>currentGuardCall().status),'active');assert.equal(await page.locator('#guard-notification').count(),0);
 await ring();await page.goto('http://localhost:4190/#estamp-reserve/PASS-001');assert.equal(await page.locator('#guard-notification').count(),1);await page.locator('#guard-notification [data-value="allow"]').click();assert.match(page.url(),/#estamp-reserve\/PASS-001$/);
 await ring();await page.evaluate(()=>{currentGuardCall().name='ผู้มาติดต่อชื่อยาวสำหรับทดสอบการตัดบรรทัดและปุ่มปิด';renderGuardNotification();});assert(await page.locator('#guard-notification').evaluate(el=>el.scrollWidth<=el.clientWidth));
 const identity=await page.locator('.guard-notice-identity').boundingBox();await page.mouse.move(identity.x+30,identity.y+30);await page.mouse.down();await page.mouse.move(identity.x+150,identity.y+30,{steps:8});await page.mouse.up();assert.equal(await page.locator('#guard-notification').count(),0);
 assert.deepEqual(errors,[]);console.log('PASS: responsive card, close, approve/reject persistence, camera routing, other-page decisions, long name and swipe');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
