const assert=require('node:assert/strict');
const fs=require('node:fs');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require('C:/Users/ouan-dev/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
let browser;
(async()=>{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:390,height:844}});
 const issues=[];page.on('pageerror',e=>issues.push(e.message));page.on('console',m=>{if(m.type()==='error')issues.push(m.text());});
 const go=async r=>{await page.goto('http://localhost:4173/#'+r);await page.locator('#app .route-fade').waitFor();};
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
 await go('pet-new');const submit=page.locator('form [type=submit]');assert(await submit.isDisabled());
 await page.locator('[name=english]').fill('ชื่อไทย');assert.equal(await page.locator('[name=english]').evaluate(e=>e.validity.patternMismatch),true);
 await page.locator('[name=english]').fill("Little-Mali");assert.equal(await page.locator('[name=english]').evaluate(e=>e.validity.patternMismatch),false);
 await page.locator('input[type=file]').setInputFiles({name:'bad.gif',mimeType:'image/gif',buffer:png});assert.match(await page.locator('#toast').innerText(),/PNG/);assert.equal(await page.locator('#photo-preview img').count(),0);
 await page.locator('input[type=file]').setInputFiles({name:'big.png',mimeType:'image/png',buffer:Buffer.alloc(5*1024*1024+1)});assert.match(await page.locator('#toast').innerText(),/5 MB/);
 await go('vehicles');await page.locator('[data-action=new-vehicle]').click();await page.locator('input[type=file]').setInputFiles({name:'car.png',mimeType:'image/png',buffer:png});await page.waitForFunction(()=>document.querySelector('#photo-preview img'));
 await page.locator('[name=kind]').selectOption('รถยนต์');await page.locator('[name=engine]').selectOption('ไฮบริด');await page.locator('[name=plate]').fill('ทด 1234');await page.locator('[name=province]').selectOption('สมุทรปราการ');await page.locator('[type=submit]').click();
 await page.locator('[name=brand]').fill('Honda');await page.locator('[name=model]').fill('City');await page.locator('[name=color]').fill('ดำ');await page.locator('[type=submit]').click();assert.equal(await page.locator('.preview-photos img').count(),1);await page.locator('[name=agree]').check();await page.locator('[type=submit]').click();await page.reload();assert.equal(await page.locator('.preview-photos img').count(),1);
 await go('settings/profile');await page.locator('[name=name]').fill('   ');assert(await page.locator('[type=submit]').isDisabled());await page.locator('[name=name]').fill('ผู้ใช้ใหม่');
 await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('Full','QuotaExceededError');};});await page.locator('[type=submit]').click();assert.match(await page.locator('#toast').innerText(),/พื้นที่จัดเก็บเต็ม/);await page.reload();assert.equal(await page.locator('[name=name]').inputValue(),'พิมพ์ชนก สุขใจ');
 await go('visitor-new');await page.locator('[name=name]').fill('ผู้มาติดต่อ');await page.locator('[name=category]').selectOption('อื่น ๆ');await page.locator('[name=plate]').fill('-');await page.locator('[name=start]').fill('2026-10-20');await page.locator('[name=end]').fill('2026-10-19');await page.locator('[type=submit]').click();assert.match(await page.locator('#toast').innerText(),/วันสิ้นสุดต้องไม่ก่อน/);
 await go('home');await page.locator('.menu-grid [data-route=parcels]').click();await page.locator('[data-action=back]').click();await page.waitForURL(/#home$/);
 await go('%');assert.match(await page.locator('#app').innerText(),/บ้านเลขที่/);
 await go('shopping');await page.screenshot({path:'.work/app/shopping-mobile.png',fullPage:true});await go('home');await page.screenshot({path:'.work/app/home-viewport.png'});
 assert.deepEqual(issues,[]);const report={passed:['Required fields disable submit','English name pattern validation','Invalid image type and 5 MB limit','Vehicle photo survives wizard and reload','Whitespace-only fields rejected','Storage quota rollback','Visitor date ordering','Back navigation','Malformed hash fallback'],errors:issues};fs.writeFileSync('.work/app/edge-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();});
