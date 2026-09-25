'use strict';
function addRepairSamples(data) {
 if(data.repairSamplesVersion===2)return false;
 const at=(days,hour,minute=0)=>{const d=new Date();d.setDate(d.getDate()-days);d.setHours(hour,minute,0,0);return d.toISOString();};
 const base={home:data.home,phone:data.profile.phone,demo:true,photos:[]};
 const examples=[
  {id:'RP-SAMPLE-201',type:'ประปา',subtype:'ก๊อกน้ำและท่อน้ำ',detail:'ก๊อกน้ำข้างสวนหยดตลอดเวลา แม้หมุนปิดจนสุดแล้ว พื้นบริเวณฐานก๊อกเปียกและเริ่มลื่น',status:'รอดำเนินการ',createdAt:at(0,8,15),photos:['assets/examples/repair-leak.svg','assets/examples/repair-joint.svg']},
  {id:'RP-SAMPLE-202',type:'ไฟฟ้า',subtype:'ไฟส่องสว่าง',detail:'ไฟทางเดินจากคลับเฮาส์ไปลานจอดรถดับ 2 ดวง ช่วงค่ำมองเห็นทางเดินไม่ชัด',status:'รับเรื่อง',createdAt:at(1,18,42),acceptedAt:at(0,9,10),acceptanceDetail:'นิติบุคคลรับเรื่องแล้ว นัดช่างไฟเข้าตรวจสอบช่วงบ่ายวันนี้'},
  {id:'RP-SAMPLE-203',type:'ความปลอดภัย',subtype:'กล้องวงจรปิด',detail:'กล้องบริเวณประตูทางเข้าไม่แสดงภาพที่จุดรักษาความปลอดภัย',status:'กำลังดำเนินการ',createdAt:at(2,10,25),acceptedAt:at(2,11,5),progress:{date:at(1,14,35),detail:'ช่างตรวจพบสายสัญญาณชำรุด กำลังเปลี่ยนสายและทดสอบภาพ ระหว่างนี้เจ้าหน้าที่เพิ่มรอบตรวจบริเวณทางเข้า'}},
  {id:'RP-SAMPLE-204',type:'ประปา',subtype:'ก๊อกน้ำและท่อน้ำ',detail:'ข้อต่อก๊อกน้ำบริเวณลานซักล้างส่วนกลางรั่ว มีน้ำขังบริเวณพื้น',status:'เสร็จสิ้น',createdAt:at(3,9,12),acceptedAt:at(3,10,5),progress:{date:at(3,13,20),detail:'ปิดน้ำเฉพาะจุดและถอดข้อต่อเดิมเพื่อเปลี่ยนซีลใหม่'},closedAt:at(3,15,45),photos:['assets/examples/repair-joint.svg'],resolution:{date:at(3,15,45),detail:'เปลี่ยนซีลและขันข้อต่อใหม่ ทดสอบเปิดน้ำต่อเนื่องแล้วไม่พบการรั่วซึม ทำความสะอาดพื้นเรียบร้อย',photos:['assets/examples/repair-completed.svg'],demo:true}},
  {id:'RP-SAMPLE-205',type:'พื้นที่ส่วนกลาง',subtype:'ถนนและทางเดิน',detail:'แจ้งฝาท่อระบายน้ำบริเวณทางเดินหน้าบ้านเคลื่อนจากตำแหน่งเดิม',status:'ยกเลิก',createdAt:at(4,7,50),closedAt:at(4,8,10)},
  {id:'RP-SAMPLE-206',type:'อื่น ๆ',subtype:'งานซ่อมทั่วไป',detail:'ขอให้ช่างโครงการเปลี่ยนบานพับตู้ครัวภายในบ้าน',status:'ปฏิเสธ',createdAt:at(5,16,20),closedAt:at(4,9,25),rejectionReason:'งานซ่อมเฟอร์นิเจอร์ภายในบ้านอยู่นอกขอบเขตการดูแลของนิติบุคคล กรุณาติดต่อช่างส่วนตัวเพื่อประเมินและดำเนินการ'},
  {id:'RP-SAMPLE-207',type:'พื้นที่ส่วนกลาง',subtype:'สวนและต้นไม้',detail:'กิ่งไม้บริเวณทางเดินสวนยื่นต่ำ ทำให้ต้องก้มหลบขณะเดินผ่าน',status:'กำลังดำเนินการ',createdAt:at(6,8,35),acceptedAt:at(6,9,15),progress:{date:at(5,10,40),detail:'ทีมสวนกั้นพื้นที่และเริ่มตัดแต่งกิ่งไม้ โดยเว้นทางเดินอีกฝั่งให้ลูกบ้านสัญจรได้'}},
  {id:'RP-SAMPLE-208',type:'ไฟฟ้า',subtype:'ไฟส่องสว่าง',detail:'ไฟบริเวณป้ายโครงการกะพริบเป็นระยะในช่วงกลางคืน',status:'เสร็จสิ้น',createdAt:at(8,19,5),acceptedAt:at(7,9,30),progress:{date:at(7,13,15),detail:'ตรวจพบชุดจ่ายไฟเสื่อม เปลี่ยนอุปกรณ์และตรวจสายไฟ'},closedAt:at(7,17,50),resolution:{date:at(7,17,50),detail:'เปลี่ยนชุดจ่ายไฟและทดสอบเปิดไฟแล้ว แสงสว่างคงที่ ไม่มีอาการกะพริบ',photos:[],demo:true}}
 ];
 for(const example of examples){if(!data.repairs.some(r=>r.id===example.id))data.repairs.push({...base,...example,date:example.createdAt.slice(0,10)});}
 data.repairSamplesVersion=2;
 return true;
}
