const {chromium}=require('C:/Users/ouan-dev/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:false});
 try{
 const page=await browser.newPage({viewport:{width:375,height:812},reducedMotion:'reduce'});
 await page.goto('http://localhost:4173/#home');await page.evaluate(()=>document.fonts.ready);
 const bell=page.getByRole('button',{name:'การแจ้งเตือน ยังไม่อ่าน 2 รายการ',exact:true});await bell.hover();
 assert.equal(await bell.evaluate(e=>getComputedStyle(e).color),'rgb(18, 78, 71)');
 await page.getByRole('button',{name:'เปลี่ยนชุมชน',exact:true}).click();await page.getByRole('button',{name:'เพิ่มห้อง/บ้าน',exact:true}).click();
 const number=page.getByRole('textbox',{name:'บ้านเลขที่'});await number.fill('   ');await page.keyboard.press('Tab');
 assert.equal(await number.getAttribute('aria-invalid'),'true');assert.match(await page.locator('.field-error').innerText(),/ไม่ใช้เฉพาะช่องว่าง/);
 await number.fill('123');assert.equal(await number.getAttribute('aria-invalid'),'false');assert.equal(await page.getByRole('button',{name:'เพิ่มบ้าน',exact:true}).isDisabled(),false);
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:/ยอดรอชำระ/}).focus();await page.keyboard.press('Enter');
 assert.equal(await page.evaluate(()=>document.activeElement.id),'app');assert.match(await page.title(),/ชำระเงิน/);
 await page.goto('http://localhost:4173/#home');
 for(let i=0;i<29;i++){
  await page.keyboard.press('Tab');await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const status=await page.evaluate(()=>{const e=document.activeElement,r=e.getBoundingClientRect(),n=document.querySelector('#navigation').getBoundingClientRect();return {check:!!e.closest('#app')&&e.matches('button,a,input,select,textarea'),bottom:r.bottom,navTop:n.top,text:e.textContent};});
  if(status.check)assert(status.bottom<=status.navTop-8,'Focus obscured: '+status.text);
 }
 for(const [width,height] of [[375,812],[812,375],[1440,1000]]){
  await page.setViewportSize({width,height});await page.goto('http://localhost:4173/#home');await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:`.work/dashboard-fixed-${width}.png`,fullPage:true});
 }
 await page.setViewportSize({width:320,height:740});await page.goto('http://localhost:4173/#repairs');
 assert.equal(await page.locator('.optional-upload').getAttribute('open'),null);
 await page.locator('.optional-upload summary').click();assert.equal(await page.locator('input[type=file]').isVisible(),true);
 await page.goto('http://localhost:4173/#pets');await page.getByRole('button',{name:'ข้ามคำแนะนำ'}).click();assert.equal(await page.getByRole('button',{name:'เพิ่มสัตว์เลี้ยง',exact:true}).count(),1);
 await page.goto('http://localhost:4173/#timeline');await page.getByRole('button',{name:'พูดคุย',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'พูดคุย',exact:true}).getAttribute('aria-pressed'),'true');
 assert.equal(await page.evaluate(()=>document.activeElement.textContent),'พูดคุย');
 await page.goto('http://localhost:4173/#visitor-new');await page.locator('[name=note]').focus();
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 assert(await page.locator('[name=note]').evaluate(e=>e.getBoundingClientRect().bottom<=document.querySelector('#navigation').getBoundingClientRect().top-8));
 assert.equal(await page.locator('[name=note]').evaluate(e=>getComputedStyle(e).fontSize),'16px');
 console.log('PASS: Edge notification label/hover, invalid-field recovery, route focus/title, keyboard clearance, responsive layout, optional uploads, skip onboarding, filter state/focus and mobile form sizing.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
