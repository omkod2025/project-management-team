const { chromium } = require('C:/Users/ouan-dev/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const section = data => ({ status: 'ok', fetchedAt: new Date().toISOString(), error: null, data });
const daily = Array.from({ length: 8 }, (_, i) => ({ date: `2026-09-${24 + i <= 30 ? 24 + i : 'XX'}`, weatherCode: [61, 63, 3, 95, 2, 0, 1, 3][i], temperatureMaxC: 29 + i, temperatureMinC: 24 }));
daily[7].date = '2026-10-01';
const fixture = { weather: section({ current: { time: '2026-09-24T10:15:00+07:00', temperatureC: 27, humidityPercent: 88, windSpeedKmh: 13, weatherCode: 2, isDay: true, precipitationProbabilityPercent: 13 }, daily, hourly: daily.flatMap((d, day) => Array.from({ length: 24 }, (_, hour) => ({ time: `${d.date}T${String(hour).padStart(2, '0')}:00:00+07:00`, temperatureC: hour === 5 ? null : 27 + Math.sin(hour / 4) * 3 + day, precipitationProbabilityPercent: day * 10 + hour, windSpeedKmh: hour / 2 }))) }), airQuality: section({ time: '2026-09-24T10:00:00+07:00', usAqi: 68, pm25Aqi: 54, pm25UgM3: 14.2, pm10UgM3: 26.8 }) };
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, timezoneId: 'America/Los_Angeles' });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    let response = fixture;
    await page.route('https://*.open-meteo.com/**', route => {
      const isAir = new URL(route.request().url()).hostname.startsWith('air-quality');
      const section = isAir ? response.airQuality : response.weather;
      if (!section?.data || section.status === 'stale') return route.fulfill({ status: 503, json: {} });
      const data = section.data, local = t => t?.replace('+07:00', '');
      if (isAir) return route.fulfill({ json: { current: { time: local(data.time), us_aqi: data.usAqi, us_aqi_pm2_5: data.pm25Aqi, pm2_5: data.pm25UgM3, pm10: data.pm10UgM3 } } });
      const c = data.current;
      const hourly = { time: data.hourly.map(h => local(h.time)), temperature_2m: data.hourly.map(h => h.temperatureC), precipitation_probability: data.hourly.map(h => h.precipitationProbabilityPercent), wind_speed_10m: data.hourly.map(h => h.windSpeedKmh) };
      const daily = { time: data.daily.map(d => d.date), weather_code: data.daily.map(d => d.weatherCode), temperature_2m_max: data.daily.map(d => d.temperatureMaxC), temperature_2m_min: data.daily.map(d => d.temperatureMinC) };
      return route.fulfill({ json: { current: { time: local(c.time), temperature_2m: c.temperatureC, relative_humidity_2m: c.humidityPercent, wind_speed_10m: c.windSpeedKmh, weather_code: c.weatherCode, is_day: 1 }, hourly, daily } });
    });
    await page.route('**/api/environment', () => { throw new Error('Unexpected backend call'); });
    await page.goto('http://localhost:4174/#home');
    await page.getByRole('button', { name: 'ปิดการแจ้งเตือนสายเข้า', exact: true }).click();
    await page.getByRole('button', { name: /สภาพอากาศและฝุ่น/ }).click();
    await page.locator('.wx-days button').last().waitFor();
    assert.equal(await page.locator('.wx-days button').count(), 8);
    await page.locator('.wx-days button').nth(1).click();
    assert.match(await page.locator('.wx-graph-date').innerText(), /25/);
    await page.getByRole('button', { name: 'โอกาสฝนตก', exact: true }).click();
    await page.locator('[data-wx="point"]').first().focus();
    assert.match(await page.locator('.wx-tooltip').innerText(), /00:00 น. · 10 %/);
    await page.getByRole('button', { name: 'ลม', exact: true }).click();
    await page.locator('[data-wx="point"]').first().click();
    assert.match(await page.locator('.wx-tooltip').innerText(), /0 km\/h/);
    assert.match(await page.locator('.wx-description').innerText(), /10:15/);
    const levels = await page.evaluate(() => [null, -1, 0, 50, 50.1, 100, 101, 150, 151, 200, 201, 300, 301].map(n => WeatherScreen.aqi(n)[2]));
    assert.deepEqual(levels, ['#6B7280','#6B7280','#00E400','#00E400','#FFFF00','#FFFF00','#FF7E00','#FF7E00','#FF0000','#FF0000','#8F3F97','#8F3F97','#7E0023']);
    await page.getByRole('button', { name: 'อุณหภูมิ', exact: true }).click();
    assert.equal(await page.locator('.wx-chart path[stroke]').count(), 2);
    fs.mkdirSync('.work/weather', { recursive: true });
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: `.work/weather/${width}.png`, fullPage: true });
    }
    response = { ...fixture, airQuality: { status: 'unavailable', data: null } };
    await page.reload(); await page.locator('.wx-days button').last().waitFor();
    assert.match(await page.locator('#wx-air').innerText(), /ลองใหม่/);
    response = { weather: { status: 'unavailable', data: null }, airQuality: section({ ...fixture.airQuality.data, usAqi: null, pm25UgM3: 0 }) };
    await page.getByRole('button', { name: 'ลองใหม่', exact: true }).click();
    await page.locator('.wx-aqi').waitFor();
    assert.match(await page.locator('.wx-aqi').innerText(), /ไม่มีข้อมูล/);
    assert.match(await page.locator('.wx-particles strong').first().innerText(), /^0/);
    response = { ...fixture, weather: { ...fixture.weather, status: 'stale' } };
    await page.evaluate(() => { const now = Date.now; Date.now = () => now() + 960000; document.dispatchEvent(new Event('visibilitychange')); });
    await page.locator('.wx-warning').waitFor();
    assert.deepEqual(errors, []);
    console.log('Weather browser tests passed: home entry, days/tabs/tooltips, timezone, AQI, gaps, partial failures, retry, stale, 320/390/1440 layouts.');
  } finally { await browser.close(); }
})();
