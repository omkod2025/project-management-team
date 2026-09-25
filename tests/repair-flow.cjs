const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
let chromium;
try{({chromium}=require('playwright'));}catch{({chromium}=require('C:/Users/ouan-dev/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const server=spawn(process.execPath,['server.cjs'],{env:{...process.env,PORT:'4176'},stdio:'pipe',windowsHide:true});
let browser;
(async()=>{
 await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);});
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:4176');await page.locator('[name=username]').fill('cit');await page.locator('[name=password]').fill('cit12345');await page.locator('#login-form [type=submit]').click();
 await page.evaluate(()=>{state.settings.servicesEnabled=true;state.repairs=['FLOW','CANCEL','REJECT'].map(id=>({id,home:house().id,type:'ประปา',subtype:'ก๊อกน้ำและท่อน้ำ',detail:'ก๊อกน้ำบริเวณสวนรั่วซึม',phone:'0812345678',date:iso(),status:'รอดำเนินการ',photos:[]}));save();});
 const go=async id=>{await page.goto('http://localhost:4176/#repairs/detail/'+id);await page.reload();await page.locator('.repair-timeline').waitFor();};
 const update=async(status,detail)=>{await page.locator('.repair-demo-tools summary').click();await page.locator('[name=status]').selectOption(status);await page.locator('[name=detail]').fill(detail);await page.locator('form [type=submit]').click();};
 await go('FLOW');assert.equal(await page.locator('.repair-step').count(),4);assert(await page.locator('[data-action=cancel-repair]').isVisible());
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


