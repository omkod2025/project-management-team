// Demonstration documents shared across projects; not official meeting records.
window.ProjectMeetings = [
 {id:'MT-DEMO-003',date:'2026-09-20',title:'แผนดูแลพื้นที่ส่วนกลางและระบบรักษาความปลอดภัย',summary:'แนวทางปรับปรุงสวน ไฟส่องสว่าง และการเข้า–ออกโครงการ',details:['ทบทวนจุดที่ต้องปรับปรุงในสวนและทางเดินส่วนกลาง เพื่อจัดลำดับงานบำรุงรักษาให้เหมาะกับการใช้งานของลูกบ้าน','หารือการตรวจเช็กไฟส่องสว่าง กล้องวงจรปิด และอุปกรณ์บริเวณทางเข้า–ออก พร้อมแนวทางแจ้งความคืบหน้าให้ลูกบ้านทราบ','เอกสารแนบเป็นตัวอย่างวาระและสรุปการหารือ ไม่มีผลเป็นมติหรือคำสั่งดำเนินงานจริง'],file:'assets/examples/meeting-MT-DEMO-003.pdf'},
 {id:'MT-DEMO-002',date:'2026-08-16',title:'ทบทวนการให้บริการและช่องทางติดต่อสำนักงานนิติบุคคล',summary:'รวบรวมข้อเสนอแนะเรื่องแจ้งซ่อม การติดต่อ และการสื่อสารภายในโครงการ',details:['รวบรวมประเด็นเกี่ยวกับการแจ้งซ่อมและการติดตามผล เพื่อให้ลูกบ้านตรวจสอบความคืบหน้าได้สะดวก','หารือแนวทางปรับปรุงสมุดโทรศัพท์และช่องทางรับข้อเสนอแนะ รวมถึงการแจ้งข่าวสารที่จำเป็น','เอกสารนี้จัดทำสำหรับสาธิตการอ่านและดาวน์โหลดรายงานการประชุม ไม่ใช่รายงานที่รับรองแล้ว'],file:'assets/examples/meeting-MT-DEMO-002.pdf'},
 {id:'MT-DEMO-001',date:'2026-07-12',title:'แนวทางใช้พื้นที่ส่วนกลางร่วมกัน',summary:'การดูแลความสะอาด การใช้พื้นที่ และการลดเสียงรบกวน',details:['แลกเปลี่ยนข้อเสนอแนะเกี่ยวกับการใช้พื้นที่ส่วนกลางอย่างเหมาะสม เพื่อให้ทุกครัวเรือนใช้งานร่วมกันได้','ทบทวนแนวทางดูแลความสะอาด การจัดเก็บอุปกรณ์ และการสื่อสารเมื่อพบปัญหาในพื้นที่','รายละเอียดและวาระทั้งหมดเป็นข้อมูลตัวอย่างสำหรับต้นแบบ ไม่ใช่ข้อบังคับเพิ่มเติมของโครงการ'],file:'assets/examples/meeting-MT-DEMO-001.pdf'}
];

window.ReportCategories = [
 {id:'annual',title:'รายงานประชุมใหญ่',icon:'users'},
 {id:'committee',title:'รายงานประชุมกรรมการ',icon:'chat'},
 {id:'finance',title:'รายงานการเงิน',icon:'bill'},
 {id:'regulations',title:'ระเบียบบังคับ',icon:'rules'},
 {id:'insurance',title:'ประกันภัยอาคาร',icon:'home'},
 {id:'physical',title:'กายภาพโครงการ',icon:'wrench'}
];
window.ProjectMeetings.forEach((record,index)=>record.category=index===2?'annual':'committee');
window.ProjectMeetings.push({id:'REG-DEMO-001',category:'regulations',date:'2026-07-01',title:'ระเบียบการอยู่อาศัยร่วมกัน',summary:'เอกสารตัวอย่างแนวทางการใช้พื้นที่และการอยู่ร่วมกันในโครงการ',details:['ศึกษาแนวทางการอยู่อาศัยและการใช้พื้นที่ส่วนกลางจากเอกสารแนบ','เอกสารนี้ใช้สำหรับสาธิต กรุณาติดต่อสำนักงานนิติบุคคลเพื่อขอข้อบังคับฉบับที่มีผลใช้จริง'],file:'assets/examples/policy_example.doc.pdf'});

function renderReportCategories(){
 const records=demoList(window.ProjectMeetings);
 page(header('รายงานทั่วไป')+`<div class="content meeting-content"><div class="meeting-intro"><p>${esc(house().project)}</p><h2>เอกสารโครงการ</h2><p>เลือกหมวดหมู่เพื่ออ่านรายงานและเอกสารที่เกี่ยวข้อง</p></div><div class="meeting-list report-categories">${window.ReportCategories.map(c=>`<button class="meeting-list-item" data-action="go" data-route="meetings/category/${c.id}"><span class="meeting-list-icon">${icon(c.icon)}</span><span class="meeting-list-copy"><strong>${c.title}</strong><span class="meeting-summary">${records.filter(r=>r.category===c.id).length} รายการ</span></span>${icon('chevron')}</button>`).join('')}</div></div>`);
}
function renderReportCategory(categoryId){
 const category=window.ReportCategories.find(c=>c.id===categoryId);
 if(!category)return page(header('รายงานทั่วไป')+empty('rules','ไม่พบหมวดหมู่','เลือกหมวดหมู่จากรายงานทั่วไป',linkBtn('ดูหมวดหมู่ทั้งหมด','meetings')));
 const list=demoList(window.ProjectMeetings).filter(r=>r.category===categoryId).sort((a,b)=>b.date.localeCompare(a.date));
 page(header(category.title).replace('data-action="back"','data-action="go" data-route="meetings"')+`<div class="content meeting-content"><div class="meeting-list-heading"><h3>${category.title}</h3><span>${list.length} รายการ</span></div><div class="meeting-list">${list.map(m=>`<button class="meeting-list-item" data-action="go" data-route="meetings/${m.id}"><span class="meeting-list-icon">${icon('rules')}</span><span class="meeting-list-copy"><span class="meeting-date">${dateLabel(m.date)}</span><strong>${esc(m.title)}</strong><span class="meeting-summary">${esc(m.summary)}</span><span class="meeting-file-label">PDF · ดูรายละเอียด</span></span>${icon('chevron')}</button>`).join('')||empty('rules','ยังไม่มีรายงานในหมวดนี้','เมื่อโครงการเพิ่มเอกสาร จะแสดงรายการที่นี่')}</div><p class="demo-label">ข้อมูลและเอกสารตัวอย่างสำหรับสาธิต</p></div>`);
}
