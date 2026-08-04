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

  // 模拟安全数据实时变化 — 高灵敏度
  useEffect(() => {
    const interval = setInterval(() => {
      const minutes = drivingDurationRef.current / 60;

      // 疲劳评分：驾驶越久越低，但即使刚开始也有明显波动
      let baseFatigue;
      if (minutes < 5) {
        baseFatigue = 92 - minutes * 1;
      } else if (minutes < 15) {
        baseFatigue = 87 - (minutes - 5) * 1.2;
      } else if (minutes < 30) {
        baseFatigue = 75 - (minutes - 15) * 1;
      } else if (minutes < 60) {
        baseFatigue = 60 - (minutes - 30) * 0.6;
      } else {
        baseFatigue = Math.max(20, 42 - (minutes - 60) * 0.35);
      }
      // 加大随机波动，让变化立即可见
      const fatigueScore = Math.round(Math.max(20, Math.min(100, baseFatigue + (Math.random() * 12 - 6))));

      const fatigueRatio = 1 - fatigueScore / 100;
      // 各指标独立波动 + 疲劳基线影响，确保始终有明显变化
      const eyeClosureRate = +(Math.min(0.85, Math.max(0.02,
        0.05 + fatigueRatio * 0.4 + (Math.random() - 0.3) * 0.08
      ))).toFixed(2);
      const yawns = Math.random() < (0.15 + fatigueRatio * 0.5)
        ? Math.floor(Math.random() * 4) + 1
        : Math.floor(Math.random() * 2);
      const allGazes = ['前方', '前方', '仪表盘', '左后视镜', '右后视镜', '左侧', '右侧', '前方'];
      const gaze = allGazes[Math.floor(Math.random() * allGazes.length)];
      const distraction = gaze !== '前方' ? Math.floor(Math.random() * 10 + 2) : Math.floor(Math.random() * 3);
      const level = fatigueScore >= 80 ? 'normal' : fatigueScore >= 60 ? 'warning' : 'danger';
      const heartRate = Math.round(68 + fatigueRatio * 20 + (Math.random() - 0.3) * 12);

      setSafety(prev => {
        const now = new Date();
        const time = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`;
        const msg = level === 'normal'
          ? '驾驶状态良好'
          : level === 'warning'
            ? '检测到轻微疲劳，建议适当休息'
            : '疲劳程度较高，请尽快休息！';
        const newAlert = { time, type: level, message: msg };
        return {
          ...prev,
          fatigueScore,
          alertLevel: level,
          eyeClosureRate,
          yawnsPerMin: yawns,
          gazeDirection: gaze,
          distractionDuration: distraction,
          heartRate: Math.max(55, Math.min(135, heartRate)),
          alerts: [...prev.alerts.slice(-12), newAlert],
        };
      });
    }, 1200); // 1.2秒更新
    return () => clearInterval(interval);
  }, []);

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
