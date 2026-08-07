/**
 * Open-Meteo 天气 API 服务层
 *
 * 特点：完全免费、无需注册、无需 API key、无调用次数限制、全球覆盖
 * 文档：https://open-meteo.com/en/docs
 */

// WMO 天气代码 → icon key + 中文描述
// 参考：https://open-meteo.com/en/docs
const WMO_MAP = {
  0: { icon: 'sun', desc: '晴' },
  1: { icon: 'cloud', desc: '大部晴朗' },
  2: { icon: 'cloud', desc: '多云' },
  3: { icon: 'cloud', desc: '阴' },
  45: { icon: 'cloud', desc: '雾' },
  48: { icon: 'cloud', desc: '雾凇' },
  51: { icon: 'cloud-rain', desc: '毛毛雨' },
  53: { icon: 'cloud-rain', desc: '毛毛雨' },
  55: { icon: 'cloud-rain', desc: '大毛毛雨' },
  56: { icon: 'cloud-rain', desc: '冻毛毛雨' },
  57: { icon: 'cloud-rain', desc: '强冻毛毛雨' },
  61: { icon: 'cloud-rain', desc: '小雨' },
  63: { icon: 'cloud-rain', desc: '中雨' },
  65: { icon: 'cloud-rain', desc: '大雨' },
  66: { icon: 'cloud-rain', desc: '冻雨' },
  67: { icon: 'cloud-rain', desc: '强冻雨' },
  71: { icon: 'cloud', desc: '小雪' },
  73: { icon: 'cloud', desc: '中雪' },
  75: { icon: 'cloud', desc: '大雪' },
  77: { icon: 'cloud', desc: '雪粒' },
  80: { icon: 'cloud-rain', desc: '阵雨' },
  81: { icon: 'cloud-rain', desc: '中阵雨' },
  82: { icon: 'cloud-rain', desc: '强阵雨' },
  85: { icon: 'cloud', desc: '小阵雪' },
  86: { icon: 'cloud', desc: '强阵雪' },
  95: { icon: 'cloud-rain', desc: '雷暴' },
  96: { icon: 'cloud-rain', desc: '雷暴伴小冰雹' },
  99: { icon: 'cloud-rain', desc: '雷暴伴大冰雹' },
};

const wmoToDesc = (code) => WMO_MAP[code]?.desc || '未知';
const wmoToIcon = (code) => WMO_MAP[code]?.icon || 'cloud';

/**
 * 已配置（Open-Meteo 无需 key，始终可用）
 */
export function isWeatherConfigured() {
  return true;
}

/**
 * 经纬度 → 实时天气 + 7 天预报
 * @param {number} lat
 * @param {number} lon
 * @returns {Promise<{now: object, forecast: Array}|null>}
 */
export async function fetchWeatherByCoords(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,pressure_msl,visibility,weather_code,is_day` +
    `&daily=temperature_2m_max,temperature_2m_min,weather_code` +
    `&timezone=Asia%2FShanghai&forecast_days=7`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();

    const c = data.current;
    const now = {
      temperature: Math.round(c.temperature_2m),
      feelsLike: Math.round(c.temperature_2m),
      condition: wmoToDesc(c.weather_code),
      icon: wmoToIcon(c.weather_code),
      humidity: c.relative_humidity_2m,
      windSpeed: Math.round(c.wind_speed_10m),
      windDir: degToDir(c.wind_direction_10m),
      windScale: '',
      pressure: Math.round(c.pressure_msl),
      visibility: c.visibility ? Math.round(c.visibility / 1000) : 10,
      cloud: null,
      dewPoint: null,
      uvIndex: null,
      real: true,
      updateTime: c.time,
    };

    const forecast = data.daily.time.map((dateStr, i) => ({
      date: dateStr,
      day: new Date(dateStr).getDay(),
      tempMax: Math.round(data.daily.temperature_2m_max[i]),
      tempMin: Math.round(data.daily.temperature_2m_min[i]),
      condition: wmoToDesc(data.daily.weather_code[i]),
      icon: wmoToIcon(data.daily.weather_code[i]),
      windDirDay: '',
      windScaleDay: '',
    }));

    return { now, forecast };
  } catch {
    return null;
  }
}

// 风向角度 → 中文方位
function degToDir(deg) {
  const dirs = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
  const idx = Math.round(deg / 45) % 8;
  return dirs[idx];
}
