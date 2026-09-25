function announcementSubtitle(a) {
 return a.subtitle ?? ({A1:'บำรุงรักษาคุณภาพน้ำ เพื่อความปลอดภัยของลูกบ้าน',A2:'พบปะเพื่อนบ้านในบรรยากาศสบาย ๆ ที่สวนส่วนกลาง'}[a.id] || '');
}
function renderAnnouncementDetail(id) {
 const a=state.announcements.find(x=>x.id===id);
 if(!a)return page(header('รายละเอียดประกาศ')+empty('announce','ไม่พบประกาศ','ประกาศนี้อาจถูกลบแล้ว',linkBtn('กลับหน้าประกาศ','announcements')),'announcements');
 if(routeParts[2]==='edit')return renderAnnouncementEditor(a);
 page(header('รายละเอียดประกาศ')+`<div class="content notice-page"><article class="notice-article">
 <div class="notice-meta"><span>${a.category==='important'?'ประกาศสำคัญ':'ข่าวสารทั่วไป'}</span><time datetime="${esc(a.date)}">${dateLabel(a.date)}</time></div>
 <h1>${esc(a.title)}</h1>${announcementSubtitle(a)?`<p class="notice-subtitle">${esc(announcementSubtitle(a))}</p>`:''}
 <p class="notice-publisher">สำนักงานนิติบุคคล · ${esc(house().project)}</p>
 ${a.cover?`<img class="notice-cover" src="${esc(a.cover)}" alt="ภาพประกอบ ${esc(a.title)}">`:''}
 <div class="notice-body">${esc(a.detail ?? a.body)}</div>
 </article><section class="notice-attachments" aria-labelledby="notice-files"><h2 id="notice-files">เอกสารแนบ</h2>
 ${a.pdf?`<div class="notice-file"><span class="notice-file-type">PDF</span><div><strong>${esc(a.pdf.name)}</strong><small>PDF · ${Math.ceil(a.pdf.size/1024).toLocaleString('th-TH')} KB</small></div></div><div class="notice-file-actions"><button class="btn secondary" id="notice-open">เปิดอ่าน PDF</button><a class="btn secondary" href="${esc(a.pdf.data)}" download="${esc(a.pdf.name)}">${icon('download')} ดาวน์โหลด</a></div>`:'<p class="notice-no-file">ประกาศนี้ไม่มีเอกสารแนบ</p>'}</section>
 <div class="notice-footer">${btn(a.read?icon('check')+' รับทราบแล้ว':'รับทราบประกาศ','acknowledge',`data-id="${esc(id)}" ${a.read?'disabled':''}`,'full')}${linkBtn('กลับหน้าประกาศ',a.category==='general'?'announcements/general':'announcements','full secondary')}</div>
 <details class="notice-demo"><summary>จัดการประกาศตัวอย่าง</summary><p>แก้ไขเฉพาะข้อมูลสาธิตในเบราว์เซอร์นี้</p>${linkBtn('แก้ไขประกาศ',`announcement/${id}/edit`,'secondary')}</details></div>`,'announcements');
 if(a.pdf)$('#notice-open').onclick=()=>{const bytes=Uint8Array.from(atob(a.pdf.data.split(',')[1]),c=>c.charCodeAt(0));const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));window.open(url,'_blank','noopener');setTimeout(()=>URL.revokeObjectURL(url),60000);};
}
function renderAnnouncementEditor(a) {
 page(header('แก้ไขประกาศตัวอย่าง')+`<div class="content notice-page"><p class="info">บันทึกเฉพาะในเบราว์เซอร์นี้ สำหรับทดสอบหน้าประกาศ</p><form id="notice-editor">
 ${field('title','หัวข้อ (Title)','text',a.title,'required maxlength="180"')}
 ${field('subtitle','หัวข้อรอง (Subtitle)','text',announcementSubtitle(a),'required maxlength="300"')}
 ${area('detail','รายละเอียด',a.detail??a.body,'required maxlength="12000" rows="8"')}
 <label class="field"><span>เอกสารแนบ PDF</span><input type="file" name="pdf" accept=".pdf,application/pdf"><small>เฉพาะ PDF ไม่เกิน 2 MB · เลือกไฟล์ใหม่เพื่อแทนที่ไฟล์เดิม</small></label>
 ${a.pdf?`<label class="notice-remove"><input type="checkbox" name="removePdf"> ลบเอกสาร ${esc(a.pdf.name)}</label>`:''}
 <label class="field"><span>รูปหัวประกาศ (ไม่บังคับ)</span><input type="file" name="cover" accept="image/jpeg,image/png"><small>JPG หรือ PNG ไม่เกิน 5 MB</small></label>
 ${a.cover?'<label class="notice-remove"><input type="checkbox" name="removeCover"> ลบรูปหัวประกาศ</label>':''}
 <p id="notice-error" class="notice-error" role="alert" tabindex="-1" hidden></p>${submit('บันทึกประกาศตัวอย่าง')}${linkBtn('ยกเลิก',`announcement/${a.id}`,'full secondary')}</form></div>`,'announcements');
 $('#notice-editor').onsubmit=async e=>{
  e.preventDefault();const form=e.currentTarget,button=form.querySelector('[type=submit]'),error=$('#notice-error');button.disabled=true;error.hidden=true;
  try {
   const d=new FormData(form),title=d.get('title').trim(),subtitle=d.get('subtitle').trim(),detail=d.get('detail').trim();
   if(!title||!subtitle||!detail)throw new Error('กรุณากรอกหัวข้อ หัวข้อรอง และรายละเอียด');
   let pdf=d.has('removePdf')?null:a.pdf,cover=d.has('removeCover')?null:a.cover;
   const file=d.get('pdf');if(file.name){
    if(!/\.pdf$/i.test(file.name)||(file.type&&file.type!=='application/pdf'))throw new Error('เอกสารแนบรองรับไฟล์ PDF เท่านั้น');
    if(file.size>2*1024*1024)throw new Error('ไฟล์ PDF ต้องไม่เกิน 2 MB');
    if(await file.slice(0,5).text()!=='%PDF-')throw new Error('ไฟล์นี้ไม่ใช่เอกสาร PDF ที่ถูกต้อง');
    const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('อ่านไฟล์ไม่สำเร็จ กรุณาเลือกอีกครั้ง'));r.readAsDataURL(file);});
    pdf={name:file.name,size:file.size,data};
   }
   if(d.get('cover').size)cover=await readPhoto(d.get('cover'));
   if(!document.contains(form))return;
   if(!commit(()=>Object.assign(state.announcements.find(x=>x.id===a.id),{title,subtitle,detail,body:detail,pdf,cover})))throw new Error('พื้นที่จัดเก็บไม่เพียงพอ กรุณาลดขนาดไฟล์แล้วลองอีกครั้ง');
   go(`announcement/${a.id}`);toast('บันทึกประกาศตัวอย่างแล้ว');
  }catch(err){error.textContent=err.message;error.hidden=false;error.focus();}finally{button.disabled=false;}
 };
}
