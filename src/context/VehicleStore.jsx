import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { vehicleData as initVehicle, safetyData as initSafety, weatherData as initWeather } from '../data/mockData';
import { fetchWeatherByCoords, isWeatherConfigured } from '../services/weatherApi';
import { api, createVehicleWebSocket } from '../services/api';

const VehicleContext = createContext();

// 城市坐标库（与后端 weather_proxy.py CITY_COORDS 保持一致）
export const CITY_COORDS = [
  // 直辖市 & 一线
  { lat: 39.9042, lon: 116.4074, name: '北京' },
  { lat: 31.2304, lon: 121.4737, name: '上海' },
  { lat: 23.1291, lon: 113.2644, name: '广州' },
  { lat: 22.5431, lon: 114.0579, name: '深圳' },
  { lat: 39.3434, lon: 117.3616, name: '天津' },
  { lat: 29.5630, lon: 106.5516, name: '重庆' },
  // 河北
  { lat: 37.0692, lon: 114.5048, name: '邢台' },
  { lat: 38.0428, lon: 114.5149, name: '石家庄' },
  { lat: 39.0842, lon: 117.2008, name: '廊坊' },
  { lat: 38.8671, lon: 115.4646, name: '保定' },
  { lat: 40.9781, lon: 117.9400, name: '承德' },
  { lat: 39.6047, lon: 118.1802, name: '唐山' },
  { lat: 39.5377, lon: 116.6837, name: '张家口' },
  { lat: 37.8455, lon: 112.5503, name: '太原' },
  // 沿海 & 华东
  { lat: 30.2741, lon: 120.1551, name: '杭州' },
  { lat: 32.0603, lon: 118.7969, name: '南京' },
  { lat: 31.8206, lon: 117.2272, name: '合肥' },
  { lat: 26.0745, lon: 119.2965, name: '福州' },
  { lat: 24.4798, lon: 118.0894, name: '厦门' },
  { lat: 36.0671, lon: 120.3826, name: '青岛' },
  { lat: 36.6512, lon: 117.1201, name: '济南' },
  { lat: 29.8683, lon: 121.5440, name: '宁波' },
  { lat: 31.2990, lon: 120.5853, name: '苏州' },
  { lat: 31.5688, lon: 120.3058, name: '无锡' },
  // 华中 & 西部
  { lat: 30.5728, lon: 104.0668, name: '成都' },
  { lat: 34.3416, lon: 108.9398, name: '西安' },
  { lat: 30.5928, lon: 114.3055, name: '武汉' },
  { lat: 28.2282, lon: 112.9388, name: '长沙' },
  { lat: 26.6470, lon: 106.6302, name: '贵阳' },
  { lat: 25.0389, lon: 102.7183, name: '昆明' },
  { lat: 36.0611, lon: 103.8343, name: '兰州' },
  { lat: 43.8171, lon: 87.6166, name: '乌鲁木齐' },
  { lat: 36.6171, lon: 101.7782, name: '西宁' },
  { lat: 38.4872, lon: 106.2309, name: '银川' },
  { lat: 40.8426, lon: 111.7519, name: '呼和浩特' },
  // 东北
  { lat: 45.8038, lon: 126.5350, name: '哈尔滨' },
  { lat: 43.8171, lon: 125.3235, name: '长春' },
  { lat: 41.8057, lon: 123.4315, name: '沈阳' },
  { lat: 38.9140, lon: 121.6147, name: '大连' },
  // 华南
  { lat: 22.8170, lon: 108.3669, name: '南宁' },
  { lat: 20.0174, lon: 110.3493, name: '海口' },
];

// 根据经纬度匹配最近城市
function findNearestCity(latitude, longitude) {
  let nearestCity = '北京';
  let minDist = Infinity;
  CITY_COORDS.forEach(city => {
    const dist = Math.sqrt(Math.pow(latitude - city.lat, 2) + Math.pow(longitude - city.lon, 2));
    if (dist < minDist) {
      minDist = dist;
      nearestCity = city.name;
    }
  });
  return nearestCity;
}

// 带超时的 fetch 封装
function fetchWithTimeout(url, ms = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

// IP 定位：浏览器原生 GPS 定位失败/被拒时的 fallback，不依赖任何权限。
// 国内 Chrome 的 getCurrentPosition 底层调 Google 服务基本不可用，IP 定位是更可靠的实时方案。
// 返回 { city, latitude, longitude } 或 null。
async function locateByIP() {
  // 方案1: 太平洋电脑网（国内稳定、免费、无需 key，返回中文城市名；GBK 编码需解码）
  try {
    const res = await fetchWithTimeout('https://whois.pconline.com.cn/ipJson.jsp?json=true', 5000);
    const buf = await res.arrayBuffer();
    const text = new TextDecoder('gb18030').decode(buf);
    const match = text.match(/\{[^}]+\}/);
    if (match) {
      const data = JSON.parse(match[0]);
      if (data.city) {
        // 模糊匹配城市库（pconline 返回"南京市"，库里有"南京"）
        const found = CITY_COORDS.find(c => data.city.includes(c.name) || c.name.includes(data.city));
        return {
          city: found ? found.name : data.city.replace(/市$/, ''),
          latitude: found ? found.lat : null,
          longitude: found ? found.lon : null,
        };
      }
    }
  } catch (e) { /* 静默，试下一个 */ }

  // 方案2: ipinfo.io（海外，返回经纬度，Cloudflare CDN 国内可访问）
  try {
    const res = await fetchWithTimeout('https://ipinfo.io/json', 5000);
    if (res.ok) {
      const data = await res.json();
      if (data && data.loc) {
        const [lat, lon] = data.loc.split(',').map(Number);
        return { city: findNearestCity(lat, lon), latitude: lat, longitude: lon };
      }
    }
  } catch (e) { /* 都失败 */ }

  return null;
}

export function VehicleProvider({ children }) {
  const [vehicle, setVehicle] = useState({ ...initVehicle });
  const [safety, setSafety] = useState({ ...initSafety, alerts: [...initSafety.alerts] });
  const [weather, setWeather] = useState({ ...initWeather, forecast: [...initWeather.forecast] });
  const drivingDurationRef = useRef(0); // 累计驾驶秒数
  const pausedRef = useRef(false); // 页面后台时暂停定时任务

  // WebSocket 相关引用
  const wsClientRef = useRef(null); // WebSocket 客户端实例
  const wsActiveRef = useRef(false); // WebSocket 是否正在推送数据（true 时跳过 mock 定时器）

  // 后端疲劳评分缓存：{ score, level, fetchedAt } | null
  // 后端调用频率受限，1.2s 间隔太密集，这里缓存最近一次结果供 safety 定时器使用
  const backendFatigueRef = useRef(null);
  const lastFatigueFetchRef = useRef(0); // 上次发起后端疲劳评分请求的时间戳

  // 车辆当前位置（全局共享，天气与导航共用）
  // source: 'gps' | 'ip' | 'manual' — 区分定位来源，UI 可展示精度差异
  const [location, setLocation] = useState({
    city: '北京', latitude: null, longitude: null,
    located: false, loading: false, error: null, denied: false,
    source: null, manual: false,
  });

  // 获取车辆当前位置：
  //   1. 浏览器原生 GPS（精度最高，~10米级）
  //   2. GPS 失败/超时/被拒 → 后端代理 IP 定位（pconline / ipinfo，城市级精度）
  //   3. 后端也失败 → 前端直连 IP 定位（备选方案）
  //   4. 全部失败 → 提示手动选择
  const refreshLocation = useCallback(() => {
    setLocation(prev => ({ ...prev, loading: true, error: null, denied: false, manual: false }));

    // 优先浏览器 GPS（高精度）
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          const city = findNearestCity(latitude, longitude);
          setLocation({ city, latitude, longitude, located: true, loading: false, error: null, denied: false, source: 'gps', manual: false });
        },
        (gpsError) => {
          // GPS 失败 → 降级到后端 IP 定位
          console.warn('[location] GPS 定位失败:', gpsError?.message || gpsError);
          fallbackToIP(gpsError);
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
      );
    } else {
      fallbackToIP(null);
    }

    async function fallbackToIP(gpsError) {
      // 方案 A: 后端 IP 定位代理（增加超时到 10s）
      try {
        const data = await api.location();
        if (data && data.city && data.latitude != null && data.longitude != null) {
          setLocation({
            city: data.city,
            latitude: data.latitude,
            longitude: data.longitude,
            located: true, loading: false, error: null, denied: false,
            source: 'ip', manual: false,
          });
          return;
        }
      } catch (_) { /* 后端不可用，继续 */ }

      // 方案 B: 前端直连 IP 定位
      const ipResult = await locateByIP();
      if (ipResult) {
        setLocation({ ...ipResult, located: true, loading: false, error: null, denied: false, source: 'ip', manual: false });
      } else {
        let msg = '定位失败，请手动选择城市';
        if (gpsError?.code === 1) msg = '定位权限被拒绝，请手动选择城市';
        setLocation(prev => ({ ...prev, loading: false, located: false, error: msg, denied: gpsError?.code === 1 }));
      }
    }
  }, []);

  // 应用启动时自动获取一次位置
  useEffect(() => {
    refreshLocation();
  }, [refreshLocation]);

  // 手动选择城市：定位失败或用户想切换城市时的可靠兜底，不依赖浏览器权限
  const setCity = useCallback((cityName) => {
    const found = CITY_COORDS.find(c => c.name === cityName);
    if (found) {
      setLocation({
        city: found.name,
        latitude: found.lat,
        longitude: found.lon,
        located: true,
        loading: false,
        error: null,
        denied: false,
        source: 'manual',
        manual: true,
      });
    }
  }, []);

  // 页面后台时暂停所有定时器，避免不可见标签页持续触发 setState 与 CPU 占用
  useEffect(() => {
    const onVisibilityChange = () => {
      const hidden = document.hidden;
      // 通过全局 ref 标记，供各 interval 自行判断是否跳过
      pausedRef.current = hidden;
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  // 驾驶时长计时器
  useEffect(() => {
    const timer = setInterval(() => {
      if (pausedRef.current) return;
      setVehicle(prev => {
        if (prev.isDriving) {
          drivingDurationRef.current += 1;
        } else {
          // 停车后缓慢恢复（每3秒减1秒驾驶时长）
          drivingDurationRef.current = Math.max(0, drivingDurationRef.current - 0.33);
        }
        return prev;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 模拟车辆数据实时变化（WebSocket 后端推送失败时的 fallback）
  useEffect(() => {
    const interval = setInterval(() => {
      if (pausedRef.current) return;
      setVehicle(prev => {
        // WebSocket 接管时跳过 mock，避免双源冲突
        if (wsActiveRef.current) return prev;
        if (!prev.isDriving) return prev;
        const speedDelta = Math.floor(Math.random() * 7) - 3;
        const newSpeed = Math.max(0, Math.min(200, prev.speed + speedDelta));
        const rpmDelta = Math.floor(Math.random() * 200) - 100;
        const newRpm = Math.max(800, Math.min(7000, prev.rpm + rpmDelta));
        const fuelDrop = Math.random() * 0.05;
        const newFuel = Math.max(0, +(prev.fuel - fuelDrop).toFixed(1));
        const waterTempDelta = Math.floor(Math.random() * 3) - 1;
        const newWaterTemp = Math.max(70, Math.min(110, prev.waterTemp + waterTempDelta));
        const tireChanges = prev.tirePressure.map(p => +(p + (Math.random() * 0.04 - 0.02)).toFixed(2));
        const mileageAdd = newSpeed > 0 ? +(newSpeed / 3600).toFixed(1) : 0;
        const batteryDrop = Math.random() * 0.02;
        const newBattery = Math.max(0, +(prev.battery - batteryDrop).toFixed(1));

        return {
          ...prev,
          speed: newSpeed,
          rpm: newRpm,
          fuel: newFuel,
          waterTemp: newWaterTemp,
          tirePressure: tireChanges,
          totalMileage: prev.totalMileage + mileageAdd,
          battery: newBattery,
        };
      });
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // WebSocket 实时车辆数据：连接 ws://localhost:8000/ws/vehicle
  // - 收到数据更新 vehicle state（speed/rpm/fuel/waterTemp/tirePressure）
  // - 页面不可见时暂停（关闭 WS），可见时恢复（重连）
  // - 断开 3s 后自动重连，最多 5 次；耗尽后 wsActiveRef=false，mock 定时器接管
  // - 组件卸载时关闭 WS
  useEffect(() => {
    let closedByUnmount = false;

    const connectWs = () => {
      if (closedByUnmount) return;
      // 上一次连接的清理
      if (wsClientRef.current) {
        try { wsClientRef.current.close(); } catch (_) { /* 静默 */ }
        wsClientRef.current = null;
      }

      wsClientRef.current = createVehicleWebSocket({
        onOpen: () => {
          wsActiveRef.current = true;
        },
        onMessage: (data) => {
          // 后端推送字段：{ timestamp, speed, rpm, fuel, temperature, tire_pressure: [fl,fr,rl,rr] }
          // 前端 vehicle 字段：speed/rpm/fuel/waterTemp/tirePressure（数组）
          // totalMileage/battery/isDriving 由前端继续维护，WS 不覆盖
          wsActiveRef.current = true;
          setVehicle(prev => {
            // 停车时冻结车辆数据，保持与 mock 定时器行为一致
            if (!prev.isDriving) return prev;
            const tirePressure = Array.isArray(data.tire_pressure) && data.tire_pressure.length === 4
              ? data.tire_pressure.map(p => +(+p).toFixed(2))
              : prev.tirePressure;
            // 行驶中按速度累积里程
            const mileageAdd = data.speed > 0 ? +(data.speed / 3600).toFixed(3) : 0;
            // 电量缓慢下降
            const batteryDrop = Math.random() * 0.02;
            return {
              ...prev,
              speed: Math.round(data.speed) || prev.speed,
              rpm: Math.round(data.rpm) || prev.rpm,
              fuel: data.fuel != null ? +(+data.fuel).toFixed(1) : prev.fuel,
              waterTemp: data.temperature != null ? Math.round(data.temperature) : prev.waterTemp,
              tirePressure,
              totalMileage: prev.totalMileage + mileageAdd,
              battery: Math.max(0, +(prev.battery - batteryDrop).toFixed(1)),
            };
          });
        },
        onClose: () => {
          // 重连耗尽：标记 WS 失活，mock 定时器接管
          wsActiveRef.current = false;
        },
        maxRetries: 5,
        retryDelay: 3000,
      });
    };

    connectWs();

    // 页面可见性变化：隐藏时关闭 WS 节省资源，可见时重连
    const onVisibilityChange = () => {
      if (document.hidden) {
        if (wsClientRef.current) {
          try { wsClientRef.current.close(); } catch (_) { /* 静默 */ }
          wsClientRef.current = null;
        }
        wsActiveRef.current = false;
      } else {
        connectWs();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      closedByUnmount = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (wsClientRef.current) {
        try { wsClientRef.current.close(); } catch (_) { /* 静默 */ }
        wsClientRef.current = null;
      }
      wsActiveRef.current = false;
    };
  }, []);

  // 模拟安全数据实时变化 — 基于真实驾驶时长与摄像头检测
  // 疲劳评分优先后端 GET /api/v1/safety/fatigue（每 5s 拉一次，缓存供 1.2s 定时器使用）
  // 后端失败时 fallback 到前端本地计算（保留原有逻辑）
  useEffect(() => {
    const interval = setInterval(() => {
      if (pausedRef.current) return;
      const minutes = drivingDurationRef.current / 60;
      const isDriving = vehicle.isDriving;

      // ===== 0. 异步拉取后端疲劳评分（每 5s 一次，不阻塞 1.2s 定时器）=====
      const nowMs = Date.now();
      if (isDriving && nowMs - lastFatigueFetchRef.current > 5000) {
        lastFatigueFetchRef.current = nowMs;
        api.fatigue({
          driving_minutes: minutes,
          continuous_minutes: minutes, // 前端未单独跟踪休息间隔，暂用累计时长
          break_count: 0,
        })
          .then((res) => {
            if (res && typeof res.score === 'number') {
              backendFatigueRef.current = { score: res.score, level: res.level, advice: res.advice, fetchedAt: Date.now() };
            } else {
              // 后端返回异常，清空缓存触发降级
              backendFatigueRef.current = null;
            }
          })
          .catch(() => { backendFatigueRef.current = null; });
      }

      // ===== 1. 驾驶时长影响（线性递减）=====
      let timeBasedFatigue;
      if (!isDriving || minutes < 1) {
        timeBasedFatigue = 95; // 刚启动或停车时状态良好
      } else if (minutes <= 30) {
        // 0-30分钟：轻微下降 95→85
        timeBasedFatigue = 95 - (minutes / 30) * 10;
      } else if (minutes <= 60) {
        // 30-60分钟：中度下降 85→70
        timeBasedFatigue = 85 - ((minutes - 30) / 30) * 15;
      } else if (minutes <= 120) {
        // 1-2小时：明显下降 70→50
        timeBasedFatigue = 70 - ((minutes - 60) / 60) * 20;
      } else {
        // 2小时以上：严重疲劳 50→25
        timeBasedFatigue = Math.max(25, 50 - ((minutes - 120) / 60) * 25);
      }

      // ===== 2. 摄像头面部识别指标（模拟真实检测）=====
      // 眨眼频率（正常0.1-0.2次/秒，疲劳时增加到0.4+）
      const blinkRate = isDriving ?
        Math.min(0.6, 0.12 + (1 - timeBasedFatigue / 100) * 0.35 + (Math.random() - 0.5) * 0.05) : 0.1;

      // 闭眼时长占比（正常<5%，疲劳时可达30%+）
      const eyeClosureRatio = isDriving ?
        Math.min(0.45, 0.03 + (1 - timeBasedFatigue / 100) * 0.32 + (Math.random() - 0.5) * 0.04) : 0.02;

      // 打哈欠次数/分钟（正常0-1次，疲劳时3-8次）
      const yawnFreq = isDriving ?
        Math.min(8, (1 - timeBasedFatigue / 100) * 6 + (Math.random() - 0.5) * 1) : 0;

      // 视线偏移检测（前方/仪表盘/后视镜/侧方/偏离）
      const gazeStates = ['前方', '前方', '前方', '前方', '仪表盘', '左后视镜', '右后视镜'];
      const fatigueGazeStates = ['前方', '仪表盘', '左侧', '右侧', '偏离', '偏离'];
      const gazePool = timeBasedFatigue > 70 ? gazeStates : fatigueGazeStates;
      const gazeDirection = gazePool[Math.floor(Math.random() * gazePool.length)];

      // 分心时长（秒）
      const distractionTime = gazeDirection === '前方' ?
        Math.floor(Math.random() * 2) :
        Math.floor(Math.random() * 8 + 3);

      // ===== 3. 综合疲劳评分 =====
      // 优先使用后端评分（10s 内有效）；否则用前端本地计算（时长70% + 面部30%）
      const backend = backendFatigueRef.current;
      const backendFresh = backend && (nowMs - backend.fetchedAt < 10000);
      let fatigueScore;
      if (backendFresh) {
        // 后端评分仅基于时长/夜间/连续驾驶；前端再叠加面部指标微调（10% 权重）
        const facialFatigue = Math.round(
          100 - (eyeClosureRatio * 100 * 0.4 + yawnFreq * 8 * 0.3 + (gazeDirection !== '前方' ? 15 : 0) * 0.3)
        );
        fatigueScore = Math.round(backend.score * 0.9 + Math.max(20, facialFatigue) * 0.1);
      } else {
        // 后端不可用：原有前端计算逻辑
        const facialFatigue = Math.round(
          100 - (eyeClosureRatio * 100 * 0.4 + yawnFreq * 8 * 0.3 + (gazeDirection !== '前方' ? 15 : 0) * 0.3)
        );
        fatigueScore = Math.round(timeBasedFatigue * 0.7 + Math.max(20, facialFatigue) * 0.3);
      }

      // ===== 4. 告警等级判断 =====
      const alertLevel = fatigueScore >= 75 ? 'normal' : fatigueScore >= 50 ? 'warning' : 'danger';

      // ===== 5. 心率（随疲劳上升）=====
      const heartRate = Math.round(
        72 + (1 - fatigueScore / 100) * 18 + (Math.random() - 0.5) * 8
      );

      setSafety(prev => {
        const now = new Date();
        const time = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`;

        let message;
        if (alertLevel === 'normal') {
          message = `驾驶${Math.floor(minutes)}分钟，状态良好`;
        } else if (alertLevel === 'warning') {
          message = `已驾驶${Math.floor(minutes)}分钟，检测到疲劳迹象，建议休息`;
        } else {
          message = `已连续驾驶${Math.floor(minutes)}分钟，疲劳程度高，请立即休息！`;
        }

        const newAlert = { time, type: alertLevel, message };
        return {
          ...prev,
          fatigueScore,
          alertLevel,
          eyeClosureRate: +(eyeClosureRatio.toFixed(2)),
          yawnsPerMin: Math.round(yawnFreq),
          gazeDirection,
          distractionDuration: distractionTime,
          heartRate: Math.max(60, Math.min(120, heartRate)),
          alerts: [...prev.alerts.slice(-12), newAlert],
        };
      });
    }, 1200); // 1.2秒更新
    return () => clearInterval(interval);
  }, [vehicle.isDriving]);

  // 定位成功后自动拉取真实天气
  // 优先级：后端 /weather/city/{name}（手动选城市）→ 后端 /weather?lat=&lon= → 前端直连 Open-Meteo
  const weatherLoadingRef = useRef(false);
  const loadRealWeather = useCallback(async () => {
    if (weatherLoadingRef.current) return;
    weatherLoadingRef.current = true;
    try {
      let result = null;

      // 1. 手动选择城市：优先后端 /weather/city/{name}
      if (location.manual && location.city) {
        result = await api.weatherByCity(location.city);
      }

      // 2. 经纬度查询：优先后端 /weather?lat=&lon=
      if (!result && location.latitude != null && location.longitude != null) {
        result = await api.weather(location.latitude, location.longitude);
      }

      // 3. 后端失败：fallback 到前端直连 Open-Meteo
      if (!result) {
        let lat = location.latitude;
        let lon = location.longitude;
        if (lat == null || lon == null) {
          const found = CITY_COORDS.find(c => c.name === location.city);
          if (found) { lat = found.lat; lon = found.lon; }
          else return;
        }
        result = await fetchWeatherByCoords(lat, lon);
      }

      if (result?.now) {
        setWeather(prev => ({
          ...prev,
          ...result.now,
          forecast: result.forecast.length > 0 ? result.forecast : prev.forecast,
          city: location.city,
        }));
      }
    } catch {
      /* 拉取失败保持现有数据 */
    } finally {
      weatherLoadingRef.current = false;
    }
  }, [location.city, location.latitude, location.longitude, location.manual]);

  // 定位成功（GPS/IP/手动）后触发一次真实天气拉取
  useEffect(() => {
    if (location.located) {
      loadRealWeather();
    }
  }, [location.located, location.city, location.latitude, location.longitude, loadRealWeather]);

  // 模拟天气数据兜底：仅在 Open-Meteo 拉取失败时才运行
  useEffect(() => {
    const interval = setInterval(() => {
      if (pausedRef.current) return;
      setWeather(prev => {
        if (prev.real) return prev; // 已有真实数据，mock 定时器停手
        const tempDelta = Math.floor(Math.random() * 3) - 1;
        const humidityDelta = Math.floor(Math.random() * 5) - 2;
        const windDelta = Math.floor(Math.random() * 4) - 2;
        return {
          ...prev,
          temperature: Math.max(15, Math.min(40, prev.temperature + tempDelta)),
          humidity: Math.max(20, Math.min(90, prev.humidity + humidityDelta)),
          windSpeed: Math.max(0, Math.min(50, prev.windSpeed + windDelta)),
        };
      });
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  // 每 15 分钟自动刷新一次真实天气
  useEffect(() => {
    const interval = setInterval(() => {
      if (pausedRef.current) return;
      if (location.located) {
        loadRealWeather();
      }
    }, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [location.located, loadRealWeather]);

  // 切换驾驶/停车状态。停车时保留驾驶时长用于疲劳恢复，开始驾驶时不清零继续累计。
  const toggleDriving = useCallback(() => {
    setVehicle(prev => ({ ...prev, isDriving: !prev.isDriving }));
  }, []);

  // 明确设置驾驶状态：true=开始驾驶，false=停车
  const setDriving = useCallback((value) => {
    setVehicle(prev => ({ ...prev, isDriving: value }));
  }, []);

  const getDrivingDuration = useCallback(() => drivingDurationRef.current, []);

  // 记录疲劳事件到后端 POST /api/v1/safety/fatigue/event
  // 静默降级：后端不可用时只 console.warn，不影响前端流程
  const recordFatigueEvent = useCallback(async ({ score, level, durationSeconds = 0, actionTaken = '', sessionId = null } = {}) => {
    try {
      await api.fatigueEvent({
        fatigue_score: score,
        level,
        duration_seconds: durationSeconds,
        action_taken: actionTaken,
        session_id: sessionId,
      });
    } catch (err) {
      console.warn('[VehicleStore] 记录疲劳事件失败:', err?.message || err);
    }
  }, []);

  return (
    <VehicleContext.Provider value={{
      vehicle, safety, weather, location,
      toggleDriving, setDriving, getDrivingDuration,
      refreshLocation, setCity, loadRealWeather, recordFatigueEvent,
    }}>
      {children}
    </VehicleContext.Provider>
  );
}

export function useVehicle() {
  const ctx = useContext(VehicleContext);
  if (!ctx) throw new Error('useVehicle must be used within VehicleProvider');
  return ctx;
}
