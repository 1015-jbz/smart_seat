import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { vehicleData as initVehicle, safetyData as initSafety, weatherData as initWeather } from '../data/mockData';

const VehicleContext = createContext();

export function VehicleProvider({ children }) {
  const [vehicle, setVehicle] = useState({ ...initVehicle });
  const [safety, setSafety] = useState({ ...initSafety, alerts: [...initSafety.alerts] });
  const [weather, setWeather] = useState({ ...initWeather, forecast: [...initWeather.forecast] });
  const drivingDurationRef = useRef(0); // 累计驾驶秒数

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

  const getDrivingDuration = useCallback(() => drivingDurationRef.current, []);

  return (
    <VehicleContext.Provider value={{ vehicle, safety, weather, toggleDriving, getDrivingDuration }}>
      {children}
    </VehicleContext.Provider>
  );
}

export function useVehicle() {
  const ctx = useContext(VehicleContext);
  if (!ctx) throw new Error('useVehicle must be used within VehicleProvider');
  return ctx;
}
