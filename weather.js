/* Weather screen: all model timestamps are interpreted in Bangkok. */
(() => {
  const valid = n => typeof n === 'number' && Number.isFinite(n);
  const value = (n, digits = 0) => valid(n) ? n.toLocaleString('th-TH', { maximumFractionDigits: digits }) : '—';
  const date = (time, options) => time ? new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', ...options }).format(new Date(time.length === 10 ? time + 'T12:00:00+07:00' : time)) : '—';
  const levels = [
    [50, 'คุณภาพอากาศดี', '#00E400'], [100, 'คุณภาพอากาศปานกลาง', '#FFFF00'],
    [150, 'มีผลต่อสุขภาพของกลุ่มเสี่ยง', '#FF7E00'], [200, 'มีผลต่อสุขภาพ', '#FF0000'],
    [300, 'มีผลต่อสุขภาพอย่างมาก', '#8F3F97'], [Infinity, 'อันตราย', '#7E0023']
  ];
  function aqi(n) { return valid(n) && n >= 0 ? levels.find(l => n <= l[0]) : [null, 'ไม่มีข้อมูล', '#6B7280']; }
  function condition(code, isDay = true) {
    if (code === 0) return ['ท้องฟ้าแจ่มใส', isDay === false ? '🌙' : '☀️'];
    if (code === 1 || code === 2) return [code === 1 ? 'มีเมฆเล็กน้อย' : 'มีเมฆบางส่วน', isDay === false ? '☁️' : '🌤️'];
    if (code === 3) return ['มีเมฆมาก', '☁️'];
    if ([45, 48].includes(code)) return ['มีหมอก', '🌫️'];
    if ([51, 53, 55].includes(code)) return ['ฝนปรอย', '🌦️'];
    if ([56, 57, 66, 67].includes(code)) return ['ฝนเยือกแข็ง', '🌨️'];
    if ([61, 63, 65].includes(code)) return [{ 61: 'ฝนเล็กน้อย', 63: 'ฝนปานกลาง', 65: 'ฝนหนัก' }[code], '🌧️'];
    if ([71, 73, 75, 77, 85, 86].includes(code)) return ['หิมะตก', '🌨️'];
    if ([80, 81, 82].includes(code)) return ['ฝนตกเป็นช่วง ๆ', '🌧️'];
    if ([95, 96, 99].includes(code)) return [code === 95 ? 'ฝนฟ้าคะนอง' : 'ฝนฟ้าคะนองและลูกเห็บ', '⛈️'];
    return ['ไม่มีข้อมูล', '—'];
  }
  const metrics = { temperatureC: ['อุณหภูมิ', '°C', '#a87912'], precipitationProbabilityPercent: ['โอกาสฝนตก', '%', '#287cad'], windSpeedKmh: ['ลม', 'km/h', '#067668'] };
const number = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const timestamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) ? value + '+07:00' : null;
function normalizeWeather(raw) {
  const c = raw.current || {}, h = raw.hourly || {}, d = raw.daily || {};
  if (!c.time && !h.time?.length && !d.time?.length) throw new Error('ไม่มีข้อมูลอากาศ');
  const index = (h.time || []).findIndex(time => time.slice(0, 13) === c.time?.slice(0, 13));
  return {
    current: { time: timestamp(c.time), temperatureC: number(c.temperature_2m), humidityPercent: number(c.relative_humidity_2m), windSpeedKmh: number(c.wind_speed_10m), weatherCode: number(c.weather_code), isDay: c.is_day === 1 ? true : c.is_day === 0 ? false : null, precipitationProbabilityPercent: number(h.precipitation_probability?.[index]) },
    hourly: (h.time || []).map((time, i) => ({ time: timestamp(time), temperatureC: number(h.temperature_2m?.[i]), precipitationProbabilityPercent: number(h.precipitation_probability?.[i]), windSpeedKmh: number(h.wind_speed_10m?.[i]) })),
    daily: (d.time || []).map((date, i) => ({ date, weatherCode: number(d.weather_code?.[i]), temperatureMaxC: number(d.temperature_2m_max?.[i]), temperatureMinC: number(d.temperature_2m_min?.[i]), precipitationProbabilityMaxPercent: number(d.precipitation_probability_max?.[i]) }))
  };
}
function normalizeAir(raw) {
  if (!raw.current?.time) throw new Error('ไม่มีข้อมูลคุณภาพอากาศ');
  const c = raw.current;
  return { time: timestamp(c.time), usAqi: number(c.us_aqi), pm25Aqi: number(c.us_aqi_pm2_5), pm25UgM3: number(c.pm2_5), pm10UgM3: number(c.pm10) };
}

  const directCache = new Map(), retryAfter = new Map();
  async function loadDirectSection(key, url, normalize, signal) {
    const old = directCache.get(key), now = Date.now();
    if (old && now - Date.parse(old.fetchedAt) < 900000) return old;
    const fallback = () => old && Date.now() - Date.parse(old.fetchedAt) <= 3600000
      ? { ...old, status: 'stale' } : { status: 'unavailable', data: null, fetchedAt: null };
    if (now < (retryAfter.get(key) || 0)) return fallback();
    try {
      const response = await fetch(url, { signal, credentials: 'omit' });
      if (response.status === 429) {
        const retry = response.headers.get('Retry-After');
        const delay = retry && /^\d+$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - Date.now();
        retryAfter.set(key, Date.now() + (Number.isFinite(delay) ? Math.max(1000, delay) : 900000));
      }
      if (!response.ok) throw new Error('Weather HTTP ' + response.status);
      const section = { status: 'ok', data: normalize(await response.json()), fetchedAt: new Date().toISOString() };
      if (!signal.aborted) directCache.set(key, section);
      return section;
    } catch { return fallback(); }
  }
  async function loadDirectEnvironment(signal) {
    const common = { latitude: 13.7563, longitude: 100.5018, timezone: 'Asia/Bangkok' };
    const weather = new URL('https://api.open-meteo.com/v1/forecast');
    weather.search = new URLSearchParams({ ...common, current: 'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,is_day', hourly: 'temperature_2m,precipitation_probability,wind_speed_10m', daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max', forecast_days: 8, temperature_unit: 'celsius', wind_speed_unit: 'kmh' });
    const air = new URL('https://air-quality-api.open-meteo.com/v1/air-quality');
    air.search = new URLSearchParams({ ...common, current: 'us_aqi,us_aqi_pm2_5,pm2_5,pm10' });

    const [w, a] = await Promise.all([
      loadDirectSection('weather', weather, normalizeWeather, signal),
      loadDirectSection('airQuality', air, normalizeAir, signal)
    ]);
    return { weather: w, airQuality: a };
  }

  let dispose;
  window.WeatherScreen = {
    aqi, condition,
    mount(root) {
      dispose?.();
      let data, selected, metric = 'temperatureC', loading = false, stopped = false, controller;
      root.innerHTML = `<div class="wx-location"><span>◎ &nbsp; กรุงเทพมหานคร</span><span>ประเทศไทย</span></div><section id="wx-weather" aria-label="สภาพอากาศ"></section><section id="wx-air" aria-label="คุณภาพอากาศ"></section><footer class="wx-footer">เวลาประเทศไทย (UTC+7) · อัปเดตอัตโนมัติทุก 15 นาที<br>ข้อมูลอากาศจาก <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> · คุณภาพอากาศจาก <a href="https://atmosphere.copernicus.eu/" target="_blank" rel="noreferrer">CAMS</a><br>ค่าฝุ่นเป็นค่าประมาณจากแบบจำลอง ไม่ใช่ค่าตรวจวัด ณ จุดที่อยู่</footer>`;
      const weather = root.querySelector('#wx-weather'), air = root.querySelector('#wx-air');
      const retry = () => `<button class="wx-retry" data-wx="retry" ${loading ? 'disabled' : ''}>${loading ? 'กำลังโหลด…' : 'ลองใหม่'}</button>`;
      function notice(section) { return section?.status === 'stale' ? `<p class="wx-warning" role="status">ข้อมูลเก่า · โหลดข้อมูลล่าสุดไม่สำเร็จ ${retry()}</p>` : ''; }
      function empty(section, title) { return `<div class="wx-empty" role="status"><h2>${title}</h2><p>${loading ? 'กำลังโหลดข้อมูล…' : 'ยังไม่มีข้อมูล กรุณาลองใหม่อีกครั้ง'}</p>${retry()}</div>`; }
      function graph() {
        const rows = (data?.weather?.data?.hourly || []).filter(r => r.time?.slice(0, 10) === selected);
        const [label, unit, color] = metrics[metric];
        const vals = rows.map(r => r[metric]).filter(valid);
        if (!vals.length) return `<div class="wx-empty">ไม่มีข้อมูล${label}สำหรับวันนี้ ${retry()}</div>`;
        const min = metric === 'temperatureC' ? Math.min(...vals) - 3 : 0;
        const max = metric === 'precipitationProbabilityPercent' ? 100 : Math.max(min + 1, ...vals) + 3;
        const points = rows.map(r => ({ x: 16 + Number(r.time.slice(11, 13)) / 23 * 608, y: valid(r[metric]) ? 125 - (r[metric] - min) / (max - min) * 90 : null }));
        const segments = []; let segment = [];
        points.forEach(p => { if (p.y === null) { if (segment.length) segments.push(segment); segment = []; } else segment.push(p); });
        if (segment.length) segments.push(segment);
        return `<div class="wx-chart" style="--chart-color:${color}"><svg viewBox="0 0 640 165" role="img" aria-label="${label}รายชั่วโมง ${date(selected, { day: 'numeric', month: 'long' })}">${segments.map(s => `<path d="M${s.map(p => `${p.x},${p.y}`).join(' L')} L${s.at(-1).x},133 L${s[0].x},133 Z" fill="${color}" opacity=".15"/><path d="M${s.map(p => `${p.x},${p.y}`).join(' L')}" fill="none" stroke="${color}" stroke-width="2.5"/>`).join('')}${points.map((p, i) => p.y === null ? '' : `<circle cx="${p.x}" cy="${p.y}" r="3" fill="${color}"/>${i % 3 === 0 ? `<text class="wx-point-label" x="${p.x}" y="${p.y - 12}" text-anchor="middle">${value(rows[i][metric])}</text>` : ''}`).join('')}${[0, 6, 12, 18, 23].map(h => `<text x="${16 + h / 23 * 608}" y="157" text-anchor="middle">${String(h).padStart(2, '0')}:00</text>`).join('')}</svg><div class="wx-chart-targets">${rows.map(r => `<button data-wx="point" aria-label="${r.time.slice(11, 16)} ${value(r[metric], 1)} ${unit}" data-time="${r.time.slice(11, 16)}" data-value="${value(r[metric], 1)} ${unit}"></button>`).join('')}</div></div><output class="wx-tooltip" aria-live="polite">แตะหรือเลื่อนบนกราฟเพื่อดูค่า · ${unit}</output>`;
      }
      function drawWeather() {
        const section = data?.weather, w = section?.data;
        if (!w) { weather.innerHTML = empty(section, 'สภาพอากาศปัจจุบัน'); return; }
        if (!w.daily.some(d => d.date === selected)) selected = w.daily[0]?.date || w.current.time?.slice(0, 10);
        const c = w.current, [text, glyph] = condition(c.weatherCode, c.isDay);
        weather.innerHTML = `${notice(section)}<div class="wx-current"><div><p class="wx-eyebrow">สภาพอากาศปัจจุบัน</p><div class="wx-temperature"><span class="wx-big-icon" aria-hidden="true">${glyph}</span><strong>${value(c.temperatureC)}</strong><span>°C</span></div></div><div class="wx-description"><h2>${text}</h2><p>${date(c.time, { weekday: 'long', hour: '2-digit', minute: '2-digit' })}</p></div></div><div class="wx-facts"><div><span>โอกาสฝนตกชั่วโมงนี้</span><strong>${value(c.precipitationProbabilityPercent)}<small> %</small></strong></div><div><span>ความชื้น</span><strong>${value(c.humidityPercent)}<small> %</small></strong></div><div><span>ความเร็วลม</span><strong>${value(c.windSpeedKmh, 1)}<small> km/h</small></strong></div></div><div class="wx-tabs" role="group" aria-label="เลือกข้อมูลรายชั่วโมง">${Object.entries(metrics).map(([key, m]) => `<button data-wx="metric" data-metric="${key}" aria-pressed="${key === metric}" class="${key === metric ? 'selected' : ''}">${m[0]}</button>`).join('')}</div><p class="wx-graph-date">${date(selected, { weekday: 'long', day: 'numeric', month: 'long' })} · 00:00–23:00 น.</p><div id="wx-graph">${graph()}</div><h2 class="wx-section-title">พยากรณ์ 8 วัน</h2><div class="wx-days" role="group" aria-label="เลือกวันพยากรณ์">${w.daily.map((d, i) => { const [label, icon] = condition(d.weatherCode); return `<button data-wx="day" data-date="${d.date}" aria-pressed="${selected === d.date}" aria-label="${date(d.date, { weekday: 'long', day: 'numeric', month: 'long' })} ${label}" class="${selected === d.date ? 'selected' : ''}"><span>${i === 0 ? 'วันนี้' : date(d.date, { weekday: 'short' })}</span><small>${date(d.date, { day: 'numeric', month: 'short' })}</small><span class="wx-day-icon" aria-hidden="true">${icon}</span><span>${value(d.temperatureMaxC)}° <em>${value(d.temperatureMinC)}°</em></span></button>`; }).join('') || `<p>ไม่มีข้อมูลพยากรณ์รายวัน ${retry()}</p>`}</div><p class="wx-timestamp">ข้อมูลอากาศ ${date(c.time, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} น.<br>ดึงข้อมูลเมื่อ ${date(section.fetchedAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} น.</p>`;
      }
      function drawAir() {
        const section = data?.airQuality, a = section?.data;
        if (!a) { air.innerHTML = empty(section, 'คุณภาพอากาศปัจจุบัน'); return; }
        const overall = aqi(a.usAqi), pm = aqi(a.pm25Aqi);
        air.innerHTML = `${notice(section)}<div class="wx-air-heading"><h2>คุณภาพอากาศปัจจุบัน</h2><span>US AQI</span></div><div class="wx-aqi"><strong>${value(a.usAqi)}</strong><div><span class="wx-level"><i style="background:${overall[2]}"></i>${overall[1]}</span><p>ดัชนีคุณภาพอากาศภาพรวม</p></div></div><div class="wx-scale" aria-hidden="true">${levels.map(l => `<span style="background:${l[2]}"></span>`).join('')}</div><div class="wx-scale-labels" aria-hidden="true"><span>ดี</span><span>อันตราย</span></div><div class="wx-particles"><div><h3>PM2.5 <span>ฝุ่นขนาดเล็ก</span></h3><strong>${value(a.pm25UgM3, 1)} <small>µg/m³</small></strong><p class="wx-level"><i style="background:${pm[2]}"></i>${pm[1]}</p><p>ดัชนีเฉพาะ PM2.5: ${value(a.pm25Aqi)}</p></div><div><h3>PM10 <span>ฝุ่นละออง</span></h3><strong>${value(a.pm10UgM3, 1)} <small>µg/m³</small></strong><p>ความเข้มข้นของฝุ่น<br>ขนาดไม่เกิน 10 ไมครอน</p></div></div><p class="wx-timestamp">ข้อมูลคุณภาพอากาศ ${date(a.time, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} น.<br>ดึงข้อมูลเมื่อ ${date(section.fetchedAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} น.</p>`;
      }
      function draw() { drawWeather(); drawAir(); }
      async function refresh() {
        if (loading || stopped) return;
        loading = true; draw(); controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 25000);
        try {
          const next = await loadDirectEnvironment(controller.signal);
          if (!next.weather || !next.airQuality) throw new Error('Missing sections');
          data = next;
        } catch {
          const unavailable = { status: 'unavailable', data: null };
          data = Object.fromEntries(['weather', 'airQuality'].map(key => {
            const old = data?.[key];
            return [key, old?.data && Date.now() - Date.parse(old.fetchedAt) <= 3600000 ? { ...old, status: 'stale' } : unavailable];
          }));
        } finally { clearTimeout(timeout); loading = false; if (!stopped) draw(); }
      }
      root.addEventListener('click', event => {
        const button = event.target.closest('[data-wx]'); if (!button) return;
        if (button.dataset.wx === 'retry') refresh();
        if (button.dataset.wx === 'day' || button.dataset.wx === 'metric') {
          const scroll = root.querySelector('.wx-days')?.scrollLeft || 0;
          if (button.dataset.wx === 'day') selected = button.dataset.date; else metric = button.dataset.metric;
          drawWeather(); root.querySelector('.wx-days').scrollLeft = scroll;
          root.querySelector(button.dataset.wx === 'day' ? `[data-date="${selected}"]` : `[data-metric="${metric}"]`)?.focus({ preventScroll: true });
        }
        showPoint(event);
      });
      function showPoint(event) { const point = event.target.closest('[data-wx="point"]'); if (point) root.querySelector('.wx-tooltip').textContent = `${point.dataset.time} น. · ${point.dataset.value}`; }
      root.addEventListener('pointerover', showPoint); root.addEventListener('focusin', showPoint);
      const timer = setInterval(() => { if (!document.hidden) refresh(); }, 900000);
      const visibility = () => { if (!document.hidden) refresh(); };
      document.addEventListener('visibilitychange', visibility);
      dispose = () => { stopped = true; controller?.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', visibility); };
      refresh(); return dispose;
    }
  };
})();
