/**
 * 统一后端 API 客户端
 *
 * - 封装 fetch：默认超时 5s，统一错误处理（失败返回 null，调用方走 fallback）
 * - 所有方法失败时返回 null，绝不抛错，方便业务层静默降级
 * - 后端返回的 snake_case 字段在业务方法内归一化为前端 camelCase
 *
 * 后端基址：http://localhost:8000
 *   - REST 前缀：/api/v1
 *   - 健康检查：/api/health
 *   - WebSocket：ws://localhost:8000/ws/vehicle
 */

// 后端服务地址（不含尾斜杠）
const BACKEND_ORIGIN = 'http://localhost:8000';
const API_BASE = `${BACKEND_ORIGIN}/api/v1`;
const WS_VEHICLE_URL = `ws://localhost:8000/ws/vehicle`;

// 默认请求超时（毫秒）
const DEFAULT_TIMEOUT = 5000;

/**
 * 带超时的 fetch 封装。
 * 失败（网络错误、超时、非 2xx）一律返回 null，由调用方降级。
 * @param {string} path 以 / 开头的相对路径（会拼到 API_BASE 后）
 * @param {RequestInit & {timeout?: number}} [options]
 * @returns {Promise<any|null>} 解析后的 JSON，失败返回 null
 */
async function apiFetch(path, options = {}) {
  const { timeout = DEFAULT_TIMEOUT, ...rest } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        // 仅当 body 是对象/字符串且未显式设置 Content-Type 时默认 JSON
        ...(rest.body && !rest.headers?.['Content-Type']
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...(rest.headers || {}),
      },
      ...rest,
    });
    if (!res.ok) {
      console.warn(`[api] ${path} 返回非 2xx: ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    // AbortError 也算超时/失败，统一静默
    console.warn(`[api] ${path} 请求失败:`, err?.message || err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ============ 天气字段归一化 ============
// 后端返回 snake_case，前端 weatherApi.js 期望 camelCase，这里做一次转换
function normalizeNow(now) {
  if (!now || typeof now !== 'object') return null;
  return {
    temperature: now.temperature,
    feelsLike: now.feels_like ?? now.feelsLike,
    condition: now.condition,
    icon: now.icon,
    humidity: now.humidity,
    windSpeed: now.wind_speed ?? now.windSpeed,
    windDir: now.wind_dir ?? now.windDir,
    windScale: now.wind_scale ?? now.windScale ?? '',
    pressure: now.pressure,
    visibility: now.visibility,
    cloud: now.cloud ?? null,
    dewPoint: now.dew_point ?? now.dewPoint ?? null,
    uvIndex: now.uv_index ?? now.uvIndex ?? null,
    real: now.real ?? true,
    updateTime: now.update_time ?? now.updateTime,
  };
}

function normalizeForecastDay(day) {
  if (!day || typeof day !== 'object') return null;
  return {
    date: day.date,
    day: day.day,
    tempMax: day.temp_max ?? day.tempMax,
    tempMin: day.temp_min ?? day.tempMin,
    condition: day.condition,
    icon: day.icon,
    windDirDay: day.wind_dir_day ?? day.windDirDay ?? '',
    windScaleDay: day.wind_scale_day ?? day.windScaleDay ?? '',
  };
}

function normalizeWeatherResponse(data) {
  if (!data || data.error) return null;
  const now = normalizeNow(data.now);
  if (!now) return null;
  const forecast = Array.isArray(data.forecast)
    ? data.forecast.map(normalizeForecastDay).filter(Boolean)
    : [];
  return { now, forecast };
}

// ============ 对外 API ============
export const api = {
  /** 健康检查 GET /api/health */
  health: async () => {
    // 健康检查端点不在 /api/v1 前缀下，单独 fetch
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);
    try {
      const res = await fetch(`${BACKEND_ORIGIN}/api/health`, { signal: controller.signal });
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      console.warn('[api] health 请求失败:', err?.message || err);
      return null;
    } finally {
      clearTimeout(timer);
    }
  },

  /** IP 定位代理 GET /location，返回 {city, latitude, longitude, pro, source?} 或 null */
  location: async () => {
    const data = await apiFetch('/location', { timeout: 10000 });
    if (!data || data.error) return null;
    return data;
  },

  /**
   * 经纬度查天气 GET /weather?lat=&lon=
   * 返回 { now, forecast }（已归一化为 camelCase）或 null
   */
  weather: async (lat, lon) => {
    const data = await apiFetch(`/weather?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`);
    return normalizeWeatherResponse(data);
  },

  /**
   * 按城市名查天气 GET /weather/city/{name}
   * 返回 { now, forecast, city } 或 null
   */
  weatherByCity: async (city) => {
    const data = await apiFetch(`/weather/city/${encodeURIComponent(city)}`);
    const normalized = normalizeWeatherResponse(data);
    if (!normalized) return null;
    return { ...normalized, city: data?.city || city };
  },

  /** 当前车辆状态 GET /vehicle/state */
  vehicleState: async () => {
    const data = await apiFetch('/vehicle/state');
    if (!data || data.error) return null;
    return data;
  },

  /**
   * 疲劳评分 GET /safety/fatigue?driving_minutes=&continuous_minutes=&break_count=
   * 返回 { score, level, advice, is_night, timestamp } 或 null
   */
  fatigue: async (params = {}) => {
    const qs = new URLSearchParams({
      driving_minutes: String(params.driving_minutes ?? 0),
      continuous_minutes: String(params.continuous_minutes ?? 0),
      break_count: String(params.break_count ?? 0),
    }).toString();
    const data = await apiFetch(`/safety/fatigue?${qs}`);
    if (!data || data.error) return null;
    return data;
  },

  /** 记录疲劳事件 POST /safety/fatigue/event */
  fatigueEvent: async (data) => {
    const res = await apiFetch('/safety/fatigue/event', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (!res || res.error) return null;
    return res;
  },

  /** 疲劳事件历史 GET /safety/fatigue/history */
  fatigueHistory: async (page = 1, pageSize = 20) => {
    const data = await apiFetch(`/safety/fatigue/history?page=${page}&page_size=${pageSize}`);
    if (!data || data.error) return null;
    return data;
  },

  /** 安全统计 GET /safety/stats */
  safetyStats: async () => {
    const data = await apiFetch('/safety/stats');
    if (!data || data.error) return null;
    return data;
  },

  /** 情绪记录历史 GET /emotion/records */
  emotionRecords: async (page = 1, pageSize = 20) => {
    const data = await apiFetch(`/emotion/records?page=${page}&page_size=${pageSize}`);
    if (!data || data.error) return null;
    return data;
  },

  /** 记录情绪识别结果 POST /emotion/records */
  createEmotionRecord: async (data) => {
    const res = await apiFetch('/emotion/records', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (!res || res.error) return null;
    return res;
  },

  /** 情绪统计 GET /emotion/stats */
  emotionStats: async (days = 7) => {
    const data = await apiFetch(`/emotion/stats?days=${days}`);
    if (!data || data.error) return null;
    return data;
  },

  /**
   * 实时表情检测 POST /emotion/detect
   * 发送 base64 图片（全帧或人脸裁剪），返回 ONNX 推理结果。
   *
   * @param {string} imageBase64 - base64 编码的 JPEG 图片
   * @param {boolean} detectFace - 是否在后端做人脸检测（false=前端已裁好人脸）
   * @returns {{emotion_zh, confidence, face_box, face_detected, all_scores, elapsed_ms}|null}
   */
  detectEmotion: async (imageBase64, detectFace = false) => {
    const res = await apiFetch('/emotion/detect', {
      method: 'POST',
      body: JSON.stringify({ image_base64: imageBase64, detect_face: detectFace }),
    });
    if (!res || res.error) return null;
    return res;
  },

  /** 驾驶会话列表 GET /driving/sessions */
  drivingSessions: async (page = 1, pageSize = 20) => {
    const data = await apiFetch(`/driving/sessions?page=${page}&page_size=${pageSize}`);
    if (!data || data.error) return null;
    return data;
  },

  /** 创建驾驶会话 POST /driving/sessions */
  createDrivingSession: async (data = {}) => {
    const res = await apiFetch('/driving/sessions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (!res || res.error) return null;
    return res;
  },

  /** 结束驾驶会话 PUT /driving/sessions/{id}/end */
  endDrivingSession: async (sessionId) => {
    const res = await apiFetch(`/driving/sessions/${sessionId}/end`, {
      method: 'PUT',
    });
    if (!res || res.error) return null;
    return res;
  },

  /** 驾驶统计 GET /driving/stats */
  drivingStats: async () => {
    const data = await apiFetch('/driving/stats');
    if (!data || data.error) return null;
    return data;
  },

  /**
   * AI 对话 POST /chat
   * @returns {{reply: string, source: 'deepseek'|'fallback'}|null}
   */
  chat: async (message, context = {}) => {
    const res = await apiFetch('/chat', {
      method: 'POST',
      body: JSON.stringify({ message, context }),
      timeout: 15000,
    });
    if (!res || res.error) return null;
    return res;
  },
};

// ============ WebSocket 客户端工厂 ============
/**
 * 创建车辆数据 WebSocket 客户端。
 *
 * 行为：
 *   - 连接 ws://localhost:8000/ws/vehicle
 *   - 收到消息调用 onMessage(data)
 *   - 断开后 3 秒自动重连，最多 maxRetries 次
 *   - 调用 close() 主动关闭，不再重连
 *
 * @param {(data: object) => void} onMessage 收到车辆数据回调
 * @param {() => void} [onClose]     最终重试耗尽/主动关闭时回调（用于触发 fallback）
 * @param {() => void} [onOpen]      连接成功时回调
 * @param {number} [maxRetries=5]    最大重试次数
 * @param {number} [retryDelay=3000] 重试间隔（毫秒）
 * @returns {{ close: () => void, isOpen: () => boolean }}
 */
export function createVehicleWebSocket({ onMessage, onClose, onOpen, maxRetries = 5, retryDelay = 3000 } = {}) {
  let ws = null;
  let retries = 0;
  let closedByUser = false;
  let reconnectTimer = null;

  const clearReconnectTimer = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const scheduleReconnect = () => {
    if (closedByUser) return;
    if (retries >= maxRetries) {
      console.warn(`[ws] 重连次数耗尽（${maxRetries}），切换 fallback`);
      onClose?.();
      return;
    }
    retries += 1;
    console.warn(`[ws] ${retryDelay}ms 后第 ${retries} 次重连...`);
    reconnectTimer = setTimeout(connect, retryDelay);
  };

  const connect = () => {
    if (closedByUser) return;
    try {
      ws = new WebSocket(WS_VEHICLE_URL);
    } catch (err) {
      console.warn('[ws] 构造失败:', err?.message || err);
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      retries = 0;
      console.info('[ws] 已连接 /ws/vehicle');
      onOpen?.();
    };

    ws.onmessage = (event) => {
      if (!event || typeof event.data !== 'string') return;
      try {
        const data = JSON.parse(event.data);
        if (data && !data.error) {
          onMessage(data);
        }
      } catch (err) {
        console.warn('[ws] 解析消息失败:', err?.message || err);
      }
    };

    ws.onerror = (err) => {
      console.warn('[ws] 错误:', err?.message || err);
    };

    ws.onclose = () => {
      ws = null;
      scheduleReconnect();
    };
  };

  connect();

  return {
    close() {
      closedByUser = true;
      clearReconnectTimer();
      if (ws) {
        try {
          ws.onclose = null; // 主动关闭不触发重连
          ws.close();
        } catch (_) { /* 静默 */ }
        ws = null;
      }
    },
    isOpen() {
      return ws !== null && ws.readyState === WebSocket.OPEN;
    },
  };
}

export default api;
