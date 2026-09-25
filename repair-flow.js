'use strict';
function repairSteps(r) {
 const cancelled=r.status.startsWith('ยกเลิก'),rejected=r.status==='ปฏิเสธ',done=r.status==='เสร็จสิ้น';
 const accepted=!!r.acceptedAt||['รับเรื่อง','กำลังดำเนินการ','เสร็จสิ้น'].includes(r.status);
 const working=!!r.progress||['กำลังดำเนินการ','เสร็จสิ้น'].includes(r.status);
 const closed=cancelled||rejected||done,result=repairResolution(r);
 const steps=[
  {title:'แจ้งเรื่อง',color:'submitted',active:true,date:r.createdAt||r.date,body:`<p>${esc(r.detail)}</p>${repairImageGrid(r.photos||[],'before',r.id)}`},
  {title:'รับเรื่อง',color:'accepted',active:accepted,date:r.acceptedAt,body:`<p>${accepted?esc(r.acceptanceDetail||'นิติบุคคลรับเรื่องแจ้งซ่อมแล้ว'):closed?'ไม่ได้ดำเนินการขั้นตอนนี้':'รอนิติบุคคลรับเรื่องแจ้งซ่อม'}</p>`},
  {title:'กำลังดำเนินการ',color:'working',active:working,date:r.progress?.date,body:`<p>${esc(r.progress?.detail||(working?'เจ้าหน้าที่กำลังตรวจสอบและดำเนินการแก้ไข':closed?'ไม่ได้ดำเนินการขั้นตอนนี้':'รายละเอียดจากนิติบุคคลจะแสดงที่นี่เมื่อเริ่มดำเนินการ'))}</p>`},
  {title:'สรุป',color:cancelled?'cancelled':rejected?'rejected':'completed',active:closed,date:r.closedAt||result?.date,body:closed?`<strong class="repair-outcome">${cancelled?'ยกเลิกโดยลูกบ้าน':rejected?'ปฏิเสธโดยนิติบุคคล':'สำเร็จ'}</strong><p>${esc(cancelled?'ลูกบ้านยกเลิกเรื่องก่อนนิติบุคคลรับเรื่อง':rejected?(r.rejectionReason||'ยังไม่ได้ระบุเหตุผลการปฏิเสธ'):(result?.detail||'ยังไม่มีรายละเอียดผลการแก้ไขจากเจ้าหน้าที่'))}</p>${done&&result?repairImageGrid(result.photos||[],'after',r.id):''}`:'<p>รอสรุปผลการดำเนินการ</p>'}
 ];
 return steps;
}
function repairTimeline(r) {
 const steps=repairSteps(r),current=steps.findLastIndex(s=>s.active);
 return `<ol class="repair-timeline" aria-label="ขั้นตอนแจ้งซ่อม">${steps.map((s,i)=>`<li class="repair-step ${s.active?s.color:'upcoming'}" ${i===current?'aria-current="step"':''}><div class="repair-step-date">${s.date?`<time>${esc(dateLabel(s.date))}</time>${String(s.date).includes('T')?`<span>${new Date(s.date).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'})} น.</span>`:''}`:'<span>—</span>'}</div><span class="repair-step-marker" aria-hidden="true">${s.active?icon(i===3&&['cancelled','rejected'].includes(s.color)?'close':'check'):i+1}</span><section class="repair-step-copy"><h3>${s.title}</h3>${s.body}${s.active?`<a class="repair-read-more" href="#repairs/info/${encodeURIComponent(r.id)}/${i}" aria-label="ดูรายละเอียดขั้นตอน${s.title}">ดูรายละเอียด ${icon('chevron')}</a>`:''}</section></li>`).join('')}</ol>`;
}
function renderRepairInfo(id,stepIndex='0') {
 const r=scoped(state.repairs).find(item=>item.id===id);
 const step=r&&repairSteps(r)[stepIndex];
 if(!step||!step.active)return page(header('รายละเอียดแจ้งซ่อม')+`<div class="content">${empty('wrench','ไม่พบรายละเอียด','',linkBtn('กลับประวัติแจ้งซ่อม','repairs/history'))}</div>`);
 page(header('รายละเอียด'+step.title)+`<article class="content repair-info"><div class="repair-detail-heading"><div class="row between"><span class="repair-muted">${esc(r.id)}</span>${repairStatus(r)}</div><h2>${esc(r.title||r.type)}</h2><p class="repair-muted">${esc(r.subtitle||r.subtype||'ไม่ระบุประเภทย่อย')}</p>${r.demo?'<p class="repair-demo">รายการตัวอย่าง</p>':''}</div><section class="repair-info-body"><h3>${step.title}</h3>${step.date?`<p class="repair-muted">${dateLabel(step.date)}</p>`:''}${step.body}</section>${linkBtn('กลับไปดูสถานะ','repairs/detail/'+r.id,'secondary full')}</article>`);
}
function repairStaffTools(r){
 if(!['รอดำเนินการ','รับเรื่อง','กำลังดำเนินการ'].includes(r.status))return '';
 return `<details class="repair-demo-tools"><summary>เครื่องมือสาธิต · สำหรับนิติบุคคล</summary><p class="repair-muted">จำลองการอัปเดตจากนิติบุคคล</p><form data-form="repair-staff" data-id="${esc(r.id)}">${select('status','อัปเดตสถานะ',r.status==='รอดำเนินการ'?['รับเรื่อง','ปฏิเสธ']:r.status==='รับเรื่อง'?['กำลังดำเนินการ','ปฏิเสธ']:['กำลังดำเนินการ','เสร็จสิ้น','ปฏิเสธ'])}${area('detail','รายละเอียดการดำเนินการ / เหตุผล',r.progress?.detail||'','required maxlength="2000" placeholder="ระบุการดำเนินการ ผลการแก้ไข หรือเหตุผลที่ปฏิเสธ"')}${submit('บันทึกสถานะ')}</form></details>`;
}
function saveRepairStaff(form){
 const r=scoped(state.repairs).find(r=>r.id===form.dataset.id),d=new FormData(form);
 const status=d.get('status'),detail=String(d.get('detail')||'').trim();
 const allowed={'รอดำเนินการ':['รับเรื่อง','ปฏิเสธ'],'รับเรื่อง':['กำลังดำเนินการ','ปฏิเสธ'],'กำลังดำเนินการ':['กำลังดำเนินการ','เสร็จสิ้น','ปฏิเสธ']};
 if(!r||!allowed[r.status]?.includes(status)){toast('สถานะรายการเปลี่ยนแล้ว กรุณาตรวจสอบอีกครั้ง');render();return;}
 if(!detail||detail.length>2000){toast('กรุณาระบุรายละเอียดไม่เกิน 2,000 ตัวอักษร');return;}
 const now=new Date().toISOString();
 if(commit(()=>{
  r.status=status;
  if(status==='รับเรื่อง'){r.acceptedAt=now;r.acceptanceDetail=detail;}
  if(status==='กำลังดำเนินการ')r.progress={detail,date:now};
  if(status==='เสร็จสิ้น'){r.closedAt=now;r.resolution={detail,date:now,photos:[]};}
  if(status==='ปฏิเสธ'){r.closedAt=now;r.rejectionReason=detail;}
 })){renderRepairDetail(r.id);toast('บันทึกสถานะแล้ว');}
}
