const assert = require('node:assert/strict');
const path = require('node:path');
const {spawn} = require('node:child_process');
let chromium;
try { ({chromium}=require('playwright')); } catch { ({chromium}=require('C:/Users/ouan-dev/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const server=spawn(process.execPath,['server.cjs'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,PORT:'4175'},windowsHide:true,stdio:'pipe'});
let browser;
(async()=>{
 await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);});
 browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:375,height:812},reducedMotion:'reduce'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.clock.install();
 const go=async route=>{await page.goto('http://localhost:4175/#'+route);await page.locator('#app h1').waitFor();};
 const bill=()=>page.evaluate(()=>(JSON.parse(localStorage.getItem('bannayuu.resident.v1'))||state).bills[0]);
 const action=a=>page.locator(`[data-action="${a}"]`).click();
 await go('bills/paid');assert.match(await page.locator('#app').innerText(),/ประเภทการชำระ:.*พร้อมเพย์/);
 await go('payment/BILL-001');await page.locator('[type=submit]').click();
 assert.equal((await bill()).paid,false);
 assert(await page.locator('.promptpay-qr').evaluate(img=>img.complete&&img.naturalWidth>0));
 assert.equal(await page.locator('#payment-countdown').innerText(),'05:00');
 await page.clock.fastForward(61000);
 assert.equal(await page.locator('#payment-countdown').innerText(),'03:59');
 const expiry=(await bill()).pendingPayment.expiresAt;
 await page.reload();assert.equal((await bill()).pendingPayment.expiresAt,expiry);
 for(const width of [320,375,430,812]){
  await page.setViewportSize({width,height:width===812?375:812});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow '+width);
 }
 await page.setViewportSize({width:375,height:812});
 await page.screenshot({path:'.work/payment-qr.png',fullPage:true});
 await page.clock.fastForward(300000);
 assert.equal(await page.locator('.promptpay-qr').count(),0);
 assert.equal((await bill()).paid,false);
 assert.match(await page.locator('#payment-status').innerText(),/หมดเวลา/);
 await action('promptpay-retry');assert.equal(await page.locator('#payment-countdown').innerText(),'05:00');
 await action('promptpay-cancel');assert.equal((await bill()).pendingPayment,undefined);
 await page.locator('[type=submit]').click();
 await action('promptpay-complete');await page.waitForURL(/receipt/);
 assert.equal((await bill()).method,'พร้อมเพย์ (จำลอง)');assert.equal((await bill()).paid,true);
 await go('bills/paid');assert.equal(await page.locator('.bill-method').count(),2);
 await page.screenshot({path:'.work/payment-paid.png',fullPage:true});
 // Old paid records without a method must have a readable fallback.
 await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('bannayuu.resident.v1'));delete s.bills[0].method;localStorage.setItem('bannayuu.resident.v1',JSON.stringify(s));});
 await page.reload();assert.match(await page.locator('#app').innerText(),/ไม่ระบุช่องทาง/);
 for(const method of ['โอนผ่านธนาคาร (จำลอง)']){
  await page.evaluate(()=>localStorage.clear());await page.reload();await go('payment/BILL-001');
  const proof=page.locator('[data-payment-proof]'),submit=page.locator('[type=submit]');
  assert.equal(await proof.isVisible(),false);
  assert.equal(await page.locator('[name=method] option').filter({hasText:'บัตรเครดิต'}).count(),0);
  await page.locator('[name=method]').selectOption(method);
  assert(await proof.isVisible());assert(await submit.isDisabled());
  await page.locator('form').evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  assert.equal((await bill()).paid,false);
  await page.locator('[name=method]').selectOption('พร้อมเพย์ (จำลอง)');
  assert.equal(await proof.isVisible(),false);assert(await submit.isEnabled());
  await page.locator('[name=method]').selectOption(method);
  const photo={name:'slip.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64')};
  await page.locator('input[type=file]').setInputFiles(photo);await page.locator('#photo-preview img').waitFor();
  assert(await submit.isEnabled());await action('remove-photo');assert(await submit.isDisabled());
  await page.locator('input[type=file]').setInputFiles(photo);await page.locator('#photo-preview img').waitFor();
  await submit.click();await page.waitForURL(/receipt/);
  assert.equal((await bill()).method,method);
  assert.match((await bill()).slip,/^data:image\/jpeg/);
 }
 assert.deepEqual(errors,[]);
 console.log('PASS: Edge mobile QR flow, paid methods, transfer-only required proof, method switching, photo removal, no credit card, responsive widths.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
