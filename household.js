'use strict';
// Prototype household policy. Production must enforce these rules and timestamps on the server.
const HOUSEHOLD_COOLDOWN_MS = 60 * 60 * 1000;
const HOUSEHOLD_MODES = [
 ['bypass','ผ่านได้เลย','ทำรายการที่หุ่นปกป้องแล้วเข้าได้ โดยไม่โทรขออนุมัติ','visitorEntry'],
 ['approve','ขออนุมัติก่อนเข้า','หุ่นปกป้องโทรหาผู้รับอนุมัติที่เลือกไว้เพียง 1 คน','phone'],
 ['dnd','ห้ามรบกวน','ไม่โทรแจ้ง และไม่อนุญาตให้ผู้มาติดต่อเข้า','visitorCancelled']
];
const PERSONAL_NOTIFICATION_TYPES = [
 ['vehicle','รถเข้า–ออก','การเข้าและออกโครงการของรถ','car'],
 ['parcel','พัสดุ','พัสดุเข้าใหม่และการรับพัสดุ','parcel'],
 ['announcement','ประกาศ','ข่าวสารจากนิติบุคคลและโครงการ','announce'],
 ['bill','บิล','บิลใหม่และการชำระเงิน','bill'],
 ['other','อื่น ๆ','การจองและข่าวสารบริการอื่น','bell']
];
function ensureHouseholdState(){
 let changed=false;state.profile.memberIds ||= {};
 for(const h of state.homes){
  if(!state.profile.memberIds[h.id]){const m=h.members.find(m=>m.name===state.profile.name);if(m){state.profile.memberIds[h.id]=m.id;changed=true;}}
  for(const m of h.members){
   if(typeof m.estampAllowed!=='boolean'){m.estampAllowed=h.id==='h1'&&m.id==='m1';changed=true;}
   if(!m.notificationPreferences){m.notificationPreferences={};changed=true;}
   for(const [key] of PERSONAL_NOTIFICATION_TYPES)if(typeof m.notificationPreferences[key]!=='boolean'){m.notificationPreferences[key]=true;changed=true;}
  }
  if(!h.contactPolicy){h.contactPolicy={mode:'approve',recipientId:(h.members.find(m=>m.role==='เจ้าบ้าน')||h.members[0])?.id||null,recipientChangedAt:null};changed=true;}
 }
 for(const n of state.notifications){
  if(!n.home){n.home=state.home;changed=true;}
  if(!n.category){n.category=notificationCategory(n.route);changed=true;}
  const h=state.homes.find(h=>h.id===n.home);
  if(!n.recipientKeys&&h){n.recipientKeys=h.members.map(m=>notificationKey(m,h));changed=true;}
  if(!n.readBy){n.readBy=n.read?[...(n.recipientKeys||[])]:[];changed=true;}
 }
 if(changed)save();
}
function activeHouseMember(h=house()){const id=state.profile.memberIds?.[h.id];return id?h.members.find(m=>m.id===id):h.members.find(m=>m.name===state.profile.name);}
function isHouseOwner(){return activeHouseMember()?.role==='เจ้าบ้าน';}
function memberCanStamp(){return activeHouseMember()?.estampAllowed===true;}
function approvalChangeRemaining(){const last=house().contactPolicy?.recipientChangedAt;return last?Math.max(0,Number(last)+HOUSEHOLD_COOLDOWN_MS-Date.now()):0;}
function canReceiveApproval(){const policy=house().contactPolicy;return policy?.mode==='approve'&&!!activeHouseMember()&&policy.recipientId===activeHouseMember().id;}
function householdPolicyResult(){const policy=house().contactPolicy;return policy?.mode==='bypass'?'allow':policy?.mode==='dnd'?'deny':'ringing';}
function saveApprovalRecipient(id){
 if(!isHouseOwner())return {error:'เฉพาะเจ้าบ้านเท่านั้นที่เปลี่ยนผู้รับอนุมัติได้'};
 const h=house();if(!h.members.some(m=>m.id===id))return {error:'กรุณาเลือกสมาชิกในบ้าน'};
 if(id===h.contactPolicy.recipientId)return {unchanged:true};
 if(approvalChangeRemaining()>0)return {error:'ยังเปลี่ยนผู้รับอนุมัติไม่ได้ ต้องรอครบ 60 นาทีจากการเปลี่ยนครั้งล่าสุด'};
 if(!commit(()=>{h.contactPolicy.recipientId=id;h.contactPolicy.recipientChangedAt=Date.now();const call=state.guardCalls?.[h.id];if(call&&['active','ended'].includes(call.status)){call.status='ringing';delete call.startedAt;}}))return {error:'บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง'};
 return {saved:true};
}
function saveHouseholdMode(mode){
 if(!isHouseOwner())return {error:'เฉพาะเจ้าบ้านเท่านั้นที่เปลี่ยนโหมดได้'};
 if(!HOUSEHOLD_MODES.some(([key])=>key===mode))return {error:'กรุณาเลือกโหมดการติดต่อ'};
 if(!commit(()=>{house().contactPolicy.mode=mode;const call=state.guardCalls?.[house().id];if(call&&['ringing','active','ended'].includes(call.status)&&mode!=='approve'){call.status=mode==='bypass'?'allow':'deny';call.policyMode=mode;}}))return {error:'บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง'};
 return {saved:true};
}
function syncHouseholdControls(){
 const remaining=approvalChangeRemaining(),owner=isHouseOwner(),policy=house().contactPolicy;
 const picker=$('#household-recipient-options');if(picker)picker.disabled=!owner||remaining>0||policy.mode!=='approve'||!house().members.length;
 const button=$('[data-action="household-recipient-save"]');if(button)button.disabled=!owner||remaining>0||!$('input[name="approvalRecipient"]:checked')||$('input[name="approvalRecipient"]:checked').value===policy.recipientId;
 const edit=$('[data-action="household-recipient-edit"]');if(edit)edit.disabled=!owner||remaining>0||policy.mode!=='approve';
 const clock=$('#household-cooldown');if(clock){clock.hidden=!remaining;clock.textContent=remaining?'เปลี่ยนผู้รับอนุมัติได้อีกใน '+Math.ceil(remaining/60000)+' นาที · หลัง '+new Date(Number(policy.recipientChangedAt)+HOUSEHOLD_COOLDOWN_MS).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'})+' น.':'';}
 const modeButton=$('[data-action="household-mode-save"]');if(modeButton)modeButton.disabled=!owner||$('input[name="householdMode"]:checked')?.value===policy.mode;
}
function toggleHouseholdRecipientEditor(open){
 const editor=$('#household-recipient-editor'),trigger=$('[data-action="household-recipient-edit"]');
 if(!editor||!trigger)return;
 if(open&&(!isHouseOwner()||approvalChangeRemaining()>0||house().contactPolicy.mode!=='approve'))return;
 editor.hidden=!open;trigger.hidden=open;trigger.setAttribute('aria-expanded',String(open));
 if(!open)for(const input of editor.querySelectorAll('input[name="approvalRecipient"]'))input.checked=input.value===house().contactPolicy.recipientId;
 syncHouseholdControls();
 (open?editor.querySelector('input:checked'):trigger)?.focus();
}
function renderHousehold(){
 ensureHouseholdState();const h=house(),me=activeHouseMember(),owner=isHouseOwner(),policy=h.contactPolicy,recipient=h.members.find(m=>m.id===policy.recipientId);
 const mode=HOUSEHOLD_MODES.find(([key])=>key===policy.mode)||HOUSEHOLD_MODES[1];
 page(header('ห้องของฉัน',iconBtn('home','เปลี่ยนชุมชน / บ้าน','switch-home'))+`<div class="content household-page">
 <section class="household-identity"><span class="household-home-icon">${icon('home')}</span><div><p>${esc(h.project)}</p><h2>บ้าน ${esc(h.number)}</h2><span>${h.members.length}/${Number.isInteger(h.memberQuota)&&h.memberQuota>0?h.memberQuota:10} สมาชิก${me?' · '+esc(me.role):''}</span></div><div class="household-identity-mode"><span class="household-mode-status household-mode-${mode[0]}" aria-label="โหมดผู้มาติดต่อ: ${mode[1]}">${icon(mode[3])}${mode[1]}</span><span class="household-permission ${me?.estampAllowed?'granted':'not-granted'}" aria-label="สิทธิ์ E-Stamp ของคุณ: ${me?.estampAllowed?'มีสิทธิ์':'ไม่มีสิทธิ์'}">${icon(me?.estampAllowed?'stampComplete':'lock')}${me?.estampAllowed?'มีสิทธิ์ E-Stamp':'ไม่มีสิทธิ์ E-Stamp'}</span>${policy.mode==='approve'?`<div class="household-my-approval ${canReceiveApproval()?'is-recipient':'not-recipient'}">${icon('phone')}<span>${canReceiveApproval()?'คุณเป็นผู้รับสายอนุมัติ':'คุณไม่ได้เป็นผู้รับสายอนุมัติ'}</span></div>`: ''}</div></section>
 <section class="household-section" aria-labelledby="household-members-title"><div class="household-section-heading"><h2 id="household-members-title">สมาชิกในบ้าน</h2><span>${h.members.length}/${Number.isInteger(h.memberQuota)&&h.memberQuota>0?h.memberQuota:10} คน</span></div><p class="household-caption">สิทธิ์ E-Stamp กำหนดโดยนิติบุคคล</p><ul class="household-members">${h.members.map(m=>`<li><span class="household-avatar" aria-hidden="true">${esc(m.name.slice(0,1))}</span><div class="household-member-info"><h3>${esc(m.name)}${m.id===me?.id?'<small>คุณ</small>':''}</h3><p>${esc(m.role)}</p><div class="household-member-badges"><span class="household-permission ${m.estampAllowed?'granted':'not-granted'}">${icon(m.estampAllowed?'stampComplete':'lock')}${m.estampAllowed?'มีสิทธิ์ E-Stamp':'ไม่มีสิทธิ์ E-Stamp'}</span>${policy.mode==='approve'&&m.id===policy.recipientId?'<span class="household-recipient-badge">'+icon('phone')+' ผู้รับอนุมัติ</span>':''}</div></div></li>`).join('')||'<li>ยังไม่มีสมาชิก กรุณาติดต่อนิติบุคคล</li>'}</ul><aside class="household-contact-note"><p>เพิ่มลูกบ้านหรือเปลี่ยนสิทธิ์ E-Stamp<br>กรุณาติดต่อนิติบุคคล</p>${linkBtn('ติดต่อนิติบุคคล','management','secondary')}</aside></section>
 <section class="household-section" aria-labelledby="household-mode-title"><div class="household-section-heading"><h2 id="household-mode-title">โหมดผู้มาติดต่อ</h2></div><p class="household-caption">ใช้งานอยู่: <span class="household-mode-status household-mode-${mode[0]}">${icon(mode[3])}${mode[1]}</span></p>${!owner?'<p class="household-owner-note">เฉพาะเจ้าบ้านเท่านั้นที่เปลี่ยนโหมดได้</p>':''}<fieldset class="household-options household-modes" ${!owner?'disabled':''}><legend class="sr-only">เลือกโหมดผู้มาติดต่อ</legend>${HOUSEHOLD_MODES.map(([key,label,description,glyph])=>`<label class="household-mode-option household-mode-${key}"><input type="radio" name="householdMode" value="${key}" ${key===policy.mode?'checked':''}><span class="household-mode-icon">${icon(glyph)}</span><span><strong>${label}${key==='bypass'?' <small>Bypass</small>':key==='approve'?' <small>Approve</small>':''}</strong><small>${description}</small></span></label>`).join('')}</fieldset>${owner?btn('บันทึกโหมดผู้มาติดต่อ','household-mode-save','','full'):''}</section>
 ${policy.mode==='approve'?`<section class="household-section" aria-labelledby="household-recipient-title"><div class="household-section-heading"><h2 id="household-recipient-title">ผู้รับสายอนุมัติ</h2><span>เลือกได้ 1 คน</span></div><p class="household-caption">รับสายจากหุ่นปกป้องเพื่ออนุมัติผู้มาติดต่อ<br>เจ้าบ้านเป็นผู้กำหนด แยกจากสิทธิ์ E-Stamp</p><div class="household-current-recipient">${icon('phone')}<div><small>ผู้รับอนุมัติปัจจุบัน</small><strong>${esc(recipient?.name||'ยังไม่ได้เลือกผู้รับอนุมัติ')}</strong></div></div>
 ${policy.mode!=='approve'?'<p class="household-caption">โหมดนี้ไม่โทรขออนุมัติ ระบบเก็บผู้รับสายคนเดิมไว้</p>':''}${!owner?'<p class="household-owner-note">เฉพาะเจ้าบ้านเท่านั้นที่เปลี่ยนผู้รับอนุมัติได้</p>':''}${owner&&policy.mode==='approve'?'<button type="button" class="btn secondary full" data-action="household-recipient-edit" aria-expanded="false" aria-controls="household-recipient-editor">เปลี่ยนผู้รับสาย</button>':''}<p class="household-cooldown" id="household-cooldown" role="status" hidden></p><div id="household-recipient-editor" hidden><fieldset id="household-recipient-options" class="household-options" ${!owner||approvalChangeRemaining()>0?'disabled':''}><legend class="sr-only">เลือกผู้รับสายอนุมัติ</legend>${h.members.map(m=>`<label class="household-recipient-option"><input type="radio" name="approvalRecipient" value="${esc(m.id)}" ${m.id===policy.recipientId?'checked':''}><span><strong>${esc(m.name)}</strong><small>${esc(m.role)}</small></span></label>`).join('')}</fieldset><p class="household-caption household-rule">เมื่อเปลี่ยนผู้รับอนุมัติ ต้องรออย่างน้อย 60 นาทีจึงจะเปลี่ยนอีกครั้งได้ รวมถึงการเปลี่ยนกลับคนเดิม</p>${owner?'<div class="household-editor-actions">'+btn('ยกเลิก','household-recipient-cancel','','secondary')+btn('บันทึกผู้รับอนุมัติ','household-recipient-save','','full')+'</div>':''}</div></section>`:''}
 <p class="household-prototype-note">ต้นแบบ: สิทธิ์จากนิติและการรับแจ้งเตือนเป็นข้อมูลจำลอง ยังไม่เชื่อมต่อเว็บนิติหรือ FCM</p>
 </div>`);
 syncHouseholdControls();const timer=setInterval(syncHouseholdControls,1000);page.disposeHousehold=()=>clearInterval(timer);
}
function renderHouseholdApprovalSettings(){return `<div class="info">เจ้าบ้านกำหนดผู้รับสายอนุมัติและโหมดผู้มาติดต่อได้ที่หน้าห้องของฉัน</div>${linkBtn('จัดการผู้มาติดต่อของบ้าน','household','full')}`;}
function renderPersonalNotificationSettings(){
 const member=activeHouseMember();if(!member)return empty('bell','ไม่พบสมาชิกของบัญชีนี้','กรุณาติดต่อนิติบุคคล');
 return `<div class="personal-notification-intro"><h2>การแจ้งเตือนของฉัน</h2><p>${esc(member.name)} · บ้าน ${esc(house().number)}</p><p>เปิดรับทุกประเภทเป็นค่าเริ่มต้น การเปลี่ยนที่นี่มีผลเฉพาะคุณ ไม่เปลี่ยนการแจ้งเตือนของสมาชิกคนอื่น</p></div><div class="card personal-notification-options">${PERSONAL_NOTIFICATION_TYPES.map(([key,label,description,glyph])=>`<label class="switch-row"><span class="personal-notification-icon">${icon(glyph)}</span><span class="grow"><strong>${label}</strong><small>${description}</small></span><input type="checkbox" role="switch" data-personal-notification="${key}" aria-label="${label}" ${member.notificationPreferences[key]?'checked':''}></label>`).join('')}</div><p class="household-caption">สายขออนุมัติผู้มาติดต่อส่งเฉพาะผู้รับอนุมัติที่เจ้าบ้านเลือก ไม่รวมกับสวิตช์ด้านบน</p>${linkBtn('ดูการแจ้งเตือนทั้งหมด','notifications','full secondary')}<details class="household-notification-demo"><summary>ทดสอบการแจ้งเตือนในต้นแบบ</summary><p>จำลองส่งแจ้งเตือนทุกประเภทให้สมาชิกที่เปิดรับแต่ละประเภท ยังไม่มีการส่ง FCM จริง</p>${btn('จำลองการแจ้งเตือน','household-test-notifications','','secondary full')}</details>`;
}
function notificationCategory(route){const root=String(route||'').split('/')[0];return /^(vehicle|vehicles)$/.test(root)?'vehicle':/^(parcel|parcels)$/.test(root)?'parcel':/^(announcement|announcements)$/.test(root)?'announcement':/^(bill|bills|payment|receipt)$/.test(root)?'bill':'other';}
function notificationKey(member=activeHouseMember(),h=house()){return member?h.id+':'+member.id:null;}
function notificationRecipientKeys(category,h=house()){return h.members.filter(m=>m.notificationPreferences?.[category]!==false).map(m=>notificationKey(m,h));}
function personalNotifications(){const key=notificationKey();if(!key)return [];return state.notifications.filter(n=>(!n.home||n.home===house().id)&&(!n.recipientKeys||n.recipientKeys.includes(key))&&!n.hiddenFor?.includes(key));}
function notificationIsRead(n){return n.readBy?n.readBy.includes(notificationKey()):!!n.read;}
function markNotificationRead(n){n.readBy ||= [];const key=notificationKey();if(key&&!n.readBy.includes(key))n.readBy.push(key);}
function personalUnreadCount(){return personalNotifications().filter(n=>!notificationIsRead(n)).length;}
function renderPersonalNotifications(){const list=personalNotifications();page(header('การแจ้งเตือน',iconBtn('check','อ่านทั้งหมด','read-notifications'))+`<div class="content">${list.map(n=>`<button class="service-card ${notificationIsRead(n)?'notification-read':'notification-item'}" data-action="open-notification" data-id="${esc(n.id)}"><span class="avatar">${icon('bell')}</span><div class="grow"><h3>${esc(n.title)}</h3><p>${esc(n.text)}</p></div>${!notificationIsRead(n)?pill('ใหม่'):''}</button>`).join('')||empty('bell','ไม่มีการแจ้งเตือน','การอัปเดตใหม่จะแสดงที่นี่')}${linkBtn('ตั้งค่าการแจ้งเตือนของฉัน','settings/notifications','full secondary')}</div>`);}
function renderGuardAccessState(){
 const h=house(),mode=h.contactPolicy.mode,recipient=h.members.find(m=>m.id===h.contactPolicy.recipientId);
 const title=mode==='bypass'?'ผู้มาติดต่อผ่านได้เลย':mode==='dnd'?'ห้ามรบกวน':'ส่งสายไปยังผู้รับอนุมัติ';
 const description=mode==='bypass'?'เมื่อทำรายการที่หุ่นปกป้องเสร็จ ผู้มาติดต่อเข้าได้โดยไม่โทรขออนุมัติ':mode==='dnd'?'ไม่โทรแจ้ง และไม่อนุญาตให้ผู้มาติดต่อเข้า':'ผู้รับอนุมัติ: '+(recipient?.name||'ยังไม่ได้กำหนด')+' · บัญชีนี้ไม่มีสิทธิ์รับสายหรืออนุมัติ';
 page(header('การติดต่อจากหุ่นปกป้อง')+`<div class="content"><section class="card"><h2>${title}</h2><p>${esc(description)}</p></section>${linkBtn('กลับห้องของฉัน','household','full secondary')}</div>`);
}
// Local browser delivery only; FCM token registration and push delivery require a backend.
function announcePersonalNotifications(items){const key=notificationKey(),received=items.filter(n=>n.recipientKeys?.includes(key)&&activeHouseMember()?.notificationPreferences?.[n.category]!==false);if(received.length)toast(received.length===1?received[0].title:'มีการแจ้งเตือนใหม่ '+received.length+' รายการ');}
window.addEventListener('storage',event=>{
 if(event.key!==STORAGE_KEY||!event.newValue)return;
 let saved;try{saved=JSON.parse(event.newValue);}catch{return;}
 if(saved?.version!==1||!Array.isArray(saved.homes)||!Array.isArray(saved.notifications))return;
 const previousIds=new Set(state.notifications.map(n=>n.id));
 const currentHome=house();const householdChanged=JSON.stringify(currentHome)!==JSON.stringify(saved.homes.find(h=>h.id===currentHome.id));
 state.homes=saved.homes;state.notifications=saved.notifications;state.guardCalls=saved.guardCalls;
 const fresh=state.notifications.filter(n=>!previousIds.has(n.id));
 if(routeParts[0]==='notifications')renderNotifications();
 else if(routeParts[0]==='household'&&householdChanged)renderHousehold();
 else if(routeParts[0]==='guard-call')renderGuardCall();
 else if(routeParts[0]==='home')renderHome();
 else renderGuardNotification();
 announcePersonalNotifications(fresh);
});
