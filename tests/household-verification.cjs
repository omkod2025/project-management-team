const {chromium}=require('C:/Users/ouan-dev/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch();try{
 const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:4173/#household');await page.locator('[name=username]').fill('cit');await page.locator('[name=password]').fill('cit12345');await page.locator('#login-form [type=submit]').click();
 const toggle=page.locator('#household-id-verification');await toggle.waitFor();assert(await toggle.isChecked());assert(await toggle.isEnabled());
 await page.evaluate(()=>{guardBannerDismissed=true;document.getElementById('guard-notification')?.remove();});
 const mode=await page.evaluate(()=>house().contactPolicy.mode);
 await toggle.uncheck();await page.reload();assert.equal(await toggle.isChecked(),false);assert.equal(await page.evaluate(()=>house().contactPolicy.mode),mode);
 await page.evaluate(()=>{state.profile.memberIds[house().id]='m2';save();renderHousehold();});assert.equal(await toggle.count(),0);assert.equal(await page.locator('.household-readonly-value').innerText(),'ปิด');
 assert.match(await page.evaluate(()=>saveHouseholdIdVerification(true).error),/เฉพาะเจ้าบ้าน/);
 assert.equal(await page.evaluate(()=>house().contactPolicy.requireIdVerification),false);
 await page.evaluate(()=>{state.profile.memberIds[house().id]='missing-member';renderHousehold();});assert.equal(await toggle.count(),0);assert.match(await page.evaluate(()=>saveHouseholdIdVerification(true).error),/เฉพาะเจ้าบ้าน/);
 await page.evaluate(()=>{state.profile.memberIds[house().id]='m1';state.homes.push({id:'VERIFY-H2',number:'222/2',project:'โครงการตัวอย่าง',members:[{id:'v2',name:state.profile.name,role:'เจ้าบ้าน'}]});state.home='VERIFY-H2';renderHousehold();});assert(await toggle.isChecked());
 await page.evaluate(()=>{state.home='h1';renderHousehold();});assert.equal(await toggle.isChecked(),false);
 await page.evaluate(()=>{delete house().contactPolicy.requireIdVerification;ensureHouseholdState();renderHousehold();});assert(await toggle.isChecked());
 assert.match(await page.evaluate(()=>saveHouseholdIdVerification('false').error),/กรุณาเลือก/);
 await page.evaluate(()=>saveHouseholdMode('dnd'));await page.evaluate(()=>renderHousehold());assert.match(await page.locator('.household-verification').innerText(),/ยังเข้าไม่ได้/);
 for(const width of [320,390,768]){await page.setViewportSize({width,height:844});await page.locator('.household-verification').scrollIntoViewIfNeeded();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'.work/household-verification-'+width+'.png'});}
 assert.deepEqual(errors,[]);console.log('Verified default-on migration, persistence, per-home isolation, owner/member/nonmember guards, invalid value and responsive layout.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
