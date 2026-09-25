const {chromium}=require('C:/Users/ouan-dev/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch();try{
const p=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'}),errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.goto('http://localhost:4173/#household');await p.locator('[name=username]').fill('cit');await p.locator('[name=password]').fill('cit12345');await p.locator('#login-form [type=submit]').click();
await p.locator('.household-overview').waitFor();await p.evaluate(()=>{guardBannerDismissed=true;document.getElementById('guard-notification')?.remove();});
assert.equal(await p.locator('.household-member-disclosure').getAttribute('open'),null);assert.equal(await p.locator('[name=householdMode]').count(),0);
const summary=p.locator('.household-member-disclosure>summary');await summary.focus();await p.keyboard.press('Enter');assert(await p.locator('.household-members').isVisible());await summary.click();
for(const width of [320,390,768]){await p.setViewportSize({width,height:844});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.screenshot({path:'.work/household-compact-'+width+'.png'});}
await p.locator('[data-route="household/mode"]').click();await p.locator('[name=householdMode][value=bypass]').check();await p.locator('[data-action=household-mode-save]').click();
await p.waitForURL('**/#household');assert.match(await p.locator('.household-overview').innerText(),/ผ่านได้เลย/);assert.equal(await p.locator('[data-route="household/recipient"]').count(),0);assert(await p.locator('#household-id-verification').isChecked());
await p.locator('[data-route="household/mode"]').click();await p.locator('[name=householdMode][value=approve]').check();await p.locator('[data-action=household-mode-save]').click();
await p.locator('[data-route="household/recipient"]').click();await p.locator('[name=approvalRecipient][value=m2]').check();await p.locator('[data-action=household-recipient-save]').click();await p.waitForURL('**/#household');
assert.match(await p.locator('[data-route="household/recipient"]').innerText(),/ณัฐพล/);assert(await p.locator('#household-cooldown').isVisible());
await p.locator('[data-route="household/recipient"]').click();assert(await p.locator('[name=approvalRecipient]').first().isDisabled());assert(await p.locator('[data-action=household-recipient-save]').isDisabled());
await p.reload();assert(await p.locator('[name=approvalRecipient]').first().isDisabled());
await p.evaluate(()=>{house().contactPolicy.recipientChangedAt=Date.now()-HOUSEHOLD_COOLDOWN_MS;syncHouseholdControls();});assert(await p.locator('[name=approvalRecipient]').first().isEnabled());
await p.locator('[name=approvalRecipient][value=m1]').check();await p.locator('[data-route=household]').last().click();assert.equal(await p.evaluate(()=>house().contactPolicy.recipientId),'m2');
await p.locator('#household-id-verification').uncheck();await p.reload();assert.equal(await p.locator('#household-id-verification').isChecked(),false);
await p.evaluate(()=>{state.profile.memberIds[house().id]='m2';save();renderHousehold();});assert.equal(await p.locator('#household-id-verification').count(),0);assert.match(await p.locator('.household-readonly').innerText(),/เจ้าบ้าน/);assert.equal(await p.locator('[data-route="household/mode"]').count(),0);
await p.goto('http://localhost:4173/#household/mode');assert.equal(await p.locator('[name=householdMode]').count(),0);assert.match(await p.locator('#app').innerText(),/เจ้าบ้าน/);
assert.match(await p.evaluate(()=>saveHouseholdMode('bypass').error),/เจ้าบ้าน/);assert.match(await p.evaluate(()=>saveApprovalRecipient('m1').error),/เจ้าบ้าน/);
assert.deepEqual(errors,[]);console.log('Compact household passed: disclosure keyboard, owner-only editors, cancel, save, refresh, cooldown, member read-only and responsive layouts.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
