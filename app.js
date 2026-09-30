'use strict';
const STORAGE_KEY = 'bannayuu.resident.v1';
const $ = (s, root = document) => root.querySelector(s);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = value => Number(value).toLocaleString('th-TH', { maximumFractionDigits: 2 });
const iso = (offset = 0) => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const dateLabel = value => value ? new Date(value.length === 10 ? value + 'T12:00:00' : value).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const uid = prefix => prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const paths = {
 stampPending: 'M6 3h6l-1 7H7L6 3zM4 10h10v5H4zM3 18h8M18 12a5 5 0 1 0 0 10 5 5 0 1 0 0-10M18 14v3l2 1',
 stampComplete: 'M6 3h6l-1 7H7L6 3zM4 10h10v5H4zM3 18h8m2-1 3 3 6-7',
 visitorExited: 'M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18m-4 9 3 3 5-6',
 visitorEntry: 'M13 5V3H4v18h9v-2M20 12H9m4-4-4 4 4 4',
 visitorCancelled: 'M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18M8.5 8.5l7 7m0-7-7 7',
 visitorExpired: 'M5 3h14M5 21h14M7 3v4c0 2 3 3 5 5-2 2-5 3-5 5v4M17 3v4c0 2-3 3-5 5 2 2 5 3 5 5v4M9 6h6M9 18h6',
 filter: 'M3 6h18M3 12h18M3 18h18M7 4h1a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM14 10h1a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1zM7 16h1a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1z',
 share: 'm14 3 8 8-8 8v-5c-5 0-8 2-11 6 0-8 4-12 11-12V3z',
 video: 'M3 5h12v14H3zM15 10l6-4v12l-6-4z',
 home: 'M3 10 12 3l9 7v11H3z M9 21v-8h6v8', chevron: 'm9 5 7 7-7 7', back: 'm15 5-7 7 7 7', close: 'm6 6 12 12M18 6 6 18', plus: 'M12 5v14M5 12h14', minus: 'M5 12h14', check: 'm5 12 4 4L19 6', bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4', bill: 'M5 3h14v18l-3-2-4 2-4-2-3 2zM8 7h8M8 11h6M8 15h4', parcel: 'm3 7 9-4 9 4v11l-9 4-9-4zM3 7l9 5 9-5M12 12v10M7 5l10 5v4', facility: 'M3 5v14M7 3v18M17 3v18M21 5v14M7 12h10', wrench: 'M14 4a6 6 0 0 0-6 8L3 17a3 3 0 0 0 4 4l6-6a6 6 0 0 0 7-8l-4 4-3-3 4-4z', car: 'm5 7 2-4h10l2 4 2 4v7H3v-7zM5 7h14M3 13h18M6 17v4M18 17v4M6 10h1M17 10h1', pet: 'M8 14c-6 6 0 9 4 6 4 3 10 0 4-6-2-3-6-3-8 0zM5 6a2 3 0 1 0 0 6 2 3 0 1 0 0-6M10 2a2 3 0 1 0 0 6 2 3 0 1 0 0-6M16 3a2 3 0 1 0 0 6 2 3 0 1 0 0-6M21 8a2 3 0 1 0 0 6 2 3 0 1 0 0-6', visitor: 'M12 2a4 4 0 1 0 0 8 4 4 0 1 0 0-8M5 21v-4a7 7 0 0 1 14 0v4M8 16h8M12 13v6', sos: 'M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20M12 6v7M12 17h.01', feedback: 'M5 3h11l4 4v14H5zM15 3v5h5M8 12h8M8 16h6', phone: 'M7 3H3c-1 10 8 19 18 18v-4l-5-2-2 2a15 15 0 0 1-7-7l2-2z', users: 'M9 3a3 3 0 1 0 0 6 3 3 0 1 0 0-6M2 20v-3a7 7 0 0 1 14 0v3M17 4a3 3 0 0 1 0 6M18 13a5 5 0 0 1 4 5v2', chat: 'M3 3h18v14H9l-6 4zM7 8h10M7 12h7', rules: 'M4 3h16v18H4zM8 7h8M8 11h8M8 15h8M8 19h4', gift: 'M3 8h18v5H3zM5 13v8h14v-8M12 8v13M12 8C2 8 6-2 12 8c6-10 10 0 0 0', vote: 'M5 10H2v11h20V10h-3M7 14h10M8 2h8v10H8zM10 6l2 2 3-3', announce: 'M3 9h5l12-5v16L8 15H3zM6 15l2 6h4l-2-5', service: 'M4 9h16v12H4zM8 9V5h8v4M2 9h20M9 14h6', timeline: 'M3 3h18v18H3zM7 7h10M7 11h6M7 15h10', shop: 'M3 7h18l-2 14H5zM8 7V5a4 4 0 0 1 8 0v2', settings: 'M21.41 10.68 L21.41 13.32 L19.28 13.81 L18.43 15.86 L19.59 17.72 L17.72 19.59 L15.86 18.43 L13.81 19.28 L13.32 21.41 L10.68 21.41 L10.19 19.28 L8.14 18.43 L6.28 19.59 L4.41 17.72 L5.57 15.86 L4.72 13.81 L2.59 13.32 L2.59 10.68 L4.72 10.19 L5.57 8.14 L4.41 6.28 L6.28 4.41 L8.14 5.57 L10.19 4.72 L10.68 2.59 L13.32 2.59 L13.81 4.72 L15.86 5.57 L17.72 4.41 L19.59 6.28 L18.43 8.14 L19.28 10.19 Z M15.3 12a3.3 3.3 0 1 0-6.6 0a3.3 3.3 0 1 0 6.6 0', search: 'M10 3a7 7 0 1 0 0 14 7 7 0 1 0 0-14M15 15l6 6', cart: 'M2 3h3l3 13h11l3-9H6M9 20h.01M18 20h.01', more: 'M5 12h.01M12 12h.01M19 12h.01', copy: 'M8 8h13v13H8zM16 8V3H3v13h5', download: 'M12 3v12m-5-5 5 5 5-5M3 17v4h18v-4', trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M9 10v7M15 10v7', edit: 'm14 4 6 6M4 14 16 2l6 6-12 12-7 1z', camera: 'M3 7h4l2-3h6l2 3h4v14H3zM12 10a4 4 0 1 0 0 8 4 4 0 1 0 0-8', calendar: 'M3 5h18v16H3zM7 2v6M17 2v6M3 10h18M7 14h2M13 14h2M7 18h2', heart: 'M12 21 3 12C-3 3 8-1 12 6c4-7 15-3 9 6z', lock: 'M5 10h14v11H5zM8 10V6a4 4 0 0 1 8 0v4M12 14v3', globe: 'M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20M2 12h20M12 2c-6 6-6 14 0 20 6-6 6-14 0-20', leaf: 'M3 21C0 5 13 2 21 3c1 15-5 19-15 15M3 21 16 8', scan: 'M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5M3 12h18', refresh: 'M20 7a9 9 0 1 0 1 9M20 2v6h-6', send: 'm2 3 20 9-20 9 4-9zM6 12h16', star: 'm12 2 3 6 7 1-5 5 1 8-6-4-6 4 1-8-5-5 7-1z', clock: 'M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20M12 6v6l4 3', receipt: 'M5 3h14v18l-3-2-4 2-4-2-3 2zM8 7h8M8 11h8M8 15h5', checkCircle: 'M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20m-5 10 3 3 7-7'
};
paths.qrCode = 'M3 3h6v6H3z M15 3h6v6h-6z M3 15h6v6H3z M13 13h3v3h-3z M19 13h2v4 M13 19v2h4 M19 19h2v2h-2z';
paths.info = 'M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18M12 11v6M12 7h.01';
const icon = (name, cls = '') => name==='car'
 ? `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true"><path fill-rule="evenodd" d="M7.1 4.2h9.8c1.35 0 2.05.65 2.55 1.85L20.7 9.1c1.3-.2 2.3.05 2.3.8 0 .85-.65 1.45-1.65 1.65.65 1.35 1 2.7 1 4.45v3.5c0 1-.45 1.5-1.4 1.5h-.9c-.95 0-1.4-.5-1.4-1.5v-1H5.35v1c0 1-.45 1.5-1.4 1.5h-.9c-.95 0-1.4-.5-1.4-1.5V16c0-1.75.35-3.1 1-4.45C1.65 11.35 1 10.75 1 9.9c0-.75 1-1 2.3-.8l1.25-3.05C5.05 4.85 5.75 4.2 7.1 4.2Zm.2.95c-.85 0-1.15.35-1.5 1.15L4.4 9.65c-.35.85-.2 1.25.8 1.25h13.6c1 0 1.15-.4.8-1.25L18.2 6.3c-.35-.8-.65-1.15-1.5-1.15H7.3ZM5.4 13.65a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 1 0 0-2.4Zm13.2 0a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 1 0 0-2.4ZM7.5 13.5v1.9h9v-1.9h-9Z"/></svg>`
 : `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.home}"/></svg>`;
const btn = (text, action, extra = '', cls = '') => `<button type="button" class="btn ${cls}" data-action="${action}" ${extra}>${text}</button>`;
const linkBtn = (text, route, cls = '') => btn(text, 'go', `data-route="${esc(route)}"`, cls);
const iconBtn = (name, label, action, extra = '') => `<button type="button" class="icon-button" aria-label="${label}" data-action="${action}" ${extra}>${icon(name)}</button>`;
const pill = (label, cls = '') => `<span class="pill ${cls}">${esc(label)}</span>`;
const header = (title, right = '', back = true) => `<header class="header"><div class="head-side">${back ? iconBtn('back', 'ย้อนกลับ', 'back') : icon('home')}</div><h1>${esc(title)}</h1><div class="head-side">${right}</div></header>`;
const tabs = (items, active = 0) => `<nav class="tabs" aria-label="หมวดหมู่">${items.map(([label, route], i) => `<button data-action="go" data-route="${route}" class="${i === active ? 'active' : ''}" ${i === active ? 'aria-current="page"' : ''}>${label}</button>`).join('')}</nav>`;
const empty = (name, title, text = '', cta = '') => `<div class="empty"><div class="empty-icon">${icon(name)}</div><h2>${title}</h2><p>${text}</p>${cta}</div>`;
const detail = pairs => `<div class="details">${pairs.map(([k, v]) => `<span>${esc(k)}</span><span>${esc(v)}</span>`).join('')}</div>`;
const field = (name, label, type = 'text', value = '', attrs = '') => `<label class="field"><span>${label}${attrs.includes('required') ? ' <b class="required">*</b>' : ''}</span><input name="${name}" type="${type}" value="${esc(value)}" ${attrs}></label>`;
const area = (name, label, value = '', attrs = '') => `<label class="field"><span>${label}${attrs.includes('required') ? ' <b class="required">*</b>' : ''}</span><textarea name="${name}" ${attrs}>${esc(value)}</textarea></label>`;
const select = (name, label, options, value = '', attrs = 'required') => `<label class="field"><span>${label}${attrs.includes('required') ? ' <b class="required">*</b>' : ''}</span><select name="${name}" ${attrs}><option value="">เลือก${label}</option>${options.map(x => { const [val, text] = Array.isArray(x) ? x : [x, x]; return `<option value="${esc(val)}" ${value === val ? 'selected' : ''}>${esc(text)}</option>`; }).join('')}</select></label>`;
const upload = (label, max = 1, required = false) => `<div class="field"><span>${label}${required ? ' <b class="required">*</b>' : ''}</span><div class="upload-zone" ${required?'data-required-photo':''}><label style="display:block;margin-bottom:12px;font-weight:400">เลือกรูปจากอัลบั้ม<input style="display:block;margin-top:8px" type="file" name="photos" accept="image/png,image/jpeg" ${max > 1 ? 'multiple' : ''} data-upload="${max}"></label>${btn(icon('camera')+' กล้องถ่ายรูป','open-camera',`data-max="${max}"`,'small secondary')}<small>รองรับ .png / .jpg ไม่เกิน 5 MB ต่อรูป • สูงสุด ${max} รูป</small><div class="preview-photos" id="photo-preview"></div></div></div>`;
const submit = (label = 'บันทึก') => `<button class="btn full" type="submit">${label}</button>`;
const bottom = html => `<div class="bottom-action">${html}</div>`;
const provinces = ['กรุงเทพมหานคร','กระบี่','กาญจนบุรี','กาฬสินธุ์','กำแพงเพชร','ขอนแก่น','จันทบุรี','ฉะเชิงเทรา','ชลบุรี','ชัยนาท','ชัยภูมิ','ชุมพร','เชียงราย','เชียงใหม่','ตรัง','ตราด','ตาก','นครนายก','นครปฐม','นครพนม','นครราชสีมา','นครศรีธรรมราช','นครสวรรค์','นนทบุรี','นราธิวาส','น่าน','บึงกาฬ','บุรีรัมย์','ปทุมธานี','ประจวบคีรีขันธ์','ปราจีนบุรี','ปัตตานี','พระนครศรีอยุธยา','พะเยา','พังงา','พัทลุง','พิจิตร','พิษณุโลก','เพชรบุรี','เพชรบูรณ์','แพร่','ภูเก็ต','มหาสารคาม','มุกดาหาร','แม่ฮ่องสอน','ยโสธร','ยะลา','ร้อยเอ็ด','ระนอง','ระยอง','ราชบุรี','ลพบุรี','ลำปาง','ลำพูน','เลย','ศรีสะเกษ','สกลนคร','สงขลา','สตูล','สมุทรปราการ','สมุทรสงคราม','สมุทรสาคร','สระแก้ว','สระบุรี','สิงห์บุรี','สุโขทัย','สุพรรณบุรี','สุราษฎร์ธานี','สุรินทร์','หนองคาย','หนองบัวลำภู','อ่างทอง','อำนาจเจริญ','อุดรธานี','อุตรดิตถ์','อุทัยธานี','อุบลราชธานี'];
function seed() {
 return {
  version: 1, profile: { name: 'พิมพ์ชนก สุขใจ', phone: '0812345678', email: 'pim@example.com' }, home: 'h1', homes: [{ id: 'h1', number: '212/1', project: 'อณาสิริ รัตนาธิเบศร์', members: [{ id: 'm1', name: 'พิมพ์ชนก สุขใจ', role: 'เจ้าบ้าน' }, { id: 'm2', name: 'ณัฐพล สุขใจ', role: 'ผู้อยู่อาศัย' }], invite: 'BNY212DEMO', expires: iso(30) }],
  bills: [{ id: 'BILL-001', home: 'h1', title: 'ค่าส่วนกลาง', period: 'ประจำเดือน ' + new Date().toLocaleDateString('th-TH', { month: 'long', year: 'numeric' }), amount: 2500, due: iso(7), paid: false }, { id: 'BILL-002', home: 'h1', title: 'ค่าส่วนกลาง', period: 'เดือนที่ผ่านมา', amount: 2500, due: iso(-23), paid: true, paidAt: iso(-25), method: 'พร้อมเพย์ (จำลอง)' }],
  deposits: [{ home: 'h1', title: 'เงินฝากส่วนกลาง', amount: 1000 }], parcels: [{ id: 'PCL-001', home: 'h1', image: 'assets/examples/example-parcel.jpg', courier: 'Kerry Express', tracking: 'DEMO-TH-091401', shelf: 'A-12', date: iso(), received: false }, { id: 'PCL-002', home: 'h1', courier: 'Flash Express', tracking: 'DEMO-TH-091402', shelf: 'B-03', date: iso(-1), received: false }, { id: 'PCL-003', home: 'h1', courier: 'ไปรษณีย์ไทย', tracking: 'DEMO-TH-090901', shelf: 'A-05', date: iso(-5), received: true, receivedAt: iso(-4) }],
  bookings: [], vehicles: [], pets: [], petIntro: false,
  visitors: [{ id: 'PASS-001', createdAt: iso(-2)+'T09:00:00+07:00', home: 'h1', name: 'ช่างดูแลสวน', category: 'รถยนต์', plate: '1กข 2345', province: 'สมุทรปราการ', start: iso(-1), end: iso(7), note: 'ดูแลสวนประจำสัปดาห์', stamped: false }, { id: 'PASS-002', createdAt: iso(-11)+'T10:00:00+07:00', home: 'h1', name: 'บริการจัดส่งเฟอร์นิเจอร์', category: 'รถยนต์', plate: '2ขค 5678', province: 'กรุงเทพมหานคร', start: iso(-10), end: iso(-9), note: 'ส่งโต๊ะรับประทานอาหาร' }],
  feedback: [], repairs: [], serviceBookings: [], cart: [], orders: [], notifications: [{ id: 'N1', title: 'พัสดุของคุณมาถึงแล้ว', text: 'มีพัสดุรอรับที่สำนักงานนิติบุคคล', route: 'parcels', read: false }, { id: 'N2', title: 'แจ้งบิลค่าส่วนกลาง', text: 'ตรวจสอบยอดและกำหนดชำระได้แล้ว', route: 'bills', read: false }],
  announcements: [{ id: 'A1', category: 'important', title: 'แจ้งปิดปรับปรุงสระว่ายน้ำชั่วคราว', date: iso(), body: 'เพื่อดูแลคุณภาพน้ำและความปลอดภัยของลูกบ้าน โครงการจะปิดสระว่ายน้ำเพื่อบำรุงรักษาในวันจันทร์หน้า เวลา 08:00–12:00 น. และเปิดให้บริการตามปกติหลังจากนั้น\n\nขอความร่วมมืองดใช้พื้นที่ในช่วงเวลาดังกล่าว ติดต่อสอบถามเพิ่มเติมได้ที่สำนักงานนิติบุคคล', read: false }, { id: 'A2', category: 'general', title: 'ชวนเพื่อนบ้านมาเดินเล่นในสวน', date: iso(-2), body: 'เย็นวันเสาร์นี้ พบกันที่สวนส่วนกลาง เวลา 17:00 น. มาพบปะเพื่อนบ้าน เดินเล่น และแบ่งปันเรื่องราวดี ๆ ด้วยกัน\n\nกิจกรรมไม่มีค่าใช้จ่าย เตรียมน้ำดื่มและรองเท้าที่เดินสบายมาด้วยนะคะ', read: false }],
  posts: [{ id: 'POST1', author: 'นิติบุคคล อณาสิริ', category: 'ข่าวชุมชน', text: 'เช้าวันใหม่กับพื้นที่สีเขียวของเรา 🌿\nสวนส่วนกลางพร้อมต้อนรับทุกคนแล้ว แวะมาเติมความสดชื่นกันนะคะ', date: iso(), likes: 12, liked: false, comments: [{ author: 'เพื่อนบ้าน', text: 'บรรยากาศดีมากเลยค่ะ' }], image: 'assets/community.svg' }, { id: 'POST2', author: 'เพื่อนบ้าน 215/8', category: 'พูดคุย', text: 'มีใครสนใจวิ่งด้วยกันตอนเช้าบ้างคะ เจอกันที่หน้าคลับเฮาส์ 6 โมงค่ะ', date: iso(-1), likes: 5, liked: false, comments: [] }],
  chat: [{ text: 'สวัสดีค่ะ สำนักงานนิติบุคคลยินดีให้บริการ ฝากข้อความไว้ได้เลยค่ะ', mine: false }], votes: {}, redeemed: [], settings: { appVersion: 1, notifications: true, marketing: false, requestVisitorApproval: true, requestReservationApproval: true, language: 'ไทย', servicesEnabled: true, emptyMode: false }, tutorial: 0
 };
}
let state;
let storageIssue = false;
try { const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); state = saved?.version === 1 ? saved : seed(); } catch { state = seed(); storageIssue = true; }
state.settings.requestVisitorApproval ??= true;
state.settings.requestReservationApproval ??= true;
// Update the current demo account once, including previously saved sessions.
if(!state.currentAccountHomeowner){
 const currentHome=state.homes.find(h=>h.id===state.home)||state.homes[0];
 const currentMember=currentHome?.members.find(m=>m.name===state.profile.name);
 if(currentMember){currentMember.role='เจ้าบ้าน';state.currentAccountHomeowner=true;try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}catch{storageIssue=true;}}
}

if(addRepairSamples(state)){
 try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}catch{storageIssue=true;}
}

function activeFacilityBooking(b){return ['รออนุมัติ','อนุมัติ','ยืนยันแล้ว'].includes(b.status);}
if(!state.facilityStatusSamples){
 state.bookings.forEach(b=>{if(b.status==='ยืนยันแล้ว')b.status='อนุมัติ';if(b.status==='ยกเลิกแล้ว')b.status='ยกเลิก';});
 const examples=[['รออนุมัติ','F1','สระว่ายน้ำ'],['อนุมัติ','F2','ห้องฟิตเนส'],['ยกเลิก','F3','ห้องอเนกประสงค์'],['ปฏิเสธ','F1','สระว่ายน้ำ']];
 examples.forEach(([status,facility,name],i)=>{let offset=i+1;while(state.bookings.some(b=>b.facility===facility&&b.date===iso(offset)&&activeFacilityBooking(b)&&b.time.split('–')[0]<'12:00'&&b.time.split('–')[1]>'11:00'))offset++;
 state.bookings.push({id:'BK-DEMO-'+(i+1),home:state.home,facility,name,date:iso(offset),time:'11:00–12:00',people:1,status,bookerName:state.profile.name,demo:true});});
 state.facilityStatusSamples=true;try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}catch{storageIssue=true;}
}
state.homes.forEach(h=>{if(h.id==='h1'&&h.project==='นันทวัน บางนา กม.7')h.project='อณาสิริ รัตนาธิเบศร์';});
// Backfill the sample attachment for previously saved demo data.
const sampleParcel = state.parcels.find(p => p.id === 'PCL-001' && p.home === 'h1');
if (sampleParcel && !Object.hasOwn(sampleParcel, 'image')) sampleParcel.image = 'assets/examples/example-parcel.jpg';
function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); return true; } catch { toast('พื้นที่จัดเก็บเต็ม กรุณาลดรูปภาพหรือส่งออกข้อมูลก่อน'); return false; } }
function commit(fn) { const previous = structuredClone(state); fn(); if (!save()) { state = previous; return false; } return true; }
const house = () => state.homes.find(h => h.id === state.home) || state.homes[0];
const scoped = list => list.filter(x => x.home === house().id);
const demoList = list => state.settings.emptyMode ? [] : list;
const services = [
 { id: 'S1', title: 'ล้างแอร์แบบติดผนัง (มาตรฐาน)', price: 649, old: 850, type: 'air', provider: 'Q-CHANG', unit: 'เครื่อง', description: 'ล้างทำความสะอาดแผ่นกรอง คอยล์เย็น และคอยล์ร้อน ตรวจสอบระบบน้ำทิ้งและทดสอบการทำงาน เหมาะกับแอร์ติดผนังขนาดไม่เกิน 24,000 BTU', terms: 'ใช้เวลาประมาณ 60–90 นาทีต่อเครื่อง • กรุณาเตรียมพื้นที่ให้ช่างเข้าทำงาน • งานซ่อมและเติมน้ำยาไม่รวมในราคานี้ หากมีค่าใช้จ่ายเพิ่มจะแจ้งก่อนดำเนินการ' },
 { id: 'S2', title: 'ล้างแอร์แบบติดผนัง (พรีเมียม)', price: 1030, old: 1090, type: 'air', provider: 'Q-CHANG', unit: 'เครื่อง', description: 'ล้างแอร์พร้อมทำความสะอาดเชิงลึกและตรวจเช็กระบบโดยทีมช่าง', terms: 'ใช้เวลาประมาณ 90–120 นาที • ไม่รวมอะไหล่และการซ่อม' },
 { id: 'S3', title: 'ล้างแอร์แบบแขวน / ฝังฝ้า', price: 1150, old: 1200, type: 'air', provider: 'Q-CHANG', unit: 'เครื่อง', description: 'บริการสำหรับเครื่องปรับอากาศแบบแขวนหรือฝังฝ้า ขนาดไม่เกิน 48,000 BTU', terms: 'กรุณาแจ้งความสูงฝ้าและรายละเอียดหน้างานก่อนนัดหมาย' },
 { id: 'S4', title: 'ล้างแอร์แบบ 4 ทิศทาง', price: 1300, old: 1400, type: 'air', provider: 'Q-CHANG', unit: 'เครื่อง', description: 'ล้างแอร์ฝังฝ้า 4 ทิศทาง ขนาดไม่เกิน 48,000 BTU', terms: 'ไม่รวมการซ่อม การเติมน้ำยา และค่าอุปกรณ์พิเศษ' },
 { id: 'S5', title: 'ทำความสะอาดบ้าน 2 ชั่วโมง', price: 585, old: 690, type: 'clean', provider: 'BeNeat', unit: 'ครั้ง', description: 'ดูแลพื้นที่อยู่อาศัย ปัดฝุ่น ดูดฝุ่น ถูพื้น และทำความสะอาดห้องน้ำ ให้บ้านพร้อมสำหรับวันพักผ่อน', terms: 'แม่บ้าน 1 คน • ไม่รวมงานบนที่สูงและงานยกของหนัก • กรุณาแจ้งจำนวนห้องล่วงหน้า' }
];
const products = [
 { id:'KUMA', name:'KUMA Facial Tissue กระดาษทิชชูเช็ดหน้า 168 แผ่น · 5 ห่อ', price:140, category:'ของใช้ในบ้าน', type:'tissue', stock:25, description:'สัมผัสนุ่ม อ่อนโยน ใช้ได้ทุกวัน กระดาษทิชชู 168 แผ่นต่อห่อ จำนวน 5 ห่อ', color:'#dfc7bc' },
 { id:'KUMA2', name:'KUMA Wet Tissue ทิชชูเปียก 40 แผ่น · 6 ห่อ', price:140, category:'ของใช้ในบ้าน', type:'tissue', stock:18, description:'ทิชชูเปียกพกพาสะดวก แพ็ก 6 ห่อ ห่อละ 40 แผ่น', color:'#c5d9e2' },
 { id:'WATER', name:'น้ำดื่มคริสตัล 1,500 มล. · 10 แพ็ก', price:520, category:'น้ำดื่ม', type:'water', stock:30, description:'น้ำดื่มสะอาด ขนาด 1,500 มล. 6 ขวดต่อแพ็ก จำนวน 10 แพ็ก', color:'#bad8dd' },
 { id:'MINERE', name:'น้ำแร่ธรรมชาติ 1.5 ลิตร · 6 แพ็ก', price:590, category:'น้ำดื่ม', type:'water', stock:12, description:'น้ำแร่สำหรับทุกวันของครอบครัว ขนาด 1.5 ลิตร', color:'#cce1c7' },
 { id:'COFFEE', name:'กาแฟพร้อมดื่ม สูตรลาเต้ · 12 กระป๋อง', price:360, category:'เครื่องดื่ม', type:'water', stock:8, description:'กาแฟลาเต้พร้อมดื่ม แพ็ก 12 กระป๋อง', color:'#d8c9ad' },
 { id:'GAS', name:'บัตรเติมน้ำมัน Bangchak มูลค่า 5,000 บาท', price:4815, category:'บัตรน้ำมัน', type:'gift', stock:5, description:'บัตรของขวัญเติมน้ำมัน มูลค่า 5,000 บาท', color:'#d5dfb7' },
 { id:'TOPUP', name:'บัตรเติมเงิน Starbucks มูลค่า 1,000 บาท', price:930, category:'เติมเงิน', type:'gift', stock:0, description:'บัตรเติมเงินสำหรับเครื่องดื่มแก้วโปรด', color:'#b9d4c2' },
 { id:'SCENT', name:'ก้านไม้หอม กลิ่นสวนหลังฝน 100 มล.', price:390, category:'เครื่องหอม', type:'scent', stock:10, description:'กลิ่นสดชื่นจากธรรมชาติ เหมาะกับมุมพักผ่อนภายในบ้าน', color:'#eadbbb' },
 { id:'SNACK', name:'คุกกี้เนยสด กล่องแบ่งปัน 250 กรัม', price:180, category:'ขนม', type:'tissue', stock:15, description:'คุกกี้เนยสดในกล่อง เหมาะสำหรับแบ่งปันช่วงพักผ่อน', color:'#e7d0a4' },
 { id:'MAT', name:'พรมเช็ดเท้า Perfect Mat 50 × 80 ซม.', price:495, category:'ของใช้ในบ้าน', type:'mat', stock:7, description:'พรมเช็ดเท้าดูดซับน้ำ ขนาด 50 × 80 ซม.', color:'#c6d2bd' }
];
const facilities = [{ id:'F1', capacity:4, name:'สระว่ายน้ำ', hours:'07:00–20:00', type:'water', note:'สูงสุด 4 ท่านต่อการจอง • สวมชุดว่ายน้ำและอาบน้ำก่อนลงสระ' },{ id:'F2', capacity:2, name:'ห้องฟิตเนส', hours:'06:00–22:00', type:'fitness', note:'สูงสุด 2 ท่านต่อการจอง • นำผ้าขนหนูและรองเท้ากีฬามาด้วย' },{ id:'F3', capacity:10, name:'ห้องอเนกประสงค์', hours:'09:00–18:00', type:'room', note:'สูงสุด 10 ท่านต่อการจอง • ดูแลความสะอาดหลังใช้งาน' }];
function art(type, color = '#c4d9cb') {
 let inner = '';
 if (type === 'air') inner = '<rect x="15" y="45" width="170" height="75" rx="13" fill="#fff" stroke="#b4c8be" stroke-width="2"/><path d="M25 92h150M27 102h146" stroke="#9db9ac" stroke-width="3"/><rect x="155" y="60" width="15" height="5" rx="2" fill="#57ad97"/><path d="M65 132q-12 13 0 25m35-25q-12 13 0 25m35-25q-12 13 0 25" fill="none" stroke="#76bda8" stroke-width="3"/>';
 else if (type === 'water') inner = `<g transform="translate(34 16)"><path d="M24 28V9h24v19l10 17v100q0 10-10 10H24q-10 0-10-10V45z" fill="#fff" stroke="#9bbfc2" stroke-width="2"/><path d="M22 53h28v72H22z" fill="${color}"/><path d="M25 7h23v14H25z" fill="#497d86"/><text x="36" y="88" text-anchor="middle" fill="#497d86" font-size="9">PURE</text><path d="M75 43V24h24v19l10 17v85q0 10-10 10H75q-10 0-10-10V60z" fill="#ffffffc9" stroke="#9bbfc2" stroke-width="2"/><path d="M73 70h28v55H73z" fill="${color}"/><path d="M76 23h23v14H76z" fill="#497d86"/></g>`;
 else if (type === 'tissue') inner = `<path d="m28 64 91-22 54 28-95 25z" fill="#ffffff"/><path d="M28 64v73l50 26V95z" fill="#b9aa9b"/><path d="m78 95 95-25v73l-95 20z" fill="${color}"/><path d="M79 64q-10-44 33-28l12 23" fill="#fff" stroke="#deded5" stroke-width="1"/><text x="127" y="113" font-family="Georgia" font-size="19" text-anchor="middle" fill="#715e54">KUMA</text><text x="126" y="131" font-size="7" text-anchor="middle" fill="#715e54">SOFT · EVERY DAY</text>`;
 else if (type === 'gift') inner = `<rect x="18" y="40" width="164" height="105" rx="12" fill="${color}"/><path d="M43 62h22v17H43z" fill="#c8ae65"/><text x="38" y="110" font-size="18" fill="#416147">GIFT CARD</text><text x="38" y="129" font-size="8" fill="#416147">A little more happiness.</text>`;
 else if (type === 'scent') inner = '<path d="m90 100-20-79m29 79 4-87m8 87 24-76" stroke="#9e8456" stroke-width="4"/><rect x="65" y="87" width="72" height="75" rx="10" fill="#b79162"/><rect x="75" y="105" width="52" height="37" rx="2" fill="#f6eddd"/><text x="101" y="127" font-size="10" fill="#8c7555" text-anchor="middle">GARDEN</text>';
 else if (type === 'mat') inner = `<path d="m26 80 105-30 51 72-102 38z" fill="${color}" stroke="#90a089" stroke-width="2"/><path d="m38 84 96-27m-88 39 96-27m-88 39 96-27m-88 39 96-27m-88 39 96-27" stroke="#9eaf97" stroke-width="3"/>`;
 else if (type === 'clean') inner = '<path d="M54 72h90l-10 86H64z" fill="#9cbeb0"/><path d="M66 72V55a33 33 0 0 1 66 0v17" fill="none" stroke="#5e9881" stroke-width="5"/><path d="m105 135 39-113" stroke="#b89665" stroke-width="7"/><path d="m91 125 34 11-10 29-34-11z" fill="#d6c39a"/>';
 else if (type === 'fitness') inner = '<g stroke="#6d9780" stroke-width="12" stroke-linecap="round"><path d="M35 75v50M53 58v83M147 58v83M165 75v50M55 100h90"/></g>';
 else inner = '<path d="M32 88 100 34l68 54v77H32z" fill="#f4f2e7" stroke="#9bab93" stroke-width="3"/><path d="M82 107h36v58M48 106h21v27H48zM132 106h21v27h-21z" fill="#88ac97"/>';
 return `<svg viewBox="0 0 200 190" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${inner}</svg>`;
}
let route = '', routeParts = [], photos = [], petTheme = 0, vehicleDraft = {}, passFlipped = false, cartQuantity = 1, shopCategory = 'ทั้งหมด', timelineCategory = 'ทั้งหมด', introStep = 0, toastTimer;
function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 3300); }
function go(to) { if (location.hash.slice(1) === to) return render(); history.pushState({resident:true, appDepth:(history.state?.appDepth||0)+1},'', '#'+to); render(); }
function back() { if (history.state?.appDepth > 0) history.back(); else { const parent={pet:'pets','pet-new':'pets',vehicle:'vehicles','vehicle-new':'vehicles',visitor:'visitors/registered','estamp-reserve':'visitors/registered','visitor-new':'visitors/registered',facility:'facilities','facility-booking':'facilities/bookings',service:'services',product:'shopping',cart:'shopping',checkout:'cart',receipt:'bills/paid',bill:'bills',payment:'bills',parcel:'parcels',announcement:'announcements',invite:'household'}[routeParts[0]] || (routeParts[0]==='settings'&&routeParts[1]?'settings':'home'); go(parent); } }
function modal(title, body) { const d = $('#modal'); d.innerHTML = `${iconBtn('close', 'ปิดหน้าต่าง', 'close')}<h2 id="modal-title">${title}</h2>${body}`; d.querySelector('.icon-button').classList.add('close-modal'); if (!d.open) d.showModal(); wireForms(); }
function confirmDialog(title, text, action, id = '') { modal(title, `<p>${text}</p><div class="actions">${btn('ยกเลิก', 'close', '', 'secondary')}${btn('ยืนยัน', action, `data-id="${esc(id)}"`)}</div>`); }
function closeModal() { stopVisitorQrCamera(); stopRepairCamera(); $('#modal').close(); $('#modal').innerHTML = ''; }
function notify(title,text,target,category=notificationCategory(target)){const notification={id:uid('N'),title,text,route:target,home:house().id,category,recipientKeys:notificationRecipientKeys(category),readBy:[],hiddenFor:[]};state.notifications.unshift(notification);setTimeout(()=>{if(state.notifications.some(n=>n.id===notification.id))announcePersonalNotifications([notification]);},0);}
const navItems = [['home','หน้าหลัก','home'],['announcements','ประกาศ','announce'],['services','บริการ','service'],['timeline','ไทม์ไลน์','timeline'],['shopping','ช้อปปิ้ง','shop'],['settings','ตั้งค่า','settings']];
function renderNav(section) { const home=routeParts[0]==='home'||!routeParts[0];$('#navigation').hidden=['visitor-stamp','estamp-reserve','guard-call'].includes(routeParts[0])||(routeParts[0]==='visitor'&&routeParts[2]==='edit')||(routeParts[0]==='household'&&['mode','recipient'].includes(routeParts[1]))||(routeParts[0]==='repairs'&&['detail','info'].includes(routeParts[1]))||(routeParts[0]==='meetings'&&!!routeParts[1]&&routeParts[1]!=='category')||(['payment','facility'].includes(routeParts[0])&&!!routeParts[1]);if(section==='home'&&!home)section='';$('#navigation').innerHTML = navItems.filter(([key]) => !['timeline','shopping','services'].includes(key)).map(([key, label, glyph]) => `<button data-action="go" data-route="${key}" class="${section === key ? 'active' : ''}" ${section === key ? 'aria-current="page"' : ''}><span class="nav-icon">${icon(glyph)}</span>${label}</button>`).join(''); }
let paymentTimer, calendarNowTimer, guardCallTimer;
function page(html, section = 'home') {
 page.disposeHousehold?.();page.disposeHousehold=null;
 page.disposeWeather?.();
 page.disposeWeather = null;
 document.getElementById('shell').classList.toggle('weather-shell', routeParts[0] === 'weather');
 stopVisitorQrCamera();
 page.disposeGuardVideo?.();
 page.disposeGuardVideo = null;
 page.disposeRules?.();
 page.disposeRules = null;
 clearInterval(paymentTimer);
 clearInterval(calendarNowTimer);
 clearInterval(guardCallTimer);
 const focused=document.activeElement;
 const restore=page.lastRoute===location.hash&&focused?.matches('[data-action]')?['data-action','data-id','data-category'].filter(a=>focused.hasAttribute(a)).map(a=>`[${a}="${CSS.escape(focused.getAttribute(a))}"]`).join(''):null;
 page.lastRoute=location.hash;
 $('#app').innerHTML = `<div class="route-fade">${html}</div>`; renderNav(section); wireForms(); renderGuardNotification();
 const heading = $('#app h1');
 document.title = `${heading?.textContent || 'หน้าหลัก'} · บ้านน่าอยู่`;
 (restore&&$(restore)||$('#app')).focus({preventScroll:true});
 measureMobileBars();
 mobileBarsObserver.disconnect();
 ['#navigation','.header','.bottom-action'].forEach(selector=>{const el=$(selector);if(el)mobileBarsObserver.observe(el);});
}
function measureMobileBars(){
 const root=document.documentElement;
 root.style.setProperty('--nav-height',`${$('#navigation')?.hidden?0:($('#navigation')?.getBoundingClientRect().height||78)}px`);
 root.style.setProperty('--action-height',`${$('.bottom-action')?.getBoundingClientRect().height||0}px`);
 root.style.setProperty('--header-height',`${$('.header')?.getBoundingClientRect().height||66}px`);
}
const mobileBarsObserver=new ResizeObserver(measureMobileBars);
function render() {
 if(!ResidentAuth.valid()) {
  closeModal();
  if(page.disposeWeather){page.disposeWeather();page.disposeWeather=null;}
  clearInterval(paymentTimer);clearInterval(calendarNowTimer);clearInterval(guardCallTimer);
  $('#guard-notification')?.remove();
  return ResidentAuth.show();
 }
 document.getElementById('shell').classList.remove('login-shell');
 document.getElementById('navigation').hidden=false;
 if(location.hash==='#login')history.replaceState(null,'','#home');
 ensureHouseholdState();
 try { route = decodeURI(location.hash.slice(1)) || 'home'; } catch { route = 'home'; } routeParts = route.split('/');
 history.replaceState({ ...history.state, resident: true }, '');
 photos = []; closeModal(); window.scrollTo(0, 0);
 const [key, id, mode] = routeParts;
 switch (key) {
 case 'meetings': return renderProjectMeetings(id);
 case 'frequent-functions': return renderFrequentPage();
 case 'weather': page(header('สภาพอากาศและฝุ่น') + '<div class="weather-page" id="weather-screen"></div>'); page.disposeWeather = window.WeatherScreen.mount(document.getElementById('weather-screen')); return;
 case 'home': return renderHome(); case 'bills': return renderBills(id); case 'bill': return renderBill(id); case 'payment': return renderPayment(id); case 'receipt': return renderReceipt(id); case 'parcels': return renderParcels(id); case 'parcel': return renderParcel(id);
 case 'facility-booking': return renderFacilityBooking(id); case 'facilities': return renderFacilities(id); case 'facility': return renderFacility(id,mode); case 'household': return renderHousehold(); case 'invite': return renderInvite(); case 'vehicles': return renderVehicles(); case 'vehicle': return renderVehicle(id, mode); case 'vehicle-new': return renderVehicleForm(Number(id) || 1); case 'pets': return state.petIntro ? renderPets() : renderPetIntro(); case 'pet-new': petTheme = 0; return renderPetForm(); case 'pet': return mode === 'edit' ? renderPetForm(id) : renderPet(id);
 case 'guard-call': return renderGuardCall(); case 'estamp-reserve': return renderEstampReserve(id); case 'visitor-details': return renderVisitorDetails(id); case 'visitor-stamp': return renderVisitorStamp(id); case 'visitors': return renderVisitors(id); case 'visitor-new': return renderVisitorForm(); case 'visitor': return mode === 'edit' ? renderVisitorForm(id) : renderVisitor(id, mode); case 'scan': return renderScanner(id); case 'feedback': return renderFeedback(id,mode); case 'phone': return renderPhone(id); case 'management': return renderManagement(); case 'repairs': return renderRepairs(id,mode); case 'emergency': history.replaceState(history.state,'','#phone/emergency'); return renderPhone('emergency'); case 'chat': return renderChat(); case 'rules': return renderRules(); case 'benefits': return renderBenefits(); case 'vote': return renderVote();
 case 'announcements': return renderAnnouncements(id); case 'announcement': return renderAnnouncement(id); case 'services': return renderServices(id); case 'service-booking': return renderServiceBookingForm(id,mode); case 'service': return renderService(id, mode); case 'timeline': return renderTimeline(id); case 'shopping': return renderShopping(); case 'product': return renderProduct(id); case 'cart': return renderCart(); case 'checkout': return renderCheckout(); case 'orders': return renderOrders(id); case 'settings': return renderSettings(id); case 'notifications': return renderNotifications(); case 'help': return renderHelp(); default: return page(header('ไม่พบหน้า') + empty('search', 'ไม่พบหน้าที่ต้องการ', 'กลับไปหน้าหลักเพื่อเริ่มต้นใหม่', linkBtn('กลับหน้าหลัก', 'home')));
 }
}
function isAppVersion2(){return state.settings.appVersion===2;}
function homeMenu(){
 const menu = [['vehicles','ยานพาหนะ<br>ของฉัน','car'],['scan','ประทับตรา','stampComplete'],['visitors','ผู้มาติดต่อ','visitor'],['parcels','พัสดุ','parcel'],['bills','ชำระบิล','bill'],['facilities','จองส่วนกลาง','facility'],['repairs','แจ้งซ่อม','wrench'],['feedback','ข้อเสนอแนะ','feedback'],['emergency','โทรฉุกเฉิน','sos'],['household','ห้องของฉัน','home'],['phone','สมุดโทรศัพท์','phone'],['management','ข้อมูลโครงการ','users'],['rules','ระเบียบชุมชน','rules'],['pets','สัตว์เลี้ยง','pet'],['vote','ประชุมใหญ่<br>(i-Vote)','vote']].filter(([route])=>isAppVersion2()||!['pets','facilities','vote','bills'].includes(route));
 if(!isAppVersion2()){const repairIndex=menu.findIndex(([route])=>route==='repairs'),emergencyIndex=menu.findIndex(([route])=>route==='emergency');[menu[repairIndex],menu[emergencyIndex]]=[menu[emergencyIndex],menu[repairIndex]];}
 if(!isAppVersion2()){
  const household=menu.splice(menu.findIndex(([route])=>route==='household'),1)[0];
  menu.splice(menu.findIndex(([route])=>route==='parcels'),1,household);
 }
 menu.splice(menu.findIndex(([route])=>route==='rules'),0,['meetings','รายงานทั่วไป','rules']);
 return menu;
}
let frequentDraft=null;
let frequentPicked=null, frequentDrag=null, frequentSuppressClick=false;
function frequentKey(){return isAppVersion2()?'v2':'v1';}
function cleanFrequentSlots(values){
 const allowed=homeMenu().map(([r])=>r),seen=new Set();
 return values.filter(r=>{if(!allowed.includes(r)||seen.has(r))return false;seen.add(r);return true;});
}
function frequentRoutes(){
 const saved=state.profile.frequentFunctions?.[frequentKey()];
 return cleanFrequentSlots(Array.isArray(saved)?saved:['vehicles','scan','visitors','household']);
}
function renderFrequent(){
 const menu=homeMenu(), selected=frequentRoutes();
 return `<section class="frequent-section" aria-labelledby="frequent-title"><div class="section-title"><h2 id="frequent-title">เมนูโปรด</h2><button data-action="frequent-edit">ปรับแต่ง</button></div><div id="frequent-content">${selected.some(Boolean)?`<div class="frequent-grid" role="region" aria-label="เมนูโปรด เรียงตามลำดับความสำคัญ เลื่อนแนวนอนเพื่อดูเพิ่มเติม" tabindex="0">${selected.map(r=>{if(!r)return '<span aria-hidden="true"></span>';const [,label,glyph]=menu.find(m=>m[0]===r);return `<button ${r==='emergency'?'data-action="go" data-route="phone/emergency"':`data-action="go" data-route="${r}"`}><span class="menu-icon">${icon(glyph)}</span><span>${label}</span></button>`;}).join('')}</div>`:'<p class="frequent-empty">เลือกเมนูโปรด เพื่อเปิดใช้งานได้เร็วขึ้น</p>'}</div></section>`;
}
function renderFrequentPage(){
 cancelFrequentDrag();frequentPicked=null;
 frequentDraft=frequentRoutes();
 page(header('ปรับแต่งเมนูโปรด').replace('data-action="back"','data-action="frequent-cancel"')+'<div class="content"><div id="frequent-content"></div></div>');
 renderFrequentEditor();
}
function renderFrequentEditor(focusSlot){
 const menu=homeMenu();
 const count=frequentDraft.filter(Boolean).length;
 $('#frequent-content').innerHTML=`<div class="favorite-editor"><section class="favorite-board" aria-labelledby="favorite-heading"><div class="favorite-heading"><h2 id="favorite-heading">เมนูโปรดของคุณ</h2><span>${count} เมนู</span></div><p id="favorite-help">เรียงเมนูสำคัญไว้ก่อน ลากเพื่อจัดลำดับ หรือแตะเมนูแล้วแตะตำแหน่งปลายทาง</p><ol class="favorite-slots">${frequentDraft.map((r,i)=>{const item=menu.find(m=>m[0]===r),name=item?item[1].replace(/<br>/g,''):'';return `<li class="favorite-slot ${r?'is-filled':''} ${frequentPicked===i?'is-picked':''}" data-favorite-slot="${i}"><span class="favorite-position">${i+1}</span><button class="favorite-tile" data-action="frequent-slot" data-slot="${i}" ${r?'data-favorite-drag':''} aria-pressed="${frequentPicked===i}" aria-label="${r?name:'ช่องว่าง'} ตำแหน่ง ${i+1}" aria-describedby="favorite-help"><span class="favorite-icon">${r?icon(item[2]):icon('plus')}</span><span class="favorite-name">${r?item[1]:'เพิ่มเมนู'}</span></button>${r?`<button class="favorite-remove" data-action="frequent-remove" data-id="${r}" aria-label="นำ ${name} ออก">×</button>`:''}</li>`;}).join('')}</ol><p class="favorite-hint" role="status">${frequentPicked!==null?(frequentDraft[frequentPicked]?'แตะช่องปลายทางเพื่อย้าย หรือแตะซ้ำเพื่อยกเลิก':'เลือกเมนูด้านล่างเพื่อเติมช่องนี้'):'หรือแตะเมนู แล้วแตะช่องที่ต้องการย้าย'}</p></section><section class="favorite-catalog" aria-labelledby="favorite-catalog-title"><h2 id="favorite-catalog-title">เพิ่มเมนูโปรด</h2><p>เพิ่มได้ทุกเมนู เมนูใหม่จะอยู่ท้ายรายการ แล้วจัดลำดับได้ตามต้องการ</p><div class="favorite-choices">${menu.map(([r,label,glyph])=>{const selected=frequentDraft.includes(r);return `<button data-action="frequent-add" data-id="${r}" ${selected?'disabled':'data-favorite-drag'} class="${selected?'is-selected':''}"><span class="favorite-icon">${icon(glyph)}</span><span>${label}</span><span class="favorite-choice-mark" aria-hidden="true">${selected?'✓':'+'}</span><span class="favorite-sr">${selected?'เลือกแล้ว':''}</span></button>`;}).join('')}</div></section><div class="favorite-actions">${btn('ยกเลิก','frequent-cancel','','secondary')}${btn('บันทึก','frequent-save')}</div></div>`;
 if(Number.isInteger(focusSlot))$(`[data-action="frequent-slot"][data-slot="${focusSlot}"]`)?.focus({preventScroll:true});
}
function swapFrequentSlots(from,to){
 if(from===to||!frequentDraft||!frequentDraft[from])return;
 const [item]=frequentDraft.splice(from,1);frequentDraft.splice(to,0,item);
 frequentPicked=null;renderFrequentEditor(to);
}
function cancelFrequentDrag(){
 if(!frequentDrag)return;
 cancelAnimationFrame(frequentDrag.frame);
 frequentDrag.ghost?.remove();frequentDrag.source.classList.remove('is-dragging');
 document.querySelectorAll('.favorite-slot.is-drop-target').forEach(el=>el.classList.remove('is-drop-target'));
 frequentDrag=null;
}
document.addEventListener('pointerdown',event=>{
 const source=event.target.closest('[data-favorite-drag]');
 if(!source||!event.isPrimary||event.button!==0)return;
 frequentSuppressClick=false;
 frequentDrag={source,from:source.hasAttribute('data-slot')?Number(source.dataset.slot):null,menu:source.dataset.id,pointer:event.pointerId,x:event.clientX,y:event.clientY,ghost:null,target:null};
 source.setPointerCapture(event.pointerId);
});
document.addEventListener('pointermove',event=>{
 const d=frequentDrag;if(!d||d.pointer!==event.pointerId)return;
 if(!d.ghost&&Math.hypot(event.clientX-d.x,event.clientY-d.y)<7)return;
 if(!d.ghost){
  d.ghost=d.source.cloneNode(true);d.ghost.removeAttribute('data-action');d.ghost.removeAttribute('data-favorite-drag');d.ghost.tabIndex=-1;d.ghost.setAttribute('aria-hidden','true');
  d.ghost.classList.add('favorite-ghost','favorite-tile');d.ghost.style.width=d.source.offsetWidth+'px';document.body.append(d.ghost);d.source.classList.add('is-dragging');
  const scroll=()=>{if(frequentDrag!==d)return;const top=($('.header')?.getBoundingClientRect().bottom||0)+48,bottom=($('#navigation')?.getBoundingClientRect().top||innerHeight)-48;if(d.y<top)window.scrollBy(0,-8);else if(d.y>bottom)window.scrollBy(0,8);updateFrequentDragTarget(d);d.frame=requestAnimationFrame(scroll);};d.frame=requestAnimationFrame(scroll);
 }
 event.preventDefault();
 d.ghost.style.transform=`translate(${event.clientX-d.source.offsetWidth/2}px,${event.clientY-44}px) rotate(4deg)`;
 d.x=event.clientX;d.y=event.clientY;updateFrequentDragTarget(d);
},{passive:false});
function updateFrequentDragTarget(d){
 const target=document.elementFromPoint(d.x,d.y)?.closest('[data-favorite-slot]');
 d.target=target?Number(target.dataset.favoriteSlot):null;
 document.querySelectorAll('.favorite-slot').forEach(el=>el.classList.toggle('is-drop-target',el===target));
}
document.addEventListener('pointerup',event=>{
 const d=frequentDrag;if(!d||d.pointer!==event.pointerId)return;
 const moved=!!d.ghost;cancelFrequentDrag();
 if(moved){frequentSuppressClick=true;if(d.target!==null){if(d.from!==null)swapFrequentSlots(d.from,d.target);else if(homeMenu().some(([r])=>r===d.menu)&&!frequentDraft.includes(d.menu)){frequentDraft.splice(d.target,0,d.menu);frequentPicked=null;renderFrequentEditor(d.target);}}setTimeout(()=>frequentSuppressClick=false,0);}
});
document.addEventListener('pointercancel',cancelFrequentDrag);
window.addEventListener('blur',cancelFrequentDrag);
window.addEventListener('hashchange',cancelFrequentDrag);
document.addEventListener('keydown',event=>{
 if(event.key==='Escape'){cancelFrequentDrag();if(route==='frequent-functions'){frequentPicked=null;renderFrequentEditor();}return;}
 const tile=event.target.closest('[data-favorite-drag][data-slot]');if(!tile)return;
 const delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-1,ArrowDown:1}[event.key];
 if(delta){event.preventDefault();const from=Number(tile.dataset.slot),to=from+delta;if(to>=0&&to<frequentDraft.length)swapFrequentSlots(from,to);}
});
function renderHome() {
 const h = house(); const due = demoList(scoped(state.bills)).filter(b => !b.paid).reduce((n, b) => n + b.amount, 0); const parcels = demoList(scoped(state.parcels)).filter(p => !p.received).length;
 const menu = homeMenu();
 page(`<section class="hero"><div class="brand-row"><div class="brand">${icon('home')}<div>บ้านน่าอยู่<small>BETTER LIVING, TOGETHER</small></div></div>${iconBtn('bell',`การแจ้งเตือน ยังไม่อ่าน ${personalUnreadCount()} รายการ`,'go','data-route="notifications"')}${personalUnreadCount()>0 ? '<span class="dot" style="right:8px;top:9px"></span>' : ''}</div><div class="hero-content"><div class="hero-copy"><h1>ยินดีต้อนรับ<br><strong>กลับบ้าน</strong></h1><button class="home-weather" data-action="go" data-route="weather"><span class="home-weather-symbol" aria-hidden="true">☁</span><span>สภาพอากาศและฝุ่น</span>${icon('chevron')}</button></div><div class="hero-art-frame"><img class="hero-art" src="assets/community-entrance.jpg" alt="ภาพหน้าหมู่บ้านอณาสิริ รัตนาธิเบศร์"></div></div></section><div class="home-body"><div class="home-card"><span class="house-icon">${icon('home')}</span><div class="grow"><h2>บ้านเลขที่ ${esc(h.number)}</h2><p>${esc(h.project)}</p></div>${iconBtn('chevron','เปลี่ยนชุมชน','switch-home')}</div>${isAppVersion2()?`<div class="summary-grid"><button class="summary-tile" data-action="go" data-route="bills">${icon('bill')}<span class="label">ยอดรอชำระ</span><strong>${money(due)}<small>บาท</small></strong></button><button class="summary-tile" data-action="go" data-route="parcels">${icon('parcel')}<span class="label">พัสดุรอรับ</span><strong>${parcels}<small>รายการ</small></strong></button><button class="summary-tile" data-action="go" data-route="facilities/bookings">${icon('calendar')}<span class="label">การจองของฉัน</span><strong>${scoped(state.bookings).filter(b => activeFacilityBooking(b)).length}<small>รายการ</small></strong></button></div>`:""}${renderFrequent()}<section class="dashboard-news"><div class="section-title"><h2>ข่าวจากชุมชน</h2><button data-action="go" data-route="announcements">ดูทั้งหมด →</button></div><button class="announcement-mini" data-action="go" data-route="announcement/A1">${icon('announce')}<div class="grow"><h3>แจ้งปิดปรับปรุงสระว่ายน้ำชั่วคราว</h3><p>ประกาศสำคัญ · ${dateLabel(iso())}</p></div>${icon('chevron')}</button></section><div class="section-title dashboard-menu-title"><h2>ดูแลเรื่องบ้าน</h2><span class="small muted">ทุกเรื่อง ในที่เดียว</span></div><div class="menu-grid">${menu.map(([r,l,i]) => `<button ${r==='emergency'?'data-action="go" data-route="phone/emergency"':`data-action="go" data-route="${r}"` }><span class="menu-icon ${i === 'sos' ? 'emergency' : ''}">${icon(i)}</span>${l}${i === 'pet' ? '<span class="tiny-badge">NEW</span>' : ''}</button>`).join('')}</div><div class="community-banner"><div><small>A LITTLE CARE, A BETTER HOME</small><h3>ให้วันพัก เป็นวันสบาย</h3><button data-action="go" data-route="services">ดูบริการดูแลบ้าน →</button></div>${icon('leaf')}</div><p class="demo-label">PROTOTYPE · ข้อมูลและธุรกรรมทั้งหมดเป็นการสาธิต</p></div>`);
 page.disposeWeather = window.WeatherScreen.mountShortcut($('.home-weather'));
}
function renderBills(tab = 'unpaid') {
 const list = demoList(scoped(state.bills)).filter(x => x.paid === (tab === 'paid'));
 const body = tab === 'deposit' ? demoList(scoped(state.deposits)).map(x => `<div class="card"><div class="row between"><div>${icon('bill')} <b>${x.title}</b></div><span class="price">฿${money(x.amount)}</span></div><p class="muted">ยอดคงเหลือสำหรับบ้าน ${esc(house().number)}</p></div>`).join('') || empty('bill','ไม่พบข้อมูล','ยังไม่มีรายการเงินฝาก/รับล่วงหน้า') : list.map(b => `<div class="card"><div class="row between"><h3>${b.title}</h3>${pill(b.paid ? 'ชำระแล้ว' : 'รอชำระ', b.paid ? '' : 'orange')}</div><p class="muted">${b.period}</p>${b.paid ? `<p class="bill-method">ประเภทการชำระ: <strong>${esc(b.method || 'ไม่ระบุช่องทาง')}</strong></p>` : ''}<div class="row between"><span class="price">฿${money(b.amount)}</span><span class="small muted">ครบกำหนด ${dateLabel(b.due)}</span></div><div class="actions">${linkBtn(b.paid ? 'ดูใบเสร็จ' : 'ดูรายละเอียดและชำระ', (b.paid ? 'receipt/' : 'bill/') + b.id, 'full ' + (b.paid ? 'secondary' : ''))}</div></div>`).join('') || empty('bill', tab === 'paid' ? 'ไม่มีรายการชำระแล้ว' : 'ไม่มีรายการในแจ้งหนี้','เมื่อมีรายการจะแสดงที่หน้านี้');
 page(header('ชำระเงิน') + tabs([['ค้างชำระ','bills'],['ชำระแล้ว','bills/paid']],tab === 'paid' ? 1 : 0) + `<div class="content">${body}</div>`);
}
function renderBill(id) { const b = scoped(state.bills).find(x => x.id === id); if (!b) return go('bills'); page(header('รายละเอียดใบแจ้งหนี้') + `<div class="content"><div class="card"><div class="row between"><h2>${b.title}</h2>${pill(b.paid ? 'ชำระแล้ว' : 'รอชำระ','orange')}</div><p class="muted">${b.period}</p><div class="divider"></div>${detail([['เลขที่ใบแจ้งหนี้',b.id],['บ้านเลขที่',house().number],['วันครบกำหนด',dateLabel(b.due)],['ยอดชำระ',money(b.amount)+' บาท']])}</div><div class="info">การชำระเงินในต้นแบบเป็นการจำลอง ไม่มีการเรียกเก็บเงินจริง</div>${linkBtn(b.paid ? 'ดูใบเสร็จ' : 'ชำระเงิน', (b.paid ? 'receipt/' : 'payment/')+id,'full')}</div>`); }
function renderPayment(id) {
 const b = scoped(state.bills).find(x => x.id === id);
 if (!b || b.paid) return go('bills');
 if (b.pendingPayment) return renderPromptPay(b);
 page(header(b.serviceBookingId?'ชำระค่าบริการ':'ชำระบิล') + `<div class="content"><div class="card" style="text-align:center"><p class="muted">ยอดชำระทั้งหมด</p><div class="price">฿${money(b.amount)}</div><p>${esc(b.title)} · บ้าน ${esc(house().number)}</p></div><form data-form="payment" data-id="${id}"><input type="hidden" name="method" value="พร้อมเพย์ (จำลอง)"><div class="card"><h2>ช่องทางชำระเงิน</h2><p>PromptPay (พร้อมเพย์)</p></div><div class="info">สแกน QR พร้อมเพย์ภายใน 5 นาที การชำระเงินเป็นการจำลอง ไม่มีการโอนเงินจริง</div>${submit('ยืนยันชำระเงินจำลอง')}</form></div>`);
}
function startPromptPay(b, slip = '') {
 if (commit(() => { b.pendingPayment = { expiresAt: Date.now() + 5 * 60 * 1000, slip }; })) renderPayment(b.id);
}
function completeBill(b, method, slip = '') {
 if (b.paid) return;
 if (commit(() => { b.paid = true; b.paidAt = iso(); b.method = method; b.slip = slip; delete b.pendingPayment; const booking=scoped(state.serviceBookings).find(x=>x.id===b.serviceBookingId);if(booking){booking.paymentStatus='paid';booking.paidAt=b.paidAt;booking.paymentMethod=method;} notify('ชำระบิลสำเร็จ',b.title+' '+money(b.amount)+' บาท','receipt/'+b.id); })) {
  go('receipt/'+b.id); toast('ชำระเงินจำลองสำเร็จ');
 }
}
function renderPromptPay(b) {
 const pending = b.pendingPayment;
 const expired = Date.now() >= pending.expiresAt;
 let qrImage = '';
 try { if (!expired) qrImage = PaymentQR.image(b.amount); } catch { /* Recoverable local QR generation failure. */ }
 const failed = !expired && !qrImage;
 page(header('ชำระด้วย PromptPay') + `<div class="content"><section class="card promptpay-card" aria-label="QR ชำระเงินจำลอง"><div class="row between"><h2>PromptPay</h2>${pill('จำลอง','gray')}</div><p class="muted">${esc(b.title)} · ${esc(b.id)}</p><div class="price">฿${money(b.amount)}</div><p>ผู้รับตัวอย่าง · บ้านน่าอยู่</p>${expired ? '<div class="qr-placeholder">'+icon('clock')+'<h2>หมดเวลารอชำระเงิน</h2><p>ยังไม่ได้ชำระบิลนี้ กดสร้าง QR ใหม่เพื่อลองอีกครั้ง</p></div>' : failed ? '<div class="qr-placeholder"><h2>สร้าง QR ไม่สำเร็จ</h2><p>กรุณาลองสร้าง QR ใหม่</p></div>' : '<img class="promptpay-qr" src="'+qrImage+'" width="240" height="240" alt="QR PromptPay จำลอง ยอด '+money(b.amount)+' บาท ไม่ใช้ชำระเงินจริง">'}<p id="payment-status" role="status">${expired ? 'หมดเวลารอชำระเงิน' : failed ? 'ไม่สามารถแสดง QR ได้' : 'รอชำระเงินจำลอง'}</p>${!expired && !failed ? '<div class="payment-countdown">เวลาที่เหลือ <span id="payment-countdown" role="timer" aria-live="off"></span></div>' : ''}<p class="muted small">QR ตัวอย่าง ไม่มีบัญชีรับเงินจริง<br>ใช้ปุ่มด้านล่างเพื่อทดสอบการชำระสำเร็จ</p></section><div class="payment-actions">${expired || failed ? btn('สร้าง QR ใหม่','promptpay-retry',`data-id="${b.id}"`,'full') : btn('จำลองรับชำระสำเร็จ','promptpay-complete',`data-id="${b.id}"`,'full')}${btn('ยกเลิกการชำระเงิน','promptpay-cancel',`data-id="${b.id}"`,'full secondary')}</div></div>`);
 if (expired || failed) return;
 const update = () => {
  const seconds = Math.max(0, Math.ceil((pending.expiresAt - Date.now()) / 1000));
  const timer = $('#payment-countdown');
  if (!timer) return clearInterval(paymentTimer);
  timer.textContent = String(Math.floor(seconds / 60)).padStart(2,'0') + ':' + String(seconds % 60).padStart(2,'0');
  if (!seconds) { renderPayment(b.id); toast('หมดเวลารอชำระเงิน สร้าง QR ใหม่เพื่อลองอีกครั้ง'); }
 };
 update();
 paymentTimer = setInterval(update, 1000);
}
function renderReceipt(id) { const b = scoped(state.bills).find(x => x.id === id && x.paid); if (!b) return go('bills/paid'); page(header('ใบเสร็จรับเงิน') + `<div class="content"><div class="receipt">${icon('checkCircle')}<h2>ชำระเงินสำเร็จ</h2><p class="muted small">ใบเสร็จสาธิต · ไม่ใช่เอกสารทางการเงิน</p><div class="divider"></div>${detail([['เลขที่ใบเสร็จ','RC-'+b.id],['ผู้ชำระ',state.profile.name],['บ้านเลขที่',house().number],['รายการ',b.title],['วันที่ชำระ',dateLabel(b.paidAt)],['ช่องทาง',b.method],['ยอดรวม',money(b.amount)+' บาท']])}</div>${btn(icon('download')+' ดาวน์โหลดใบเสร็จ','download-receipt',`data-id="${id}"`,'full secondary')}<div class="actions">${linkBtn(b.serviceBookingId?'กลับการจองของฉัน':'กลับรายการชำระแล้ว',b.serviceBookingId?'services/bookings':'bills/paid','full')}</div></div>`); }
function renderParcels(tab) { const list = demoList(scoped(state.parcels)).filter(p => p.received === (tab === 'history')); page(header('พัสดุทั้งหมด') + tabs([['พัสดุใหม่','parcels'],['ประวัติพัสดุ','parcels/history']],tab === 'history' ? 1 : 0) + `<div class="content">${list.map(p => `<button class="service-card" data-action="go" data-route="parcel/${p.id}"><span class="avatar">${icon('parcel')}</span><div class="grow"><h3>${p.courier}</h3><p>${p.tracking}</p><p>${dateLabel(p.date)} · ชั้น ${p.shelf}</p></div>${pill(p.received ? 'รับแล้ว' : 'รอรับ',p.received ? '' : 'orange')}</button>`).join('') || empty('parcel',tab === 'history' ? 'ยังไม่มีรายการประวัติพัสดุ' : 'ยังไม่มีพัสดุใหม่','พัสดุของคุณจะแสดงที่นี่เมื่อมาถึง')}</div>`); }
function parcelPhoto(p) {
 const source=typeof p.image==='string'?p.image.trim():'';
 return `<section class="parcel-photo-section" aria-labelledby="parcel-photo-title"><h3 id="parcel-photo-title">รูปพัสดุ</h3><div class="parcel-photo">${source?`<button class="parcel-photo-open" data-action="view-parcel-photo" data-id="${esc(p.id)}" aria-label="ขยายรูปพัสดุ ${esc(p.id)}"><img src="${esc(source)}" alt="รูปพัสดุ ${esc(p.id)}" decoding="async"><span class="parcel-photo-hint">แตะเพื่อขยาย</span></button>`:''}<div class="parcel-photo-empty" ${source?'hidden':''}>${icon('camera')}<strong lang="en">No image</strong><span>ไม่มีรูปพัสดุที่แสดงได้</span></div></div></section>`;
}
function renderParcel(id) { const p = scoped(state.parcels).find(x => x.id === id); if (!p) return go('parcels'); page(header('รายละเอียดพัสดุ') + `<div class="content"><div class="card"><div class="row between"><h2>${icon('parcel')} ${p.courier}</h2>${pill(p.received ? 'รับแล้ว' : 'รอรับ','orange')}</div><div class="divider"></div>${parcelPhoto(p)}${detail([['เลขติดตาม',p.tracking],['บ้านเลขที่',house().number],['มาถึงวันที่',dateLabel(p.date)],['จุดรับพัสดุ','สำนักงานนิติบุคคล'],['ชั้นจัดเก็บ',p.shelf],...(p.received ? [['วันที่รับ',dateLabel(p.receivedAt)]] : [])])}</div>${p.received ? linkBtn('ดูประวัติพัสดุ','parcels/history','full secondary') : `<div class="info">แจ้งรหัสรับพัสดุ <b>DEMO-${p.id.slice(-3)}</b> กับเจ้าหน้าที่ ตัวอย่างนี้สามารถกดยืนยันเพื่อสาธิตการรับพัสดุได้</div>${btn('ยืนยันรับพัสดุ','receive-parcel',`data-id="${id}"`,'full')}`}</div>`); const image=$('.parcel-photo img'); if(image){ const fallback=()=>{image.parentElement.hidden=true; image.parentElement.nextElementSibling.hidden=false;}; image.addEventListener('error',fallback,{once:true}); if(image.complete&&!image.naturalWidth)fallback(); } }
function renderFacilities(tab) {
 const records = scoped(state.bookings);
 page(header('จองส่วนกลาง') + tabs([['ส่วนกลาง','facilities'],['การจองของฉัน','facilities/bookings']],tab === 'bookings' ? 1 : 0) + `<div class="content">${tab === 'bookings' ? records.map(b => `<div class="card booking-list-card"><button type="button" class="booking-list-open" data-action="go" data-route="facility-booking/${esc(b.id)}"><div class="row between"><h3>${esc(b.name)}</h3>${pill(b.status,b.status==='ปฏิเสธ'?'red':b.status==='รออนุมัติ'?'orange':b.status==='อนุมัติ'?'':'gray')}</div><p>${dateLabel(b.date)} · ${esc(b.time)} น.</p><p class="muted">${b.people} ท่าน · ${esc(b.id)}${b.demo?' · ตัวอย่าง':''}</p><span class="small">ดูรายละเอียด →</span></button>${activeFacilityBooking(b)?`<div class="actions">${b.status==='รออนุมัติ'?btn('แก้ไขการจอง','edit-facility-booking',`data-id="${esc(b.id)}"`,'small'):''}${btn('ยกเลิกการจอง','cancel-booking',`data-id="${esc(b.id)}"`,'small secondary')}</div>`:''}</div>`).join('') || empty('calendar','ไม่มีการจองของฉัน','เลือกพื้นที่ส่วนกลางแล้วจองวันเวลาที่สะดวก',linkBtn('เลือกส่วนกลาง','facilities')) : demoList(facilities).map(f => `<button class="service-card" data-action="go" data-route="facility/${f.id}"><span class="product-art">${art(f.type)}</span><div class="grow"><h3>${f.name}</h3><p>${f.hours} น.</p><p>สำหรับลูกบ้าน · ไม่มีค่าใช้จ่าย</p>${pill('พร้อมให้จอง')}</div></button>`).join('') || empty('facility','ยังไม่มีรายการส่วนกลาง','โครงการจะแจ้งเมื่อเปิดให้จอง')}</div>`);
}
// Facility hours are supplied by the management configuration (mock data above).
function refreshFacilityBookings(){
 try{const saved=JSON.parse(localStorage.getItem(STORAGE_KEY));if(Array.isArray(saved?.bookings))state.bookings=saved.bookings;}catch{}
}
window.addEventListener('storage',event=>{if(event.key===STORAGE_KEY&&($('form[data-form="facility"]')||$('form[data-form="facility-calendar"]'))){refreshFacilityBookings();const calendar=$('form[data-form="facility-calendar"]');if(calendar)renderFacilityAvailability(calendar);syncFormValidity();}});
function facilityBusy(id,date){
 const bookings=state.bookings.filter(b=>b.facility===id&&b.date===date&&activeFacilityBooking(b)).map(b=>{const [start,end]=b.time.split('–');return {id:b.id,start,end,own:b.home===house().id,approval:b.status==='ยืนยันแล้ว'?'อนุมัติ':b.status,booker:b.bookerName||state.profile.name};});
 // Recurring demo reservation; kept separate from the resident's saved bookings.
 if(id==='F2')bookings.push({start:'16:00',end:'17:00',own:false,approval:'อนุมัติ',demo:true});
 return bookings.sort((a,b)=>a.start.localeCompare(b.start));
}

function facilityTimeError(f,date,start,end,bookingId){
 const [open,close]=f.hours.split('–');
 if(!date||date<iso())return 'กรุณาเลือกวันนี้หรือวันถัดไป';
 if(!start||!end)return '';
 if(start<open||end>close)return 'กรุณาเลือกเวลาภายใน '+f.hours+' น.';
 if(end<=start)return 'กรุณาเลือกเวลาสิ้นสุดหลังเวลาเริ่ม';
 const now=new Date(),current=String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');
 const existing=bookingId&&state.bookings.find(b=>b.id===bookingId&&b.home===house().id&&activeFacilityBooking(b));
 if(bookingId&&!existing)return 'ไม่พบการจองที่แก้ไขได้';
 if(existing&&date===iso()&&existing.time.split('–')[1]<=current)return 'การจองนี้สิ้นสุดแล้ว';
 if(date===iso()&&start<=current&&(!existing||existing.time.split('–')[0]!==start))return 'เวลานี้ผ่านไปแล้ว กรุณาเลือกเวลาใหม่';
 if(facilityBusy(f.id,date).some(b=>b.id!==bookingId&&start<b.end&&end>b.start))return 'ช่วงเวลานี้มีการจองแล้ว กรุณาเลือกช่วงว่าง';
 return '';
}
function renderCalendarDatePicker(date){
 const selected=new Date(date+'T12:00:00'),year=selected.getFullYear(),month=selected.getMonth();
 const months=Array.from({length:12},(_,i)=>[String(i),new Date(2026,i,1).toLocaleDateString('th-TH',{month:'long'})]);
 modal('เลือกวันที่',`<div class="calendar-picker" data-selected="${date}"><div class="facility-time-range"><div class="field"><span id="picker-month-label">เดือน</span><input type="hidden" name="pickerMonth" value="${month}"><button type="button" class="picker-year-trigger" data-action="calendar-month-picker" aria-labelledby="picker-month-label picker-month-value"><span id="picker-month-value">${months[month][1]}</span>${icon('chevron')}</button></div><div class="field"><span id="picker-year-label">ปี (ค.ศ.)</span><input type="hidden" name="pickerYear" value="${year}"><button type="button" class="picker-year-trigger" data-action="calendar-year-picker" aria-labelledby="picker-year-label picker-year-value"><span id="picker-year-value">${year}</span>${icon('chevron')}</button></div></div><div class="calendar-picker-grid" aria-label="เลือกวัน"></div>${btn('วันนี้','calendar-today','','full secondary')}</div>`);updateCalendarPickerDays();
}
function renderCalendarMonthPicker(){
 const picker=$('.calendar-picker'),selected=Number($('[name="pickerMonth"]',picker).value);picker.hidden=true;
 const view=document.createElement('div');view.className='calendar-month-picker';
 $('#modal-title').textContent='เลือกเดือน';
 view.innerHTML=`<div class="calendar-year-grid calendar-month-grid">${Array.from({length:12},(_,i)=>`<button type="button" data-action="calendar-pick-month" data-month="${i}" aria-pressed="${i===selected}">${new Date(2026,i,1).toLocaleDateString('th-TH',{month:'long'})}</button>`).join('')}</div>${btn('กลับไปเลือกวันที่','calendar-month-back','','full secondary')}`;
 $('#modal').append(view);$('[aria-pressed="true"]',view).focus();
}
function closeCalendarMonthPicker(){
 $('.calendar-month-picker')?.remove();const picker=$('.calendar-picker');picker.hidden=false;$('#modal-title').textContent='เลือกวันที่';$('[data-action="calendar-month-picker"]',picker).focus();
}
function renderCalendarYearPicker(first){
 const picker=$('.calendar-picker');if(!picker)return;
 const current=new Date().getFullYear(),selected=Number($('[name="pickerYear"]',picker).value);
 first=Math.max(current,Math.min(9988,first));picker.hidden=true;
 let view=$('.calendar-year-picker');if(!view){view=document.createElement('div');view.className='calendar-year-picker';$('#modal').append(view);}
 $('#modal-title').textContent='เลือกปี (ค.ศ.)';
 view.innerHTML=`<div class="calendar-day-nav">${iconBtn('back','ปีก่อนหน้า','calendar-year-page',`data-first="${first-12}" ${first===current?'disabled':''}`)}<strong>${first}–${first+11}</strong>${iconBtn('chevron','ปีถัดไป','calendar-year-page',`data-first="${first+12}" ${first>=9988?'disabled':''}`)}</div><div class="calendar-year-grid">${Array.from({length:12},(_,i)=>`<button type="button" data-action="calendar-pick-year" data-year="${first+i}" aria-pressed="${first+i===selected}">${first+i}</button>`).join('')}</div>${btn('กลับไปเลือกวันที่','calendar-year-back','','full secondary')}`;
 $('[aria-pressed="true"]',view)?.focus();
}
function closeCalendarYearPicker(){
 $('.calendar-year-picker')?.remove();const picker=$('.calendar-picker');picker.hidden=false;$('#modal-title').textContent='เลือกวันที่';$('[data-action="calendar-year-picker"]',picker).focus();
}
function updateCalendarPickerDays(){
 const picker=$('.calendar-picker');if(!picker)return;
 const year=Number($('[name="pickerYear"]',picker).value),month=Number($('[name="pickerMonth"]',picker).value),grid=$('.calendar-picker-grid',picker);
 if(!Number.isInteger(year)||year<new Date().getFullYear()||year>9999||$('[name="pickerMonth"]',picker).value===''){grid.innerHTML='<p class="picker-message">กรุณาเลือกเดือนและปีให้ถูกต้อง</p>';return;}
 const days=new Date(year,month+1,0).getDate(),offset=new Date(year,month,1).getDay();
 grid.innerHTML=['อา','จ','อ','พ','พฤ','ศ','ส'].map(d=>`<span class="picker-weekday">${d}</span>`).join('')+'<span aria-hidden="true"></span>'.repeat(offset)+Array.from({length:days},(_,i)=>{
 const date=year+'-'+String(month+1).padStart(2,'0')+'-'+String(i+1).padStart(2,'0');return `<button type="button" data-action="calendar-pick-date" data-date="${date}" aria-label="${dateLabel(date)}" aria-pressed="${date===picker.dataset.selected}" ${date<iso()?'disabled':''}>${i+1}</button>`;
 }).join('');
}
function updateCalendarNow(form){
 const calendar=$('.facility-calendar',form);if(!calendar)return;
 let marker=$('.calendar-now',calendar);
 const f=facilities.find(f=>f.id===form.dataset.id),[open,close]=f.hours.split('–');
 const toMinutes=t=>Number(t.slice(0,2))*60+Number(t.slice(3));
 const now=new Date(),minute=now.getHours()*60+now.getMinutes(),current=String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');
 if(form.elements.date.value!==iso()||minute<toMinutes(open)||minute>=toMinutes(close)){marker?.remove();return;}
 if(!marker){marker=document.createElement('div');marker.className='calendar-now';marker.innerHTML='<span></span>';calendar.append(marker);}
 marker.style.top=((minute+now.getSeconds()/60-toMinutes(open))*1.2)+'px';
 marker.setAttribute('aria-label','เวลาปัจจุบัน '+current+' น.');marker.firstElementChild.textContent=current;
}
function ensureDailyPendingBooking(facility,date){
 if(facility!=='F2'||!date)return;
 const id='BK-DAILY-'+house().id+'-'+date;
 if(state.bookings.some(b=>b.id===id))return;
 const record={id,home:house().id,facility,name:'ห้องฟิตเนส',bookerName:state.profile.name,date,time:'18:00–19:30',people:1,status:'รออนุมัติ',demo:true};
 commit(()=>state.bookings.push(record));
}
function renderFacilityAvailability(form,refreshOnly=false){
 clearInterval(calendarNowTimer);

 const panel=$('#facility-availability',form);if(!panel)return;
 const f=facilities.find(f=>f.id===form.dataset.id),date=form.elements.date.value;
 if(!date||date<iso()){panel.innerHTML='<p>เลือกวันที่เพื่อดูช่วงเวลาว่าง</p>';return;}
 ensureDailyPendingBooking(f.id,date);
 const [open,close]=f.hours.split('–');let cursor=open;const rows=[];
 const add=(start,end,status,booker='',bookingId='',approval='')=>{if(start<end)rows.push({start,end,status,booker,bookingId,approval});};
 const now=new Date(),current=String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');
 if(date===iso()&&current>open){cursor=current<close?current:close;add(open,cursor,'ผ่านไปแล้ว');}
 for(const busy of facilityBusy(f.id,date).filter(b=>b.own||b.approval==='อนุมัติ')){
 const start=busy.start<cursor?cursor:busy.start,end=busy.end>close?close:busy.end;
 if(start>=close||end<=cursor)continue;
 add(cursor,start,'ว่าง');add(start,end,busy.own?'การจองของบ้านเรา':'ผู้อื่นจองแล้ว',busy.own?busy.booker:'',busy.id,busy.approval);cursor=end;
 }
 add(cursor,close,'ว่าง');
 const minutes=t=>Number(t.slice(0,2))*60+Number(t.slice(3));
 const time=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
 const first=minutes(open),last=minutes(close),scale=1.2;
 const cells=[];
 for(const row of rows){
 const start=minutes(row.start),end=minutes(row.end);
 if(row.status==='ว่าง'){
 for(let t=start;t<end;){const next=Math.min(end,(Math.floor(t/60)+1)*60);cells.push(`<button type="button" class="calendar-free" style="top:${(t-first)*scale}px;height:${(next-t)*scale}px" data-action="choose-facility-range" data-start="${time(t)}" data-end="${time(next)}" aria-label="จอง ${time(t)} ถึง ${time(next)}"><span>+ จอง</span></button>`);t=next;}
 }else cells.push(`<${row.bookingId&&row.booker?'button type="button" data-action="go" data-route="facility-booking/'+esc(row.bookingId)+'" data-id="'+esc(row.bookingId)+'" aria-label="ดูรายละเอียดการจองของเรา"':'div'} class="calendar-event ${row.status==='ผ่านไปแล้ว'?'calendar-event-past':row.status==='การจองของบ้านเรา'?'calendar-event-own':'calendar-event-other'} ${row.approval==='รออนุมัติ'?'calendar-event-pending':row.approval==='อนุมัติ'?'calendar-event-approved':''}" style="top:${(start-first)*scale}px;height:${(end-start)*scale}px"><strong>${row.status}${row.approval?' · '+row.approval:''}</strong>${row.booker?`<span class="calendar-booker">${esc(row.booker)}</span>`:''}<span>${row.start}–${row.end}${row.booker?' · ดูรายละเอียด':''}</span></${row.bookingId&&row.booker?'button':'div'}>`);
 }
 const labels=[];for(let t=first;t<=last;t+=60)labels.push(`<span class="calendar-hour" style="top:${(t-first)*scale}px">${time(t)}</span>`);
 if(refreshOnly&&$('.calendar-track',panel)){
 const track=$('.calendar-track',panel),active=document.activeElement,focused=track.contains(active)?active.dataset.start:null;
 track.innerHTML=cells.join('');if(focused){const replacement=$('[data-start="'+focused+'"]',track);(replacement||$('.calendar-scroll',panel)).focus({preventScroll:true});}
 }else panel.innerHTML=`<div class="calendar-day-nav">${iconBtn('back','วันก่อนหน้า','facility-day','data-offset="-1" '+(date<=iso()?'disabled':''))}<button type="button" class="calendar-date-trigger" data-action="calendar-date-picker" aria-haspopup="dialog" aria-label="เลือกวัน เดือน และปี">${dateLabel(date)} ${icon('calendar')}</button>${iconBtn('chevron','วันถัดไป','facility-day','data-offset="1"')}</div><p class="small muted">เปิด ${open} · ปิด ${close} น. (กำหนดโดยนิติ)</p><p class="small">แตะช่วงว่างเพื่อเลือกเวลาและกรอกข้อมูลจอง</p><div class="calendar-scroll" tabindex="0" role="region" aria-label="ตารางเวลา เลื่อนขึ้นลงเพื่อเลือกช่วงเวลาจอง"><div class="facility-calendar" style="height:${(last-first)*scale}px" aria-label="ปฏิทินการจองรายวัน"><div class="calendar-hours">${labels.join('')}</div><div class="calendar-track">${cells.join('')}</div></div></div><p class="small muted calendar-legend">${rows.some(r=>r.status==='ว่าง')?'เหลือง: รออนุมัติ · เขียว: ของเรา · น้ำเงิน: ผู้อื่น · เทา: ผ่านแล้ว':'วันนี้ไม่มีช่วงว่าง กรุณาเลือกวันอื่น'}</p>`;

 updateCalendarNow(form);let renderedMinute=new Date().toISOString().slice(0,16);
 calendarNowTimer=setInterval(()=>{const minute=new Date().toISOString().slice(0,16);if(minute!==renderedMinute){renderFacilityAvailability(form,true);syncFormValidity();}else updateCalendarNow(form);},15000);
}
function renderFacility(id,mode) {
 const f = facilities.find(x => x.id === id); if (!f) return go('facilities');
 if(mode!=='book'){
 page(header(f.name)+`<div class="content has-action"><div class="cover-art">${art(f.type)}</div><div class="card"><h2>${esc(f.name)}</h2><p>เปิด ${esc(f.hours)} น.</p><p class="muted">สำหรับลูกบ้าน · ไม่มีค่าใช้จ่าย</p><div class="divider"></div><p>${esc(f.note)}</p></div><p class="muted">เลือกวันและช่วงเวลาว่างจากปฏิทินก่อนยืนยันการจอง</p><button type="button" class="facility-terms-link" data-action="facility-terms" data-id="${id}" aria-haspopup="dialog">เงื่อนไขการเข้าใช้งานส่วนกลาง</button></div>`+bottom(linkBtn(icon('calendar')+' จอง',`facility/${id}/book`,'full')));return;
 }
 {
 const editing=state.bookings.find(b=>b.id===routeParts[3]&&b.facility===id&&b.home===house().id&&activeFacilityBooking(b));
 page(header('ปฏิทินการจอง')+`<div class="content booking-calendar-page"><p class="facility-booking-title">${esc(f.name)}</p><form data-form="facility-calendar" data-id="${id}"><input type="hidden" name="date" value="${editing&&editing.date>=iso()?editing.date:iso()}"><section id="facility-availability" aria-label="ปฏิทินการจอง"></section></form></div>`);
 renderFacilityAvailability($('form[data-form="facility-calendar"]'));
 if(editing)requestAnimationFrame(()=>{const target=$('.calendar-event-own[data-id]').find(b=>b.dataset.id===editing.id);if(target){const scroller=$('.calendar-scroll');scroller.scrollTop=Math.max(0,target.offsetTop-80);target.focus({preventScroll:true});}});return;
 }
}


// Booking detail inherits the resident app's green palette and read-only detail rows.
// The QR and share action lead; editing remains a separate calendar flow.
function bookingQrImage(b) {
 return reservationQrImage('BANNAYUU-DEMO-BOOKING:'+b.id);
}
function reservationQrImage(payload,branded=false) {
 const qr=qrcode(0,branded?'H':'M');qr.addData(payload);qr.make();
 const count=qr.getModuleCount(),scale=8,margin=4,size=(count+margin*2)*scale;
 const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
 const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,size,size);ctx.fillStyle='#000';
 for(let y=0;y<count;y++)for(let x=0;x<count;x++)if(qr.isDark(y,x))ctx.fillRect((x+margin)*scale,(y+margin)*scale,scale,scale);
 if(branded){
 // Keep a four-module quiet zone; the centered logo covers seven modules
 // plus one white module on each side. Artwork matches assets/mark.svg.
 const logoSize=7*scale,logoStart=(size-logoSize)/2;
 ctx.fillStyle='#fff';ctx.fillRect(logoStart-scale,logoStart-scale,logoSize+scale*2,logoSize+scale*2);
 ctx.save();ctx.translate(logoStart,logoStart);ctx.scale(logoSize/80,logoSize/80);
 ctx.fillStyle='#078b7b';ctx.beginPath();ctx.roundRect(0,0,80,80,22);ctx.fill();
 ctx.strokeStyle='#fff';ctx.lineWidth=5;ctx.lineJoin='round';
 ctx.stroke(new Path2D('M19 38 40 20l21 18v25H19z'));ctx.stroke(new Path2D('M34 62V44h12v18'));ctx.restore();
 }
 return canvas;
}
function renderFacilityBooking(id) {
 refreshFacilityBookings();const b=scoped(state.bookings).find(x=>x.id===id);
 if(!b)return page(header('รายละเอียดการจอง')+`<div class="content">${empty('calendar','ไม่พบการจองนี้','กลับไปตรวจสอบรายการจองของบ้านที่เลือก',linkBtn('การจองของฉัน','facilities/bookings'))}</div>`);
 page(header('รายละเอียดการจอง')+`<div class="content booking-detail"><section class="booking-detail-summary"><div class="row between"><h2>${esc(b.name)}</h2>${pill(b.status,b.status==='ปฏิเสธ'?'red':b.status==='รออนุมัติ'?'orange':b.status==='อนุมัติ'?'':'gray')}</div><p class="muted small">เลขที่การจอง ${esc(b.id)}</p>${detail([['วันที่',dateLabel(b.date)],['เวลา',b.time+' น.'],['จำนวนผู้ใช้งาน',b.people+' ท่าน'],['ผู้จอง',b.bookerName||state.profile.name],['บ้านเลขที่',house().number],['โครงการ',house().project]])}</section><section class="booking-qr-panel" aria-labelledby="booking-qr-title"><h2 id="booking-qr-title">QR Code การจอง</h2><img class="booking-qr-image" src="${bookingQrImage(b).toDataURL('image/png')}" width="240" height="240" alt="QR Code การจอง ${esc(b.id)}"><p class="small muted">QR สาธิตสำหรับอ้างอิงการจอง<br>ไม่ใช่สิทธิ์เข้าพื้นที่จริง</p>${btn('แชร์ QR Code','share-booking-qr',`data-id="${esc(b.id)}"`,'full')}<p class="small muted">เลือก LINE, Instagram, Facebook หรือแอปอื่น<br>ที่รองรับในเมนูแชร์ของอุปกรณ์</p>${btn(icon('download')+' บันทึกรูป QR','download-booking-qr',`data-id="${esc(b.id)}"`,'full secondary')}<p class="small muted">หากไม่พบแอปที่ต้องการ ให้บันทึกรูปแล้วแนบในแอปนั้น</p></section>${activeFacilityBooking(b)?`<div class="actions">${btn('แก้ไขการจอง','edit-facility-booking',`data-id="${esc(b.id)}"`,'secondary')}${btn('ยกเลิกการจอง','cancel-booking',`data-id="${esc(b.id)}"`,'secondary')}</div>`:''}${linkBtn('กลับการจองของฉัน','facilities/bookings','full secondary')}</div>`);
}
function bookingQrFile(b) {
 const qr=bookingQrImage(b),canvas=document.createElement('canvas');canvas.width=720;canvas.height=960;
 const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,720,960);ctx.fillStyle='#173f35';ctx.textAlign='center';ctx.font='bold 32px Tahoma';ctx.fillText(b.name,360,65,640);
 ctx.font='24px Tahoma';ctx.fillText(dateLabel(b.date)+' · '+b.time+' น.',360,115,640);ctx.fillText('สถานะ: '+b.status,360,160,640);
 ctx.imageSmoothingEnabled=false;const size=Math.floor(440/qr.width)*qr.width||qr.width;ctx.drawImage(qr,(720-size)/2,200,size,size);
 ctx.fillText(b.id,360,710,640);ctx.fillText('บ้าน '+house().number+' · '+b.people+' ท่าน',360,760,640);ctx.fillText(house().project,360,810,640);ctx.font='22px Tahoma';ctx.fillText('QR สาธิต · ไม่ใช่สิทธิ์เข้าพื้นที่จริง',360,895,640);
 const data=atob(canvas.toDataURL('image/png').split(',')[1]);return new File([Uint8Array.from(data,c=>c.charCodeAt(0))],'booking-'+b.id+'.png',{type:'image/png'});
}
async function shareBookingQr(id,saveOnly=false) {
 refreshFacilityBookings();const b=scoped(state.bookings).find(x=>x.id===id);if(!b)return toast('ไม่พบการจองนี้');
 try{
 const file=bookingQrFile(b);
 if(saveOnly){download(file.name,file,file.type);return;}
 if(navigator.share&&navigator.canShare?.({files:[file]})){
 await navigator.share({files:[file]});
 }else toast('อุปกรณ์นี้แชร์รูปโดยตรงไม่ได้ กรุณากดบันทึกรูป QR แล้วแนบในแอปที่ต้องการ');
 }catch(error){if(error.name!=='AbortError')toast('แชร์รูปไม่สำเร็จ กรุณาบันทึกรูป QR แล้วแนบในแอปที่ต้องการ');}
}
function qrSvg(text) {
 // A visibly labeled demo marker, deliberately not a real access credential.
 let seed = [...text].reduce((n,c) => n + c.charCodeAt(0), 0), cells = '';
 for (let y=0;y<25;y++) for(let x=0;x<25;x++) { const finder = (x<8&&y<8)||(x>16&&y<8)||(x<8&&y>16); seed = (seed * 9301 + 49297) % 233280; if (!finder && seed % 3 !== 0) cells += `<rect x="${x+2}" y="${y+2}" width="1" height="1"/>`; }
 for(const [x,y] of [[2,2],[20,2],[2,20]]) cells += `<rect x="${x}" y="${y}" width="7" height="7"/><rect x="${x+1}" y="${y+1}" width="5" height="5" fill="white"/><rect x="${x+2}" y="${y+2}" width="3" height="3"/>`;
 return `<svg class="qr" viewBox="0 0 29 29" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="ลาย QR ตัวอย่าง ไม่ใช่รหัสเข้าพื้นที่จริง"><rect width="29" height="29" fill="white"/><g fill="#244b40">${cells}</g><rect x="7" y="12" width="15" height="5" rx="1" fill="white"/><text x="14.5" y="15.5" font-size="3" text-anchor="middle" fill="#078b7b">DEMO</text></svg>`;
}
function renderInvite(){page(header('สมาชิกในบ้าน')+'<div class="content"><div class="info">ต้องการเพิ่มลูกบ้าน กรุณาติดต่อนิติบุคคล</div>'+linkBtn('ติดต่อนิติบุคคล','management','full')+'</div>');}
function ensureVehicleSamples(){if(state.vehiclePassSamples)return;commit(()=>{if(!scoped(state.vehicles).length){['9กค 52444','9กค 5244'].forEach((plate,i)=>state.vehicles.push({id:'CAR-DEMO-'+(i+1),home:house().id,plate,kind:'รถยนต์',engine:'น้ำมัน/สันดาปภายใน',province:'กรุงเทพมหานคร',brand:i?'Honda':'Toyota',model:i?'City':'Yaris',color:i?'ขาว':'เทา',owner:state.profile.name,phone:state.profile.phone,photos:[],validFrom:iso(),validUntil:iso(365),demo:true}));}state.vehiclePassSamples=true;});}
function vehicleQuotaText(count){const quota=Number.isInteger(house().vehicleQuota)&&house().vehicleQuota>0?house().vehicleQuota:5;return count+'/'+quota+' คัน';}
function renderVehicles(){ensureVehicleSamples();
 if(scoped(state.vehicles).length<2)commit(()=>{while(scoped(state.vehicles).length<2){const i=scoped(state.vehicles).length;state.vehicles.push({id:uid('CAR-DEMO'),home:house().id,plate:i?'9กค 5244':'9กค 52444',kind:'รถยนต์',engine:'น้ำมัน/สันดาปภายใน',province:'กรุงเทพมหานคร',brand:i?'Honda':'Toyota',model:i?'City':'Yaris',color:i?'ขาว':'เทา',owner:state.profile.name,phone:state.profile.phone,photos:[],validFrom:iso(),validUntil:iso(365),demo:true});}});
 ensureVehiclePresence();
 const count=state.settings.vehicleDemoCount===2?2:1,list=scoped(state.vehicles).slice(0,count);const controls=`<details class="vehicle-demo-panel"><summary>โหมดสาธิต</summary><div class="vehicle-demo-control"><span id="vehicle-demo-label">จำลองจำนวนรถ</span><div class="vehicle-demo-switch" role="group" aria-labelledby="vehicle-demo-label">${[1,2].map(n=>`<button type="button" data-action="vehicle-demo-count" data-count="${n}" aria-pressed="${count===n}">${n} คัน</button>`).join('')}</div></div></details>`;if(list.length===1)return renderVehicle(list[0].id,controls);page(header('ยานพาหนะของฉัน')+`<div class="content vehicle-list"><h2 class="vehicle-count">ยานพาหนะของฉัน · ${vehicleQuotaText(list.length)}</h2>${list.map(v=>`<button class="service-card vehicle-list-row" data-action="go" data-route="vehicle/${esc(v.id)}"><span class="avatar">${icon('car')}</span><div class="grow"><h3>${esc(v.plate)}</h3><p>${esc(vehicleDescription(v))}</p>${vehiclePresenceBadge(v)}<p class="vehicle-list-location">${esc(v.province||'ไม่ระบุจังหวัด')} · บ้าน ${esc(house().number)}</p></div>${icon('chevron')}</button>`).join('')}${vehicleHelp()}${controls}</div>`);}
function ensureVehiclePresence(){
 const list=scoped(state.vehicles);if(!list.some(v=>typeof v.inProject!=='boolean'))return;
 commit(()=>list.forEach((v,i)=>{if(typeof v.inProject!=='boolean')v.inProject=!!v.demo&&i===0;}));
}
function vehiclePresenceLabel(v){return v.inProject===true?'อยู่ในโครงการ':'ยังไม่เข้าโครงการ';}
function vehiclePresenceBadge(v){return `<span class="vehicle-presence ${v.inProject===true?'is-inside':'is-outside'}">${icon(v.inProject===true?'home':'car')}${vehiclePresenceLabel(v)}</span>`;}
function vehicleDescription(v){return [[v.brand,v.model].filter(Boolean).join(' '),v.color?'สี'+v.color:''].filter(Boolean).join(' · ')||'ยังไม่ระบุรุ่นและสี';}
function vehicleHelp(){return `<aside class="vehicle-help"><div class="vehicle-help-heading">${iconBtn('info','ข้อมูลการเพิ่มหรือแก้ไขทะเบียนรถ','vehicle-help')}<p>ต้องการเพิ่มรถหรือแก้ไขข้อมูล?</p></div>${linkBtn('ติดต่อนิติบุคคล','management','secondary')}</aside>`;}
function renderVehicleForm(step) {
 const v = vehicleDraft; if (step > 1 && !v.plate) return go('vehicle-new/1');
 const steps = `<div class="stepper">${['ข้อมูลยานพาหนะ','ข้อมูลเพิ่มเติม','ยืนยัน'].map((x,i) => `<span class="${i+1<=step ? 'active' : ''}"><b>${i+1}</b>${x}</span>`).join('')}</div>`;
 let body;
 if(step === 1) body = `${upload('รูปยานพาหนะ (สูงสุด 6 รูป)',6)}${select('kind','ประเภทยานพาหนะ',['รถยนต์','รถจักรยานยนต์'],v.kind)}${select('engine','ประเภทรถยนต์/รถจักรยานยนต์',['น้ำมัน/สันดาปภายใน','ไฟฟ้า/ปลั๊กอินไฮบริด','ไฮบริด','อื่น ๆ'],v.engine)}${field('plate','ทะเบียนรถ','text',v.plate,'required maxlength="20" placeholder="เช่น 1กข 2345"')}${select('province','จังหวัด',provinces,v.province)}${submit('ถัดไป')}`;
 else if(step === 2) body = `${field('brand','ยี่ห้อ','text',v.brand,'required maxlength="40" placeholder="เช่น Toyota"')}${field('model','รุ่น','text',v.model,'required maxlength="40" placeholder="เช่น Camry"')}${field('color','สี','text',v.color,'required maxlength="30"')}${field('owner','ชื่อผู้ครอบครอง','text',v.owner || state.profile.name,'required maxlength="100"')}${field('phone','เบอร์โทรศัพท์','tel',v.phone || state.profile.phone,'required pattern="0[0-9]{8,9}" inputmode="tel"')}${submit('ตรวจสอบข้อมูล')}`;
 else body = `<div class="card">${detail([['ประเภทยานพาหนะ',v.kind],['ประเภทเครื่องยนต์',v.engine],['ทะเบียนรถ',v.plate],['จังหวัด',v.province],['ยี่ห้อ / รุ่น',v.brand+' '+v.model],['สี',v.color],['ผู้ครอบครอง',v.owner],['โทรศัพท์',v.phone],['บ้านเลขที่',house().number]])}</div><div class="preview-photos">${(v.photos||[]).map(p=>`<img src="${p}" alt="รูปยานพาหนะ">`).join('')}</div><label class="choice" style="margin:20px 0"><input name="agree" type="checkbox" required>ยืนยันว่าข้อมูลถูกต้อง</label>${submit('ยืนยันลงทะเบียนยานพาหนะ')}`;
 page(header('เพิ่มยานพาหนะ')+`<div class="content">${steps}<form data-form="vehicle" data-step="${step}">${body}</form></div>`);
 if(step===1) { photos = v.photos || []; updatePhotoPreview(); }
}
function vehiclePassQr(v){const qr=reservationQrImage('BANNAYUU-DEMO-VEHICLE:'+v.id,true);return `<img src="${qr.toDataURL('image/png')}" width="${qr.width}" height="${qr.height}" alt="QR Code ยานพาหนะ ${esc(v.plate)} พร้อมโลโก้บ้านน่าอยู่">`;}
function renderVehicle(id,controls=''){
 ensureVehiclePresence();
 const v=scoped(state.vehicles).find(x=>x.id===id);if(!v)return go('vehicles');
 const group=(title,pairs)=>`<span class="vehicle-info-group"><strong class="vehicle-info-title">${title}</strong><span class="vehicle-info-facts">${pairs.map(([label,value])=>`<span>${label}</span><span>${esc(value||'ยังไม่ระบุ')}</span>`).join('')}</span></span>`;
 page(header('บัตรยานพาหนะ')+`<div class="content vehicle-pass-page"><p class="vehicle-quota">ยานพาหนะของฉัน · ${vehicleQuotaText(Math.min(scoped(state.vehicles).length,state.settings.vehicleDemoCount===2?2:1))}</p><div class="vehicle-summary"><h2>${esc(v.plate)}</h2>${vehiclePresenceBadge(v)}<p>${esc(vehicleDescription(v))} · ${esc(v.province||'ไม่ระบุจังหวัด')}</p></div>
 <div class="vehicle-side-switch" role="group" aria-label="ด้านของบัตรยานพาหนะ">${[['qr','qrCode','QR Code'],['details','car','ข้อมูลรถ']].map(([side,glyph,label])=>`<button type="button" data-action="vehicle-side" data-side="${side}" aria-pressed="${side==='qr'}" aria-controls="vehicle-${side}-panel">${icon(glyph)}${label}</button>`).join('')}</div>
 <button type="button" class="vehicle-pass" data-action="flip-vehicle-pass" aria-label="พลิกบัตรเพื่อดูข้อมูลยานพาหนะ" aria-pressed="false"><span class="vehicle-pass-inner"><span id="vehicle-qr-panel" class="vehicle-pass-face vehicle-pass-front"><strong class="pass-type-heading">${icon('house')}<span>บ้าน ${esc(house().number)}</span></strong><span class="vehicle-pass-qr">${vehiclePassQr(v)}</span><span class="vehicle-pass-expiry">${v.validUntil?'หมดอายุ '+dateLabel(v.validUntil):'ยังไม่ระบุวันหมดอายุ'}</span><span class="vehicle-pass-flip">${icon('refresh')} แตะเพื่อพลิกบัตร</span></span>
 <span id="vehicle-details-panel" class="vehicle-pass-face vehicle-pass-back" aria-hidden="true" inert><strong class="vehicle-pass-heading pass-type-heading">${icon('car')}<span>ข้อมูลยานพาหนะ</span></strong>
 ${group('ข้อมูลรถ',[['สถานะรถ',vehiclePresenceLabel(v)],['ทะเบียน',v.plate],['จังหวัด',v.province],['ยี่ห้อ / รุ่น',[v.brand,v.model].filter(Boolean).join(' ')],['สี',v.color],['ประเภทรถ',v.kind],['เครื่องยนต์',v.engine]])}
 ${group('ข้อมูลบัตร',[['บ้าน',house().number],['วันที่เริ่มต้น',v.validFrom?dateLabel(v.validFrom):''],['วันหมดอายุ',v.validUntil?dateLabel(v.validUntil):'']])}
 ${group('ผู้ครอบครอง',[['ชื่อ',v.owner],['เบอร์โทรศัพท์',v.phone]])}
 ${v.photos?.length?`<span class="vehicle-pass-photos">${v.photos.map(p=>`<img src="${esc(p)}" alt="รถของฉัน">`).join('')}</span>`:''}<span class="vehicle-pass-flip">${icon('qrCode')} แตะเพื่อดู QR Code</span></span></span></button>${vehicleHelp()}${controls}</div>`);
}
function setVehicleSide(flipped){const card=$('.vehicle-pass');if(!card)return;card.setAttribute('aria-pressed',String(flipped));card.setAttribute('aria-label',flipped?'พลิกบัตรเพื่อดู QR Code':'พลิกบัตรเพื่อดูข้อมูลยานพาหนะ');for(const [selector,hidden] of [['.vehicle-pass-front',flipped],['.vehicle-pass-back',!flipped]]){const face=card.querySelector(selector);face.inert=hidden;face.setAttribute('aria-hidden',String(hidden));}document.querySelectorAll('[data-action="vehicle-side"]').forEach(el=>el.setAttribute('aria-pressed',String((el.dataset.side==='details')===flipped)));}

function renderPetIntro() { const data = [['ทุกความน่ารัก มีบัตรของตัวเอง','สร้าง Bannayuu Next’s Pet Card ให้เพื่อนตัวน้อย เก็บข้อมูลสำคัญและภาพน่ารักไว้ด้วยกัน'],['บันทึกข้อมูลได้ครบในที่เดียว','ชื่อ สายพันธุ์ วันเกิด น้ำหนัก และไมโครชิป พร้อมให้เปิดดูได้ทุกเมื่อ'],['ความน่ารักที่เป็นส่วนตัว','ข้อมูลนี้เห็นเฉพาะคุณ ใช้สร้างโปรไฟล์สัตว์เลี้ยง ไม่ใช่การลงทะเบียนกับนิติบุคคล']][introStep]; page(header('สัตว์เลี้ยง')+`<div class="content intro"><div class="intro-art">${icon('pet')}</div><h2>${data[0]}</h2><p>${data[1]}</p><div class="intro-dots">${[0,1,2].map(i=>`<span class="${i===introStep?'active':''}"></span>`).join('')}</div>${btn(introStep===2?'เริ่มต้นใช้งาน':'ถัดไป','pet-intro','','full')}${introStep<2?btn('ข้ามคำแนะนำ','pet-skip','','full secondary'):''}</div>`); }
function petCard(p) { return `<div class="pet-card theme-${p.theme||0}"><div class="watermark">${icon('pet')}</div><h2>${['PAWTOPIA · PET CARD','Bannayuu Next’S PET CARD','MY LITTLE COMPANION'][p.theme||0]}</h2><div class="row">${p.photo ? `<img class="pet-photo" src="${p.photo}" alt="${esc(p.thai)}">` : `<div class="pet-photo" style="display:grid;place-items:center">${icon('pet')}</div>`}<div><h3>${esc(p.thai||'ชื่อสัตว์เลี้ยง')}</h3><p>${esc(p.english||'Your little friend')}</p><p>${esc(p.species||'ชนิด')} · ${esc(p.breed||'สายพันธุ์')}</p><p>${esc(p.sex||'เพศ')} · ${esc(p.weight||'—')} กก.</p><p>${dateLabel(p.birth)}</p></div></div><div class="pet-bottom"><span>บ้านน่าอยู่ · ${esc(state.profile.name)}</span><span>Where Every Paw Matters</span></div></div>`; }
function renderPets() { page(header('สัตว์เลี้ยง')+`<div class="content has-action"><div class="info">ข้อมูลสัตว์เลี้ยงเป็นข้อมูลส่วนตัว เห็นเฉพาะคุณ และใช้สร้างโปรไฟล์สัตว์เลี้ยงเท่านั้น</div>${state.pets.map(p=>`<button data-action="go" data-route="pet/${p.id}" style="border:0;background:none;padding:0;width:100%;text-align:left">${petCard(p)}</button>`).join('')||empty('pet','เริ่มสร้างบัตรให้เพื่อนตัวน้อย','เพิ่มสัตว์เลี้ยงและเลือกบัตรในแบบที่ชอบ')}</div>${bottom(linkBtn(icon('plus')+' เพิ่มสัตว์เลี้ยง','pet-new','full'))}`); }
function renderPetForm(id) {
 const p = state.pets.find(x=>x.id===id)||{}; petTheme=p.theme||0;
 page(header(id?'แก้ไขข้อมูลสัตว์เลี้ยง':'เพิ่มสัตว์เลี้ยง')+`<div class="content"><label class="field"><span>รูปแบบ Bannayuu Next’s Pet Card <b class="required">*</b></span></label><div class="pet-templates">${['PAWTOPIA','Bannayuu Next’S PET CARD','LITTLE COMPANION'].map((x,i)=>`<button data-action="pet-theme" data-theme="${i}" class="${i===petTheme?'selected':''}"><strong>${x}</strong>${icon('pet')} &nbsp; ${['อบอุ่นเป็นธรรมชาติ','สดใสในทุกวัน','เพื่อนตัวน้อย'][i]}</button>`).join('')}</div><form data-form="pet" data-id="${id||''}">${upload('รูปภาพสำหรับบัตร',1,true)}${field('thai','ชื่อสัตว์เลี้ยงภาษาไทย','text',p.thai,'required maxlength="20" data-count="20"')}${field('english','ชื่อสัตว์เลี้ยงภาษาอังกฤษ','text',p.english,'required maxlength="20" pattern="[A-Za-z][A-Za-z .\\x27\\x2D]*" data-count="20"')}${select('species','ชนิดสัตว์เลี้ยง',['แมว','สุนัข','นก','กระต่าย','แฮมสเตอร์','หนูตะเภา','เม่นแคระ','ชูการ์ไกลเดอร์','ชินชิลลา','เต่า','งู','ปลา','อื่น ๆ'],p.species)}${field('breed','สายพันธุ์','text',p.breed,'required maxlength="20" data-count="20"')}${field('birth','วันเกิด','date',p.birth,`required max="${iso()}"`)}${field('weight','น้ำหนัก (กิโลกรัม)','number',p.weight,'required min="0.01" max="1000" step="0.01"')}${select('sex','เพศ',['ผู้','เมีย'],p.sex)}${field('color','สี','text',p.color,'required maxlength="40"')}<label class="choice" style="margin-bottom:18px"><input type="checkbox" name="chip" ${p.chip?'checked':''}>ฝังไมโครชิป</label>${field('chipNumber','หมายเลขไมโครชิป (ถ้ามี)','text',p.chipNumber,'maxlength="30"')}${submit('บันทึก')}</form></div>`);
 photos=p.photo?[p.photo]:[]; updatePhotoPreview();
}
function renderPet(id) { const p=state.pets.find(x=>x.id===id); if(!p)return go('pets'); page(header('โปรไฟล์สัตว์เลี้ยง',iconBtn('trash','ลบสัตว์เลี้ยง','delete-ask',`data-kind="pets" data-id="${id}"`))+`<div class="content">${petCard(p)}${btn(icon('download')+' บันทึกภาพ','download-pet',`data-id="${id}"`,'full secondary')}<div class="card" style="margin-top:20px"><h2>โปรไฟล์สัตว์เลี้ยง</h2><div class="divider"></div>${detail([['เจ้าของ',state.profile.name],['ชื่อภาษาไทย',p.thai],['ชื่อภาษาอังกฤษ',p.english],['ชนิดสัตว์เลี้ยง',p.species],['สายพันธุ์',p.breed],['วันเกิด',dateLabel(p.birth)],['น้ำหนัก',p.weight+' กก.'],['เพศ',p.sex],['สี',p.color],['ไมโครชิป',p.chip?(p.chipNumber||'ฝังไมโครชิปแล้ว'):'ไม่ได้ฝัง']])}</div>${linkBtn('แก้ไขข้อมูล',`pet/${id}/edit`,'full')}</div>`); }
function visitorStatusGlyph(status){return {'กำลังเข้า':'visitorEntry','รอเข้า':'visitorEntry','ยังไม่ถึงวันเข้า':'visitorEntry','รอประทับตรา':'stampPending','ประทับตราแล้ว':'stampComplete','ออกแล้ว':'visitorExited','ยกเลิก':'visitorCancelled','ยกเลิกสิทธิ์':'visitorCancelled','หมดอายุ':'visitorExpired'}[status]||'car';}
function visitorStatusIcon(v){
 const [status,color]=visitorStatus(v),glyph=visitorStatusGlyph(status);
 return `<span class="avatar visitor-state-icon ${esc(color)}" data-status-icon="${glyph}" aria-hidden="true">${icon(glyph)}</span>`;
}
function canManageVisitor(v){return !!v&&v.source!=='walkin'&&visitorStatus(v)[0]==='รอเข้า';}
function renderVisitorCalling(v){
 const call=visitorEntryCall(v);
 if(!canReceiveApproval()||!call||!['ringing','active'].includes(call.status)||visitorStatus(v)[0]!=='กำลังเข้า')return '';
 return `<div class="visitor-call-strip ${call.status==='ringing'?'is-ringing':'is-active'}"><div class="visitor-call-copy" role="status"><span class="visitor-call-symbol" aria-hidden="true">${icon('video')}</span><span><strong>${call.status==='active'?'กำลังสนทนาวิดีโอ':'Calling · สายเข้า'}</strong><small>${call.status==='ringing'?'กำลังรอคุณรับสาย':'เชื่อมต่อสายแล้ว'}</small><span class="visitor-call-source">ทางเข้าโครงการ · สายจำลอง</span></span></div>${call.status==='active'?btn('กลับเข้าสาย','guard-resume',`data-visitor-id="${esc(v.id)}"`,'small'):btn(icon('video')+' รับสายวิดีโอ <span class="visitor-call-dots" aria-hidden="true"><i></i><i></i><i></i></span>','guard-answer',`data-visitor-id="${esc(v.id)}" aria-label="รับสายวิดีโอ ทะเบียน ${esc(v.plate)}"`,'small')}</div>`;
}
function visitorEntryCall(v){
 const call=v.demoCall||state.guardCalls?.[v.home];
 if(!call||v.home!==house().id||!['ringing','active','ended'].includes(call.status)||v.revoked||v.stamped||v.enteredAt||v.exitedAt||v.start>iso()||v.end<iso())return null;
 const normalize=value=>String(value||'').replace(/[\s-]+/g,'');
 return (call.visitorId?call.visitorId===v.id:!!v.plate&&normalize(v.plate)===normalize(call.plate)&&v.province===call.province)?call:null;
}
function visitorStatus(v){
 if(visitorEntryCall(v))return ['กำลังเข้า','entering'];
 if(v.source!=='walkin')return v.revoked?['ยกเลิก','gray']:v.exitedAt?['ออกแล้ว','']:v.end<iso()?['หมดอายุ','gray']:v.stamped?['ประทับตราแล้ว','']:!v.enteredAt?['รอเข้า','blue']:['รอประทับตรา','yellow'];
 return v.exitedAt?['ออกแล้ว','']:v.stamped?['ประทับตราแล้ว','']:['รอประทับตรา','yellow'];
}
function registeredVisitorExamples(){
 const home=house().id;
 const callingId='REGISTER-CALL-DEMO-'+home;
 if(!state.visitors.some(v=>v.id===callingId))commit(()=>state.visitors.push({id:callingId,home,source:'registered',name:'คุณพิชญา วัฒนกุล',plate:'ขน 4826',province:'กรุงเทพมหานคร',category:'รถยนต์',entryMode:'single',bookingFormat:visitorBookingFormats()[0],start:iso(),end:iso(),startTime:'08:00',endTime:'23:59',enteredAt:null,exitedAt:null,stamped:false,demo:true,createdAt:new Date().toISOString(),note:'ตัวอย่างลงทะเบียนล่วงหน้า มีสายวิดีโอเรียกเข้าที่ทางเข้าโครงการ',demoCall:{visitorId:callingId,name:'คุณพิชญา วัฒนกุล',plate:'ขน 4826',province:'กรุงเทพมหานคร',photo:'assets/examples/visitor-caller.jpg',status:householdPolicyResult()}}));
 if(state.registeredVisitorSamples?.[home])return;
 const at=(days,hour)=>iso(days)+'T'+hour+':00+07:00';
 const examples=[
 {name:'คุณนภา ใจดี',plate:'กน 1201',start:iso(1),end:iso(1)},
 {name:'ช่างติดตั้งอินเทอร์เน็ต',plate:'ขก 2302',enteredAt:at(0,'09:00')},
 {name:'คุณธนา สุขใจ',plate:'คต 3403',start:iso(-1),end:iso(-1),enteredAt:at(-1,'10:00'),exitedAt:at(-1,'11:30'),stamped:true,stampedAt:at(-1,'11:00'),stampedBy:state.profile.name,stampRight:'สิทธิ์ลูกบ้าน'},
 {name:'ช่างล้างเครื่องปรับอากาศ',plate:'งบ 4504',revoked:true},
 {name:'คุณมาลี แสงดี',plate:'จม 5605',start:iso(-2),end:iso(-2)}
 ];
 commit(()=>{examples.forEach((sample,i)=>state.visitors.push({id:'REGISTER-DEMO-'+home+'-'+(i+1),home,source:'registered',category:'รถยนต์',province:'กรุงเทพมหานคร',entryMode:'single',entryTime:'09:00',start:iso(),end:iso(),stamped:false,note:'รายการตัวอย่างสำหรับประวัติลงทะเบียน',createdAt:at(-3,'08:00'),demo:true,...sample}));state.registeredVisitorSamples={...state.registeredVisitorSamples,[home]:true};});
}
function visitorExamples(){
 if(state.visitorStep3Samples)return;
 commit(()=>{state.visitors.forEach(v=>{v.source??='registered';v.entryMode??=v.start===v.end?'single':'multiple';});
 state.visitors.push({id:'VISIT-DEMO-1',home:house().id,name:'ผู้มาติดต่อจัดส่งสินค้า',category:'รถยนต์',plate:'กย 9999',province:'กรุงเทพมหานคร',start:iso(),end:iso(),source:'walkin',entryMode:'single',stamped:false,note:'รายการตัวอย่าง'}, {id:'VISIT-DEMO-2',home:house().id,name:'ช่างซ่อมบำรุง',category:'รถยนต์',plate:'กค 1120',province:'นนทบุรี',start:iso(),end:iso(),source:'walkin',entryMode:'single',stamped:true,stampedAt:new Date().toISOString(),stampRight:'สิทธิ์ลูกบ้าน',note:'รายการตัวอย่าง'});state.visitorStep3Samples=true;});
}
function renderVisitors(tab){return renderVisitorOverview(tab);}
function visitorStatusFilters(list,allowedStatuses){
 const colors=new Map(list.map(visitorStatus)),available=new Set(colors.keys()),statuses=allowedStatuses||[...new Set(['กำลังเข้า','รอเข้า','รอประทับตรา','ออกแล้ว','ยกเลิก','หมดอายุ',...available])].filter(status=>available.has(status));
 if(allowedStatuses)allowedStatuses.forEach(status=>{if(!colors.has(status))colors.set(status,{'กำลังเข้า':'entering','รอประทับตรา':'yellow'}[status]||'');});
 return `<fieldset id="visitor-status-panel" class="visitor-status-filter" hidden><legend class="sr-only">กรองสถานะ เลือกได้หลายสถานะ</legend><div class="visitor-status-heading"><span>สถานะ <small>เลือกได้หลายสถานะ</small></span>${btn('ล้างสถานะ','visitor-status-clear','disabled','visitor-filter-clear')}</div><div class="visitor-status-options">${statuses.map(status=>{return `<label class="${esc(colors.get(status))}"><input type="checkbox" data-visitor-status value="${esc(status)}" aria-controls="visitor-list">${icon(visitorStatusGlyph(status))}<span>${esc(status)}</span></label>`;}).join('')}</div></fieldset>`;
}
function toggleVisitorStatusFilter(){const panel=$('#visitor-status-panel'),trigger=$('[data-action="visitor-filter-toggle"]');if(!panel||!trigger)return;panel.hidden=!panel.hidden;trigger.setAttribute('aria-expanded',String(!panel.hidden));}
function filterVisitorPlates(value){
 const normalize=text=>String(text||'').normalize('NFKC').toLocaleLowerCase().replace(/[\s-]+/g,''),query=normalize(value),selected=new Set($$('[data-visitor-status]:checked').map(input=>input.value)),rows=$$('#visitor-list .visit-row');let count=0;
 const matching=rows.filter(row=>normalize(row.dataset.search||row.dataset.plate).includes(query));
 rows.forEach(row=>{row.hidden=!matching.includes(row)||(selected.size>0&&!selected.has(row.dataset.status));if(!row.hidden)count++;});
 const filtering=!!query||selected.size>0;$('#visitor-list-empty').hidden=filtering||rows.length>0;$('#visitor-filter-empty').hidden=!filtering||count>0;
 const trigger=$('[data-action="visitor-filter-toggle"]');trigger?.classList.toggle('has-filters',selected.size>0);trigger?.setAttribute('aria-label',selected.size?'กรองสถานะ มีสถานะที่เลือก':'กรองสถานะ');
 const clear=$('[data-action="visitor-status-clear"]');if(clear)clear.disabled=!selected.size;
 $('#visitor-search-result').textContent=filtering?(count?'แสดงรายการตามตัวกรอง':'ไม่พบรายการที่ตรงกับตัวกรอง'):'แสดงรายการทั้งหมด';
}
function resetVisitorFilters(all=false){$$('[data-visitor-status]').forEach(input=>input.checked=false);const search=$('#visitor-plate-search');if(all)search.value='';filterVisitorPlates(search.value);(all?search:$('[data-action="visitor-filter-toggle"]')).focus();}
function syncVisitorEntry(){const f=$('form[data-form="visitor"]');if(!f)return;const text=$('[data-visitor-range-text]',f);if(text)text.textContent=dateLabel(f.elements.start.value)+' – '+dateLabel(f.elements.end.value);}
let visitorRangeDraft=null;
function openVisitorRange(){const f=$('form[data-form="visitor"]');if(!f)return;visitorRangeDraft={start:f.elements.start.value,end:f.elements.end.value,month:f.elements.start.value.slice(0,7),min:f.dataset.id?f.elements.start.value:iso()};renderVisitorRange();}
function renderVisitorRange(){
 const d=visitorRangeDraft;if(!d)return;const [year,month]=d.month.split('-').map(Number),first=new Date(year,month-1,1),count=new Date(year,month,0).getDate();
 const days=Array.from({length:first.getDay()},()=>'<span aria-hidden="true"></span>');
 for(let day=1;day<=count;day++){const date=d.month+'-'+String(day).padStart(2,'0'),edge=date===d.start||date===d.end,inRange=d.start&&d.end&&date>d.start&&date<d.end;days.push(`<button type="button" data-action="visitor-range-day" data-date="${date}" aria-label="${dateLabel(date)}${date===d.start?' วันเริ่มต้น':''}${date===d.end?' วันสิ้นสุด':''}" aria-pressed="${edge}" class="${inRange?'in-range':''}" ${date<d.min?'disabled':''}>${day}</button>`);}
 modal('วันที่เข้าใช้บริการ',`<div class="visitor-range-picker"><div class="visitor-range-month">${iconBtn('back','เดือนก่อนหน้า','visitor-range-month','data-offset="-1" '+(d.month<=d.min.slice(0,7)?'disabled':''))}<h3>${first.toLocaleDateString('th-TH',{month:'long',year:'numeric'})}</h3>${iconBtn('chevron','เดือนถัดไป','visitor-range-month','data-offset="1"')}</div><p class="visitor-range-summary" role="status">${d.start?dateLabel(d.start):'เลือกวันเริ่มต้น'} – ${d.end?dateLabel(d.end):'เลือกวันสิ้นสุด'}</p><p class="small muted">${d.start&&!d.end?'เลือกวันสิ้นสุด หรือเลือกวันเดิมอีกครั้งเพื่อใช้บริการวันเดียว':'เลือกวันเริ่มต้น แล้วเลือกวันสิ้นสุด'}</p><div class="calendar-picker-grid visitor-range-days">${['อา','จ','อ','พ','พฤ','ศ','ส'].map(day=>`<span class="picker-weekday">${day}</span>`).join('')}${days.join('')}</div><div class="actions">${btn('ยกเลิก','close','','secondary')}${btn('ยืนยันช่วงวันที่','visitor-range-apply',d.start&&d.end?'':'disabled')}</div></div>`);
}
function handleVisitorRange(action,button){
 if(action==='visitor-range-open'){openVisitorRange();return;}
 const d=visitorRangeDraft;if(!d)return;
 if(action==='visitor-range-month'){const [year,month]=d.month.split('-').map(Number),next=new Date(year,month-1+Number(button.dataset.offset),1);d.month=next.getFullYear()+'-'+String(next.getMonth()+1).padStart(2,'0');renderVisitorRange();$(`[data-action="visitor-range-month"][data-offset="${button.dataset.offset}"]`)?.focus();}
 if(action==='visitor-range-day'){const date=button.dataset.date;if(date<d.min)return;if(!d.start||d.end||date<d.start){d.start=date;d.end='';}else d.end=date;renderVisitorRange();$(`[data-action="visitor-range-day"][data-date="${date}"]`)?.focus();}
 if(action==='visitor-range-apply'&&d.start&&d.end&&d.end>=d.start){const f=$('form[data-form="visitor"]');if(!f)return;f.elements.start.value=d.start;f.elements.end.value=d.end;closeModal();syncVisitorEntry();syncFormValidity();$('[data-action="visitor-range-open"]',f).focus();}
}
function visitorBookingFormats(){const configured=house().reservationTypes;return Array.isArray(configured)&&configured.length?configured:['ผู้มาติดต่อทั่วไป'];}
function visitorBookingFormatField(v){const options=visitorBookingFormats(),value=v.bookingFormat||'';return options.length===1?field('bookingFormat','รูปแบบการจอง','text',options[0],'required readonly'):select('bookingFormat','รูปแบบการจอง',options,value);}
function validateVisitorTimes(){const f=$('form[data-form="visitor"]');if(!f)return;const end=f.elements.endTime;if(!end)return;f.elements.end.min=f.elements.start.value;const invalidDate=f.elements.end.value&&f.elements.start.value&&f.elements.end.value<f.elements.start.value;const invalidTime=f.elements.start.value===f.elements.end.value&&end.value&&f.elements.startTime.value&&end.value<=f.elements.startTime.value;end.setCustomValidity(invalidTime?'เวลาสิ้นสุดต้องหลังเวลาเริ่มต้น':'');const message=invalidDate?'วันสิ้นสุดต้องไม่ก่อนวันเริ่มต้น':invalidTime?'เวลาสิ้นสุดต้องหลังเวลาเริ่มต้น':'';const error=$('#visitor-datetime-error',f);if(error){error.textContent=message;error.hidden=!message;}for(const input of [f.elements.end,end]){const invalid=input===end?!!invalidTime:!!invalidDate;input.setAttribute('aria-invalid',String(invalid));input.setAttribute('aria-describedby','visitor-datetime-error');}}
function renderVisitorForm(id){
 const v=id?scoped(state.visitors).find(x=>x.id===id):{};if(!v)return go('visitors/registered');
 if(id&&!canManageVisitor(v)){go('estamp-reserve/'+id);toast('แก้ไขได้เฉพาะรายการที่รอเข้า');return;}
 page(header(id?'แก้ไขการลงทะเบียน':'ลงทะเบียนล่วงหน้า')+`<div class="content visitor-surface visitor-registration"><div class="visit-house">${icon('home')}<div><b>${esc(house().project)}</b><p>บ้านเลขที่ ${esc(house().number)}</p></div></div><form data-form="visitor" data-id="${esc(id||'')}"><section class="card registration-section"><h2>ผู้มาติดต่อ</h2>${field('name','ชื่อผู้มาติดต่อ','text',v.name||'','required maxlength="80" autocomplete="name" placeholder="ชื่อ–นามสกุล"')}${visitorBookingFormatField(v)}</section><section class="card registration-section"><h2>ช่วงเวลาเข้าใช้บริการ</h2><fieldset class="visit-entry"><legend>ประเภทการเข้า–ออก</legend><div class="visit-segments"><label><input type="radio" name="entryMode" value="single" ${v.entryMode!=='multiple'?'checked':''}><span>รอบเดียว</span></label><label><input type="radio" name="entryMode" value="multiple" ${v.entryMode==='multiple'?'checked':''}><span>หลายครั้ง</span></label></div></fieldset><div class="visitor-datetime-groups"><fieldset class="visitor-datetime-group"><legend>เริ่มเข้าใช้บริการ</legend><div class="visitor-datetime-fields">${field('start','วันเริ่มต้น','date',v.start||iso(),'required min="'+esc(id?(v.start||iso()):iso())+'"')}${field('startTime','เวลาเริ่มต้น','time',v.startTime||'00:00','required')}</div></fieldset><fieldset class="visitor-datetime-group"><legend>สิ้นสุดการใช้บริการ</legend><div class="visitor-datetime-fields">${field('end','วันสิ้นสุด','date',v.end||v.start||iso(),'required')}${field('endTime','เวลาสิ้นสุด','time',v.endTime||'23:59','required')}</div></fieldset></div><p id="visitor-datetime-error" class="registration-error" role="status" hidden></p></section><section class="card registration-section"><h2>ข้อมูลเพิ่มเติม <span>ไม่บังคับ</span></h2><p class="registration-help">หากนำรถเข้าโครงการ กรุณาระบุทะเบียนและจังหวัด</p>${field('plate','ป้ายทะเบียน','text',v.plate||'','maxlength="20" placeholder="เช่น กย 9999"')}${field('province','จังหวัดที่จดทะเบียน','text',v.province||'','readonly data-action="visitor-province" placeholder="เลือกจังหวัด"')}${area('note','หมายเหตุ',v.note||'','maxlength="100"')}</section><div class="registration-submit"><p>ตรวจสอบชื่อและช่วงเวลาก่อนยืนยัน</p>${submit(id?'บันทึกการแก้ไข':'ยืนยันการลงทะเบียน')}</div></form></div>`);
 photos=v.photo?[v.photo]:[];updatePhotoPreview();syncVisitorEntry();syncFormValidity();
}
function openVisitorProvince(){modal('เลือกจังหวัด',`<label class="field"><span>ค้นหาจังหวัด</span><input type="search" id="visitor-province-search" placeholder="พิมพ์ชื่อจังหวัด"></label><div class="visit-provinces">${provinces.map(p=>btn(esc(p),'visitor-set-province',`data-value="${esc(p)}"`,'secondary full')).join('')}</div><p id="visitor-province-empty" hidden>ไม่พบจังหวัดที่ค้นหา</p>`);}
function openVisitorRecord(id){const v=scoped(state.visitors).find(v=>v.id===id);if(!v)return;go((v.source!=='walkin'?'estamp-reserve/':v.stamped?'visitor-details/':'visitor-stamp/')+v.id);}
function canStampVisitor(v){return memberCanStamp()&&!!v&&!v.revoked&&!v.stamped&&!v.exitedAt&&v.start<=iso()&&v.end>=iso()&&visitorStatus(v)[0]==='รอประทับตรา';}
function reserveUsageDate(v){if(v.startTime&&v.endTime)return dateLabel(v.start)+' '+v.startTime+' – '+(v.start===v.end?'':dateLabel(v.end)+' ')+v.endTime+' น.';return v.start===v.end?dateLabel(v.start):dateLabel(v.start)+' – '+dateLabel(v.end);}
function renderEstampReserve(id){
 currentGuardCall();
 const v=scoped(state.visitors).find(x=>x.id===id&&x.source!=='walkin');
 if(!v)return page(header('ข้อมูลการจอง')+'<div class="content">'+empty('visitor','ไม่พบรายการลงทะเบียน','รายการนี้อาจอยู่ในเบราว์เซอร์อื่น หรือบ้านที่เลือกไม่ตรงกัน',linkBtn('กลับลงทะเบียนล่วงหน้า','visitors/registered'))+'</div>');
 const [label,color]=visitorStatus(v),usage=reserveUsageDate(v);
 const group=(title,pairs)=>'<section class="reserve-info-group"><h3>'+title+'</h3>'+detail(pairs)+'</section>';
 const actions=canManageVisitor(v)?'<div class="visitor-detail-actions">'+iconBtn('edit','แก้ไขการลงทะเบียน '+esc(v.plate),'go','data-route="visitor/'+esc(v.id)+'/edit" title="แก้ไขการลงทะเบียน"')+'<details class="reserve-more"><summary aria-label="ตัวเลือกการจองเพิ่มเติม">'+icon('more')+'</summary><div class="reserve-more-panel">'+btn(icon('visitorCancelled')+' ยกเลิกการจอง','visitor-cancel','data-visitor-id="'+esc(v.id)+'"','reserve-cancel')+'</div></details></div>':'';
 const back=visitorPhotoPreview(v)+group('ผู้มาติดต่อและรถ',[['ชื่อผู้มาติดต่อ',v.name||'ไม่ได้ระบุชื่อ'],['ทะเบียนรถ',(v.plate||'ไม่ระบุทะเบียน')+' · '+(v.province||'ไม่ระบุจังหวัด')]])+group('การนัดหมาย',[['รูปแบบการจอง',v.bookingFormat||'—'],['บ้านที่มาติดต่อ',house().number],['โครงการ',house().project],['วันที่เข้าใช้บริการ',usage],['หมายเหตุ',v.note||'—']])+group('ประวัติรายการ',[['เวลาลงทะเบียน',visitorEventTime(v.createdAt)],['เวลาเข้า',label==='รอเข้า'&&v.enteredAt===null?'ยังไม่เข้า':visitorEventTime(v.enteredAt)],['เวลาออก',visitorEventTime(v.exitedAt)]])+(v.stamped?group('ข้อมูล E-Stamp',[['เวลาประทับตรา',visitorEventTime(v.stampedAt)],['ผู้ประทับตรา',v.stampedBy||'—'],['สิทธิ์ประทับตรา',v.stampRight||'—']]):'');
 page(header('ข้อมูลการจอง',actions)+'<div class="content visitor-surface reserve-page reserve-polished"><section class="booking-detail-summary reserve-identity"><div class="row between"><h2>'+esc(v.plate||v.name)+'</h2><span class="pill reserve-status '+esc(color)+'">'+icon(visitorStatusGlyph(label))+'<span>'+esc(label)+'</span></span></div><p>'+esc(v.name||'ไม่ได้ระบุชื่อ')+' · บ้าน '+esc(house().number)+'</p></section>'+renderVisitorCalling(v)+'<div class="reserve-side-switch" role="group" aria-label="ด้านของบัตร"><button type="button" data-action="reserve-side" data-side="qr" aria-pressed="true" aria-controls="reserve-qr-panel">'+icon('qrCode')+' QR Code</button><button type="button" data-action="reserve-side" data-side="details" aria-pressed="false" aria-controls="reserve-info-panel">'+icon('rules')+' ข้อมูลการจอง</button></div><div class="reserve-pass" data-action="flip-reserve-pass" data-flipped="false"><div class="reserve-pass-inner"><section id="reserve-qr-panel" class="booking-qr-panel reserve-qr reserve-pass-front" aria-label="QR Code การจอง"><h2 class="reserve-house">'+icon('home')+' บ้าน '+esc(house().number)+'</h2><img class="booking-qr-image" src="'+reservationQrImage('BANNAYUU-DEMO-RESERVE:'+v.id,true).toDataURL('image/png')+'" width="240" height="240" alt="QR Code ลงทะเบียน '+esc(v.id)+'"><div class="reserve-usage"><span>วันที่เข้าใช้บริการ</span><strong>'+esc(usage)+'</strong></div><p class="reserve-qr-number">รหัสอ้างอิง '+esc(v.id)+'</p><span class="reserve-flip-hint">'+icon('refresh')+' แตะเพื่อดูรายละเอียด</span></section><section id="reserve-info-panel" class="reserve-pass-back" aria-label="ข้อมูลการจอง" aria-hidden="true" inert><h2 class="reserve-pass-title">ข้อมูลการจอง</h2>'+back+'<span class="reserve-flip-hint">'+icon('qrCode')+' แตะเพื่อดู QR Code</span></section></div></div><div class="reserve-export-actions">'+btn(icon('share')+' แชร์ QR','share-reserve-qr','data-id="'+esc(v.id)+'"','secondary')+btn(icon('download')+' บันทึก QR','download-reserve-qr','data-id="'+esc(v.id)+'"','secondary')+'</div>'+(canStampVisitor(v)?'<form class="reserve-stamp" data-form="visitor-stamp" data-id="'+esc(v.id)+'"><h2>ประทับตรา E-Stamp</h2>'+select('right','เลือกสิทธิ์ประทับตรา',['สิทธิ์ลูกบ้าน'],'สิทธิ์ลูกบ้าน')+area('note','หมายเหตุ (ถ้ามี)','','maxlength="200"')+submit('ประทับตรา (จำลอง)')+'</form>':'')+'</div>');
}
function setReserveSide(flipped){
 const card=$('.reserve-pass');if(!card)return;
 card.dataset.flipped=String(flipped);const front=card.querySelector('.reserve-pass-front'),back=card.querySelector('.reserve-pass-back');front.inert=flipped;back.inert=!flipped;front.setAttribute('aria-hidden',String(flipped));back.setAttribute('aria-hidden',String(!flipped));
 $$('[data-action="reserve-side"]').forEach(button=>button.setAttribute('aria-pressed',String((button.dataset.side==='details')===flipped)));
}
function reserveQrFile(v){
 const visitor=v.source==='walkin',passColor=visitor?'#8A5A24':'#274e81';
 const fontFamily=getComputedStyle(document.documentElement).fontFamily;
 const canvas=document.createElement('canvas');canvas.width=720;const ctx=canvas.getContext('2d'),rows=[];let y=64;
 const textRow=(text,font,lineHeight,gap=12,align='center',color=passColor)=>{
  font=font.replace('Tahoma',fontFamily);
  ctx.font=font;let line='';
  for(const character of Array.from(String(text))){if(line&&ctx.measureText(line+character).width>624){rows.push({text:line,font,y,align,color});y+=lineHeight;line='';}line+=character;}
  rows.push({text:line,font,y,align,color});y+=lineHeight+gap;
 };
 textRow(visitor?'QR ผู้มาติดต่อ · Visitor':'QR ลงทะเบียนล่วงหน้า','bold 32px Tahoma',40,8);
 textRow('บ้าน '+house().number,'bold 26px Tahoma',34,0);
 textRow(house().project,'24px Tahoma',32,8);
 const qr=reservationQrImage('BANNAYUU-DEMO-'+(visitor?'VISITOR':'RESERVE')+':'+v.id,true),size=qr.width,qrY=y;y+=size+36;
 textRow('รหัสอ้างอิง '+v.id,'24px Tahoma',32,24);
 const dateBadgeY=y-26;
 textRow('วันที่เข้าใช้บริการ','bold 22px Tahoma',32,12);
 textRow(reserveUsageDate(v),'26px Tahoma',36,16);
 const dividerY=y;y+=44;
 textRow('ผู้มาติดต่อ','22px Tahoma',30,0,'left','#52685f');
 textRow(v.name||'ไม่ได้ระบุชื่อ','bold 28px Tahoma',38,20,'left','#203c38');
 textRow('ทะเบียนรถ','22px Tahoma',30,0,'left','#52685f');
 textRow(v.plate+' · '+(v.province||'ไม่ระบุจังหวัด'),'bold 28px Tahoma',38,0,'left','#203c38');
 canvas.height=y+24;ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#274e81';ctx.textAlign='center';
 ctx.fillStyle=visitor?'#F5EBDD':'#e8effb';ctx.beginPath();ctx.roundRect(240,dateBadgeY,240,40,12);ctx.fill();
 ctx.strokeStyle='#dce4ec';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(48,dividerY);ctx.lineTo(672,dividerY);ctx.stroke();
 for(const row of rows){ctx.font=row.font;ctx.textAlign=row.align;ctx.fillStyle=row.color;ctx.fillText(row.text,row.align==='left'?48:360,row.y);}
 ctx.drawImage(qr,(720-size)/2,qrY,size,size);
 const bytes=Uint8Array.from(atob(canvas.toDataURL('image/png').split(',')[1]),c=>c.charCodeAt(0));return new File([bytes],(visitor?'visitor-':'reserve-')+v.id+'.png',{type:'image/png'});
}
function reserveShareFallback(id){modal('แชร์ QR Code',`<p>บันทึกรูป QR แล้วแนบใน LINE, Instagram, Facebook หรือแอปที่ต้องการ</p>${btn(icon('download')+' บันทึกรูป QR','download-reserve-qr',`data-id="${esc(id)}"`,'full')}`);}
async function shareReserveQr(id,saveOnly=false){
 const v=scoped(state.visitors).find(v=>v.id===id);if(!v)return toast('ไม่พบรายการผู้มาติดต่อ');
 try{await document.fonts.ready;const file=reserveQrFile(v);if(saveOnly){download(file.name,file,file.type);return;}if(navigator.share&&navigator.canShare?.({files:[file]})){await navigator.share({files:[file]});}else reserveShareFallback(id);}
 catch(error){if(error.name!=='AbortError')reserveShareFallback(id);}
}
function visitorEventTime(value){if(!value||Number.isNaN(new Date(value).getTime()))return 'ยังไม่มีข้อมูล';return new Date(value).toLocaleString('th-TH',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});}
function visitorPhotos(v){
 const sources=[v.photo,...(Array.isArray(v.photos)?v.photos:[])].filter(p=>typeof p==='string'&&p);
 if(sources.length)return [...new Set(sources)].map((src,i)=>({src,label:'รูปผู้มาติดต่อ '+(i+1)}));
 return /^(VISIT|REGISTER)-DEMO-/.test(v.id)?[
  {src:'assets/examples/visitor-caller.jpg',label:'ผู้มาติดต่อ · รูปตัวอย่าง'},
  {src:'assets/examples/example-parcel.jpg',label:'พัสดุที่นำมาจัดส่ง · รูปตัวอย่าง'},
  {src:'assets/community-entrance.jpg',label:'ทางเข้าโครงการ · รูปตัวอย่าง'}
 ]:[];
}
function visitorPhotoPreview(v){
 const images=visitorPhotos(v);
 return `<div class="visitor-stamp-photo">${images.length?`<button type="button" class="visitor-photo-open" data-action="view-visitor-photos" data-id="${esc(v.id)}" aria-label="ดูรูปผู้มาติดต่อทั้งหมด ${images.length} รูป"><img src="${esc(images[0].src)}" alt="${esc(images[0].label)}"><span class="visitor-photo-count">${icon('image')} ดูรูปทั้งหมด · ${images.length} รูป</span></button>`:`<div class="visitor-photo-empty">${icon('visitor')}<span>ไม่มีรูปผู้มาติดต่อ</span></div>`}</div>`;
}
function showVisitorPhotos(id){
 const v=scoped(state.visitors).find(v=>v.id===id);if(!v)return;
 const images=visitorPhotos(v);if(!images.length)return;
 modal('รูปผู้มาติดต่อ',`<p class="visitor-gallery-help">${esc(v.name||v.plate)} · ${images.length} รูป<br>เลื่อนขึ้น–ลงเพื่อดูรูปทั้งหมด</p><div class="visitor-photo-gallery" tabindex="0" role="region" aria-label="รูปผู้มาติดต่อทั้งหมด เลื่อนดูตามแนวตั้ง">${images.map((photo,i)=>`<figure class="visitor-photo-slide"><img src="${esc(photo.src)}" alt="${esc(photo.label)}" decoding="async"><figcaption><span>${esc(photo.label)}</span><span>${i+1} / ${images.length}</span></figcaption></figure>`).join('')}</div>`);
}
function renderVisitorDetails(id){return renderVisitorStamp(id,true);}
function renderVisitorStamp(id,detailsPage=false){
 currentGuardCall();
 const v=scoped(state.visitors).find(v=>v.id===id);if(!v)return go('visitors');
 const [label,color]=visitorStatus(v),eligible=canStampVisitor(v);
 const group=(title,pairs)=>'<section class="reserve-info-group"><h3>'+title+'</h3>'+detail(pairs)+'</section>';
 const stampInfo=v.stamped?group('ข้อมูล E-Stamp',[['ผู้ประทับตรา',v.stampedBy||'ไม่ได้บันทึกชื่อผู้ประทับตรา'],['วันเวลาที่ประทับตรา',visitorEventTime(v.stampedAt)],['สิทธิ์ประทับตรา',v.stampRight||'—'],...(v.stampNote?[['หมายเหตุการประทับตรา',v.stampNote]]:[])]):'';
 const info=group('ผู้มาติดต่อและรถ',[['ชื่อผู้มาติดต่อ',v.name||'ไม่ได้ระบุชื่อ'],['ประเภทรถ',v.category||'—'],['ทะเบียนรถ',v.plate+' · '+(v.province||'ไม่ระบุจังหวัด')],['บ้านที่มาติดต่อ',house().number],['หมายเหตุ',v.note||'—']])+group('เวลาเข้า–ออก',[['เวลาเข้า',visitorEventTime(v.enteredAt)],['เวลาออก',visitorEventTime(v.exitedAt)]]);
 page(header(v.stamped||detailsPage?'รายละเอียดผู้มาติดต่อ':'ประทับตราผู้มาติดต่อ')+`<div class="content visitor-surface reserve-page reserve-polished visitor-pass-page">
 <section class="booking-detail-summary reserve-identity"><div class="row between"><h2>${esc(v.plate)}</h2><span class="pill reserve-status ${esc(color)}">${icon(visitorStatusGlyph(label))}<span>${esc(label)}</span></span></div><p>${esc(v.name||v.category)} · บ้าน ${esc(house().number)}</p></section>
 ${renderVisitorCalling(v)}<div class="reserve-side-switch" role="group" aria-label="ด้านของบัตรผู้มาติดต่อ"><button type="button" data-action="reserve-side" data-side="qr" aria-pressed="true" aria-controls="reserve-qr-panel">${icon('qrCode')} QR Code</button><button type="button" data-action="reserve-side" data-side="details" aria-pressed="false" aria-controls="reserve-info-panel">${icon('visitor')} ข้อมูลผู้มาติดต่อ</button></div>
 <div class="reserve-pass" data-action="flip-reserve-pass" data-flipped="false"><div class="reserve-pass-inner">
 <section id="reserve-qr-panel" class="booking-qr-panel reserve-qr reserve-pass-front" aria-label="QR Code ผู้มาติดต่อ"><p class="visitor-pass-type">Visitor · ผู้มาติดต่อ</p><h2 class="reserve-house">${icon('home')} บ้าน ${esc(house().number)}</h2><img class="booking-qr-image" src="${reservationQrImage('BANNAYUU-DEMO-VISITOR:'+v.id,true).toDataURL('image/png')}" width="240" height="240" alt="QR Code ผู้มาติดต่อ ${esc(v.id)}"><div class="reserve-usage"><span>วันที่เข้ามาติดต่อ</span><strong>${esc(reserveUsageDate(v))}</strong></div><p class="reserve-qr-number">รหัสอ้างอิง ${esc(v.id)}</p><span class="reserve-flip-hint">${icon('refresh')} แตะเพื่อดูรายละเอียด</span></section>
 <section id="reserve-info-panel" class="reserve-pass-back" aria-label="ข้อมูลผู้มาติดต่อ" aria-hidden="true" inert><h2 class="reserve-pass-title">ข้อมูลผู้มาติดต่อ</h2>${visitorPhotoPreview(v)}${info}${stampInfo}<span class="reserve-flip-hint">${icon('qrCode')} แตะเพื่อดู QR Code</span></section></div></div>
 <div class="reserve-export-actions">${btn(icon('share')+' แชร์ QR','share-reserve-qr','data-id="'+esc(v.id)+'"','secondary')}${btn(icon('download')+' บันทึก QR','download-reserve-qr','data-id="'+esc(v.id)+'"','secondary')}</div>
 ${eligible?`<form class="reserve-stamp" data-form="visitor-stamp" data-id="${esc(v.id)}"><h2>ประทับตรา E-Stamp</h2>${select('right','เลือกสิทธิ์ประทับตรา',['สิทธิ์ลูกบ้าน'],'สิทธิ์ลูกบ้าน')}${area('note','หมายเหตุ (ถ้ามี)','','maxlength="200"')}${submit('ประทับตรา (จำลอง)')}</form>`:v.stamped?'':`<div class="info">${esc(label)} · ${memberCanStamp()?'ไม่สามารถประทับตราซ้ำหรือใช้งานนอกช่วงวันที่กำหนด':'บัญชีนี้ไม่มีสิทธิ์ E-Stamp กรุณาติดต่อนิติบุคคล'}</div>`}
</div>`);
}
let guardBannerDismissed = false;
function currentGuardCall(){
 if(!state.guardCalls?.[house().id])commit(()=>{state.guardCalls ||= {};state.guardCalls[house().id]={name:'สมชาย ใจดี',plate:'กย 9999',province:'กรุงเทพมหานคร',photo:'assets/examples/visitor-caller.jpg',status:householdPolicyResult()};});
 const selected=state.guardCalls?.[house().id];
 return scoped(state.visitors).find(v=>v.id===selected?.visitorId)?.demoCall||selected;
}
function renderGuardNotification(){
 $('#guard-notification')?.remove();
 if(!canReceiveApproval())return;
 const call=currentGuardCall();
 if(!call||call.status!=='ringing'||guardBannerDismissed||routeParts[0]==='guard-call')return;
 const el=document.createElement('aside');el.id='guard-notification';el.className='guard-notification guard-notification-card';el.setAttribute('aria-label','สายเรียกเข้าจากหุ่นยนต์ปกป้อง');
 el.innerHTML=`<div role="status" class="sr-only">สายเรียกเข้าจากพี่ปกป้อง ${esc(call.name)} ทะเบียน ${esc(call.plate)}</div>${iconBtn('close','ปิดการแจ้งเตือนสายเข้า','guard-dismiss')}<div class="guard-notice-identity"><span class="guard-robot" aria-hidden="true"><svg viewBox="0 0 80 80"><path d="M28 15h24" stroke="currentColor" stroke-width="8" stroke-linecap="round"/><rect x="10" y="24" width="60" height="43" rx="14" fill="currentColor"/><circle cx="28" cy="45" r="10" fill="none" stroke="white" stroke-width="4"/><circle cx="52" cy="45" r="10" fill="none" stroke="white" stroke-width="4"/><path d="M37 59h6" stroke="white" stroke-width="3" stroke-linecap="round"/></svg></span><div class="guard-notice-copy"><p>สายเรียกเข้า - พี่ปกป้อง</p><h2>${esc(call.name)}</h2><span>ทะเบียน - ${esc(call.plate)}</span></div></div><div class="guard-notice-actions">${btn(icon('video')+' เปิดกล้อง','guard-answer','','guard-notice-camera')}${btn(icon('check')+' อนุมัติ','guard-decision','data-value="allow"','guard-notice-allow')}${btn(icon('close')+' ไม่อนุมัติ','guard-decision','data-value="deny"','guard-notice-deny')}</div>`;
 if(!routeParts[0]||routeParts[0]==='home'){el.classList.add('guard-notification-home');$('#shell').prepend(el);}else document.body.append(el);
 let swipe=null, suppressClick=false;
 el.addEventListener('pointerdown',event=>{
  if(!event.isPrimary||event.button!==0||event.target.closest('[data-action]'))return;
  swipe={id:event.pointerId,x:event.clientX,y:event.clientY,dx:0,dragging:false};suppressClick=false;
 });
 el.addEventListener('pointermove',event=>{
  if(!swipe||swipe.id!==event.pointerId)return;
  const dx=event.clientX-swipe.x,dy=event.clientY-swipe.y;
  if(!swipe.dragging&&Math.abs(dy)>12&&Math.abs(dy)>Math.abs(dx)){swipe=null;return;}
  if(!swipe.dragging&&dx>10&&dx>Math.abs(dy)){swipe.dragging=true;suppressClick=true;el.setPointerCapture(event.pointerId);}
  if(!swipe.dragging)return;
  swipe.dx=Math.max(0,dx);el.style.translate=`${Math.min(swipe.dx,120)}px 0`;el.style.opacity=String(Math.max(.25,1-swipe.dx/el.offsetWidth));
 });
 const finishSwipe=event=>{
  if(!swipe||swipe.id!==event.pointerId)return;
  const dismiss=event.type==='pointerup'&&swipe.dragging&&swipe.dx>=Math.min(88,el.offsetWidth*.25);
  swipe=null;
  if(dismiss){guardBannerDismissed=true;el.remove();}
  else{el.style.translate='';el.style.opacity='';}
 };
 el.addEventListener('pointerup',finishSwipe);el.addEventListener('pointercancel',finishSwipe);
 el.addEventListener('click',event=>{if(suppressClick){event.preventDefault();event.stopPropagation();suppressClick=false;}},true);

}
function renderGuardCall(){
 if(!canReceiveApproval())return renderGuardAccessState();
 const call=currentGuardCall();if(!call)return go('visitors');
 const active=call.status==='active',resolved=['allow','deny'].includes(call.status);
 const status={ringing:'ผู้มาติดต่อรอการอนุมัติ',active:'วิดีโอคอลจำลองกำลังทำงาน',allow:'อนุญาตให้เข้าแล้ว',deny:'ไม่อนุญาตให้เข้า',ended:'สิ้นสุดการโทร · รอการอนุมัติ'}[call.status];
 page(header('หุ่นยนต์ปกป้อง')+`<div class="content guard-call guard-incoming"><div class="guard-caller-stage ${active?'guard-video-active':''}">${active?`<video class="guard-remote-video" autoplay muted playsinline aria-label="วิดีโอผู้มาติดต่อจำลอง" poster="${esc(call.photo)}"></video><div class="guard-call-topbar"><span class="guard-call-duration" role="timer" aria-label="ระยะเวลาการโทร">00:00</span></div>`:''}<img class="guard-caller-photo" src="${esc(call.photo)}" alt="" aria-hidden="true"><div class="guard-caller-info"><span class="guard-demo">สายเรียกเข้าเพื่อขออนุมัติ · จำลอง</span><div class="guard-caller-avatar">${icon('visitor')}<img src="${esc(call.photo)}" alt="ภาพผู้มาติดต่อ ${esc(call.name)}" width="112" height="112"></div><h2>${esc(call.name)}</h2><p>ทะเบียน ${esc(call.plate)} · ${esc(call.province)}</p><p>ทางเข้าหลัก · บ้าน ${esc(house().number)}</p></div><div class="guard-call-footer"><div class="guard-caller-controls">${!resolved?btn(icon('video'),active?'guard-end':'guard-answer',`aria-label="${active?'วางสาย':'โทร'}"`,'guard-call-button'+(active?' is-active':''))+(active?'<span class="guard-call-label">วางสาย</span>':''):''}${!resolved&&!active?'<div class="guard-waiting" role="status"><span class="guard-waiting-dots" aria-hidden="true"><i></i><i></i><i></i></span><p>รออนุมัติ</p></div>':''}<div class="guard-caller-status" role="status" id="guard-status">${call.status==='ringing'?'':`<p>${status}</p>`}</div></div><div class="guard-actions">${!resolved?btn(icon('check')+' อนุมัติ','guard-decision','data-value="allow"')+btn(icon('close')+' ปฏิเสธ','guard-decision','data-value="deny"','guard-reject'):linkBtn('กลับหน้าผู้มาติดต่อ','visitors','full')+btn('จำลองสายเข้าอีกครั้ง','guard-replay','','secondary')}</div><p class="guard-privacy-note">ระหว่างที่ VDO Call ผู้มาติดต่อจะไม่เห็นใบหน้าของท่าน</p></div></div></div>`);
 $$('.guard-caller-photo,.guard-caller-avatar img').forEach(img=>{const hide=()=>{img.hidden=true;};img.addEventListener('error',hide,{once:true});if(img.complete&&!img.naturalWidth)hide();});
 if(active){
  const started=call.startedAt||Date.now();
  const update=()=>{const seconds=Math.max(0,Math.floor((Date.now()-started)/1000));const el=$('.guard-call-duration');if(el)el.textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;};
  startGuardDemoVideo(call.photo);
  update();guardCallTimer=setInterval(update,1000);
 }

}


function startGuardDemoVideo(photo){
 const video=$('.guard-remote-video');if(!video)return;
 const canvas=document.createElement('canvas');canvas.width=480;canvas.height=640;
 const ctx=canvas.getContext('2d'),portrait=new Image();let stream,timer,disposed=false;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 page.disposeGuardVideo=()=>{disposed=true;clearInterval(timer);stream?.getTracks().forEach(track=>track.stop());video.pause();video.srcObject=null;portrait.onload=null;};
 portrait.onload=()=>{
  if(disposed)return;
  const began=performance.now();
  const draw=()=>{const motion=reduced?0:Math.sin((performance.now()-began)/4000)*.015;const scale=Math.max(canvas.width/portrait.width,canvas.height/portrait.height)*(1.04+motion);const w=portrait.width*scale,h=portrait.height*scale;ctx.drawImage(portrait,(canvas.width-w)/2,(canvas.height-h)/2,w,h);};
  draw();if(!canvas.captureStream)return;
  stream=canvas.captureStream(12);video.srcObject=stream;video.play().catch(()=>{});timer=setInterval(draw,1000/12);
 };
 portrait.src=photo;
}

function renderVisitor(id,tab) { const v=scoped(state.visitors).find(x=>x.id===id); if(!v)return go('visitors/registered'); const status=v.revoked?'หมดสิทธิ์':v.end<iso()?'หมดอายุ':v.start>iso()?'ยังไม่ถึงวันเริ่มต้น':'ใช้งานได้'; const card=`<div class="pass-card"><h2>i-Pass</h2><p>${esc(house().project)}</p><h3>${esc(v.name)}</h3>${passFlipped?`<div style="height:156px;display:grid;place-items:center;margin:18px auto">${detail([['บ้านเลขที่',house().number],['ทะเบียน',v.plate],['จังหวัด',v.province]])}</div>`:qrSvg(v.id)}${pill(status,status==='ใช้งานได้'?'':'gray')}<p>${dateLabel(v.start)} – ${dateLabel(v.end)}</p>${iconBtn('refresh','สลับด้านบัตร','flip-pass')}<div class="strip">DEMO i-PASS · บัตรสาธิต ไม่ใช้เข้าพื้นที่จริง</div></div>`; page(header('ข้อมูลผู้มาติดต่อ')+tabs([['บัตรสมาชิก',`visitor/${id}`],['รายละเอียด',`visitor/${id}/details`]],tab==='details'?1:0)+`<div class="content">${tab==='details'?`<div class="card">${detail([['สถานะ',status],['ชื่อ',v.name],['เริ่มต้น',dateLabel(v.start)],['เวลาเข้าใช้งานที่กำหนด',v.entryTime?v.entryTime+' น.':'ไม่ได้ระบุ'],['สิ้นสุด',dateLabel(v.end)],['หมวดหมู่',v.category],['บ้านเลขที่',house().number],['ทะเบียน',v.plate],['จังหวัด',v.province],['รายละเอียดเพิ่มเติม',v.note||'—']])}</div>${linkBtn('แก้ไข',`visitor/${id}/edit`,'full')}${!v.revoked?`<div class="actions">${btn('ยกเลิกสิทธิ์บัตร','revoke-pass',`data-id="${id}"`,'danger full')}</div>`:''}`:`${card}<p class="small muted" style="text-align:center">กดลูกศรเพื่อสลับด้าน • บันทึกภาพเฉพาะด้านที่แสดง</p><div class="actions">${btn(icon('copy')+' คัดลอกลิงก์','copy-pass',`data-id="${id}"`,'secondary')}${btn(icon('download')+' บันทึกภาพ','download-pass',`data-id="${id}"`)}</div><div class="info" style="margin-top:18px">ลิงก์บัตรในต้นแบบเปิดข้อมูลได้เฉพาะเบราว์เซอร์ที่เก็บรายการนี้ไว้</div>`}</div>`); }
let visitorQrStream=null,visitorQrTimer=null,visitorQrSession=0;
function stopVisitorQrCamera(){
 visitorQrSession++;clearTimeout(visitorQrTimer);visitorQrStream?.getTracks().forEach(t=>t.stop());visitorQrStream=null;
 const video=$('#visitor-qr-video');if(video){video.pause();video.srcObject=null;}
}
function readVisitorQr(value){
 const match=/^BANNAYUU-DEMO-(RESERVE|VISITOR):(.+)$/.exec(value);
 if(!match)return false;
 const v=scoped(state.visitors).find(v=>v.id===match[2]&&(match[1]==='RESERVE'?v.source!=='walkin':v.source==='walkin'));
 if(!v)return false;
 closeModal();openVisitorRecord(v.id);return true;
}
async function openVisitorQrCamera(){
 stopVisitorQrCamera();const session=visitorQrSession;
 modal('สแกน QR การจอง',`<div class="visitor-qr-camera"><video id="visitor-qr-video" autoplay muted playsinline aria-label="กล้องสแกน QR Code"></video><p id="visitor-qr-message" role="status">กำลังเปิดกล้อง…</p><p class="small muted">วาง QR Code การจองล่วงหน้าให้อยู่ในภาพ</p>${btn('ปิดกล้องและเลือกรายการ','close','','secondary full')}</div>`);
 $('#modal').addEventListener('close',stopVisitorQrCamera,{once:true});
 try{
  if(!navigator.mediaDevices?.getUserMedia)throw {name:'Unsupported'};
  const stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'}}});
  if(session!==visitorQrSession){stream.getTracks().forEach(t=>t.stop());return;}
  visitorQrStream=stream;const video=$('#visitor-qr-video');video.srcObject=stream;await video.play();
  if(session!==visitorQrSession)return;
  $('#visitor-qr-message').textContent='พร้อมสแกน QR Code';
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
  const scan=()=>{
   if(session!==visitorQrSession)return;
   if(video.readyState>=2&&video.videoWidth){
    const scale=Math.min(1,720/video.videoWidth);canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);
    ctx.drawImage(video,0,0,canvas.width,canvas.height);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height),code=jsQR(pixels.data,canvas.width,canvas.height,{inversionAttempts:'attemptBoth'});
    if(code){if(readVisitorQr(code.data))return;$('#visitor-qr-message').textContent='ไม่พบรายการของบ้านนี้ กรุณาตรวจสอบ QR Code แล้วลองอีกครั้ง';}
   }
   visitorQrTimer=setTimeout(scan,200);
  };scan();
 }catch(error){
  if(session!==visitorQrSession)return;stopVisitorQrCamera();
  $('#visitor-qr-message').textContent=error.name==='NotAllowedError'?'ไม่ได้รับอนุญาตให้ใช้กล้อง กรุณาอนุญาตกล้องในเบราว์เซอร์ หรือเลือกจากรายการ':error.name==='NotFoundError'?'ไม่พบกล้องบนอุปกรณ์นี้ กรุณาเลือกจากรายการ':'เปิดกล้องไม่ได้ กรุณาใช้ HTTPS หรือ localhost และตรวจสอบว่ากล้องพร้อมใช้งาน';
 }
}
document.addEventListener('visibilitychange',()=>{if(document.hidden&&visitorQrStream){stopVisitorQrCamera();closeModal();}});
window.addEventListener('pagehide',stopVisitorQrCamera);
function renderScanner(mode) {
 visitorExamples();const registered=mode==='registered';if(registered)registeredVisitorExamples();
 const active=scoped(state.visitors).filter(v=>canStampVisitor(v)&&(registered?v.source!=='walkin':v.source==='walkin')).sort((a,b)=>String(b.enteredAt||b.start).localeCompare(String(a.enteredAt||a.start)));
 page(header('ประทับตรา')+tabs([['ผู้มาติดต่อ','scan'],['ลงทะเบียนล่วงหน้า','scan/registered']],registered?1:0)+`<div class="content scan-picker"><button type="button" class="scan-camera-trigger" data-action="scan-camera">${icon('scan')}<span><strong>สแกน QR การจอง</strong><small>สำหรับผู้จองล่วงหน้า</small></span></button><section aria-labelledby="scan-picker-title"><label class="scan-search-label" for="scan-search">ค้นหาทะเบียนรถหรือชื่อ</label><div class="scan-search">${icon('search')}<input id="scan-search" type="search" placeholder="ค้นหา…" autocomplete="off" aria-controls="scan-visitors"></div><h2 id="scan-picker-title">${registered?'การจองรอประทับตรา':'ผู้มาติดต่อรอประทับตรา'} · <span id="scan-result-count">${active.length}</span> รายการ</h2>${active.length?`<div class="scan-visitors" id="scan-visitors">${active.map(v=>`<button type="button" class="scan-visitor" data-action="scan-visitor" data-id="${esc(v.id)}" data-search="${esc([v.plate,v.name,v.id].join(' '))}">${visitorStatusIcon(v)}<span class="scan-visitor-copy"><strong>${esc(v.plate||'ไม่ระบุทะเบียน')}</strong><span>${esc(v.name)}</span><small>${dateLabel(v.start)}</small></span>${icon('chevron')}</button>`).join('')}</div><div id="scan-no-results" class="scan-no-results" hidden><span class="scan-empty-icon" aria-hidden="true">${icon('search')}</span><div class="scan-empty-copy"><h3>ไม่พบรายการที่ค้นหา</h3><p>ลองตรวจสอบทะเบียนรถหรือชื่ออีกครั้ง<br>ค้นหาได้เฉพาะรายการรอประทับตรา</p></div>${btn('ล้างคำค้นหา','scan-search-clear','','secondary')}</div><p id="scan-search-status" class="sr-only" role="status" aria-live="polite"></p>`:empty('stampPending',registered?'ไม่มีการจองรอประทับตรา':'ไม่มีผู้มาติดต่อรอประทับตรา','รายการที่พร้อมประทับตราจะแสดงที่นี่',linkBtn('ดูรายการผู้มาติดต่อ','visitors','secondary'))}</section><p class="small muted scan-footnote">ตรวจสอบข้อมูลและยืนยันในหน้าถัดไป ยังไม่มีการประทับตราเมื่อเลือกรายการ</p></div>`);
}
function filterScanVisitors(value){
 if(!$('#scan-visitors'))return;
 const normalize=s=>s.toLocaleLowerCase().replace(/[\s-]/g,'');const query=normalize(value);let found=false;
 $$('.scan-visitor').forEach(row=>{row.hidden=!normalize(row.dataset.search).includes(query);if(!row.hidden)found=true;});
 $('#scan-result-count').textContent=$$('.scan-visitor').filter(row=>!row.hidden).length;$('#scan-visitors').hidden=!found;$('#scan-no-results').hidden=found;$('#scan-search-status').textContent=found?'แสดงรายการที่ตรงกับคำค้นหา':'ไม่พบผู้มาติดต่อที่ตรงกับคำค้นหา';
}
document.addEventListener('input',e=>{if(e.target.id==='scan-search')filterScanVisitors(e.target.value);});
function renderFeedback(tab,id) {
 if(tab==='detail')return renderFeedbackDetail(id);
 const records=scoped(state.feedback);
 page(header('ข้อเสนอแนะ')+tabs([['ส่งข้อเสนอแนะ','feedback'],['รายการของฉัน','feedback/history']],tab==='history'?1:0)+`<div class="content">${tab==='history'?records.map(f=>`<button type="button" class="feedback-history-item" data-action="go" data-route="feedback/detail/${esc(f.id)}"><strong>${esc(f.title)}</strong><p class="feedback-preview">${esc(f.detail)}</p><span class="feedback-history-footer"><span>${dateLabel(f.date)}${f.photos?.length?' · '+f.photos.length+' รูป':''}</span><span>ดูรายละเอียด ${icon('chevron')}</span></span></button>`).join('')||empty('feedback','ยังไม่มีข้อเสนอแนะ','ข้อเสนอแนะที่ส่งแล้วจะแสดงที่นี่',linkBtn('ส่งข้อเสนอแนะ','feedback')):`<div class="info">ข้อเสนอแนะสำหรับทีมบริหาร (นิติบุคคล)</div><form data-form="feedback">${field('title','หัวข้อข้อเสนอแนะ','text','','required maxlength="120" placeholder="เช่น ไฟส่องทางบริเวณสวนไม่ติด"')}${area('detail','รายละเอียด','','required maxlength="2000" placeholder="บอกตำแหน่ง เหตุการณ์ และสิ่งที่ต้องการให้ตรวจสอบ"')}${upload('เพิ่มรูป (ไม่เกิน 3 รูป)',3)}${field('phone','เบอร์โทรศัพท์สำหรับติดต่อกลับ','tel',state.profile.phone,'required pattern="0[0-9]{8,9}"')}${field('email','ส่งสำเนาไปยังอีเมลของคุณ','email',state.profile.email)}${submit('ยืนยัน')}</form>`}</div>`);
}
function renderFeedbackDetail(id){
 const f=scoped(state.feedback).find(item=>item.id===id);
 const heading=header('รายละเอียดข้อเสนอแนะ').replace('data-action="back"','data-action="go" data-route="feedback/history"');
 if(!f)return page(heading+'<div class="content">'+empty('feedback','ไม่พบข้อเสนอแนะ','',linkBtn('กลับรายการของฉัน','feedback/history','secondary'))+'</div>');
 page(heading+`<div class="content"><article class="feedback-detail"><h2>${esc(f.title)}</h2><p class="muted">${esc(f.id)} · ${dateLabel(f.date)}</p><p class="feedback-full-text">${esc(f.detail)}</p>${f.photos?.length?'<div class="feedback-images">'+f.photos.map((src,i)=>'<img src="'+esc(src)+'" alt="รูปแนบข้อเสนอแนะ '+(i+1)+'" loading="lazy">').join('')+'</div>':''}${f.phone||f.email?'<section class="feedback-contact"><h3>ข้อมูลติดต่อกลับ</h3>'+detail([...(f.phone?[['เบอร์โทรศัพท์',f.phone]]:[]),...(f.email?[['อีเมล',f.email]]:[])])+'</section>':''}</article>${linkBtn('กลับรายการของฉัน','feedback/history','secondary full')}</div>`);
}
function disabledPage(title) { page(header(title)+`<div class="content">${empty('lock','ฟีเจอร์นี้ยังไม่เปิดให้ใช้บริการ','กรุณาติดต่อสอบถามการเปิดใช้งานจากนิติบุคคล<br>ผ่านข้อมูลโครงการหรือสมุดโทรศัพท์',linkBtn('ข้อมูลโครงการ','management','secondary'))}<p class="small muted" style="text-align:center">เปิดโหมดบริการสาธิตได้ใน ตั้งค่า → โหมดนำเสนอ</p></div>`); }
function renderPhone(tab='project') {
 const types=[['โครงการ','phone'],['ฉุกเฉิน','phone/emergency'],['อื่น ๆ','phone/other']];
 const contacts=tab==='emergency'?[['ศูนย์ประสานงานฉุกเฉิน','DEMO-SOS',[]],['เจ้าหน้าที่รักษาความปลอดภัย','DEMO-SEC',['line']]]:tab==='other'?[['บริการดูแลบ้าน','DEMO-HOME',['line','facebook']]]:[['สำนักงานนิติบุคคล','DEMO-OFFICE',['line','facebook']],['ป้อมรักษาความปลอดภัย','DEMO-GATE',['line']]];
 const providers={line:{name:'LINE',url:'https://line.me/R/nv/chat'},facebook:{name:'Facebook',url:'https://www.facebook.com/messages/'}};
 page(header('สมุดโทรศัพท์')+tabs(types,tab==='emergency'?1:tab==='other'?2:0)+`<div class="content phone-directory">${state.settings.emptyMode?empty('phone','ยังไม่มีช่องทางติดต่อ','สอบถามสำนักงานนิติบุคคลของโครงการ'):contacts.map(([name,code,channels])=>`<article class="card phone-contact"><div class="phone-contact-heading"><h2>${esc(name)}</h2><p class="muted">${code}</p></div><div class="phone-contact-actions" role="group" aria-label="ติดต่อ ${esc(name)}">${channels.map(key=>{const provider=providers[key];return `<a class="phone-provider phone-provider-${key}" href="${provider.url}" target="_blank" rel="noopener noreferrer" aria-label="เปิด ${provider.name} สำหรับ ${esc(name)} (ช่องทางตัวอย่าง)"><img src="assets/brands/${key}.svg" alt="โลโก้ ${provider.name}" width="28" height="28"><span>${provider.name}</span></a>`;}).join('')}<button type="button" class="phone-contact-call" data-action="call" data-name="${esc(name)}" aria-label="จำลองโทร ${esc(name)}">${icon('phone')}<span>โทร</span></button></div></article>`).join('')}<p class="phone-directory-note">ข้อมูลติดต่อเป็นตัวอย่าง ปุ่มโทรจำลองการโทร ส่วน LINE และ Facebook เปิดหน้าข้อความของผู้ให้บริการ ยังไม่ผูกบัญชีโครงการ</p></div>`);
}

function renderManagement() { page(header('ข้อมูลโครงการ')+`<div class="content">${state.settings.emptyMode?empty('home','ยังไม่มีข้อมูลโครงการ','กรุณาสอบถามข้อมูลจากนิติบุคคลหรือเจ้าของโครงการ'):`<div class="card"><div class="row"><span class="avatar">${icon('home')}</span><div><h2>${esc(house().project)}</h2><p>ข้อมูลและช่องทางติดต่อโครงการ</p></div></div><div class="divider"></div>${detail([['เวลาทำการ','จันทร์–เสาร์ 09:00–18:00 น.'],['สถานที่','อาคารคลับเฮาส์ ชั้น 1'],['ผู้จัดการโครงการ','คุณวรินทร์ (บุคคลสมมติ)'],['เบอร์โทรศัพท์','02-000-0000 (ตัวอย่าง)'],['อีเมล','office@example.com']])}</div><div class="actions">${btn(icon('phone')+' โทรหาโครงการ','call','data-name="สำนักงานโครงการ (เบอร์ตัวอย่าง 02-000-0000)"')}${linkBtn('สมุดโทรศัพท์','phone','secondary')}</div><p class="small muted">เบอร์โทรเป็นข้อมูลตัวอย่าง ปุ่มโทรจำลองการติดต่อโครงการ</p>`} </div>`); }
let repairCameraStream=null,repairCameraSession=0,repairCameraShot='';
function stopRepairCamera(){repairCameraSession++;repairCameraStream?.getTracks().forEach(track=>track.stop());repairCameraStream=null;repairCameraShot='';}
async function openRepairCamera(){
 if(photos.length>=3)return toast('แนบรูปได้สูงสุด 3 รูป กรุณาลบรูปก่อนถ่ายเพิ่ม');
 stopRepairCamera();const session=repairCameraSession;
 modal('ถ่ายภาพประกอบ',`<div class="repair-camera"><p data-camera-message role="status">กำลังเปิดกล้อง…</p><video autoplay muted playsinline aria-label="ภาพสดจากกล้อง"></video><img hidden alt="ภาพที่ถ่าย"><div class="repair-photo-actions">${btn('ถ่ายภาพ','repair-camera-capture','disabled')}${btn('ปิดกล้อง','close','','secondary')}</div></div>`);
 const dialog=$('#modal');dialog.addEventListener('close',stopRepairCamera,{once:true});
 try{
  if(!navigator.mediaDevices?.getUserMedia)throw {name:'Unsupported'};
  const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
  if(session!==repairCameraSession||!dialog.open){stream.getTracks().forEach(t=>t.stop());return;}
  repairCameraStream=stream;const video=$('.repair-camera video');video.srcObject=stream;await video.play();
  if(session!==repairCameraSession)return;
  $('[data-camera-message]').textContent='จัดภาพให้เห็นบริเวณที่ต้องการแจ้งซ่อม';$('[data-action="repair-camera-capture"]').disabled=false;
 }catch(error){
  if(session!==repairCameraSession)return;
  repairCameraStream?.getTracks().forEach(t=>t.stop());repairCameraStream=null;
  const message=error.name==='NotAllowedError'?'ไม่สามารถใช้กล้องได้ กรุณาอนุญาตสิทธิ์กล้องในการตั้งค่าเบราว์เซอร์':error.name==='NotFoundError'?'ไม่พบกล้องบนอุปกรณ์นี้':error.name==='Unsupported'?'เบราว์เซอร์นี้เปิดกล้องไม่ได้ กรุณาใช้งานผ่าน HTTPS หรือ localhost':'เปิดกล้องไม่ได้ กรุณาปิดแอปอื่นที่ใช้กล้องแล้วลองอีกครั้ง';
  $('.repair-camera').innerHTML=`<p role="alert">${message}</p><div class="repair-photo-actions">${btn('ลองอีกครั้ง','repair-camera-open')}${btn('ปิด','close','','secondary')}</div>`;
 }
}
function captureRepairCamera(){
 const video=$('.repair-camera video');if(!video?.videoWidth)return toast('กล้องยังไม่พร้อม กรุณาลองอีกครั้ง');
 const canvas=document.createElement('canvas'),scale=Math.min(1,700/Math.max(video.videoWidth,video.videoHeight));canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);repairCameraShot=canvas.toDataURL('image/jpeg',.76);
 video.hidden=true;const preview=$('.repair-camera img');preview.src=repairCameraShot;preview.hidden=false;$('[data-camera-message]').textContent='ตรวจสอบภาพก่อนแนบ';$('.repair-camera .repair-photo-actions').innerHTML=btn('ใช้รูปนี้','repair-camera-use')+btn('ถ่ายใหม่','repair-camera-retake','','secondary');
}
function repairPhotos(){return `<section class="field repair-photos" aria-labelledby="repair-photo-label"><div class="row between"><span id="repair-photo-label">ภาพประกอบ <small id="repair-photo-count">0/3 รูป</small></span><small class="muted">ไม่บังคับ</small></div><div class="repair-photo-actions">${btn(icon('plus')+' เลือกไฟล์','repair-local-photo','','secondary')}${btn(icon('camera')+' ถ่ายภาพ','repair-camera-open','data-max="3"','secondary')}</div><input type="file" name="photos" accept="image/png,image/jpeg" multiple data-upload="3" data-repair-file hidden><small class="muted">JPG / PNG สูงสุด 3 รูป · ไม่เกิน 5 MB ต่อรูป</small><div class="preview-photos" id="photo-preview" aria-live="polite"></div></section>`;}

const REPAIR_SUBTYPES={
 'ไฟฟ้า':['ไฟส่องสว่าง','ปลั๊กและสวิตช์','ระบบไฟฟ้าอื่น ๆ'],
 'ประปา':['ก๊อกน้ำและท่อน้ำ','ท่อระบายน้ำ','ปั๊มน้ำ'],
 'พื้นที่ส่วนกลาง':['ถนนและทางเดิน','สวนและต้นไม้','อาคารและอุปกรณ์'],
 'ความปลอดภัย':['กล้องวงจรปิด','ประตูและไม้กั้น','ระบบเข้า–ออก'],
 'อื่น ๆ':['งานซ่อมทั่วไป']
};
function repairStatus(r){const tone=({'รอดำเนินการ':'submitted','รับเรื่อง':'accepted','เสร็จสิ้น':'completed','ยกเลิก':'cancelled','ยกเลิกแล้ว':'cancelled','ปฏิเสธ':'rejected','กำลังดำเนินการ':'working'})[r.status]||'submitted';return `<span class="repair-status ${tone}">${esc(r.status==='รอดำเนินการ'?'รอรับเรื่อง':r.status==='เสร็จสิ้น'?'สำเร็จ':r.status)}</span>`;}
function repairResolution(r){
 if(r.resolution)return r.resolution;
 if(r.demo&&r.status==='เสร็จสิ้น')return {detail:r.type==='ประปา'?'เปลี่ยนซีลและข้อต่อก๊อกน้ำที่รั่ว ตรวจสอบการไหลของน้ำและทดสอบแล้วไม่พบการรั่วซึม':'ตรวจสอบและแก้ไขอุปกรณ์ ทดสอบการใช้งานเรียบร้อยแล้ว',date:r.date,photos:['assets/examples/repair-completed.svg'],demo:true};
 return null;
}
function repairImageGrid(images,group,id){return images.length?`<div class="repair-image-grid">${images.map((src,i)=>`<button type="button" data-action="repair-gallery" data-id="${esc(id)}" data-group="${group}" aria-haspopup="dialog" aria-label="ดูรูป${group==='after'?'หลังแก้ไข':'ปัญหาที่แจ้ง'} ${i+1} และรูปทั้งหมด ${images.length} รูป"><img src="${esc(src)}" alt="รูป${group==='after'?'หลังแก้ไข':'ปัญหาที่แจ้ง'} ${i+1}" loading="lazy"></button>`).join('')}</div><p class="repair-gallery-hint">แตะรูปเพื่อดูภาพทั้งหมด · ${images.length} รูป</p>`:'<p class="repair-muted">ไม่มีรูปแนบ</p>';}
function renderRepairDetail(id){
 const r=scoped(state.repairs).find(r=>r.id===id);
 if(!r)return page(header('รายละเอียดแจ้งซ่อม')+'<div class="content">'+empty('wrench','ไม่พบรายการแจ้งซ่อม','',linkBtn('กลับประวัติ','repairs/history'))+'</div>');
 page(header('รายละเอียดแจ้งซ่อม')+`<div class="content repair-page repair-detail-page"><section class="repair-detail-heading"><div class="row between"><span class="repair-muted">${esc(r.id)}</span>${repairStatus(r)}</div><h2>${esc(r.title||r.type)}</h2><p class="repair-muted">${esc(r.subtitle||r.subtype||'ไม่ระบุประเภทย่อย')}</p>${r.demo?'<p class="repair-demo">รายการตัวอย่าง</p>':''}</section>${repairTimeline(r)}${r.status==='รอดำเนินการ'?`<div class="repair-detail-actions">${linkBtn('แก้ไขรายการ','repairs/edit/'+r.id,'secondary')}${btn('ยกเลิกรายการ','cancel-repair',`data-id="${esc(r.id)}"`,'secondary')}</div><p class="repair-muted">ยกเลิกได้เฉพาะก่อนนิติบุคคลรับเรื่อง</p>`:''}${repairStaffTools(r)}${linkBtn('กลับประวัติแจ้งซ่อม','repairs/history','secondary full')}</div>`);
}
function renderRepairs(tab,editId) {
 if(!state.settings.servicesEnabled)return disabledPage('แจ้งซ่อม');
 if(tab==='detail')return renderRepairDetail(editId);
 if(tab==='info')return renderRepairInfo(editId,routeParts[3]);
 const editing=tab==='edit',repair=editing?scoped(state.repairs).find(r=>r.id===editId):null;
 if(editing&&(!repair||repair.status!=='รอดำเนินการ'))return page(header('แก้ไขแจ้งซ่อม')+'<div class="content">'+empty('wrench','ไม่สามารถแก้ไขรายการนี้ได้','แก้ไขได้เฉพาะรายการที่รอดำเนินการ',linkBtn('กลับรายการของฉัน','repairs/history'))+'</div>');
 page(header(editing?'แก้ไขแจ้งซ่อม':'แจ้งซ่อม')+tabs([['แจ้งปัญหา','repairs'],['ประวัติแจ้งซ่อม','repairs/history']],tab==='history'||editing?1:0)+`<div class="content repair-page">${tab==='history'?`<p class="repair-intro">ติดตามสถานะและดูผลการแก้ไขของแต่ละรายการ</p><div class="repair-history">${scoped(state.repairs).slice().sort((a,b)=>new Date(b.createdAt||b.date)-new Date(a.createdAt||a.date)).map(r=>`<button class="repair-history-item" data-action="go" data-route="repairs/detail/${esc(r.id)}"><div class="row between"><strong>${esc(r.type)}</strong>${repairStatus(r)}</div><p class="repair-history-description">${esc(r.detail)}</p><p class="repair-muted">${esc(r.subtype||'ไม่ระบุประเภทย่อย')} · ${dateLabel(r.date)}</p><div class="repair-history-footer"><small>${esc(r.id)}${r.demo?' · ตัวอย่าง':''}${r.photos?.length?' · '+r.photos.length+' รูป':''}</small><span>ดูรายละเอียด ${icon('chevron')}</span></div></button>`).join('')||empty('wrench','ยังไม่มีรายการแจ้งซ่อม','แจ้งปัญหาเพื่อให้เจ้าหน้าที่ดูแล',linkBtn('แจ้งปัญหา','repairs'))}</div>`:`<form data-form="repair" data-id="${esc(repair?.id||'')}" class="repair-form"><section class="repair-panel"><h2>รายละเอียดปัญหา</h2><p class="repair-intro">เลือกประเภทงานและอธิบายปัญหาที่ต้องการให้ดูแล</p>${select('type','ประเภทงาน',Object.keys(REPAIR_SUBTYPES),repair?.type)}<div id="repair-subtype-field">${select('subtype','ประเภทย่อย',REPAIR_SUBTYPES[repair?.type]||[],repair?.subtype,repair?'required':'required disabled')}</div>${area('detail','รายละเอียดปัญหา',repair?.detail||'','required maxlength="2000" placeholder="อธิบายอาการและบริเวณที่พบปัญหา"')}</section><section class="repair-panel">${repairPhotos()}</section><section class="repair-panel"><h2>ข้อมูลติดต่อ</h2>${field('phone','เบอร์โทรติดต่อ','tel',repair?.phone??state.profile.phone,'required pattern="0[0-9]{8,9}"')}</section>${submit(editing?'บันทึกการแก้ไข':'ส่งเรื่องแจ้งซ่อม')}</form>`}</div>`);
 photos=[...(repair?.photos||[])];updatePhotoPreview();
 const type=$('form[data-form="repair"] [name="type"]');
 if(type)type.addEventListener('change',()=>{const options=REPAIR_SUBTYPES[type.value]||[];$('#repair-subtype-field').innerHTML=select('subtype','ประเภทย่อย',options,options.length===1?options[0]:'',options.length?'required':'required disabled');syncFormValidity();});
}
function renderEmergency() { if(!state.settings.servicesEnabled)return disabledPage('ฉุกเฉิน และ บริการ'); page(header('ฉุกเฉิน และ บริการ')+`<div class="content"><div class="info warning">หน้าสาธิต ไม่มีการแจ้งเหตุหรือโทรออกจริง</div><div class="card"><h2>ติดต่อเจ้าหน้าที่โครงการ</h2><p>เลือกบริการที่ต้องการให้ช่วยประสานงาน</p></div>${[['รักษาความปลอดภัย','sos'],['ความช่วยเหลือฉุกเฉิน','phone'],['บริการดูแลบ้าน','wrench']].map(([n,i])=>`<button class="service-card" data-action="call" data-name="${n}"><span class="avatar">${icon(i)}</span><div class="grow"><h3>${n}</h3><p>จำลองการติดต่อเจ้าหน้าที่</p></div>${icon('chevron')}</button>`).join('')}</div>`); }
function renderChat() { if(!state.settings.servicesEnabled)return disabledPage('แชทกับนิติ'); page(header('แชทกับนิติบุคคล')+`<div class="content has-action"><div class="info">ผู้ช่วยสาธิตตอบกลับอัตโนมัติ ไม่มีการส่งข้อความถึงนิติบุคคลจริง</div>${state.chat.map(m=>`<div class="chat-bubble ${m.mine?'mine':''}">${esc(m.text)}</div>`).join('')}</div>${bottom(`<form data-form="chat" class="chat-compose"><input name="text" placeholder="พิมพ์ข้อความ…" aria-label="ข้อความถึงนิติบุคคล" required maxlength="1000"><button class="btn" type="submit" aria-label="ส่งข้อความ">${icon('send')}</button></form>`)}`); }
function renderProjectMeetings(id){
 const records=window.ProjectMeetings||[];
 if(!id)return renderReportCategories();
 if(id==='category')return renderReportCategory(routeParts[2]);
 const meeting=records.find(m=>m.id===id);
 if(!meeting)return page(header('รายละเอียดรายงาน')+`<div class="content">${empty('rules','ไม่พบรายงาน','กลับไปเลือกหัวข้อจากรายการ',linkBtn('ดูหมวดหมู่ทั้งหมด','meetings'))}</div>`);
 page(header('รายละเอียดรายงาน').replace('data-action="back"',`data-action="go" data-route="meetings/category/${meeting.category}"`)+`<div class="content meeting-content"><article class="meeting-detail"><p class="meeting-date">${dateLabel(meeting.date)} · เอกสารตัวอย่าง</p><h2>${esc(meeting.title)}</h2><p class="meeting-project">${esc(house().project)}</p><div class="meeting-description"><h3>รายละเอียด</h3>${meeting.details.map(p=>`<p>${esc(p)}</p>`).join('')}</div></article><section class="meeting-document" aria-labelledby="meeting-document-title"><div class="meeting-document-heading"><h3 id="meeting-document-title">เอกสารแนบ</h3><span>PDF</span></div><div class="meeting-document-actions"><a class="btn" href="${meeting.file}" download="${meeting.id}.pdf">${icon('download')} ดาวน์โหลด PDF</a></div></section></div>`);
}
function renderRules() {
 const pdfUrl = 'assets/examples/policy_example.doc.pdf';
 page(header('ระเบียบชุมชน')+`<div class="content rules-content">
  <p class="rules-help" role="status">กำลังโหลดเอกสาร…</p>
  <div class="rules-pages" role="region" tabindex="0" aria-label="เอกสารระเบียบชุมชน เลื่อนขึ้นลงเพื่ออ่าน" aria-busy="true"></div>
  <div class="rules-actions">
   <a class="btn secondary" href="${pdfUrl}" download="policy_example.doc.pdf">${icon('download')} ดาวน์โหลด PDF</a>
  </div>
 </div>`);
 const container = $('.rules-pages');
 const status = $('.rules-help');
 import('./assets/rules-pdf.js').then(({renderRulesPdf}) => {
  if (container.isConnected) page.disposeRules = renderRulesPdf(container, status, pdfUrl);
 }).catch(() => {
  if (!container.isConnected) return;
  container.setAttribute('aria-busy', 'false');
  status.textContent = 'ไม่สามารถแสดงเอกสารได้ กรุณาโหลดหน้าใหม่ หรือกดดาวน์โหลด PDF เพื่ออ่าน';
 });
}
function renderBenefits() { page(header('สิทธิพิเศษ')+`<div class="content"><div class="info">สิทธิพิเศษและรหัสแลกรับเป็นตัวอย่างสำหรับพรีเซนต์</div>${[['G1','ส่วนลดบริการล้างแอร์','รับส่วนลด 100 บาท สำหรับบริการดูแลบ้าน','service'],['G2','ช่วงเวลาดี ๆ กับกาแฟแก้วโปรด','รับส่วนลดเครื่องดื่ม 20% ที่ร้านพาร์ทเนอร์','gift']].map(([id,title,desc,i])=>`<div class="card"><div class="article-art">${icon(i)}</div><h2>${title}</h2><p class="muted">${desc}</p><p class="small muted">1 สิทธิ์ต่อบัญชี · ใช้ภายใน ${dateLabel(iso(30))}</p>${state.redeemed.includes(id)?`<div class="info">รหัสสาธิต: BNY-${id}-DEMO</div>${btn('คัดลอกรหัส','copy',`data-text="BNY-${id}-DEMO"`,'full secondary')}`:btn('รับสิทธิ์','redeem',`data-id="${id}"`,'full')}</div>`).join('')}</div>`); }
function renderVote() { const vote=state.votes[house().id]; page(header('ประชุมใหญ่ (i-Vote)')+`<div class="content"><div class="info">การประชุมและผลลงคะแนนเป็นการจำลอง ไม่มีผลต่อการประชุมจริง</div><div class="card"><span class="pill">เปิดลงคะแนน</span><h2 style="margin-top:15px">ประชุมใหญ่สามัญประจำปี</h2><p class="muted">${esc(house().project)} · บ้าน ${esc(house().number)}</p><div class="divider"></div><h3>วาระที่ 1: ปรับปรุงพื้นที่สวนส่วนกลาง</h3><p>เสนอเพิ่มที่นั่งพักและต้นไม้ร่มเงาบริเวณทางเดินรอบสวน โดยใช้งบประมาณตัวอย่าง 80,000 บาท</p>${vote?`<div class="info">คุณลงคะแนนแล้ว: <b>${esc(vote)}</b></div>${[['เห็นชอบ',73],['ไม่เห็นชอบ',18],['งดออกเสียง',9]].map(([x,n])=>`<p class="row between"><span>${x}</span><b>${n}%</b></p><div class="progress-track"><span style="width:${n}%"></span></div>`).join('')}<p class="small muted">ผลรวมสาธิตจากผู้เข้าร่วม 100 คน</p>`:`<form data-form="vote">${['เห็นชอบ','ไม่เห็นชอบ','งดออกเสียง'].map(x=>`<label class="vote-option"><input type="radio" name="choice" value="${x}" required> ${x}</label>`).join('')}${submit('ยืนยันลงคะแนน')}</form>`}</div></div>`); }
function renderAnnouncements(tab) { const category=tab==='general'?'general':'important'; const list=demoList(state.announcements).filter(a=>a.category===category); page(header('ประกาศ',iconBtn('search','ค้นหาประกาศ','search-announcements'),false)+tabs([['ประกาศสำคัญ','announcements'],['ข่าวสารทั่วไป','announcements/general']],tab==='general'?1:0)+`<div class="content"><input class="search-input" id="announcement-search" type="search" aria-label="ค้นหาประกาศ" placeholder="ค้นหาประกาศ…" hidden><div id="announcement-list">${list.map(a=>`<button class="service-card searchable" data-search="${esc(a.title)}" data-action="go" data-route="announcement/${a.id}"><span class="avatar gold">${icon('announce')}</span><div class="grow"><h3>${esc(a.title)}</h3><p>${dateLabel(a.date)}</p></div>${!a.read?pill('ใหม่'):icon('chevron')}</button>`).join('')||empty('announce',tab==='general'?'ยังไม่มีประกาศข่าวสารทั่วไป':'ยังไม่มีประกาศสำคัญ','ติดตามข่าวสารจากโครงการได้ที่นี่')}</div><p id="announcement-empty" class="muted small" hidden>ไม่พบประกาศที่ตรงกับคำค้นหา</p></div>`,'announcements'); }
function renderAnnouncement(id) { return renderAnnouncementDetail(id); }
const serviceOffers=[{id:'none',label:'ไม่ใช้ส่วนลด / สิทธิ์พิเศษ'},{id:'resident10',label:'ส่วนลดลูกบ้าน 10% (ตัวอย่าง)'},{id:'air100',label:'สิทธิ์พิเศษล้างแอร์ ลด 100 บาท (ตัวอย่าง)',type:'air'}];
function serviceOfferOptions(item){return serviceOffers.filter(o=>!o.type||o.type===item?.type);}
function servicePricing(item,quantity,offer='none'){
 const subtotal=item.price*quantity,valid=serviceOfferOptions(item).find(o=>o.id===offer)||serviceOffers[0];
 const discount=valid.id==='resident10'?Math.round(subtotal*.1*100)/100:valid.id==='air100'?Math.min(100,subtotal):0;
 return {unitPrice:item.price,subtotal,discount,total:subtotal-discount,offer:valid.id,offerLabel:valid.label};
}
function serviceOfferFields(item,selected='none'){return `<label class="field"><span>ส่วนลด / สิทธิ์พิเศษ</span><select name="offer">${serviceOfferOptions(item).map(o=>`<option value="${o.id}" ${selected===o.id?'selected':''}>${o.label}</option>`).join('')}</select></label><p class="small muted">เลือกใช้ได้ 1 รายการต่อการจอง · สิทธิ์ตัวอย่างสำหรับระบบจำลอง</p><div class="service-price-summary" aria-live="polite"></div>`;}
function wireServicePricing(item){const form=$('form[data-form="service"],form[data-form="service-booking-change"]');if(!form?.querySelector('[name="offer"]'))return;const update=()=>{const q=Number(form.elements.quantity.value);if(!Number.isInteger(q)||q<1||q>10){form.querySelector('.service-price-summary').textContent='กรุณาระบุจำนวน 1–10';return;}const price=servicePricing(item,q,form.elements.offer.value);form.querySelector('.service-price-summary').innerHTML=`<div><span>ค่าบริการ</span><span>฿${money(price.subtotal)}</span></div><div><span>ส่วนลด</span><span>−฿${money(price.discount)}</span></div><div><strong>ยอดสุทธิ</strong><strong>฿${money(price.total)}</strong></div>`;};form.elements.quantity.addEventListener('input',update);form.elements.offer.addEventListener('change',update);update();}
const serviceStatusColors={'รอยืนยัน':'yellow','รอดำเนินการ':'blue','สำเร็จ':'','ปฏิเสธ':'red','ยกเลิก':'gray'};
function ensureServiceSamples(){
 if(state.serviceStatusSamples?.[house().id])return;
 commit(()=>{
  scoped(state.serviceBookings).forEach(b=>{if(b.status==='ยืนยันแล้ว')b.status='รอดำเนินการ';if(b.status==='ยกเลิกแล้ว')b.status='ยกเลิก';});
  Object.keys(serviceStatusColors).forEach((status,i)=>{const item=services[i];state.serviceBookings.push({id:uid('SV'),home:house().id,serviceId:item.id,title:item.title,unit:item.unit,quantity:1,total:item.price,date:iso(i<2?i+1:-i),time:'09:00–12:00',address:'บ้าน '+house().number+' '+house().project,phone:state.profile.phone,note:'',status,mock:true});});
  state.serviceStatusSamples||={};state.serviceStatusSamples[house().id]=true;
 });
}
function serviceBookingCard(b){return `<article class="card service-booking-card"><div class="service-booking-heading"><h3>${esc(b.title)}</h3>${pill(b.status,serviceStatusColors[b.status]||'')}</div><p>${dateLabel(b.date)} · ${esc(b.time)} น.</p><p>${b.quantity} ${esc(b.unit)} · ฿${money(b.total)}</p><p class="muted">${esc(b.address)}</p>${b.discount?`<p class="small">${esc(b.offerLabel)} · ลด ฿${money(b.discount)}</p>`:''}${b.request?`<div class="info"><b>${b.request.kind==='cancel'?'คำขอยกเลิกบริการ':'คำขอเปลี่ยนวัน / เวลา'}</b>${b.request.kind==='reschedule'?`<p>${dateLabel(b.request.date)} · ${esc(b.request.time)} น.</p>`:''}<p>เหตุผล: ${esc(b.request.reason)}</p></div>`:''}${b.billId?`<p class="small">${b.paymentStatus==='paid'?'ชำระเงินแล้ว':'ยังไม่ได้ชำระเงิน'}</p>${b.status!=='ยกเลิก'&&b.status!=='ปฏิเสธ'?linkBtn(b.paymentStatus==='paid'?'ดูใบเสร็จ':'ชำระเงิน',`${b.paymentStatus==='paid'?'receipt':'payment'}/${b.billId}`,'full secondary'):''}`:''}<small class="muted">${esc(b.id)}${b.mock?' · รายการตัวอย่าง':''}</small>${b.status==='รอยืนยัน'?`<div class="service-booking-actions">${linkBtn('แก้ไข',`service-booking/${b.id}/edit`,'secondary')}${btn('ยกเลิก','cancel-service',`data-id="${b.id}"`,'secondary')}</div>`:b.status==='รอดำเนินการ'?`<div class="service-booking-actions">${linkBtn('ยื่นเรื่องขอแก้ไข',`service-booking/${b.id}/request`,'secondary full')}</div>`:''}</article>`;}
function renderServices(tab) { ensureServiceSamples();page(header('บริการจากพาร์ทเนอร์','',false)+tabs([['บริการ','services'],['การจองของฉัน','services/bookings']],tab==='bookings'?1:0)+`<div class="content">${tab==='bookings'?scoped(state.serviceBookings).map(serviceBookingCard).join('')||empty('calendar','ยังไม่มีรายการจองบริการ','จองผู้ช่วยดูแลบ้านสำหรับวันพักผ่อนของคุณ',linkBtn('ดูบริการ','services')):`<div class="section-title" style="margin-top:0"><h2>ผู้ช่วยดูแลบ้านของคุณ</h2>${pill('คัดสรรเพื่อคุณ')}</div>${services.map(s=>`<button class="service-card" data-action="go" data-route="service/${s.id}"><span class="product-art">${art(s.type)}</span><div class="grow"><h3>${s.title}</h3><p><s>฿${money(s.old)}</s> <span class="price">฿${money(s.price)}</span> / ${s.unit}</p><p>โดย ${s.provider} &nbsp; <span style="color:var(--gold)">★ 4.9</span></p></div></button>`).join('')}`}</div>`,'services'); }
function renderServiceBookingForm(id,mode){
 const b=scoped(state.serviceBookings).find(x=>x.id===id),request=mode==='request';
 if(!b||b.status!==(request?'รอดำเนินการ':'รอยืนยัน')){go('services/bookings');return;}
 page(header(request?'ยื่นเรื่องขอแก้ไข':'แก้ไขการจองบริการ')+`<div class="content"><div class="card"><h2>${esc(b.title)}</h2><p>กำหนดเดิม ${dateLabel(b.date)} · ${esc(b.time)} น.</p>${pill(b.status,serviceStatusColors[b.status])}</div><form data-form="service-booking-change" data-id="${esc(id)}" data-mode="${request?'request':'edit'}">${request||b.request?select('kind','รายการที่ต้องการ',['เปลี่ยนวัน / เวลา','ยกเลิกบริการ'],b.request?.kind==='cancel'?'ยกเลิกบริการ':'เปลี่ยนวัน / เวลา'):''}<div id="service-schedule-fields">${field('date','วันที่รับบริการ','date',b.request?.date||b.date,`required min="${iso()}"`)}${select('time','เวลา',['09:00–12:00','13:00–16:00','16:00–19:00'],b.request?.time||b.time)}</div>${!request&&!b.request?`${field('quantity','จำนวน ('+b.unit+')','number',b.quantity,'required min="1" max="10"')}${field('address','สถานที่รับบริการ','text',b.address,'required maxlength="300"')}${field('phone','เบอร์โทรติดต่อ','tel',b.phone,'required pattern="0[0-9]{8,9}"')}${area('note','หมายเหตุ',b.note||'','maxlength="500"')}${serviceOfferFields(services.find(x=>x.id===b.serviceId||x.title===b.title),b.offer)}`:''}${request||b.request?area('reason','เหตุผล',b.request?.reason||'','required maxlength="1000"'):''}<p class="muted">${request||b.request?'เมื่อส่งคำขอ สถานะจะเป็นรอยืนยันเพื่อให้เจ้าหน้าที่พิจารณา':'บันทึกแล้วรายการจะอยู่ในสถานะรอยืนยัน'}</p>${submit(request?'ส่งคำขอ':'บันทึกการแก้ไข')}</form></div>`,'services');
 wireServicePricing(services.find(x=>x.id===b.serviceId||x.title===b.title)||{price:b.unitPrice||b.total/b.quantity});
 if(b.paymentStatus==='paid'){for(const name of ['quantity','offer']){const input=$(`[name="${name}"]`);if(input)input.disabled=true;}}
 const kind=$('[name="kind"]');if(kind){const update=()=>{const cancelled=kind.value==='ยกเลิกบริการ';$('#service-schedule-fields').hidden=cancelled;$('#service-schedule-fields').querySelectorAll('input,select').forEach(e=>e.disabled=cancelled);};kind.addEventListener('change',update);update();}
}

function renderService(id,mode) { const s=services.find(x=>x.id===id);if(!s)return go('services');page(header(mode==='book'?'จองบริการ':s.title)+`<div class="content ${mode==='book'?'':'has-action'}">${mode==='book'?`<div class="card"><h2>${s.title}</h2><p>฿${money(s.price)} / ${s.unit} · โดย ${s.provider}</p></div><form data-form="service" data-id="${id}">${field('date','วันที่รับบริการ','date',iso(1),`required min="${iso()}"`)}${select('time','เวลา',['09:00–12:00','13:00–16:00','16:00–19:00'])}${field('quantity','จำนวน ('+s.unit+')','number','1','required min="1" max="10"')}${field('address','สถานที่รับบริการ','text','บ้าน '+house().number+' '+house().project,'required maxlength="300"')}${field('phone','เบอร์โทรติดต่อ','tel',state.profile.phone,'required pattern="0[0-9]{8,9}"')}${area('note','หมายเหตุ','','maxlength="500"')}${serviceOfferFields(s)}<div class="info">ยืนยันแล้วจะสร้างการจองสาธิต ไม่มีการนัดหมายหรือชำระเงินกับผู้ให้บริการจริง</div>${submit('ยืนยันจองบริการ') }</form>`:`<div class="cover-art">${art(s.type)}</div><h2>${s.title}</h2><div class="row between"><span class="price">฿${money(s.price)} <small style="font-size:12px">/ ${s.unit}</small></span><span class="small muted">โดย ${s.provider}</span></div><div class="card" style="margin-top:23px"><h3>รายละเอียดการบริการ</h3><p>${s.description}</p><div class="divider"></div><h3>เงื่อนไขและค่าใช้จ่ายเพิ่มเติม</h3><p>${s.terms}</p></div><div class="info">ราคาและเงื่อนไขตัวอย่างสำหรับสาธิต</div>`}</div>${mode==='book'?'':bottom(linkBtn('เริ่มจองใช้บริการ',`service/${id}/book`,'full'))}`,'services');if(mode==='book')wireServicePricing(s); }
function renderTimeline(postId) {const list=state.posts.filter(p=>(!postId||p.id===postId)&&(postId||timelineCategory==='ทั้งหมด'||p.category===timelineCategory));page(header('ไทม์ไลน์ชุมชน',iconBtn('plus','สร้างโพสต์','new-post'),false)+`<div class="content"><div class="row" style="margin-bottom:17px"><span class="avatar">${icon('home')}</span><div><b>${esc(house().project)}</b><p class="small muted" style="margin:4px 0">พื้นที่ดี ๆ ของเพื่อนบ้าน</p></div></div>${postId?'':`<button class="card row" style="width:100%;text-align:left" data-action="new-post"><span class="avatar">พ</span><span class="muted">วันนี้มีอะไรอยากแบ่งปันไหม?</span>${icon('edit')}</button><div class="filter-chips">${['ทั้งหมด','ข่าวชุมชน','พูดคุย','ซื้อขาย','แจ้งเตือน'].map(c=>`<button data-action="timeline-filter" data-category="${c}" class="${timelineCategory===c?'active':''}">${c}</button>`).join('')}</div>`}${list.map(p=>`<article class="card"><div class="post-head"><span class="avatar">${esc(p.author[0])}</span><div class="grow"><h3>${esc(p.author)}</h3><span class="small muted">${dateLabel(p.date)} · ${esc(p.category)}</span></div>${p.own?iconBtn('trash','ลบโพสต์','delete-ask',`data-kind="posts" data-id="${p.id}"`):''}</div><p style="white-space:pre-wrap">${esc(p.text)}</p>${p.image?`<img class="post-photo" src="${p.image}" alt="ภาพประกอบโพสต์">`:''}<div class="post-actions"><button data-action="like" data-id="${p.id}" class="${p.liked?'liked':''}" aria-pressed="${p.liked}">${icon('heart')} ${p.likes} ถูกใจ</button><button data-action="comment" data-id="${p.id}">${icon('chat')} ${p.comments.length} ความคิดเห็น</button></div>${p.comments.map(c=>`<div class="comment"><small>${esc(c.author)}</small>${esc(c.text)}</div>`).join('')}</article>`).join('')||empty('timeline','ยังไม่มีโพสต์ในหมวดนี้','เริ่มแบ่งปันเรื่องราวกับเพื่อนบ้านได้เลย')}</div>`,'timeline'); }
function cartCount(){return state.cart.reduce((n,c)=>n+c.quantity,0);}
function renderShopping() {const categories=['ทั้งหมด','น้ำดื่ม','เครื่องดื่ม','บัตรน้ำมัน','เติมเงิน','เครื่องหอม','ขนม','ของใช้ในบ้าน','บริการอื่น ๆ'];const list=products.filter(p=>shopCategory==='ทั้งหมด'||p.category===shopCategory);page(header('Living Mart',`${iconBtn('cart','รถเข็น','go','data-route="cart"')}${cartCount()?`<span class="badge-number">${cartCount()}</span>`:''}`,false)+`<div class="content"><div class="row between" style="margin-bottom:18px"><div><span class="small muted">ของดี ส่งถึงบ้าน</span><h2 style="margin:5px 0 0;font-size:23px">เติมความสุขให้ทุกวัน</h2></div>${iconBtn('receipt','คำสั่งซื้อของฉัน','go','data-route="orders"')}</div><div class="filter-chips">${categories.map(c=>`<button class="${shopCategory===c?'active':''}" data-action="shop-filter" data-category="${c}">${c}</button>`).join('')}</div>${shopCategory==='ทั้งหมด'?`<div class="community-banner" style="margin:0 0 20px"><div><small>LIVING ESSENTIALS</small><h3>เรื่องเล็ก ๆ ที่บ้านต้องมี</h3><span class="small muted">คัดสรรของใช้ เพื่อทุกวันของคุณ</span></div>${icon('shop')}</div>`:''}<div class="shop-grid">${list.map(p=>`<button class="product" data-action="go" data-route="product/${p.id}"><div class="product-art">${art(p.type,p.color)}</div>${!p.stock?pill('สินค้าหมด','gray'):''}<div class="product-info"><h3>${p.name}</h3><span class="price">฿${money(p.price)}</span><small>Living Mart · จัดส่งถึงบ้าน</small></div></button>`).join('')}</div>${shopCategory==='บริการอื่น ๆ'?empty('service','บริการสำหรับบ้านของคุณ','ดูบริการล้างแอร์และทำความสะอาดจากพาร์ทเนอร์',linkBtn('เลือกบริการ','services')):''}</div>`,'shopping'); }
function renderProduct(id) {const p=products.find(x=>x.id===id);if(!p)return go('shopping');page(header('รายละเอียดสินค้า',iconBtn('cart','รถเข็น','go','data-route="cart"'))+`<div class="content has-action"><div class="cover-art">${art(p.type,p.color)}</div><span class="small muted">LIVING MART / ${p.category}</span><h2 style="font-size:20px;line-height:1.6">${p.name}</h2><div class="row between"><span class="price">฿${money(p.price)}</span>${pill(p.stock?'พร้อมส่ง · '+p.stock+' ชิ้น':'สินค้าหมด',p.stock?'':'gray')}</div><div class="card" style="margin-top:23px"><h3>รายละเอียดสินค้า</h3><p>${p.description}</p><div class="divider"></div><h3>การจัดส่ง</h3><p>จัดส่งภายในโครงการ 1–3 วันทำการ ค่าส่ง 40 บาทต่อคำสั่งซื้อ ส่งฟรีเมื่อยอดสินค้าตั้งแต่ 500 บาท</p><p class="muted">ราคาและสินค้าทั้งหมดใช้เพื่อสาธิต ไม่มีการจัดส่งจริง</p></div></div>${bottom(btn(icon('plus')+' เพิ่มลงรถเข็น','product-sheet',`data-id="${id}" ${!p.stock?'disabled':''}`,'full'))}`,'shopping'); }
function quantityControl(id,quantity,action='cart-quantity'){return `<div class="quantity"><button aria-label="ลดจำนวน" data-action="${action}" data-id="${id}" data-delta="-1">−</button><span id="quantity-value">${quantity}</span><button aria-label="เพิ่มจำนวน" data-action="${action}" data-id="${id}" data-delta="1">+</button></div>`;}
function cartTotals(){const selected=state.cart.filter(c=>c.selected);const subtotal=selected.reduce((n,c)=>n+products.find(p=>p.id===c.id).price*c.quantity,0);return {selected,subtotal,shipping:subtotal?subtotal>=500?0:40:0};}
function renderCart() {const {selected,subtotal}=cartTotals();page(header('รถเข็น')+`<div class="content has-action">${state.cart.length?`<p class="small muted">Living Mart · ${cartCount()} ชิ้น</p>${state.cart.map(c=>{const p=products.find(p=>p.id===c.id);return `<div class="card cart-item"><input type="checkbox" aria-label="เลือก ${esc(p.name)}" data-cart-select="${p.id}" ${c.selected?'checked':''}><span class="product-art">${art(p.type,p.color)}</span><div class="grow"><h3>${p.name}</h3><div class="row between"><span class="price">฿${money(p.price)}</span>${quantityControl(p.id,c.quantity)}</div></div>${iconBtn('trash','ลบสินค้า '+p.name,'remove-cart',`data-id="${p.id}"`)}</div>`;}).join('')}<div class="info">เลือกรายการที่ต้องการซื้อเพื่อคำนวณยอดรวม</div>`:empty('cart','รถเข็นยังว่างอยู่','เลือกของใช้ที่ถูกใจ แล้วเพิ่มลงรถเข็น',linkBtn('เลือกซื้อสินค้า','shopping'))}</div>${state.cart.length?bottom(`<div class="cart-footer"><label class="row" style="gap:5px;font-size:11px"><input type="checkbox" id="select-all" ${selected.length===state.cart.length?'checked':''}>ทั้งหมด</label><div class="grow" style="text-align:right"><span class="small muted">รวม </span><b style="color:var(--green)">฿${money(subtotal)}</b></div>${btn('ซื้อสินค้า','go',`data-route="checkout" ${!selected.length?'disabled':''}`)}</div>`):''}`,'shopping'); }
function renderCheckout(){const {selected,subtotal,shipping}=cartTotals();if(!selected.length)return go('cart');page(header('ยืนยันคำสั่งซื้อ')+`<div class="content"><form data-form="checkout">${field('name','ชื่อผู้รับ','text',state.profile.name,'required maxlength="100"')}${field('phone','เบอร์โทรผู้รับ','tel',state.profile.phone,'required pattern="0[0-9]{8,9}"')}${area('address','ที่อยู่จัดส่ง','บ้าน '+house().number+' '+house().project,'required maxlength="500"')}${select('delivery','วิธีจัดส่ง',['จัดส่งถึงบ้าน (1–3 วันทำการ)'],'จัดส่งถึงบ้าน (1–3 วันทำการ)')}${select('method','วิธีชำระเงิน',['พร้อมเพย์ (จำลอง)','บัตรเครดิต (จำลอง)','เก็บเงินปลายทาง (จำลอง)'],'พร้อมเพย์ (จำลอง)')}<div class="card"><h3>สรุปคำสั่งซื้อ</h3>${selected.map(c=>`<p class="row between"><span>${products.find(p=>p.id===c.id).name.split(' ').slice(0,3).join(' ')} × ${c.quantity}</span><b>฿${money(products.find(p=>p.id===c.id).price*c.quantity)}</b></p>`).join('')}<div class="divider"></div>${detail([['ยอดสินค้า',money(subtotal)+' บาท'],['ค่าจัดส่ง',shipping?shipping+' บาท':'ฟรี'],['ยอดสุทธิ',money(subtotal+shipping)+' บาท']])}</div><div class="info">คำสั่งซื้อจำลอง ไม่มีการชำระเงินหรือจัดส่งจริง</div>${submit('ยืนยันสั่งซื้อ · ฿'+money(subtotal+shipping))}</form></div>`,'shopping');}
function renderOrders(id){const list=scoped(state.orders).filter(o=>!id||o.id===id);page(header('คำสั่งซื้อของฉัน')+`<div class="content">${list.map(o=>`<div class="card"><div class="row between"><h3>${o.id}</h3>${pill(o.status,o.status==='ยกเลิกแล้ว'?'gray':'')}</div><p class="muted">${dateLabel(o.date)}</p>${o.items.map(c=>`<p>${esc(c.name)} × ${c.quantity}</p>`).join('')}<div class="divider"></div>${detail([['ผู้รับ',o.name],['โทรศัพท์',o.phone],['ที่อยู่',o.address],['ช่องทางชำระ',o.method],['ค่าจัดส่ง',money(o.shipping)+' บาท'],['ยอดสุทธิ',money(o.total)+' บาท']])}<div class="actions">${o.status==='เตรียมจัดส่ง'?`${btn('จำลองรับสินค้า','order-received',`data-id="${o.id}"`,'small')}${btn('ยกเลิกคำสั่งซื้อ','cancel-order',`data-id="${o.id}"`,'small secondary')}`:''}</div></div>`).join('')||empty('shop','ยังไม่มีคำสั่งซื้อ','เริ่มเลือกซื้อสินค้าสำหรับบ้านของคุณ',linkBtn('เลือกสินค้า','shopping'))}</div>`,'shopping');}
function settingsRow(label,glyph,to){return `<button class="list-button" data-action="go" data-route="${to}">${icon(glyph)}<span>${label}</span>${icon('chevron')}</button>`;}
function renderSettings(part){
 let body='',title='การตั้งค่า';
 if(!part){body=`<div class="card row"><span class="avatar">${esc(state.profile.name[0])}</span><div class="grow"><h2>${esc(state.profile.name)}</h2><p class="muted">${esc(activeHouseMember()?.role||'ลูกบ้าน')} · ${esc(house().number)}</p></div>${iconBtn('edit','แก้ไขข้อมูลส่วนตัว','go','data-route="settings/profile"')}</div><div class="group-title">การตั้งค่า</div><div class="card" style="padding:0">${settingsRow('ข้อมูลส่วนตัว','visitor','settings/profile')}${settingsRow('ตั้งค่าขอสิทธิ์อนุมัติ','checkCircle','settings/approval')}${settingsRow('เวอร์ชันแอป · Version '+(isAppVersion2()?2:1),'settings','settings/version')}${isAppVersion2()?settingsRow('สัตว์เลี้ยง','pet','pets'):''}</div><div class="group-title">การแจ้งเตือน</div><div class="card" style="padding:0"><button class="list-button" data-action="clear-notifications">${icon('bell')}ล้างการแจ้งเตือน${icon('chevron')}</button>${settingsRow('การแจ้งเตือน','bell','settings/notifications')}</div><div class="group-title">การใช้งาน</div><div class="card" style="padding:0">${settingsRow('Bannayuu Next v.1.0.1 (ต้นแบบ)','home','settings/about')}${settingsRow('คำถามที่พบบ่อย','sos','help')}${settingsRow('ภาษา','globe','settings/language')}${settingsRow('ตั้งค่าการใช้งานกล้อง','camera','settings/camera')}${settingsRow('นโยบายความยินยอมทางการตลาด','checkCircle','settings/marketing')}${settingsRow('นโยบายความเป็นส่วนตัว','lock','settings/privacy')}${settingsRow('เงื่อนไขการใช้บริการ','rules','settings/terms')}${settingsRow('ข้อเสนอแนะสำหรับผู้พัฒนาแอปฯ Bannayuu Next','feedback','settings/developer')}</div><div class="group-title">สำหรับการนำเสนอ</div><div class="card" style="padding:0">${settingsRow('โหมดนำเสนอและข้อมูลตัวอย่าง','settings','settings/demo')}</div><p class="demo-label">บ้านน่าอยู่ · RESIDENT PROTOTYPE 1.0<br>อ้างอิง Bannayuu Next 3.31.3</p>`;}
 else if(part==='version'){title='เวอร์ชันแอป';body=`<fieldset class="app-version-options"><legend>เลือกเวอร์ชันแอป</legend>${[1,2].map(version=>`<label class="app-version-option"><input type="radio" name="appVersion" data-app-version value="${version}" ${(isAppVersion2()?2:1)===version?'checked':''}><span><strong>Version ${version}</strong><small>${version===1?'แสดงเมนูพื้นฐานและแจ้งเตือนสายเรียกเข้า':'เพิ่มยอดรอชำระ พัสดุรอรับ การจองของฉัน ชำระบิล สัตว์เลี้ยง จองส่วนกลาง ประชุมใหญ่ และแจ้งเตือนสายเรียกเข้า'}</small></span></label>`).join('')}</fieldset><p class="small muted">บันทึกอัตโนมัติ การเปลี่ยนเวอร์ชันไม่ลบข้อมูลเดิม</p>`;}
 else if(part==='approval'){title='การขออนุมัติผู้มาติดต่อ';body=renderHouseholdApprovalSettings();}
 else if(part==='profile'){title='ข้อมูลส่วนตัว';body=`<form data-form="profile">${field('name','ชื่อ–นามสกุล','text',state.profile.name,'required maxlength="100"')}${field('phone','เบอร์โทรศัพท์','tel',state.profile.phone,'required pattern="0[0-9]{8,9}"')}${field('email','อีเมล','email',state.profile.email,'required')}${submit('บันทึกข้อมูล')}</form>`;}
 else if(part==='notifications'){title='การแจ้งเตือน';body=renderPersonalNotificationSettings();}
 else if(part==='language'){title='ภาษา';body=`<form data-form="language">${select('language','ภาษา',['ไทย','English'],state.settings.language)}<div class="info">การสาธิตภาษาอังกฤษจะเปลี่ยนชื่อเมนูหลัก ชื่อหน้าหลัก และปุ่มนำทาง ส่วนข้อมูลโครงการและแบบฟอร์มตามคู่มือยังคงเป็นภาษาไทย</div>${submit('บันทึกภาษา')}</form>`;}
 else if(part==='camera'){title='ตั้งค่าการใช้งานกล้อง';body=`<div class="card"><h2>กล้องและคลังรูปภาพ</h2><p>กดปุ่มด้านล่างเพื่อเลือกถ่ายภาพบนมือถือที่รองรับ หรือเลือกรูปจากอุปกรณ์</p><label class="field"><span>ทดสอบเลือกรูปภาพ / ถ่ายภาพ</span><input type="file" accept="image/jpeg,image/png" capture="environment" data-upload="1"><div id="photo-preview" class="preview-photos"></div></label></div><div class="info">สิทธิ์กล้องจัดการโดยเบราว์เซอร์ของคุณ หากเคยปฏิเสธ ให้เปิดการตั้งค่าเว็บไซต์เพื่อเปลี่ยนสิทธิ์ รูปทดสอบจะไม่ถูกบันทึก</div>`;}
 else if(part==='marketing'){title='ความยินยอมทางการตลาด';body=`<div class="card"><p>รับข่าวสารและข้อเสนอพิเศษจากพาร์ทเนอร์ โดยสามารถเปลี่ยนความยินยอมได้ทุกเมื่อ</p><label class="switch-row"><span>ยินยอมรับข่าวสารการตลาด</span><input type="checkbox" data-setting="marketing" ${state.settings.marketing?'checked':''}></label></div><div class="info">บันทึกการตั้งค่าสาธิตเท่านั้น ไม่มีการส่งข้อมูลออกจากเครื่อง</div>`;}
 else if(part==='privacy'||part==='terms'){title=part==='privacy'?'นโยบายความเป็นส่วนตัว':'เงื่อนไขการใช้บริการ';body=`<div class="card article"><h2>${title}สำหรับต้นแบบ</h2><p>เว็บแอปนี้เป็นต้นแบบสำหรับนำเสนอ ไม่ใช่บริการ Bannayuu Next อย่างเป็นทางการ ข้อมูลทั้งหมดเป็นข้อมูลสมมติและข้อมูลที่คุณกรอกเพื่อสาธิต</p><p>ข้อมูล รูปภาพ รายการ และการตั้งค่าเก็บไว้ใน localStorage ของเบราว์เซอร์นี้ ไม่มีการส่งไปยังเซิร์ฟเวอร์หรือผู้ให้บริการภายนอก ไม่ซิงก์ข้ามอุปกรณ์</p><p>การชำระเงิน การโทร การจอง การสั่งซื้อ การลงคะแนน และรหัสเข้าพื้นที่ไม่มีผลในระบบจริง คุณสามารถส่งออกข้อมูลหรือล้างข้อมูลได้ในโหมดนำเสนอ</p><p>เอกสารนี้อธิบายการทำงานของต้นแบบเท่านั้น ก่อนเปิดบริการจริงต้องจัดทำเงื่อนไขและนโยบายสำหรับผลิตภัณฑ์จริง</p></div>`;}
 else if(part==='developer'){title='ข้อเสนอแนะสำหรับผู้พัฒนา';body=`<div class="info">ช่องทางนี้สำหรับข้อเสนอแนะเกี่ยวกับแอป ส่วนเรื่องโครงการให้ใช้ “ข้อเสนอแนะ” บนหน้าหลัก</div><form data-form="developer">${field('title','หัวข้อ','text','','required maxlength="120"')}${area('detail','รายละเอียด','','required maxlength="2000"')}${field('email','อีเมลติดต่อกลับ','email',state.profile.email,'required')}${submit('ส่งข้อเสนอแนะ')}</form>${(state.developerFeedback||[]).map(f=>`<div class="card" style="margin-top:15px"><h3>${esc(f.title)}</h3><p>${esc(f.detail)}</p>${pill('บันทึกแล้ว')}</div>`).join('')}`;}
 else if(part==='demo'){title='โหมดนำเสนอ';body=`<div class="info">ปรับสถานการณ์สำหรับพรีเซนต์ขายแอป ข้อมูลทั้งหมดเก็บในเบราว์เซอร์นี้</div><div class="card"><label class="switch-row"><span>เปิดบริการเพิ่มเติม<br><small class="muted">แจ้งซ่อม ฉุกเฉิน และแชทกับนิติ</small></span><input type="checkbox" data-setting="servicesEnabled" ${state.settings.servicesEnabled?'checked':''}></label><label class="switch-row"><span>แสดงหน้าว่างตามวิดีโอ<br><small class="muted">ซ่อนข้อมูลตัวอย่างบิล พัสดุ ประกาศ และรายชื่อบริการส่วนกลาง</small></span><input type="checkbox" data-setting="emptyMode" ${state.settings.emptyMode?'checked':''}></label></div><div class="stack">${btn(icon('download')+' ส่งออกข้อมูล JSON','export','','full secondary')}${btn(icon('refresh')+' รีเซ็ตข้อมูลเพื่อเริ่มนำเสนอใหม่','reset-ask','','full danger')}<a class="btn secondary full" href="resident-user-manual.html" target="_blank" rel="noopener">เปิดคู่มืออ้างอิง ${icon('rules')}</a></div><p class="small muted" style="line-height:1.9">การรีเซ็ตจะลบรายการที่สร้างในต้นแบบและคืนข้อมูลตัวอย่างเริ่มต้น รูปภาพถูกย่อก่อนจัดเก็บเพื่อลดพื้นที่การใช้งาน</p>`;}
 else {title='เกี่ยวกับแอป';body=`<div class="success">${icon('home')}<h2>บ้านน่าอยู่</h2><p>Better living, together.</p><p>Bannayuu Next v.1.0.1<br>ต้นแบบเว็บแอปลูกบ้าน<br>Mobile layout · localStorage</p>${linkBtn('ดูคู่มือการใช้งานต้นแบบ','help','secondary')}</div>`;}
 if(!part)body+='<button type="button" class="btn secondary full" data-logout>ออกจากระบบ</button>';
 page(header(title,'',!!part)+`<div class="content">${body}</div>`,'settings');
}
function renderNotifications(){renderPersonalNotifications();}
function renderHelp(){page(header('คำถามที่พบบ่อย')+`<div class="content">${[['เริ่มสาธิตอย่างไร?','เริ่มจากหน้าหลัก ลองชำระบิล รับพัสดุ หรือเพิ่มสัตว์เลี้ยง ข้อมูลที่บันทึกจะอยู่หลังรีเฟรชหน้า'],['ข้อมูลหายเมื่อเปลี่ยนอุปกรณ์หรือไม่?','ข้อมูลเก็บใน localStorage ของเบราว์เซอร์เดิมเท่านั้น ไม่ซิงก์ข้ามอุปกรณ์ หากล้างข้อมูลเว็บไซต์ ข้อมูลต้นแบบจะถูกลบ'],['รูปภาพแบบไหนใช้ได้?','ใช้รูป PNG หรือ JPG ไม่เกิน 5 MB ต่อรูป ระบบย่อภาพก่อนบันทึก สัตว์เลี้ยงและผู้มาติดต่อ 1 รูป รถสูงสุด 6 รูป และข้อเสนอแนะสูงสุด 3 รูป'],['ยอดรถเข็นเป็น 0 เพราะอะไร?','ต้องติ๊กเลือกสินค้าหรือเลือก “ทั้งหมด” ก่อน ปุ่มซื้อสินค้าจึงใช้งานได้'],['บันทึกแบบฟอร์มไม่ได้?','ตรวจช่องที่มี * วันเริ่มต้น/สิ้นสุด และรูปภาพที่จำเป็น ช่องที่ไม่ครบจะมีคำแนะนำให้แก้ไข'],['ฟีเจอร์ยังไม่เปิดให้บริการ?','ในตั้งค่า → โหมดนำเสนอ เปิดบริการเพิ่มเติมเพื่อสาธิตแจ้งซ่อม ฉุกเฉิน และแชท หรือปิดเพื่อแสดงสถานะตามวิดีโอ'],['แชร์ i-Pass ให้คนอื่นใช้ได้หรือไม่?','เป็นบัตรสาธิตเท่านั้น ลาย QR ไม่ใช่รหัสจริง ลิงก์เปิดได้เฉพาะเบราว์เซอร์ที่เก็บรายการนั้นไว้'],['เริ่มนำเสนอใหม่อย่างไร?','ไปที่ตั้งค่า → โหมดนำเสนอ → รีเซ็ตข้อมูล คุณสามารถส่งออก JSON ก่อนรีเซ็ตได้']].map(([q,a])=>`<details class="card"><summary style="font-weight:600;cursor:pointer">${q}</summary><p>${a}</p></details>`).join('')}<a class="btn secondary full" href="resident-user-manual.html" target="_blank" rel="noopener">เปิดคู่มืออ้างอิงฉบับเต็ม</a></div>`,'settings');}
function applyLanguage(){if(state.settings.language!=='English')return;const labels=['Home','News','Services','Community','Shop','Settings'];$$('#navigation button').forEach((b,i)=>{b.lastChild.textContent=labels[i];});if(route==='home'){const h=$('.hero-copy h1');if(h)h.innerHTML='Every good day<br>starts at <strong>home</strong>';$('.hero-copy p').textContent='A happier place for everyone';}const back=$('[aria-label="ย้อนกลับ"]');if(back)back.setAttribute('aria-label','Back');}
const $$=(s,root=document)=>[...root.querySelectorAll(s)];
function wireForms(){
 $$('input[data-count],textarea[data-count]').forEach(input=>{if(input.dataset.counterReady)return;input.dataset.counterReady='true';const c=document.createElement('small');c.textContent=`${input.value.length}/${input.dataset.count}`;input.after(c);input.addEventListener('input',()=>c.textContent=`${input.value.length}/${input.dataset.count}`);});
 $$('.upload-zone:not([data-required-photo])').forEach(zone=>{
  const field=zone.closest('.field');if(!field||field.closest('.optional-upload'))return;
  const disclosure=document.createElement('details');disclosure.className='optional-upload';
  const summary=document.createElement('summary');summary.textContent=(field.querySelector(':scope > span')?.textContent||'แนบรูป')+' · ไม่บังคับ';
  field.before(disclosure);disclosure.append(summary,field);field.querySelector(':scope > span')?.remove();
 });
 $$('.filter-chips button,.pet-templates button').forEach(button=>button.setAttribute('aria-pressed',String(button.classList.contains('active')||button.classList.contains('selected'))));
 applyLanguage(); syncFormValidity();
}
function syncFacilityTime(){
 const form=$('form[data-form="facility"]');if(!form)return;
 const start=form.elements.startTime,end=form.elements.endTime;
 const f=facilities.find(f=>f.id===form.dataset.id);
 end.setCustomValidity(facilityTimeError(f,form.elements.date.value,start.value,end.value,form.dataset.booking));
 const panel=$('#facility-availability',form);const key=JSON.stringify([form.elements.date.value,state.bookings]);if(panel&&panel.dataset.key!==key){panel.dataset.key=key;renderFacilityAvailability(form);}
 if(end.value)showFieldError(end);
}
function syncFormValidity(){ validateVisitorTimes(); syncFacilityTime(); $$('form[data-form]').forEach(form=>{const submitButton=$('[type=submit]',form);if(!submitButton)return;const missing=$$('input,select,textarea',form).some(el=>!el.validity.valid||(el.required&&typeof el.value==='string'&&!el.value.trim()));submitButton.disabled=missing||!!($$('[data-required-photo]',form).some(zone=>!zone.closest('[hidden]'))&&!photos.length)||uploadsPending>0;}); }
function updatePhotoPreview(){const count=$('#repair-photo-count');if(count)count.textContent=photos.length+'/3 รูป';const el=$('#photo-preview');if(el)el.innerHTML=photos.map((p,i)=>`<div style="position:relative"><img src="${p}" alt="รูปที่ ${i+1}"><button type="button" data-action="remove-photo" data-index="${i}" aria-label="ลบรูปที่ ${i+1}" style="position:absolute;right:0;top:0;border:0;border-radius:50%;background:#fff">×</button></div>`).join('');syncFormValidity();}
async function readPhoto(file){
 if(!['image/png','image/jpeg'].includes(file.type)||!/(\.png|\.jpe?g)$/i.test(file.name))throw new Error('กรุณาใช้รูป PNG หรือ JPG');
 if(file.size>5*1024*1024)throw new Error('รูปภาพต้องมีขนาดไม่เกิน 5 MB ต่อรูป');
 const url=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('อ่านรูปภาพไม่สำเร็จ'));r.readAsDataURL(file);});
 const img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(new Error('ไฟล์รูปภาพไม่ถูกต้อง'));i.src=url;});
 const scale=Math.min(1,700/Math.max(img.width,img.height)),canvas=document.createElement('canvas');canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/jpeg',.76);
}
let uploadsPending=0;
document.addEventListener('change',async e=>{
 const el=e.target;
 if(el.id==='household-id-verification'){
  const result=saveHouseholdIdVerification(el.checked);
  if(result.error){el.checked=house().contactPolicy.requireIdVerification;toast(result.error);return;}
  renderHousehold();$('#household-id-verification')?.focus({preventScroll:true});toast('บันทึกการยืนยันบัตรประชาชนแล้ว');return;
 }
 if(el.matches('form[data-form=visitor] [name=entryMode],form[data-form=visitor] [name=start]'))syncVisitorEntry();
 if(el.matches('[name="pickerMonth"],[name="pickerYear"]'))updateCalendarPickerDays();
 if(el.matches('form[data-form="facility-calendar"] [name="date"]'))renderFacilityAvailability(el.closest('form'));
 if(el.matches('[data-upload]')){
  const max=Number(el.dataset.upload),files=[...el.files];if(files.length+(el.closest('form')?.dataset.form==='repair'?photos.length:0)>max){toast(`แนบรูปได้สูงสุด ${max} รูป`);el.value='';return;}
  const form=el.closest('form');const button=form?.querySelector('[type=submit]');uploadsPending++;if(button)button.disabled=true;
  try{const loaded=await Promise.all(files.map(readPhoto));if(document.contains(el)){photos=el.dataset.camera||form?.dataset.form==='repair'?[...photos,...loaded].slice(-max):loaded;updatePhotoPreview();}}catch(error){toast(error.message);}finally{uploadsPending--;el.value='';if(el.dataset.camera)el.remove();syncFormValidity();}
 }
 if(el.matches('[data-cart-select]')){if(commit(()=>{state.cart.find(c=>c.id===el.dataset.cartSelect).selected=el.checked;}))renderCart();}
 if(el.id==='select-all'){if(commit(()=>state.cart.forEach(c=>c.selected=el.checked)))renderCart();}
 if(el.matches('[data-app-version]')){const version=Number(el.value);if(version!==1&&version!==2)return;if(commit(()=>state.settings.appVersion=version))toast('เปลี่ยนเป็น Version '+version+' แล้ว');render();return;}
 if(el.matches('[data-personal-notification]')){const member=activeHouseMember(),key=el.dataset.personalNotification;if(!member||!PERSONAL_NOTIFICATION_TYPES.some(([type])=>type===key))return;if(commit(()=>member.notificationPreferences[key]=el.checked))toast('บันทึกการแจ้งเตือนของคุณแล้ว');else el.checked=!el.checked;return;}
 if(el.matches('[name="approvalRecipient"],[name="householdMode"]')){syncHouseholdControls();return;}
 if(el.matches('[data-setting]')){if(commit(()=>state.settings[el.dataset.setting]=el.checked)){toast('บันทึกการตั้งค่าแล้ว');if(el.matches('.approval-switch'))el.closest('label').querySelector('.approval-switch-status').textContent=el.checked?'เปิด':'ปิด';else render();}else el.checked=!el.checked;}
 syncFormValidity();
});
function showFieldError(input) {
 if (!input.matches('input:not([type=file]):not([type=checkbox]):not([type=radio]),select,textarea') || !input.closest('form[data-form]')) return;
 const label = input.closest('.field'); if (!label) return;
 let message = '';
 if (input.required && !input.value.trim()) message = 'กรุณากรอกข้อมูลช่องนี้ ไม่ใช้เฉพาะช่องว่าง';
 else if (!input.validity.valid) message = input.validationMessage;
 let error = label.querySelector('.field-error');
 if (!error) {
  error = document.createElement('small'); error.className = 'field-error'; error.id = uid('field-error'); error.setAttribute('aria-live','polite'); label.append(error);
  input.setAttribute('aria-describedby', [input.getAttribute('aria-describedby'),error.id].filter(Boolean).join(' '));
 }
 input.setAttribute('aria-invalid', String(!!message)); error.textContent = message;
}
document.addEventListener('focusout',e=>{if(e.target.matches('input,select,textarea'))showFieldError(e.target);});
document.addEventListener('input',e=>{if(e.target.id==='visitor-province-search'){let count=0;$$('.visit-provinces button').forEach(b=>{b.hidden=!b.textContent.includes(e.target.value.trim());if(!b.hidden)count++;});$('#visitor-province-empty').hidden=count>0;}syncFormValidity();if(e.target.hasAttribute('aria-invalid'))showFieldError(e.target);});
document.addEventListener('focusin',e=>{
 if (!e.target.closest('#app') || !e.target.matches('button,a,input,select,textarea,summary')) return;
 requestAnimationFrame(()=>{
  if(document.activeElement!==e.target)return;
  const rect=e.target.getBoundingClientRect(),nav=$('#navigation').getBoundingClientRect();
  const action=$('.bottom-action');const limit=action&&!action.contains(e.target)?action.getBoundingClientRect().top:nav.top;
  const tabs=$('.tabs'),header=$('.header');const top=tabs&&!tabs.contains(e.target)?tabs.getBoundingClientRect().bottom:header&&!header.contains(e.target)?header.getBoundingClientRect().bottom:0;
  if(rect.top<top+8)window.scrollBy({top:rect.top-top-12,behavior:'instant'});
  else if(rect.bottom>limit-12)window.scrollBy({top:rect.bottom-limit+16,behavior:'instant'});
 });
});
document.addEventListener('input',e=>{if(e.target.id==='visitor-plate-search'||e.target.matches('[data-visitor-status]'))filterVisitorPlates($('#visitor-plate-search').value);if(e.target.id==='announcement-search'){const q=e.target.value.toLowerCase().trim();let count=0;$$('.searchable').forEach(el=>{el.hidden=!el.dataset.search.toLowerCase().includes(q);if(!el.hidden)count++;});$('#announcement-empty').hidden=count>0;}});
function download(name,content,type='text/plain;charset=utf-8'){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);}
async function copy(text){try{await navigator.clipboard.writeText(text);toast('คัดลอกแล้ว');}catch{modal('คัดลอกข้อความ',`<p>เลือกข้อความด้านล่างเพื่อคัดลอก</p><textarea readonly aria-label="ข้อความสำหรับคัดลอก">${esc(text)}</textarea>`);$('#modal textarea').select();}}
function formData(form){return Object.fromEntries(new FormData(form).entries());}
function showSuccess(title,text,target){modal(title,`<div class="success" style="padding:5px">${icon('checkCircle')}<p>${text}</p>${linkBtn('เรียบร้อย',target,'full')}</div>`);}
document.addEventListener('submit',async event=>{
 const form=event.target.closest('form[data-form]');if(!form)return;event.preventDefault();
 if(form.dataset.form==='repair-staff'){saveRepairStaff(form);return;}
 if(uploadsPending){toast('กำลังเตรียมรูปภาพ กรุณารอสักครู่');return;}
 const d=formData(form),type=form.dataset.form,id=form.dataset.id;for(const k in d)if(typeof d[k]==='string')d[k]=d[k].trim();
 const required=$$('[required]',form).filter(el=>el.type!=='checkbox'&&el.type!=='radio'&&typeof d[el.name]==='string'&&!d[el.name]);if(required.length){required[0].focus();toast('กรุณากรอกข้อมูลให้ครบ ไม่ใช้เฉพาะช่องว่าง');return;}
 if(type==='payment'){const b=scoped(state.bills).find(x=>x.id===id);if(!b||b.paid)return;if(d.method==='พร้อมเพย์ (จำลอง)')startPromptPay(b);else toast('กรุณาเลือกช่องทางชำระเงินที่รองรับ');}
 else if(type==='facility'){refreshFacilityBookings();const f=facilities.find(x=>x.id===id);if(d.date<iso())return toast('กรุณาเลือกวันนี้หรือวันถัดไป');{
 if(!Number.isInteger(Number(d.people))||Number(d.people)<1||Number(d.people)>f.capacity)return toast('กรุณาระบุจำนวนผู้ใช้งาน 1–'+f.capacity+' ท่าน');
 const [open,close]=f.hours.split('–');
 if(!/^\d{2}:\d{2}$/.test(d.startTime||'')||!/^\d{2}:\d{2}$/.test(d.endTime||'')||d.startTime<open||d.endTime>close||d.endTime<=d.startTime)return toast('กรุณาเลือกเวลาเริ่มและสิ้นสุดภายในเวลาเปิด โดยเวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม');
 const error=facilityTimeError(f,d.date,d.startTime,d.endTime,form.dataset.booking);if(error){syncFormValidity();return toast(error);}
 d.time=d.startTime+'–'+d.endTime;
 }
 if(form.dataset.booking){
 const booking=state.bookings.find(b=>b.id===form.dataset.booking&&b.home===house().id&&b.facility===id&&activeFacilityBooking(b));
 if(!booking)return toast('ไม่พบการจองที่แก้ไขได้');
 if(commit(()=>{booking.time=d.time;booking.people=Number(d.people);booking.status='รออนุมัติ';})){closeModal();const calendar=$('form[data-form="facility-calendar"]');if(calendar)renderFacilityAvailability(calendar,true);else go('facility-booking/'+booking.id);toast('บันทึกแล้ว รออนุมัติ');}return;
 }
 if(state.bookings.some(b=>{
 if(b.facility!==id||b.date!==d.date||!activeFacilityBooking(b))return false;
 const [start,end]=b.time.split('–');return d.startTime<end&&d.endTime>start;
 }))return toast('ช่วงเวลานี้ถูกจองแล้ว กรุณาเลือกเวลาอื่น');if(commit(()=>{state.bookings.unshift({id:uid('BK'),home:house().id,facility:id,name:f.name,bookerName:state.profile.name,date:d.date,time:d.time,people:Number(d.people),status:'รออนุมัติ'});notify('จองส่วนกลางสำเร็จ',f.name+' · '+dateLabel(d.date),'facility-booking/'+state.bookings[0].id);})){closeModal();go('facility-booking/'+state.bookings[0].id);toast('จองส่วนกลางสำเร็จ');}}
 else if(type==='home'){if(state.homes.some(h=>h.number===d.number&&h.project===d.project))return toast('มีบ้านนี้อยู่แล้ว');if(commit(()=>{const h={id:uid('HOME'),number:d.number,project:d.project,members:[{id:uid('M'),name:state.profile.name,role:'เจ้าของกรรมสิทธิ์'}],invite:uid('BNY').toUpperCase(),expires:iso(30)};state.homes.push(h);state.home=h.id;})){closeModal();go('household');toast('เพิ่มบ้านสำเร็จ');}}
 else if(type==='member'){closeModal();go('management');toast('กรุณาติดต่อนิติบุคคลเพื่อจัดการสมาชิก');}
 else if(type==='join'){closeModal();go('management');toast('กรุณาติดต่อนิติบุคคลเพื่อจัดการสมาชิก');}
 else if(type==='vehicle'){const step=Number(form.dataset.step);vehicleDraft={...vehicleDraft,...d};delete vehicleDraft.photos;if(step===1){vehicleDraft.photos=[...photos];vehicleDraft._photos=[...photos];go('vehicle-new/2');}else if(step===2){vehicleDraft.photos=vehicleDraft._photos||[];go('vehicle-new/3');}else{if(scoped(state.vehicles).some(v=>v.id!==vehicleDraft.id&&v.plate===vehicleDraft.plate&&v.province===vehicleDraft.province))return toast('มีทะเบียนรถนี้ในบ้านแล้ว');const v={...vehicleDraft,id:vehicleDraft.id||uid('CAR'),home:house().id,photos:vehicleDraft._photos||[]};delete v._photos;delete v.agree;if(commit(()=>{const n=state.vehicles.findIndex(x=>x.id===v.id);if(n>=0)state.vehicles[n]=v;else state.vehicles.push(v);})){vehicleDraft={};go('vehicle/'+v.id);toast('บันทึกยานพาหนะสำเร็จ');}}}
 else if(type==='pet'){if(!photos.length)return toast('กรุณาเพิ่มรูปภาพสำหรับบัตร');if(d.birth>iso())return toast('วันเกิดต้องไม่อยู่ในอนาคต');const p={...d,id:id||uid('PET'),theme:petTheme,photo:photos[0],chip:!!d.chip};delete p.photos;if(commit(()=>{const n=state.pets.findIndex(x=>x.id===id);if(n>=0)state.pets[n]=p;else state.pets.push(p);})){go('pet/'+p.id);setTimeout(()=>showSuccess(id?'แก้ไขข้อมูลสำเร็จ':'เพิ่มสัตว์เลี้ยงสำเร็จ','สร้างโปรไฟล์และ Pet Card เรียบร้อยแล้ว','pet/'+p.id),30);}}
 else if(type==='visitor'){if(!d.name?.trim())return toast('กรุณาระบุชื่อผู้มาติดต่อ');if(!visitorBookingFormats().includes(d.bookingFormat))return toast('กรุณาเลือกรูปแบบการจอง');if(!d.startTime||!d.endTime)return toast('กรุณาระบุเวลาให้ครบ');if(d.start===d.end&&d.endTime<=d.startTime)return toast('เวลาสิ้นสุดต้องหลังเวลาเริ่มต้น');if(!d.start||!d.end)return toast('กรุณาเลือกวันที่เข้าใช้บริการให้ครบ');if(!id&&d.start<iso())return toast('กรุณาเลือกวันเริ่มต้นเป็นวันนี้หรือวันถัดไป');if(id&&!canManageVisitor(scoped(state.visitors).find(v=>v.id===id)))return toast('แก้ไขได้เฉพาะรายการที่รอเข้า');if(d.end<d.start)return toast('วันสิ้นสุดต้องไม่ก่อนวันเริ่มต้น');if(!id&&d.end<iso())return toast('กรุณากำหนดวันสิ้นสุดเป็นวันนี้หรือวันถัดไป');const original=state.visitors.find(v=>v.id===id)||{};const v={...(!id?{enteredAt:null,exitedAt:null}:{}),...original,...d,createdAt:id?original.createdAt:new Date().toISOString(),name:d.name.trim(),source:original.source||'registered',id:id||uid('PASS'),home:house().id,photo:photos[0]||''};delete v.photos;if(commit(()=>{const n=state.visitors.findIndex(x=>x.id===id);if(n>=0)state.visitors[n]=v;else state.visitors.unshift(v);})){passFlipped=false;go(id?'visitors/registered':'estamp-reserve/'+v.id);toast('บันทึกผู้มาติดต่อสำเร็จ');}}
 else if(type==='stamp'){const v=scoped(state.visitors).find(v=>v.id===d.pass);if(v)go('visitor-stamp/'+v.id);}
 else if(type==='visitor-stamp'){const v=scoped(state.visitors).find(v=>v.id===id);if(!canStampVisitor(v))return toast('รายการนี้ไม่สามารถประทับตราได้');if(d.right!=='สิทธิ์ลูกบ้าน')return toast('กรุณาเลือกสิทธิ์ประทับตรา');if(commit(()=>Object.assign(v,{stamped:true,stampedAt:new Date().toISOString(),stampedBy:state.profile.name,stampRight:d.right,stampNote:d.note}))){openVisitorRecord(id);toast('ประทับตราแล้ว');}}

 else if(type==='feedback'){if(commit(()=>state.feedback.unshift({id:uid('FB'),home:house().id,...d,photos:[...photos],date:iso()}))){go('feedback/history');toast('ส่งข้อเสนอแนะสำเร็จ');}}
 else if(type==='repair'){
 const repair=id?scoped(state.repairs).find(r=>r.id===id):null;
 if(id&&(!repair||repair.status!=='รอดำเนินการ'))return toast('แก้ไขได้เฉพาะรายการที่รอดำเนินการ');
 if(!REPAIR_SUBTYPES[d.type]?.includes(d.subtype))return toast('กรุณาเลือกประเภทย่อย');
 if(photos.length>3)return toast('แนบรูปได้สูงสุด 3 รูป');
 const values={type:d.type,subtype:d.subtype,detail:d.detail,phone:d.phone,photos:[...photos]};
 if(commit(()=>{if(repair)Object.assign(repair,values);else state.repairs.unshift({id:uid('RP'),home:house().id,...values,date:iso(),createdAt:new Date().toISOString(),status:'รอดำเนินการ'});})){go('repairs/history');toast(id?'บันทึกการแก้ไขแล้ว':'ส่งเรื่องแจ้งซ่อมแล้ว');}
 }
 else if(type==='chat'){if(commit(()=>{state.chat.push({text:d.text,mine:true});state.chat.push({text:'รับข้อความเรียบร้อยค่ะ ทีมงานสาธิตจะประสานงานให้ หากเป็นปัญหาที่ต้องติดตาม สามารถเปิดเมนูแจ้งซ่อมหรือข้อเสนอแนะได้ค่ะ',mine:false});})){renderChat();window.scrollTo(0,document.body.scrollHeight);}}
 else if(type==='vote'){if(state.votes[house().id])return toast('บ้านนี้ลงคะแนนแล้ว');confirmDialog('ยืนยันลงคะแนน','คุณเลือก “'+esc(d.choice)+'” เมื่อลงคะแนนแล้วจะแก้ไขไม่ได้','confirm-vote',d.choice);}
 else if(type==='service-booking-change'){
 const b=scoped(state.serviceBookings).find(x=>x.id===id),request=form.dataset.mode==='request';
 if(!b||b.status!==(request?'รอดำเนินการ':'รอยืนยัน'))return toast('ไม่สามารถแก้ไขรายการในสถานะนี้');
 const isRequest=request||!!b.request,cancelled=d.kind==='ยกเลิกบริการ';if(!isRequest&&b.paymentStatus==='paid'){d.quantity=String(b.quantity);d.offer=b.offer;}
 if(isRequest&&!d.reason?.trim())return toast('กรุณากรอกเหตุผล');
 if(!cancelled&&(!d.date||d.date<iso()||!['09:00–12:00','13:00–16:00','16:00–19:00'].includes(d.time)))return toast('กรุณาเลือกวันและเวลาที่ถูกต้อง');
 if(!isRequest&&(!d.address?.trim()||!Number.isInteger(Number(d.quantity))||Number(d.quantity)<1||Number(d.quantity)>10))return toast('กรุณากรอกข้อมูลให้ครบถ้วน');
 if(commit(()=>{if(isRequest){b.request={kind:cancelled?'cancel':'reschedule',reason:d.reason.trim(),...(cancelled?{}:{date:d.date,time:d.time}),submittedAt:new Date().toISOString()};}else{const item=services.find(x=>x.id===b.serviceId||x.title===b.title)||{price:b.unitPrice||b.total/b.quantity};Object.assign(b,d,{quantity:Number(d.quantity)},servicePricing(item,Number(d.quantity),d.offer||b.offer));}b.status='รอยืนยัน';const bill=state.bills.find(x=>x.id===b.billId&&!x.paid);if(bill&&bill.amount!==b.total){bill.amount=b.total;delete bill.pendingPayment;}})){go('services/bookings');toast(isRequest?'ส่งคำขอแล้ว รอเจ้าหน้าที่ยืนยัน':'บันทึกการแก้ไขแล้ว');}
 }
 else if(type==='service'){
 const item=services.find(x=>x.id===id),quantity=Number(d.quantity);
 if(!item||!Number.isInteger(quantity)||quantity<1||quantity>10||!serviceOfferOptions(item).some(o=>o.id===d.offer))return toast('กรุณาตรวจสอบจำนวนและสิทธิ์ที่เลือก');
 if(d.date<iso())return toast('กรุณาเลือกวันนี้หรือวันถัดไป');
 const bookingId=uid('SV'),billId=uid('BILL-SV'),price=servicePricing(item,quantity,d.offer);
 if(commit(()=>{state.serviceBookings.unshift({id:bookingId,home:house().id,...d,title:item.title,unit:item.unit,quantity,...price,serviceId:item.id,billId,status:'รอยืนยัน'});state.bills.unshift({id:billId,home:house().id,serviceBookingId:bookingId,title:item.title,amount:price.total,period:'ค่าจองบริการ',due:iso(),paid:false});})){go('payment/'+billId);}
 }
 else if(type==='post'){if(commit(()=>state.posts.unshift({id:uid('POST'),author:state.profile.name,category:d.category,text:d.text,date:iso(),likes:0,liked:false,comments:[],own:true,image:photos[0]||''}))){closeModal();timelineCategory='ทั้งหมด';go('timeline');renderTimeline();toast('เผยแพร่โพสต์แล้ว');}}
 else if(type==='comment'){if(commit(()=>state.posts.find(p=>p.id===id).comments.push({author:state.profile.name,text:d.text}))){closeModal();renderTimeline(routeParts[1]);toast('เพิ่มความคิดเห็นแล้ว');}}
 else if(type==='checkout'){const {selected,subtotal,shipping}=cartTotals();if(!selected.length)return go('cart');if(selected.some(c=>c.quantity>products.find(p=>p.id===c.id).stock))return toast('จำนวนสินค้ามากกว่าคงเหลือ');const order={id:uid('ORD').toUpperCase(),home:house().id,...d,items:selected.map(c=>({...c,name:products.find(p=>p.id===c.id).name,price:products.find(p=>p.id===c.id).price})),subtotal,shipping,total:subtotal+shipping,date:iso(),status:'เตรียมจัดส่ง'};if(commit(()=>{state.orders.unshift(order);state.cart=state.cart.filter(c=>!c.selected);notify('สั่งซื้อสำเร็จ','คำสั่งซื้อ '+order.id,'orders/'+order.id);})){go('orders/'+order.id);toast('สร้างคำสั่งซื้อจำลองสำเร็จ');}}
 else if(type==='profile'){if(commit(()=>{const old=state.profile.name;state.profile={...state.profile,...d};state.homes.forEach(h=>h.members.forEach(m=>{if(m.name===old)m.name=d.name;}));})){go('settings');toast('บันทึกข้อมูลส่วนตัวแล้ว');}}
 else if(type==='language'){if(commit(()=>state.settings.language=d.language)){go('settings');toast('บันทึกภาษาแล้ว');}}
 else if(type==='developer'){if(commit(()=>{state.developerFeedback??=[];state.developerFeedback.unshift({...d,date:iso()});})){renderSettings('developer');toast('บันทึกข้อเสนอแนะในต้นแบบแล้ว');}}
});
document.addEventListener('click',async event=>{
 const b=event.target.closest('[data-action]');if(!b||b.disabled)return;
 const a=b.dataset.action,id=b.dataset.id;
 if(a.startsWith('promptpay-')) {
  const bill=scoped(state.bills).find(x=>x.id===id && !x.paid);
  if(!bill || !bill.pendingPayment)return;
  if(a==='promptpay-retry')return startPromptPay(bill,bill.pendingPayment.slip);
  if(a==='promptpay-cancel'){if(commit(()=>{delete bill.pendingPayment;}))renderPayment(id);return;}
  if(a==='promptpay-complete'){
   if(Date.now()>=bill.pendingPayment.expiresAt)return renderPayment(id);
   return completeBill(bill,'พร้อมเพย์ (จำลอง)',bill.pendingPayment.slip);
  }
 }
 if(a==='frequent-edit'){return go('frequent-functions');}
 if(a==='frequent-cancel'){frequentDraft=null;go('home');return;}
 if(a==='frequent-save'){
  if(!frequentDraft)return;
  const selection=cleanFrequentSlots(frequentDraft);
  if(commit(()=>{state.profile.frequentFunctions??={};state.profile.frequentFunctions[frequentKey()]=selection;})){frequentDraft=null;go('home');toast('บันทึกเมนูโปรดแล้ว');}return;
 }
 if(a.startsWith('frequent-')&&frequentDraft){
  if(frequentSuppressClick)return;
  if(a==='frequent-slot'){
   const target=Number(b.dataset.slot);
   if(frequentPicked!==null&&frequentDraft[frequentPicked]&&frequentPicked!==target){swapFrequentSlots(frequentPicked,target);return;}
   frequentPicked=frequentPicked===target?null:target;renderFrequentEditor(target);return;
  }
  const i=frequentDraft.indexOf(id);
  if(a==='frequent-add'&&i<0&&homeMenu().some(([r])=>r===id))frequentDraft.push(id);
  if(a==='frequent-remove'&&i>=0)frequentDraft.splice(i,1);
  frequentPicked=null;renderFrequentEditor(a==='frequent-remove'?Math.min(i,frequentDraft.length-1):frequentDraft.length-1);return;
 }
 if(a==='go'){closeModal();return go(b.dataset.route);}
 if(a==='visitor-status-clear')return resetVisitorFilters();
 if(a==='visitor-filter-reset')return resetVisitorFilters(true);
 if(a==='visitor-filter-toggle')return toggleVisitorStatusFilter();
 if(a.startsWith('visitor-range-'))return handleVisitorRange(a,b);
 if(a==='calendar-month-picker'){renderCalendarMonthPicker();return;}
 if(a==='calendar-month-back'){closeCalendarMonthPicker();return;}
 if(a==='calendar-pick-month'){
 $('[name="pickerMonth"]').value=b.dataset.month;$('#picker-month-value').textContent=b.textContent;updateCalendarPickerDays();closeCalendarMonthPicker();return;
 }
 if(a==='calendar-year-picker'){renderCalendarYearPicker(Number($('[name="pickerYear"]').value));return;}
 if(a==='calendar-year-page'){renderCalendarYearPicker(Number(b.dataset.first));return;}
 if(a==='calendar-year-back'){closeCalendarYearPicker();return;}
 if(a==='calendar-pick-year'){
 $('[name="pickerYear"]').value=b.dataset.year;$('#picker-year-value').textContent=b.dataset.year;updateCalendarPickerDays();closeCalendarYearPicker();return;
 }
 if(a==='calendar-date-picker'){renderCalendarDatePicker(b.closest('form').elements.date.value);return;}
 if(a==='calendar-pick-date'||a==='calendar-today'){
 const form=$('form[data-form="facility-calendar"]'),date=a==='calendar-today'?iso():b.dataset.date;
 if(!form||date<iso())return;form.elements.date.value=date;closeModal();renderFacilityAvailability(form);$('.calendar-date-trigger',form).focus();return;
 }
 if(a==='facility-day'){

 const form=b.closest('form'),input=form.elements.date;const date=new Date(input.value+'T12:00:00');date.setDate(date.getDate()+Number(b.dataset.offset));input.value=date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');renderFacilityAvailability(form);return;
 }
 if(a==='share-reserve-qr')return shareReserveQr(id);
 if(a==='download-reserve-qr')return shareReserveQr(id,true);
 if(a==='share-booking-qr')return shareBookingQr(id);
 if(a==='download-booking-qr')return shareBookingQr(id,true);
 if(a==='edit-facility-booking'){
 refreshFacilityBookings();const booking=state.bookings.find(x=>x.id===id&&x.home===house().id);if(!booking)return toast('ไม่พบการจองนี้');
 if(!activeFacilityBooking(booking)){modal('รายละเอียดการจอง',detail([['ส่วนกลาง',booking.name],['สถานะ',booking.status],['วันที่',dateLabel(booking.date)],['เวลา',booking.time+' น.'],['ผู้จอง',booking.bookerName||state.profile.name]])+btn('ปิด','close','','full secondary'));return;}
 
 const f=facilities.find(x=>x.id===booking.facility),[start,end]=booking.time.split('–'),[open,close]=f.hours.split('–');
 modal('แก้ไขเวลาการจอง',`<form data-form="facility" data-id="${f.id}" data-booking="${esc(id)}"><p>${esc(f.name)} · ${dateLabel(booking.date)}</p><input type="hidden" name="date" value="${booking.date}"><div class="facility-time-range">${field('startTime','เริ่ม','time',start,`required min="${open}" max="${close}"`)}${field('endTime','ถึง','time',end,`required min="${open}" max="${close}"`)}</div>${field('people','จำนวนผู้ใช้งาน','number',String(booking.people),`required min="1" max="${f.capacity}"`)}<p class="small muted">แก้ไขได้ภายในเวลาเปิดและไม่ทับซ้อนการจองอื่น หลังบันทึกจะรออนุมัติอีกครั้ง</p><div class="booking-modal-actions">${btn('ยกเลิก','close','','secondary')}${submit('บันทึกการแก้ไข')}</div></form>`);return;
 }
 if(a==='choose-facility-range'){
 const calendar=b.closest('form'),f=facilities.find(f=>f.id===calendar.dataset.id),date=calendar.elements.date.value;
 modal('จอง'+f.name,`<form data-form="facility" data-id="${f.id}" class="facility-booking-modal"><p class="muted">${dateLabel(date)} · เปิด ${f.hours} น.</p><input type="hidden" name="date" value="${date}"><div class="facility-time-range">${field('startTime','เริ่ม','time',b.dataset.start,`required min="${f.hours.split('–')[0]}" max="${f.hours.split('–')[1]}" step="60"`)}${field('endTime','ถึง','time',b.dataset.end,`required min="${f.hours.split('–')[0]}" max="${f.hours.split('–')[1]}" step="60"`)}</div>${field('people','จำนวนผู้ใช้งาน','number','1',`required min="1" max="${f.capacity}"`)}<details class="booking-terms"><summary>เงื่อนไขการเข้าใช้งานส่วนกลาง</summary><p>${esc(f.note)}</p><p>เข้าใช้งานตามเวลาที่จอง รักษาความสะอาดและไม่รบกวนผู้อื่น หากไม่สามารถมาได้ กรุณายกเลิกการจอง</p><small class="muted">เงื่อนไขตัวอย่างสำหรับระบบจำลอง</small></details><label class="choice"><input type="checkbox" name="agree" required>ยอมรับเงื่อนไขการเข้าใช้งาน</label><div class="booking-modal-actions">${btn('ยกเลิก','close','','secondary')}${submit('ยืนยันการจอง')}</div></form>`);return;
 }
 if(a==='facility-terms'){
 const f=facilities.find(x=>x.id===id);if(!f)return;
 modal('เงื่อนไขการเข้าใช้งานส่วนกลาง',`<div class="facility-terms"><h3>${esc(f.name)}</h3><p>เวลาเปิดให้บริการ ${esc(f.hours)} น.</p><ul><li>${esc(f.note)}</li><li>เข้าใช้งานตามวันและเวลาที่จอง และออกจากพื้นที่เมื่อสิ้นสุดช่วงเวลา</li><li>หากไม่สามารถเข้าใช้งานได้ กรุณายกเลิกในหน้าการจองของฉัน</li><li>ใช้อุปกรณ์อย่างระมัดระวัง รักษาความสะอาด และไม่รบกวนผู้ใช้งานท่านอื่น</li><li>หากพบอุปกรณ์ชำรุดหรือมีปัญหาระหว่างใช้งาน กรุณาแจ้งเจ้าหน้าที่นิติบุคคล</li></ul><p class="small muted">เงื่อนไขตัวอย่างสำหรับระบบจำลอง</p>${btn('ปิด','close','','full secondary')}</div>`);return;
 }
 if(a==='view-visitor-photos'){showVisitorPhotos(id);return;}
 if(a==='view-parcel-photo'){const p=scoped(state.parcels).find(p=>p.id===id);if(p?.image)modal('รูปพัสดุ '+esc(p.id),`<div class="parcel-photo-viewer"><img src="${esc(p.image)}" alt="รูปพัสดุ ${esc(p.id)} แบบเต็มภาพ"></div>`);return;}
 if(a==='back')return back();if(a==='close')return closeModal();
 if(a==='copy')return copy(b.dataset.text);
 if(a==='switch-home')return modal('เปลี่ยนชุมชน / บ้าน',state.homes.map(h=>`<button class="service-card" data-action="select-home" data-id="${h.id}"><span class="avatar">${icon('home')}</span><div class="grow"><h3>บ้าน ${esc(h.number)}</h3><p>${esc(h.project)}</p></div>${h.id===state.home?icon('check'):icon('chevron')}</button>`).join('')+btn(icon('plus')+' เพิ่มห้อง/บ้าน','add-home','','full secondary'));
 if(a==='select-home'){if(commit(()=>state.home=id)){closeModal();render();toast('เปลี่ยนเป็นบ้าน '+house().number);}return;}
 if(a==='add-home')return modal('เพิ่มห้อง/บ้าน',`<form data-form="home">${field('number','บ้านเลขที่','text','','required maxlength="30" placeholder="เช่น 212/2"')}${field('project','ชื่อโครงการ','text',house().project,'required maxlength="100"')}<div class="info">เพิ่มบ้านสาธิตได้ทันที โดยไม่ต้องรออนุมัติจากโครงการ</div>${submit('เพิ่มบ้าน')}</form>`);
 if(a==='member-menu')return go('management');
 if(a==='join-member')return go('management');
 if(a==='receive-parcel')return confirmDialog('ยืนยันรับพัสดุ','จำลองว่าคุณได้รับพัสดุจากเจ้าหน้าที่แล้ว','confirm-parcel',id);
 if(a==='confirm-parcel'){if(commit(()=>{const p=state.parcels.find(x=>x.id===id);p.received=true;p.receivedAt=iso();})){closeModal();renderParcel(id);toast('ยืนยันรับพัสดุแล้ว');}return;}
 if(a==='cancel-booking'){refreshFacilityBookings();const booking=state.bookings.find(x=>x.id===id&&x.home===house().id);if(!booking||!activeFacilityBooking(booking))return toast('รายการนี้ไม่สามารถยกเลิกได้');return confirmDialog('ยกเลิกการจองส่วนกลาง','คืนช่วงเวลานี้ให้ผู้อื่นจองได้','confirm-cancel-booking',id);}
 if(a==='confirm-cancel-booking'){refreshFacilityBookings();const booking=state.bookings.find(x=>x.id===id&&x.home===house().id);if(!booking||!activeFacilityBooking(booking)){closeModal();render();return toast('รายการนี้ไม่สามารถยกเลิกได้');}if(commit(()=>booking.status='ยกเลิก')){closeModal();render();toast('ยกเลิกการจองแล้ว');}return;}
 if(a==='new-vehicle'){vehicleDraft={};return go('vehicle-new/1');}
 if(a==='edit-vehicle'){vehicleDraft=structuredClone(state.vehicles.find(x=>x.id===id));vehicleDraft._photos=vehicleDraft.photos||[];return go('vehicle-new/1');}
 if(a==='pet-skip'){if(commit(()=>state.petIntro=true))renderPets();return;}
 if(a==='pet-intro'){if(introStep<2){introStep++;renderPetIntro();}else if(commit(()=>state.petIntro=true))renderPets();return;}
 if(a==='pet-theme'){petTheme=Number(b.dataset.theme);$('.pet-templates button').forEach((x,i)=>{x.classList.toggle('selected',i===petTheme);x.setAttribute('aria-pressed',String(i===petTheme));});return;}
 if(a==='remove-photo'){photos.splice(Number(b.dataset.index),1);updatePhotoPreview();return;}
 if(a==='reserve-side'){setReserveSide(b.dataset.side==='details');return;}
 if(a==='flip-reserve-pass'){setReserveSide($('.reserve-pass').dataset.flipped!=='true');return;}
 if(a==='flip-vehicle-pass'){setVehicleSide(b.getAttribute('aria-pressed')!=='true');return;}
 if(a==='vehicle-side'){setVehicleSide(b.dataset.side==='details');return;}
 if(a==='vehicle-help'){modal('เพิ่มหรือแก้ไขทะเบียนรถ',`<p>หากต้องการเพิ่มทะเบียนรถ หรือแก้ไขทะเบียนรถ กรุณาติดต่อทางนิติบุคคล</p>${linkBtn('ติดต่อนิติบุคคล','management','full')}`);return;}
 if(a==='vehicle-demo-count'){const count=Number(b.dataset.count);if([1,2].includes(count)&&commit(()=>{state.settings.vehicleDemoCount=count;})){renderVehicles();$('.vehicle-demo-panel').open=true;$('[data-action="vehicle-demo-count"][data-count="'+count+'"]').focus({preventScroll:true});}return;}
 if(a==='scan-camera')return openVisitorQrCamera();
 if(a==='scan-search-clear'){$('#scan-search').value='';filterScanVisitors('');$('#scan-search').focus();return;}
 if(a==='scan-visitor'){const v=scoped(state.visitors).find(v=>v.id===id);if(canStampVisitor(v))openVisitorRecord(id);else{renderScanner(location.hash.split('/')[1]);toast('รายการนี้ไม่อยู่ในสถานะรอประทับตราแล้ว');}return;}
 if(a==='visitor-open'){openVisitorRecord(b.dataset.visitorId||id);return;}
 if(a==='visitor-province'){openVisitorProvince();return;}
 if(a==='visitor-set-province'){const input=$('form[data-form=visitor] [name=province]');input.value=b.dataset.value;closeModal();syncFormValidity();input.focus();return;}
 if(a==='visitor-cancel'){const v=scoped(state.visitors).find(v=>v.id===b.dataset.visitorId);if(!canManageVisitor(v))return toast('ยกเลิกได้เฉพาะรายการที่รอเข้า');return confirmDialog('ยกเลิกการจอง',`ต้องการยกเลิกการจองทะเบียน ${esc(v.plate)} หรือไม่? รายการจะยังคงอยู่ในประวัติ`,'visitor-cancel-confirm',v.id);}
 if(a==='visitor-cancel-confirm'){const v=scoped(state.visitors).find(v=>v.id===id);if(!canManageVisitor(v)){closeModal();return toast('ยกเลิกได้เฉพาะรายการที่รอเข้า');}if(commit(()=>{v.revoked=true;v.cancelledAt=new Date().toISOString();})){closeModal();renderEstampReserve(id);toast('ยกเลิกการจองแล้ว');}return;}
 if(a==='household-recipient-edit')return go('household/recipient');
 if(a==='household-recipient-cancel')return go('household');
 if(a==='household-recipient-save'){const result=saveApprovalRecipient($('input[name="approvalRecipient"]:checked')?.value);if(result.error)return toast(result.error);if(result.saved){guardBannerDismissed=false;go('household');toast('เปลี่ยนผู้รับอนุมัติแล้ว เปลี่ยนอีกครั้งได้หลัง 60 นาที');}return;}
 if(a==='household-mode-save'){const result=saveHouseholdMode($('input[name="householdMode"]:checked')?.value);if(result.error)return toast(result.error);guardBannerDismissed=false;go('household');toast('บันทึกโหมดผู้มาติดต่อแล้ว');return;}
 if(a==='household-test-notifications'){const routes={vehicle:'vehicles',parcel:'parcels',announcement:'announcements',bill:'bills',other:'services'};if(commit(()=>PERSONAL_NOTIFICATION_TYPES.forEach(([key,label])=>notify('แจ้งเตือนตัวอย่าง · '+label,'ส่งถึงสมาชิกทุกคนที่เปิดรับประเภทนี้',routes[key],key)))){toast('ส่งแจ้งเตือนจำลองแล้ว');go('notifications');}return;}
 if(a==='guard-dismiss'){guardBannerDismissed=true;$('#guard-notification')?.remove();return;}
 if(a==='guard-resume'){if(!canReceiveApproval())return;const visitor=scoped(state.visitors).find(v=>v.id===b.dataset.visitorId);if(visitor?.demoCall?.status==='active'&&commit(()=>state.guardCalls[house().id]=visitor.demoCall))go('guard-call');return;}
 if(a==='guard-answer'){if(!canReceiveApproval())return toast('บัญชีนี้ไม่มีสิทธิ์รับสายหรืออนุมัติผู้มาติดต่อ');const visitor=scoped(state.visitors).find(v=>v.id===b.dataset.visitorId);if(visitor?.demoCall&&!commit(()=>state.guardCalls[house().id]=visitor.demoCall))return;const call=currentGuardCall();if(['ringing','ended'].includes(call.status)&&commit(()=>{call.status='active';call.startedAt=Date.now();}))go('guard-call');return;}
 if(a==='guard-end'){if(!canReceiveApproval())return toast('บัญชีนี้ไม่มีสิทธิ์รับสายหรืออนุมัติผู้มาติดต่อ');if(commit(()=>currentGuardCall().status='ended'))renderGuardCall();return;}
 if(a==='guard-replay'){if(!canReceiveApproval())return renderGuardAccessState();if(commit(()=>currentGuardCall().status='ringing')){guardBannerDismissed=false;renderGuardCall();}return;}
 if(a==='guard-decision'){if(!canReceiveApproval())return toast('บัญชีนี้ไม่มีสิทธิ์รับสายหรืออนุมัติผู้มาติดต่อ');const call=currentGuardCall();if(!['ringing','active','ended'].includes(call.status))return;if(commit(()=>call.status=b.dataset.value==='allow'?'allow':'deny')){if(routeParts[0]==='guard-call')renderGuardCall();else{if(routeParts[0]==='visitors')renderVisitors(routeParts[1]);else renderGuardNotification();toast(call.status==='allow'?'อนุมัติผู้มาติดต่อแล้ว':'ไม่อนุมัติผู้มาติดต่อ');$('#app').focus({preventScroll:true});}}return;}
 if(a==='repair-camera-open'){openRepairCamera();return;}
 if(a==='repair-camera-capture'){captureRepairCamera();return;}
 if(a==='repair-camera-retake'){repairCameraShot='';$('.repair-camera img').hidden=true;$('.repair-camera video').hidden=false;$('[data-camera-message]').textContent='จัดภาพให้เห็นบริเวณที่ต้องการแจ้งซ่อม';$('.repair-camera .repair-photo-actions').innerHTML=btn('ถ่ายภาพ','repair-camera-capture')+btn('ปิดกล้อง','close','','secondary');return;}
 if(a==='repair-camera-use'){if(!repairCameraShot)return;if(photos.length>=3)return toast('แนบรูปได้สูงสุด 3 รูป');photos.push(repairCameraShot);closeModal();updatePhotoPreview();return;}
 if(a==='repair-local-photo'){b.closest('form').querySelector('[data-repair-file]').click();return;}
 if(a==='open-camera'){const input=document.createElement('input');input.type='file';input.accept='image/png,image/jpeg';input.setAttribute('capture','environment');input.hidden=true;input.dataset.upload=b.dataset.max;input.dataset.camera='true';(b.closest('form')||b.parentElement).append(input);input.click();return;}
 if(a==='delete-ask'){const kind=b.dataset.kind;return modal('ยืนยันการลบ',`<p>รายการนี้จะถูกลบออกจากข้อมูลในเครื่อง คุณต้องการดำเนินการต่อหรือไม่?</p><div class="actions">${btn('ยกเลิก','close','','secondary')}${btn('ลบรายการ','delete-confirm',`data-kind="${kind}" data-id="${id}"`,'danger')}</div>`);}
 if(a==='delete-confirm'){const kind=b.dataset.kind;if(!['pets','vehicles','posts'].includes(kind))return;if(commit(()=>state[kind]=state[kind].filter(x=>x.id!==id))){closeModal();go(kind==='posts'?'timeline':kind);if(routeParts[0]==='timeline')renderTimeline();toast('ลบรายการแล้ว');}return;}
 if(a==='visitor-info')return modal('ผู้มาติดต่อและ i-Pass','<p>ลงทะเบียนล่วงหน้าเพื่อสร้างบัตร i-Pass ตรวจวันเริ่มต้นและวันสิ้นสุดก่อนใช้บัตร เลือกสแกน E-Stamp เพื่อสาธิตการประทับตรา</p><p>ลาย QR และสิทธิ์ทั้งหมดในต้นแบบเป็นตัวอย่าง ไม่เชื่อมระบบเข้าออกจริง</p>');
 if(a==='flip-pass'){passFlipped=!passFlipped;return renderVisitor(routeParts[1]);}
 if(a==='copy-pass')return copy(location.href.split('#')[0]+'#visitor/'+id);
 if(a==='revoke-pass')return confirmDialog('ยกเลิกสิทธิ์บัตร','บัตรนี้จะแสดงสถานะหมดสิทธิ์และใช้สาธิตการประทับตราไม่ได้','confirm-revoke',id);
 if(a==='confirm-revoke'){if(commit(()=>state.visitors.find(x=>x.id===id).revoked=true)){closeModal();renderVisitor(id,'details');toast('ยกเลิกสิทธิ์แล้ว');}return;}
 if(a==='call')return modal('กำลังเชื่อมต่อ · โหมดสาธิต',`<div class="success">${icon('phone')}<h3>${esc(b.dataset.name)}</h3><p>จำลองหน้าการโทร ไม่มีการโทรออกจริง</p>${btn('วางสาย','close','','danger full')}</div>`);
 if(a==='repair-gallery'){const r=scoped(state.repairs).find(r=>r.id===id);if(!r)return;const images=b.dataset.group==='after'?(repairResolution(r)?.photos||[]):(r.photos||[]);return modal((b.dataset.group==='after'?'รูปหลังแก้ไข':'รูปปัญหาที่แจ้ง')+' · '+images.length+' รูป','<div class="visitor-photo-gallery repair-photo-gallery" tabindex="0" role="region" aria-label="รูปแนบทั้งหมด เลื่อนเพื่อดูรูปเพิ่มเติม">'+images.map((src,i)=>'<figure class="visitor-photo-slide"><img src="'+esc(src)+'" alt="ภาพประกอบ '+(i+1)+'"><figcaption>รูป '+(i+1)+' / '+images.length+'</figcaption></figure>').join('')+'</div>');}
 if(a==='cancel-repair'){const repair=scoped(state.repairs).find(r=>r.id===id);if(!repair||repair.status!=='รอดำเนินการ')return toast('ยกเลิกได้เฉพาะรายการที่รอดำเนินการ');return confirmDialog('ยกเลิกงานแจ้งซ่อม','ต้องการยกเลิกเรื่องนี้หรือไม่?','confirm-cancel-repair',id);}
 if(a==='confirm-cancel-repair'){const repair=scoped(state.repairs).find(r=>r.id===id);if(!repair||repair.status!=='รอดำเนินการ'){closeModal();renderRepairs('history');return toast('ยกเลิกได้เฉพาะรายการที่รอดำเนินการ');}if(commit(()=>{repair.status='ยกเลิก';repair.closedAt=new Date().toISOString();})){closeModal();renderRepairs('history');toast('ยกเลิกงานแจ้งซ่อมแล้ว');}return;}
 if(a==='redeem')return confirmDialog('รับสิทธิพิเศษ','ใช้สิทธิ์สาธิต 1 ครั้งสำหรับบัญชีนี้','confirm-redeem',id);
 if(a==='confirm-redeem'){if(!state.redeemed.includes(id)&&commit(()=>state.redeemed.push(id))){closeModal();renderBenefits();toast('รับสิทธิ์สำเร็จ');}return;}
 if(a==='confirm-vote'){if(!state.votes[house().id]&&commit(()=>state.votes[house().id]=id)){closeModal();renderVote();toast('ลงคะแนนสำเร็จ');}return;}
 if(a==='search-announcements'){const input=$('#announcement-search');input.hidden=false;input.focus();return;}
 if(a==='acknowledge'){if(commit(()=>state.announcements.find(x=>x.id===id).read=true)){renderAnnouncement(id);toast('รับทราบประกาศแล้ว');}return;}
 if(a==='cancel-service'){const b=scoped(state.serviceBookings).find(x=>x.id===id);if(!b||b.status!=='รอยืนยัน')return toast('ยกเลิกได้เฉพาะรายการรอยืนยัน');return confirmDialog('ยกเลิกการจองบริการ','ต้องการยกเลิกการจองนี้หรือไม่','confirm-cancel-service',id);}
 if(a==='confirm-cancel-service'){const b=scoped(state.serviceBookings).find(x=>x.id===id);if(!b||b.status!=='รอยืนยัน')return toast('ไม่สามารถยกเลิกรายการนี้');if(commit(()=>{b.status='ยกเลิก';delete b.request;state.bills=state.bills.filter(x=>x.id!==b.billId||x.paid);})){closeModal();renderServices('bookings');toast('ยกเลิกการจองบริการแล้ว');}return;}
 if(a==='timeline-filter'){timelineCategory=b.dataset.category;return renderTimeline();}
 if(a==='new-post'){photos=[];return modal('แบ่งปันเรื่องราวกับเพื่อนบ้าน',`<form data-form="post">${select('category','หมวดหมู่',['ข่าวชุมชน','พูดคุย','ซื้อขาย','แจ้งเตือน'],'พูดคุย')}${area('text','เรื่องที่อยากแบ่งปัน','','required maxlength="3000"')}${upload('ภาพประกอบ',1)}${submit('เผยแพร่โพสต์')}</form>`);}
 if(a==='like'){if(commit(()=>{const p=state.posts.find(p=>p.id===id);p.liked=!p.liked;p.likes+=p.liked?1:-1;})){const scroll=window.scrollY;renderTimeline(routeParts[1]);window.scrollTo(0,scroll);}return;}
 if(a==='comment')return modal('เพิ่มความคิดเห็น',`<form data-form="comment" data-id="${id}">${area('text','ความคิดเห็น','','required maxlength="1000"')}${submit('ส่งความคิดเห็น')}</form>`);
 if(a==='shop-filter'){shopCategory=b.dataset.category;return renderShopping();}
 if(a==='product-sheet'){cartQuantity=1;const p=products.find(x=>x.id===id);return modal('เพิ่มลงรถเข็น',`<div class="service-card"><span class="product-art">${art(p.type,p.color)}</span><div class="grow"><h3>${p.name}</h3><p class="price">฿${money(p.price)}</p><p>คงเหลือ ${p.stock} ชิ้น</p></div></div><div class="row between" style="margin:20px 0"><span>จำนวน</span>${quantityControl(id,cartQuantity,'sheet-quantity')}</div>${btn('เพิ่มลงรถเข็น','add-cart',`data-id="${id}"`,'full')}`);}
 if(a==='sheet-quantity'){const p=products.find(x=>x.id===id);cartQuantity=Math.max(1,Math.min(p.stock,cartQuantity+Number(b.dataset.delta)));$('#modal #quantity-value').textContent=cartQuantity;return;}
 if(a==='add-cart'){const p=products.find(x=>x.id===id),existing=state.cart.find(x=>x.id===id);if((existing?.quantity||0)+cartQuantity>p.stock)return toast('จำนวนในรถเข็นรวมเกินสินค้าคงเหลือ');if(commit(()=>{if(existing)existing.quantity+=cartQuantity;else state.cart.push({id,quantity:cartQuantity,selected:false});})){closeModal();toast('เพิ่มลงรถเข็นแล้ว');}return;}
 if(a==='cart-quantity'){const c=state.cart.find(x=>x.id===id),p=products.find(x=>x.id===id),quantity=c.quantity+Number(b.dataset.delta);if(quantity<1)return;if(quantity>p.stock)return toast('จำนวนสูงสุด '+p.stock+' ชิ้น');if(commit(()=>c.quantity=quantity))renderCart();return;}
 if(a==='remove-cart'){if(commit(()=>state.cart=state.cart.filter(x=>x.id!==id))){renderCart();toast('ลบสินค้าออกจากรถเข็นแล้ว');}return;}
 if(a==='order-received'){if(commit(()=>state.orders.find(x=>x.id===id).status='ได้รับสินค้าแล้ว')){renderOrders(routeParts[1]);toast('ยืนยันรับสินค้าจำลองแล้ว');}return;}
 if(a==='cancel-order')return confirmDialog('ยกเลิกคำสั่งซื้อ','สินค้าจะยังไม่ถูกจัดส่ง การคืนเงินในต้นแบบไม่มีผลกับเงินจริง','confirm-cancel-order',id);
 if(a==='confirm-cancel-order'){if(commit(()=>state.orders.find(x=>x.id===id).status='ยกเลิกแล้ว')){closeModal();renderOrders(routeParts[1]);toast('ยกเลิกคำสั่งซื้อแล้ว');}return;}
 if(a==='open-notification'){const n=personalNotifications().find(x=>x.id===id);if(n&&commit(()=>markNotificationRead(n)))go(n.route);return;}
 if(a==='read-notifications'){if(commit(()=>personalNotifications().forEach(markNotificationRead))){renderNotifications();toast('อ่านการแจ้งเตือนของคุณทั้งหมดแล้ว');}return;}
 if(a==='clear-notifications')return confirmDialog('ล้างการแจ้งเตือน','ล้างเฉพาะการแจ้งเตือนของคุณ สมาชิกคนอื่นยังเห็นรายการเดิม','confirm-clear-notifications');
 if(a==='confirm-clear-notifications'){if(commit(()=>personalNotifications().forEach(n=>{n.hiddenFor ||= [];n.hiddenFor.push(notificationKey());}))){closeModal();toast('ล้างการแจ้งเตือนแล้ว');}return;}
 if(a==='export'){download('bannayuu-demo-backup.json',JSON.stringify(state,null,2),'application/json');toast('ส่งออกข้อมูลแล้ว');return;}
 if(a==='reset-ask')return confirmDialog('เริ่มนำเสนอใหม่','รายการ รูปภาพ และการตั้งค่าที่เพิ่มจะถูกลบ และคืนข้อมูลตัวอย่างเริ่มต้นทั้งหมด','reset-confirm');
 if(a==='reset-confirm'){const previous=state;state=seed();if(save()){vehicleDraft={};introStep=0;shopCategory='ทั้งหมด';timelineCategory='ทั้งหมด';closeModal();go('home');toast('คืนข้อมูลตัวอย่างแล้ว');}else state=previous;return;}
 if(a==='download-receipt'){const r=state.bills.find(x=>x.id===id);download('receipt-'+id+'.html',exportDocument('ใบเสร็จรับเงินสาธิต',detail([['เลขที่','RC-'+id],['รายการ',r.title],['บ้านเลขที่',house().number],['ชำระวันที่',dateLabel(r.paidAt)],['วิธีชำระ',r.method],['ยอดรวม',money(r.amount)+' บาท']])),'text/html;charset=utf-8');toast('ดาวน์โหลดใบเสร็จแล้ว');return;}

 if(a==='download-pet')return downloadCard('pet',id);
 if(a==='download-pass')return downloadCard('pass',id);
});
function exportDocument(title,body){return `<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>body{max-width:650px;margin:40px auto;padding:25px;font:16px/1.9 Tahoma,sans-serif;color:#204d40}.details{display:grid;grid-template-columns:1fr 1fr;gap:12px;border-top:1px solid #ddd;padding-top:20px}small{color:#888}</style><h1>${esc(title)}</h1>${body}<hr><small>บ้านน่าอยู่ · เอกสารสาธิต ไม่มีผลในระบบจริง</small></html>`;}
async function downloadCard(type,id){
 const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=630;const ctx=canvas.getContext('2d');ctx.fillStyle=type==='pet'?'#e3ecd9':'#e7efe9';ctx.fillRect(0,0,1000,630);ctx.fillStyle='#1d5847';ctx.font='bold 38px Tahoma';
 const load=src=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=src;});
 try{
 if(type==='pet'){const p=state.pets.find(x=>x.id===id);ctx.fillStyle=['#e7edda','#dcefe5','#eae5f2'][p.theme||0];ctx.fillRect(0,0,1000,630);ctx.fillStyle='#1d5847';ctx.fillText(['PAWTOPIA · PET CARD','Bannayuu Next’S PET CARD','MY LITTLE COMPANION'][p.theme||0],55,75);if(p.photo){const img=await load(p.photo);const side=Math.min(img.width,img.height);ctx.drawImage(img,(img.width-side)/2,(img.height-side)/2,side,side,55,125,330,330);}ctx.font='bold 40px Tahoma';ctx.fillText(p.thai,430,175);ctx.font='25px Tahoma';[p.english,p.species+' · '+p.breed,'เกิด '+dateLabel(p.birth),p.sex+' · '+p.weight+' กก. · '+p.color].forEach((t,i)=>ctx.fillText(t,430,235+i*55));ctx.fillStyle='#3a7b63';ctx.fillRect(0,530,1000,100);ctx.fillStyle='#fff';ctx.font='23px Tahoma';ctx.fillText('บ้านน่าอยู่ · Where Every Paw Matters',50,588);}
 else{const v=state.visitors.find(x=>x.id===id);ctx.fillText('i-Pass · DEMO',55,75);ctx.font='30px Tahoma';ctx.fillText(v.name,55,135);ctx.font='23px Tahoma';ctx.fillText(house().project,55,180);const lines=passFlipped?['ด้านหลังบัตร','ทะเบียน '+v.plate,'จังหวัด '+v.province,'บ้านเลขที่ '+house().number,v.note||'—']:['ด้านหน้าบัตร','บ้านเลขที่ '+house().number,'เริ่มต้น '+dateLabel(v.start),'สิ้นสุด '+dateLabel(v.end),v.id];lines.forEach((t,i)=>ctx.fillText(t,55,260+i*50));if(!passFlipped){const svg=qrSvg(v.id);const url='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);const im=await load(url);ctx.drawImage(im,650,180,290,290);}ctx.fillStyle='#324c46';ctx.fillRect(0,550,1000,80);ctx.fillStyle='#fff';ctx.font='23px Tahoma';ctx.fillText('บัตรสาธิต ไม่ใช่รหัสหรือสิทธิ์เข้าพื้นที่จริง',50,600);}
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));download(`${type}-${id}${type==='pass'?(passFlipped?'-back':'-front'):''}.png`,blob,'image/png');toast('บันทึกภาพบัตรแล้ว');
 }catch{toast('บันทึกภาพไม่สำเร็จ กรุณาลองใหม่');}
}
$('#modal').addEventListener('click',e=>{if(e.target===$('#modal')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeModal();}});
window.addEventListener('hashchange',render);
if(!location.hash)history.replaceState(null,'','#home');
render();
if(storageIssue)toast('ไม่สามารถอ่านข้อมูลเดิมได้ กำลังใช้ข้อมูลตัวอย่าง');



