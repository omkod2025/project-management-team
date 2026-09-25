'use strict';
// Static prototype login only; production authentication requires a server.
window.ResidentAuth = (() => {
 const KEY = 'bannayuu.session.v1';
 const DAY = 24 * 60 * 60 * 1000;
 let timer;
 function session() {
  try {
   const s = JSON.parse(localStorage.getItem(KEY));
   if(s?.username === 'cit' && Number.isFinite(s.createdAt) && s.createdAt <= Date.now() &&
      s.expiresAt === s.createdAt + DAY && Date.now() < s.expiresAt) return s;
  } catch {}
  return null;
 }
 function valid() { return !!session(); }
 function watch() {
  clearTimeout(timer);
  const s = session();
  if(s)timer = setTimeout(() => { render(); watch(); }, Math.max(1,s.expiresAt-Date.now()));
 }
 function show() {
  const app = document.getElementById('app');
  document.getElementById('shell').classList.add('login-shell');
  document.getElementById('navigation').hidden = true;
  if(document.getElementById('login-form'))return;
  document.title = 'เข้าสู่ระบบ · บ้านน่าอยู่';
  app.innerHTML = `<section class="login-page">
   <div class="login-brand"><img src="assets/mark.svg" width="44" height="44" alt=""><span>บ้านน่าอยู่<small>RESIDENT APP</small></span></div>
   <img class="login-scene" src="assets/community.svg" alt="บรรยากาศชุมชนบ้านน่าอยู่">
   <div class="login-content"><h1>ยินดีต้อนรับกลับบ้าน</h1><p class="muted">เข้าสู่ระบบเพื่อดูแลทุกเรื่องของบ้านคุณ</p>
   <form id="login-form">
    <label class="field"><span>ชื่อผู้ใช้</span><input name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required maxlength="80"></label>
    <label class="field"><span>รหัสผ่าน</span><div class="login-password"><input name="password" type="password" autocomplete="current-password" required maxlength="128"><button type="button" id="toggle-password" aria-label="แสดงรหัสผ่าน" aria-pressed="false">แสดง</button></div></label>
    <p id="login-error" class="login-error" role="alert"></p>
    <button type="submit" class="btn full">เข้าสู่ระบบ</button>
   </form><p class="login-session-note">จดจำการเข้าสู่ระบบบนอุปกรณ์นี้เป็นเวลา 1 วัน</p></div>
  </section>`;
  document.getElementById('toggle-password').onclick = event => {
   const input = app.querySelector('[name=password]');
   const visible = input.type === 'password';
   input.type = visible ? 'text' : 'password';
   event.currentTarget.textContent = visible ? 'ซ่อน' : 'แสดง';
   event.currentTarget.setAttribute('aria-label',visible?'ซ่อนรหัสผ่าน':'แสดงรหัสผ่าน');
   event.currentTarget.setAttribute('aria-pressed',String(visible));
  };
  document.getElementById('login-form').onsubmit = event => {
   event.preventDefault();
   const data = new FormData(event.currentTarget);
   const error = document.getElementById('login-error');
   if(data.get('username').trim() !== 'cit' || data.get('password') !== 'cit12345') {
    error.textContent = 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง กรุณาลองอีกครั้ง';return;
   }
   const createdAt = Date.now();
   try { localStorage.setItem(KEY,JSON.stringify({username:'cit',createdAt,expiresAt:createdAt+DAY})); }
   catch { error.textContent = 'บันทึกการเข้าสู่ระบบไม่ได้ กรุณาอนุญาตให้เบราว์เซอร์จัดเก็บข้อมูล';return; }
   watch();render();
  };
  app.focus({preventScroll:true});
 }
 document.addEventListener('click',event => {
  if(event.target.closest('[data-logout]')) {
   localStorage.removeItem(KEY);clearTimeout(timer);
   history.replaceState(null,'','#login');render();return;
  }
  if(!valid() && !event.target.closest('.login-page')) {event.preventDefault();event.stopImmediatePropagation();render();}
 },true);
 document.addEventListener('submit',event => {
  if(event.target.id!=='login-form' && !valid()){event.preventDefault();event.stopImmediatePropagation();render();}
 },true);
 window.addEventListener('storage',event => {if(event.key===KEY || event.key===null){watch();render();}});
 window.addEventListener('pageshow',() => {if(!valid())render();watch();});
 document.addEventListener('visibilitychange',() => {if(!document.hidden){if(!valid())render();watch();}});
 watch();
 return {valid,show};
})();
