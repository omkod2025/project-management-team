const TTL = 15 * 60 * 1000;
const MAX_AGE = 60 * 60 * 1000;
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
function createEnvironmentService({ fetcher = fetch, now = Date.now } = {}) {
  const cache = new Map(), pending = new Map(), cooldown = new Map();
  async function section(url, normalize) {
    const key = url.toString(), old = cache.get(key);
    const fallback = () => old && now() - old.at <= MAX_AGE ? { status: 'stale', fetchedAt: old.fetchedAt, error: 'โหลดข้อมูลล่าสุดไม่สำเร็จ', data: old.data } : { status: 'unavailable', fetchedAt: null, error: 'ไม่สามารถโหลดข้อมูลได้', data: null };
    if (old && now() - old.at < TTL) return { status: 'ok', fetchedAt: old.fetchedAt, error: null, data: old.data };
    if ((cooldown.get(key) || 0) > now()) return fallback();
    if (pending.has(key)) return pending.get(key);
    const request = (async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        let response;
        try { response = await fetcher(url, { signal: AbortSignal.timeout(10000) }); }
        catch { if (!attempt) continue; return fallback(); }
        if (response.status === 429) {
          const retry = response.headers.get('Retry-After');
          const delay = retry && /^\d+$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - now();
          cooldown.set(key, now() + (Number.isFinite(delay) ? Math.max(1000, delay) : TTL));
          return fallback();
        }
        if (response.status >= 500 && !attempt) continue;
        if (!response.ok) return fallback();
        try {
          const data = normalize(await response.json()), at = now(), fetchedAt = new Date(at).toISOString();
          cache.set(key, { data, at, fetchedAt });
          // Bound memory for arbitrary coordinate requests.
          if (cache.size > 256) cache.delete(cache.keys().next().value);
          if (cooldown.size > 256) cooldown.delete(cooldown.keys().next().value);
          return { status: 'ok', fetchedAt, error: null, data };
        } catch { return fallback(); }
      }
    })();
    pending.set(key, request);
    try { return await request; } finally { pending.delete(key); }
  }
  return async function environment(params) {
    const lat = params.get('latitude'), lon = params.get('longitude');
    const latitude = lat === null ? 13.7563 : Number(lat), longitude = lon === null ? 100.5018 : Number(lon);
    if ((lat === null) !== (lon === null) || (lat !== null && (!lat.trim() || !lon.trim())) || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return { status: 400, body: { error: 'พิกัดไม่ถูกต้อง กรุณาระบุ latitude และ longitude ให้ครบ' } };
    const common = { latitude, longitude, timezone: 'Asia/Bangkok' };
    const weather = new URL('https://api.open-meteo.com/v1/forecast');
    weather.search = new URLSearchParams({ ...common, current: 'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,is_day', hourly: 'temperature_2m,precipitation_probability,wind_speed_10m', daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max', forecast_days: 8, temperature_unit: 'celsius', wind_speed_unit: 'kmh' });
    const air = new URL('https://air-quality-api.open-meteo.com/v1/air-quality');
    air.search = new URLSearchParams({ ...common, current: 'us_aqi,us_aqi_pm2_5,pm2_5,pm10' });
    const [w, a] = await Promise.all([section(weather, normalizeWeather), section(air, normalizeAir)]);
    return { status: !w.data && !a.data ? 503 : 200, body: { location: common, weather: w, airQuality: a } };
  };
}
module.exports = { createEnvironmentService, normalizeWeather, normalizeAir };
