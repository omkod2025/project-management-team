function visitorIsHistory(v){return !!(v.revoked||v.exitedAt||v.end<iso());}
function visitorIsInside(v){
 return !v.revoked&&!v.exitedAt&&v.start<=iso()&&v.end>=iso()&&visitorStatus(v)[0]!=='กำลังเข้า'&&(!!v.enteredAt||v.source==='walkin');
}
function visitorOverviewRow(v,calling=false){
 const [label,color]=visitorStatus(v);
 return `<article class="service-card visit-row ${calling?'visit-row-calling':''}" data-id="${esc(v.id)}" data-plate="${esc(v.plate)}" data-search="${esc((v.name||'')+' '+(v.plate||''))}" data-status="${esc(label)}"><button type="button" class="visitor-row-open" data-action="visitor-open" data-visitor-id="${esc(v.id)}" aria-label="ดูรายละเอียด ${esc(v.name||v.plate)}">${visitorStatusIcon(v)}<div class="grow"><div class="visit-row-title"><h3>${esc(v.plate||v.name)}</h3>${pill(label,color)}</div><p>${esc(v.name||v.category)}</p><p class="visitor-row-meta">${v.source==='walkin'?'Visitor':'Reserve'} · ${dateLabel(v.start)}${v.startTime?' · '+esc(v.startTime):''}</p></div>${icon('chevron')}</button>${calling?renderVisitorCalling(v):''}</article>`;
}
function renderVisitorOverview(tab){
 if(tab&&!['list','registered','inside','entering','history'].includes(tab))return go('visitors');
 visitorExamples();registeredVisitorExamples();ensureReservationStatusSamples();currentGuardCall();
 // Keep each demo caller independent when switching between Visitor and Reserve calls.
 const existing=currentGuardCall();
 if(existing&&!existing.visitorId){
  const match=scoped(state.visitors).find(v=>v.source==='walkin'&&v.plate===existing.plate&&v.province===existing.province);
  if(match&&!match.demoCall)commit(()=>{match.demoCall={...existing,visitorId:match.id};state.guardCalls[house().id]=match.demoCall;});
 }
 ensureVisitorStatusSamples();
 const all=demoList(scoped(state.visitors)).sort((a,b)=>String(b.start||'').localeCompare(String(a.start||''))||String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
 const calls=canReceiveApproval()?all.filter(v=>['ringing','active'].includes(visitorEntryCall(v)?.status)):[];
 const entering=all.filter(v=>visitorStatus(v)[0]==='กำลังเข้า');
 const inside=all.filter(visitorIsInside);
 const list=(tab==='list'?all.filter(v=>v.source==='walkin'):tab==='registered'?all.filter(v=>v.source!=='walkin'):tab==='inside'?inside.filter(v=>routeParts[2]==='registered'?v.source!=='walkin':v.source==='walkin'):tab==='entering'?entering:tab==='history'?all.filter(v=>visitorIsHistory(v)&&(routeParts[2]==='registered'?v.source!=='walkin':v.source==='walkin')):all);
 if(tab)return renderVisitorListPage(tab,list,calls);
 page(header('ผู้มาติดต่อ')+`<div class="content visitor-surface visitor-overview">
 ${calls.length?`<section class="visitor-live" aria-labelledby="visitor-live-title"><div class="visitor-overview-heading"><h2 id="visitor-live-title">สายที่ต้องดูแล</h2><span>${calls.length} สาย</span></div><div id="visitor-calls">${calls.map(v=>visitorOverviewRow(v,true)).join('')}</div></section>`:''}
 <section class="visitor-today" aria-labelledby="visitor-today-title"><div class="visitor-overview-heading"><h2 id="visitor-today-title">ภาพรวมวันนี้</h2><span>${dateLabel(iso())}</span></div><div class="visitor-today-counts"><button data-action="go" data-route="visitors/entering" ${tab==='entering'?'aria-current="page"':''}><span>${icon('visitorEntry')} กำลังเข้า</span><strong>${entering.length}<small> รายการ</small></strong>${icon('chevron')}</button><button data-action="go" data-route="visitors/inside" ${tab==='inside'?'aria-current="page"':''}><span>${icon('visitor')} อยู่ในโครงการ</span><strong>${inside.length}<small> รายการ</small></strong>${icon('chevron')}</button></div></section>
 <div class="visitor-primary-actions">${linkBtn(icon('plus')+' ลงทะเบียนล่วงหน้า','visitor-new')}${linkBtn(icon('scan')+' สแกน / ประทับตรา','scan','secondary')}</div>
 <nav class="visitor-hub-menu" aria-label="เมนูผู้มาติดต่อ"><button data-action="go" data-route="visitors/list">${icon('visitor')}<span><strong>ผู้มาติดต่อ</strong><small>Visitor · ทุกสถานะ</small></span>${icon('chevron')}</button><button data-action="go" data-route="visitors/registered">${icon('calendar')}<span><strong>รายการจอง</strong><small>ลงทะเบียนล่วงหน้า · ทุกสถานะ</small></span>${icon('chevron')}</button></nav></div>`);
}
function renderVisitorListPage(tab,list,calls){
 const insidePage=tab==='inside',historyPage=tab==='history',insideRegistered=routeParts[2]==='registered';
 const title=tab==='list'?'ผู้มาติดต่อ':insidePage?'อยู่ในโครงการ':historyPage?'ประวัติการเข้า–ออก':tab==='registered'?'รายการจอง':'กำลังเข้า';
 list.sort((a,b)=>Number(calls.includes(b))-Number(calls.includes(a)));
 page(header(title).replace('data-action="back"','data-action="go" data-route="visitors"')+`<div class="content visitor-surface visitor-overview visitor-list-page"> <section aria-label="${title}">
 ${insidePage||historyPage?tabs([['ผู้มาติดต่อ',`visitors/${tab}`],['ลงทะเบียนล่วงหน้า',`visitors/${tab}/registered`]],insideRegistered?1:0):`<p class="visitor-list-context">${tab==='list'?'รายการผู้มาติดต่อทั้งหมด · ทุกสถานะ':tab==='registered'?'รายการลงทะเบียนล่วงหน้าทั้งหมด · กรองสถานะได้':'รายการที่กำลังขอเข้าโครงการ'}</p>`}
 <div class="visitor-search-row"><label class="field"><span>ค้นหาชื่อหรือทะเบียนรถ</span><input id="visitor-plate-search" type="search" placeholder="ชื่อผู้มาติดต่อ หรือทะเบียนรถ" autocomplete="off" aria-controls="visitor-list"></label><button type="button" class="icon-button visitor-filter-trigger" data-action="visitor-filter-toggle" aria-label="กรองสถานะ" aria-expanded="false" aria-controls="visitor-status-panel" ${list.length?'':'disabled'}>${icon('filter')}</button></div>${visitorStatusFilters(list,tab==='list'?['กำลังเข้า','รอประทับตรา','ประทับตราแล้ว','ออกแล้ว']:undefined)}
 <div class="visitor-results-summary"><span>${list.length} รายการ · ใหม่ไปเก่า</span><p id="visitor-search-result" class="sr-only" role="status"></p></div><div id="visitor-list">${list.map(v=>visitorOverviewRow(v,calls.includes(v))).join('')}</div>
 <div id="visitor-list-empty" ${list.length?'hidden':''}>${empty('visitor',historyPage?'ยังไม่มีประวัติในหมวดนี้':insidePage?(insideRegistered?'ยังไม่มีผู้ลงทะเบียนล่วงหน้าอยู่ในโครงการ':'ยังไม่มีผู้มาติดต่ออยู่ในโครงการ'):tab==='entering'?'ยังไม่มีผู้มาติดต่อกำลังเข้า':tab==='registered'?'ยังไม่มีรายการจอง':'ยังไม่มีรายการผู้มาติดต่อ','เมื่อมีรายการ จะแสดงข้อมูลที่นี่')}</div><div id="visitor-filter-empty" class="visitor-filter-empty" hidden><h2>ไม่พบรายการที่ตรงกับตัวกรอง</h2><p>ลองค้นหาชื่อ ทะเบียนรถ หรือเปลี่ยนสถานะ</p>${btn('ล้างตัวกรอง','visitor-filter-reset','','secondary')}</div></section></div>`);
}
function ensureReservationStatusSamples(){
 const home=house().id;
 if(state.reservationStatusSamples?.[home])return;
 const at=(day,time)=>iso(day)+'T'+time+':00+07:00';
 const samples=[
  {status:'รอเข้า',name:'คุณอรทัย วงศ์สวัสดิ์',plate:'ขร 6812',start:iso(1),end:iso(1)},
  {status:'กำลังเข้า',name:'คุณศรัณย์ พงษ์ไพศาล',plate:'กว 3948',calling:true},
  {status:'รอประทับตรา',name:'ช่างติดตั้งเครื่องกรองน้ำ',plate:'ขม 7264',enteredAt:at(0,'09:15')},
  {status:'ประทับตราแล้ว',name:'คุณปวีณา รัตนกุล',plate:'กท 8153',enteredAt:at(0,'08:40'),stamped:true,stampedAt:at(0,'09:10'),stampedBy:'คุณธนกร (ผู้ประทับตราตัวอย่าง)',stampRight:'สิทธิ์ลูกบ้าน',stampNote:'เข้าพบลูกบ้านตามนัดหมาย'},
  {status:'ออกแล้ว',name:'คุณณัฐพล ศรีสุวรรณ',plate:'ขพ 4579',start:iso(-1),end:iso(-1),enteredAt:at(-1,'10:20'),exitedAt:at(-1,'12:05'),stamped:true,stampedAt:at(-1,'11:50'),stampedBy:'คุณธนกร (ผู้ประทับตราตัวอย่าง)',stampRight:'สิทธิ์ลูกบ้าน'},
  {status:'ยกเลิก',name:'ช่างดูแลสวน',plate:'กบ 2637',revoked:true},
  {status:'หมดอายุ',name:'คุณวราภรณ์ แสงอรุณ',plate:'ขล 9082',start:iso(-3),end:iso(-3)}
 ];
 const existing=new Set(scoped(state.visitors).filter(v=>v.source!=='walkin').map(v=>visitorStatus(v)[0]));
 commit(()=>{
  samples.forEach((sample,i)=>{
   if(existing.has(sample.status))return;
   const id='RESERVE-STATUS-DEMO-'+home+'-'+i;
   if(state.visitors.some(v=>v.id===id))return;
   const {status,calling,...fields}=sample;
   const v={id,home,source:'registered',category:'รถยนต์',province:'กรุงเทพมหานคร',entryMode:'single',bookingFormat:visitorBookingFormats()[0],start:iso(),end:iso(),startTime:'08:00',endTime:'18:00',enteredAt:null,exitedAt:null,stamped:false,demo:true,createdAt:at(-4,'14:30'),note:'ข้อมูลตัวอย่างรายการจอง · '+status,...fields};
   if(calling)v.demoCall={visitorId:id,name:v.name,plate:v.plate,province:v.province,photo:'assets/examples/visitor-caller.jpg',status:'ringing'};
   state.visitors.push(v);
  });
  state.reservationStatusSamples={...state.reservationStatusSamples,[home]:true};
 });
}

function ensureVisitorStatusSamples(){
 const home=house().id;
 if(state.visitorStatusSamplesV2?.[home])return;
 // Remove only the obsolete demo records created for unsupported walk-in states.
 const obsolete=new Set([0,5,6].map(i=>'VISITOR-STATUS-DEMO-'+home+'-'+i));
 if(!commit(()=>{state.visitors=state.visitors.filter(v=>!(v.demo&&v.source==='walkin'&&obsolete.has(v.id)));}))return;
 const at=(day,time)=>iso(day)+'T'+time+':00+07:00';
 const samples=[
  {status:'กำลังเข้า',name:'คุณวรพล ส่งสินค้า',plate:'ขส 7281',calling:true},
  {status:'รอประทับตรา',name:'ช่างซ่อมเครื่องปรับอากาศ',plate:'กช 4526',enteredAt:at(0,'09:20')},
  {status:'ประทับตราแล้ว',name:'คุณปาริชาติ เยี่ยมลูกบ้าน',plate:'ขว 8194',enteredAt:at(0,'09:00'),stamped:true,stampedAt:at(0,'09:30'),stampedBy:'คุณธนกร (ผู้ประทับตราตัวอย่าง)',stampRight:'สิทธิ์ลูกบ้าน'},
  {status:'ออกแล้ว',name:'พนักงานจัดส่งพัสดุ',plate:'กพ 3572',start:iso(-1),end:iso(-1),enteredAt:at(-1,'10:00'),exitedAt:at(-1,'10:45'),stamped:true,stampedAt:at(-1,'10:30'),stampedBy:'คุณธนกร (ผู้ประทับตราตัวอย่าง)',stampRight:'สิทธิ์ลูกบ้าน'},
 ];
 const existing=new Set(scoped(state.visitors).filter(v=>v.source==='walkin').map(v=>visitorStatus(v)[0]));
 commit(()=>{
  samples.forEach((sample,i)=>{
   if(existing.has(sample.status))return;
   const id='VISITOR-STATUS-DEMO-'+home+'-'+(i+1);
   if(state.visitors.some(v=>v.id===id))return;
   const {status,calling,...fields}=sample;
   const v={id,home,source:'walkin',category:'รถยนต์',province:'กรุงเทพมหานคร',entryMode:'single',start:iso(),end:iso(),startTime:'08:00',endTime:'18:00',enteredAt:null,exitedAt:null,stamped:false,demo:true,createdAt:at(-4,'14:30'),note:'ข้อมูลตัวอย่างผู้มาติดต่อ · '+status,...fields};
   if(calling)v.demoCall={visitorId:id,name:v.name,plate:v.plate,province:v.province,photo:'assets/examples/visitor-caller.jpg',status:'ringing'};
   state.visitors.push(v);
  });
  state.visitorStatusSamplesV2={...state.visitorStatusSamplesV2,[home]:true};
 });
}
