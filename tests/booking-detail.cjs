const assert=require('node:assert/strict');
const fs=require('node:fs');
const {spawn}=require('node:child_process');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require('C:/Users/ouan-dev/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const server=spawn(process.execPath,['server.cjs'],{env:{...process.env,PORT:'4186'},windowsHide:true,stdio:'pipe'});
let browser;
(async()=>{
 await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.stderr.once('data',d=>reject(new Error(d.toString())));server.once('error',reject);server.once('exit',code=>reject(new Error('Server exited: '+code)));});
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:4186/#facilities/bookings');
 await page.locator('.booking-list-open').first().click();await page.waitForURL(/#facility-booking\//);
 assert.equal(await page.locator('#app h1').innerText(),'รายละเอียดการจอง');assert.equal(await page.locator('#app form').count(),0);assert.equal(await page.locator('#modal:modal').count(),0);
 const route=page.url();await page.reload();assert(await page.locator('.booking-qr-image').evaluate(img=>img.complete&&img.naturalWidth>0));
 await page.evaluate(()=>{navigator.canShare=()=>true;navigator.share=async data=>{window.shared={name:data.files[0].name,type:data.files[0].type,size:data.files[0].size};};});
 await page.locator('[data-action="share-booking-qr"]').click();assert.equal(await page.evaluate(()=>window.shared.type),'image/png');assert((await page.evaluate(()=>window.shared.size))>1000);
 await page.evaluate(()=>navigator.canShare=()=>false);await page.locator('[data-action="share-booking-qr"]').click();assert.match(await page.locator('#toast').innerText(),/บันทึกรูป QR/);
 const download=page.waitForEvent('download');await page.locator('[data-action="download-booking-qr"]').click();assert.match((await download).suggestedFilename(),/\.png$/);
 await page.locator('[data-action="edit-facility-booking"]').click();assert.equal(page.url(),route);assert.equal(await page.locator('#modal:modal form').count(),1);await page.locator('#modal [name="people"]').fill('2');await page.locator('#modal [type="submit"]').click();assert.equal(page.url(),route);assert.match(await page.locator('.booking-detail-summary').innerText(),/2 ท่าน/);
 await page.reload();
 fs.mkdirSync('.work/booking-detail',{recursive:true});
 for(const width of [320,390,1280]){await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'.work/booking-detail/detail-'+width+'.png',fullPage:true});}
 await page.locator('[data-action="cancel-booking"]').click();await page.locator('[data-action="confirm-cancel-booking"]').click();assert.equal(page.url(),route);assert.match(await page.locator('.booking-detail-summary').innerText(),/ยกเลิก/);assert.equal(await page.locator('[data-action="edit-facility-booking"]').count(),0);
 await page.goto('http://localhost:4186/#facility-booking/missing');assert.match(await page.locator('#app').innerText(),/ไม่พบการจองนี้/);
 assert.deepEqual(errors,[]);console.log('PASS: detail navigation/reload, QR PNG, native share and fallback, download, edit, cancel, missing record, responsive layout');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
