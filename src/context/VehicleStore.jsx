import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { vehicleData as initVehicle, safetyData as initSafety, weatherData as initWeather } from '../data/mockData';

const VehicleContext = createContext();

// 城市坐标库（用于根据经纬度匹配城市）
const CITY_COORDS = [
  { lat: 39.9, lon: 116.4, name: '北京' },
  { lat: 31.2, lon: 121.5, name: '上海' },
  { lat: 23.1, lon: 113.3, name: '广州' },
  { lat: 22.5, lon: 114.1, name: '深圳' },
  { lat: 30.6, lon: 104.1, name: '成都' },
  { lat: 34.3, lon: 108.9, name: '西安' },
  { lat: 30.3, lon: 120.2, name: '杭州' },
  { lat: 32.1, lon: 118.8, name: '南京' },
  { lat: 39.1, lon: 117.2, name: '天津' },
  { lat: 29.6, lon: 106.5, name: '重庆' },
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

export function VehicleProvider({ children }) {
  const [vehicle, setVehicle] = useState({ ...initVehicle });
  const [safety, setSafety] = useState({ ...initSafety, alerts: [...initSafety.alerts] });
  const [weather, setWeather] = useState({ ...initWeather, forecast: [...initWeather.forecast] });
  const drivingDurationRef = useRef(0); // 累计驾驶秒数

  // 车辆当前位置（全局共享，天气与导航共用）
  const [location, setLocation] = useState({ city: '北京', latitude: null, longitude: null, loading: false, error: null });

  // 获取车辆当前位置
  const refreshLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocation(prev => ({ ...prev, error: '浏览器不支持地理定位' }));
      return;
    }
    setLocation(prev => ({ ...prev, loading: true, error: null }));
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const city = findNearestCity(latitude, longitude);
        setLocation({ city, latitude, longitude, loading: false, error: null });
      },
      (error) => {
        let msg = '定位失败';
        if (error.code === 1) msg = '用户拒绝授权定位';
        else if (error.code === 2) msg = '位置信息不可用';
        else if (error.code === 3) msg = '定位超时';
        setLocation(prev => ({ ...prev, loading: false, error: msg }));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
    );
  }, []);

  // 应用启动时自动获取一次位置
  useEffect(() => {
    refreshLocation();
  }, [refreshLocation]);

  // 驾驶时长计时器
  useEffect(() => {
    const timer = setInterval(() => {
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

  // 模拟车辆数据实时变化
  useEffect(() => {
    const interval = setInterval(() => {
      setVehicle(prev => {
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

  // 模拟安全数据实时变化 — 基于真实驾驶时长与摄像头检测
  useEffect(() => {
    const interval = setInterval(() => {
      const minutes = drivingDurationRef.current / 60;
      const isDriving = vehicle.isDriving;

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

      // ===== 3. 综合疲劳评分（时长70% + 面部指标30%）=====
      const facialFatigue = Math.round(
        100 - (eyeClosureRatio * 100 * 0.4 + yawnFreq * 8 * 0.3 + (gazeDirection !== '前方' ? 15 : 0) * 0.3)
      );
      const fatigueScore = Math.round(timeBasedFatigue * 0.7 + Math.max(20, facialFatigue) * 0.3);

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

  // 模拟天气数据缓慢变化
  useEffect(() => {
    const interval = setInterval(() => {
      setWeather(prev => {
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

  const toggleDriving = useCallback(() => {
    setVehicle(prev => {
      if (prev.isDriving) {
        // 停车时保留驾驶时长（用于疲劳恢复）
      } else {
        // 开始驾驶时不清零，继续累计
      }
      return { ...prev, isDriving: !prev.isDriving };
    });
  }, []);

  // 明确设置驾驶状态：true=开始驾驶，false=停车
  const setDriving = useCallback((value) => {
    setVehicle(prev => ({ ...prev, isDriving: value }));
  }, []);

  const getDrivingDuration = useCallback(() => drivingDurationRef.current, []);

  return (
    <VehicleContext.Provider value={{ vehicle, safety, weather, location, toggleDriving, setDriving, getDrivingDuration, refreshLocation }}>
      {children}
    </VehicleContext.Provider>
  );
}

export function useVehicle() {
  const ctx = useContext(VehicleContext);
  if (!ctx) throw new Error('useVehicle must be used within VehicleProvider');
  return ctx;
}
