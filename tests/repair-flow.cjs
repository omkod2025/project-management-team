const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
let chromium;
try{({chromium}=require('playwright'));}catch{({chromium}=require('C:/Users/ouan-dev/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const server=spawn(process.execPath,['server.cjs'],{env:{...process.env,PORT:'4176'},stdio:'pipe',windowsHide:true});
let browser;
(async()=>{
 await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);});
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:4176');await page.locator('[name=username]').fill('cit');await page.locator('[name=password]').fill('cit12345');await page.locator('#login-form [type=submit]').click();
 const sampleCount=await page.evaluate(()=>state.repairs.length);
 assert.equal(sampleCount,8);
 assert.equal(await page.evaluate(()=>new Set(state.repairs.map(r=>r.status)).size),6);
 await page.reload();assert.equal(await page.evaluate(()=>state.repairs.length),sampleCount);
 await page.evaluate(()=>{state.settings.servicesEnabled=true;save();});
 for(const width of [320,390,768]){
  await page.setViewportSize({width,height:844});await page.goto('http://localhost:4176/#repairs/history');await page.reload();
  await page.evaluate(()=>{guardBannerDismissed=true;document.getElementById('guard-notification')?.remove();window.scrollTo(0,0);});
  assert.equal(await page.locator('.repair-history-item').count(),8);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:'.work/repair-history-polish-'+width+'.png',fullPage:true});
 }
 await page.setViewportSize({width:390,height:844});
 for(const id of ['201','202','203','204','205','206']){
  await page.goto('http://localhost:4176/#repairs/detail/RP-SAMPLE-'+id);
  await page.locator('.repair-timeline').waitFor();
  assert.equal(await page.locator('[aria-current=step]').count(),1);
  await page.evaluate(()=>{guardBannerDismissed=true;document.getElementById('guard-notification')?.remove();window.scrollTo(0,0);});
  await page.screenshot({path:'.work/repair-sample-'+id+'.png',fullPage:true});
 }
 await page.evaluate(()=>{state.settings.servicesEnabled=true;state.repairs=['FLOW','CANCEL','REJECT'].map(id=>({id,home:house().id,type:'ประปา',subtype:'ก๊อกน้ำและท่อน้ำ',detail:'ก๊อกน้ำบริเวณสวนรั่วซึม',phone:'0812345678',date:iso(),status:'รอดำเนินการ',photos:[]}));save();});
 const go=async id=>{await page.goto('http://localhost:4176/#repairs/detail/'+id);await page.reload();await page.locator('.repair-timeline').waitFor();};
 const update=async(status,detail)=>{await page.locator('.repair-demo-tools summary').click();await page.locator('[name=status]').selectOption(status);await page.locator('[name=detail]').fill(detail);await page.locator('form [type=submit]').click();};
 await go('FLOW');assert.equal(await page.locator('.repair-step').count(),4);assert(await page.locator('[data-action=cancel-repair]').isVisible());
 await page.evaluate(()=>{const r=state.repairs.find(r=>r.id==='FLOW');r.location='ตำแหน่งเก่าที่ไม่ควรแสดง';r.photos=['assets/community.svg','assets/examples/repair-completed.svg','data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="2000"><rect width="200" height="2000" fill="#82afa0"/></svg>')];save();render();guardBannerDismissed=true;document.getElementById('guard-notification')?.remove();});
 for(const width of [320,390,768]){
  await page.setViewportSize({width,height:844});
  const boxes=await page.locator('.repair-image-grid button').evaluateAll(items=>items.map(el=>({top:el.getBoundingClientRect().top,height:el.getBoundingClientRect().height})));
  assert.equal(boxes.length,3);assert(boxes.every(b=>b.height<=72.1&&Math.abs(b.top-boxes[0].top)<1));
 }
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.locator('.repair-detail-heading h2').innerText(),'ประปา');
 assert.doesNotMatch(await page.locator('.repair-detail-page').innerText(),/0812345678|ตำแหน่งเก่าที่ไม่ควรแสดง/);
 assert.equal(await page.locator('.repair-status.submitted').innerText(),'รอรับเรื่อง');
 await page.locator('[data-action=repair-gallery]').last().click();
 assert.equal(await page.locator('#modal[open] .repair-photo-gallery img').count(),3);
 assert.equal(await page.locator('#modal .repair-photo-gallery figcaption').last().innerText(),'รูป 3 / 3');
 await page.screenshot({path:'.work/repair-gallery-modal.png',fullPage:true});
 await page.keyboard.press('Escape');assert.equal(await page.locator('#modal').isVisible(),false);
 const longDetail='พบรอยรั่วบริเวณข้อต่อก๊อกน้ำส่วนกลาง กรุณาตรวจสอบและแก้ไขเพื่อป้องกันพื้นลื่น '.repeat(15);
 await page.evaluate(text=>{state.repairs.find(r=>r.id==='FLOW').detail=text;save();render();},longDetail);
 assert(await page.locator('.repair-step.submitted .repair-step-copy>p').first().evaluate(el=>el.getBoundingClientRect().height<=parseFloat(getComputedStyle(el).lineHeight)*2+1));
 await page.locator('.repair-read-more').first().click();await page.waitForURL('**/#repairs/info/FLOW/0');
 assert.equal(await page.locator('.repair-info-body>p').nth(1).textContent(),longDetail);
 await page.reload();await page.locator('.repair-info-body').waitFor();
 await page.locator('[data-action=repair-gallery]').first().click();
 assert.equal(await page.locator('#modal[open] .repair-photo-gallery img').count(),3);
 await page.keyboard.press('Escape');
 await page.locator('[data-route="repairs/detail/FLOW"]').click();await page.locator('.repair-timeline').waitFor();
 await page.goto('http://localhost:4176/#repairs/edit/FLOW');
 assert.equal(await page.locator('form [name=location]').count(),0);
 await go('FLOW');
 await update('รับเรื่อง','รับเรื่องและนัดหมายช่างแล้ว');assert.equal(await page.locator('[data-action=cancel-repair]').count(),0);assert.equal(await page.locator('.repair-step.accepted').count(),1);
 // A stale cancellation request must also fail in the handler.
 await page.evaluate(()=>{const b=document.createElement('button');b.dataset.action='confirm-cancel-repair';b.dataset.id='FLOW';document.body.append(b);b.click();b.remove();});
 assert.equal(await page.evaluate(()=>state.repairs.find(r=>r.id==='FLOW').status),'รับเรื่อง');await go('FLOW');
 await update('กำลังดำเนินการ','ช่างตรวจพบข้อต่อชำรุด กำลังเปลี่ยนข้อต่อใหม่');assert.equal(await page.locator('.repair-step.working').count(),1);
 await page.reload();assert.match(await page.locator('.repair-step.working').innerText(),/กำลังเปลี่ยนข้อต่อใหม่/);
 await page.evaluate(()=>{guardBannerDismissed=true;document.getElementById('guard-notification')?.remove();window.scrollTo(0,0);});
 for(const width of [320,390,768]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'.work/repair-flow-'+width+'.png',fullPage:true});}
 await update('เสร็จสิ้น','เปลี่ยนข้อต่อและทดสอบแล้ว ไม่มีน้ำรั่ว');assert.match(await page.locator('.repair-step.completed').innerText(),/สำเร็จ/);assert.equal(await page.locator('.repair-demo-tools').count(),0);
 await go('CANCEL');await page.locator('[data-action=cancel-repair]').click();await page.locator('[data-action=confirm-cancel-repair]').click();await go('CANCEL');assert.match(await page.locator('.repair-step.cancelled').innerText(),/ยกเลิกโดยลูกบ้าน/);
 await go('REJECT');await update('ปฏิเสธ','พื้นที่อยู่นอกความรับผิดชอบ กรุณาติดต่อผู้รับเหมา');assert.match(await page.locator('.repair-step.rejected').innerText(),/พื้นที่อยู่นอก/);assert.equal(await page.locator('.repair-step.accepted').count(),0);
 await page.reload();assert.match(await page.locator('.repair-step.rejected').innerText(),/ปฏิเสธโดยนิติบุคคล/);
 assert.deepEqual(errors,[]);console.log('Repair workflow passed: four steps, acceptance, progress details, completion, rejection, guarded cancellation, persistence and responsive layouts.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});



