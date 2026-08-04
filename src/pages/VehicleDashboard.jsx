import { useState, useEffect } from 'react';
import { Gauge, Fuel, Thermometer, CircleDot, Timer, Play, Square } from 'lucide-react';
import { useVehicle } from '../context/VehicleStore';

function SpeedGauge({ speed }) {
  const radius = 80;
  const circumference = 2 * Math.PI * radius;
  const maxSpeed = 240;
  const percent = Math.min(speed / maxSpeed, 1);
  const dashOffset = circumference * (1 - percent * 0.75);

  const ticks = [];
  for (let i = 0; i <= 240; i += 20) {
    const angle = -225 + (i / 240) * 270;
    const rad = (angle * Math.PI) / 180;
    const inner = i % 40 === 0 ? 65 : 70;
    ticks.push(
      <g key={i}>
        <line
          x1={100 + inner * Math.cos(rad)} y1={100 + inner * Math.sin(rad)}
          x2={100 + 78 * Math.cos(rad)} y2={100 + 78 * Math.sin(rad)}
          stroke={i >= speed ? 'rgba(255,255,255,0.15)' : '#00d4ff'}
          strokeWidth={i % 40 === 0 ? 2 : 1}
        />
        {i % 40 === 0 && (
          <text
            x={100 + 56 * Math.cos(rad)} y={100 + 56 * Math.sin(rad)}
            textAnchor="middle" dominantBaseline="middle"
            fill="var(--color-text-secondary)" fontSize="9"
          >
            {i}
          </text>
        )}
      </g>
    );
  }

  const needleAngle = -225 + percent * 270;
  const needleRad = (needleAngle * Math.PI) / 180;

  return (
    <svg width="200" height="200" viewBox="0 0 200 200">
      <circle cx="100" cy="100" r="90" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="2" />
      <circle cx="100" cy="100" r={radius} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8"
        strokeDasharray={`${circumference * 0.75} ${circumference * 0.25}`}
        transform="rotate(-225 100 100)" strokeLinecap="round"
      />
      <circle cx="100" cy="100" r={radius} fill="none" stroke="#00d4ff" strokeWidth="8"
        strokeDasharray={circumference} strokeDashoffset={dashOffset}
        transform="rotate(-225 100 100)" strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.8s ease', filter: 'drop-shadow(0 0 8px rgba(0,212,255,0.5))' }}
      />
      {ticks}
      <line
        x1="100" y1="100"
        x2={100 + 60 * Math.cos(needleRad)} y2={100 + 60 * Math.sin(needleRad)}
        stroke="#ff4757" strokeWidth="2" strokeLinecap="round"
        style={{ transition: 'all 0.8s ease', filter: 'drop-shadow(0 0 4px rgba(255,71,87,0.6))' }}
      />
      <circle cx="100" cy="100" r="6" fill="#ff4757" />
      <circle cx="100" cy="100" r="3" fill="#0a0e1a" />
      <text x="100" y="140" textAnchor="middle" fill="#00d4ff" fontSize="28" fontWeight="bold">{speed}</text>
      <text x="100" y="155" textAnchor="middle" fill="var(--color-text-secondary)" fontSize="10">km/h</text>
    </svg>
  );
}

function MiniGauge({ value, max, label, unit, color, icon: Icon }) {
  const radius = 35;
  const circumference = 2 * Math.PI * radius;
  const percent = Math.min(value / max, 1);
  const dashOffset = circumference * (1 - percent * 0.75);

  return (
    <div className="flex flex-col items-center">
      <svg width="90" height="90" viewBox="0 0 90 90">
        <circle cx="45" cy="45" r={radius} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="5"
          strokeDasharray={`${circumference * 0.75} ${circumference * 0.25}`}
          transform="rotate(-225 45 45)" strokeLinecap="round"
        />
        <circle cx="45" cy="45" r={radius} fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={circumference} strokeDashoffset={dashOffset}
          transform="rotate(-225 45 45)" strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.8s ease', filter: `drop-shadow(0 0 4px ${color}60)` }}
        />
        <text x="45" y="42" textAnchor="middle" fill={color} fontSize="14" fontWeight="bold">{value}</text>
        <text x="45" y="55" textAnchor="middle" fill="var(--color-text-secondary)" fontSize="8">{unit}</text>
      </svg>
      <div className="flex items-center gap-1 mt-1">
        {Icon && <Icon size={12} style={{ color }} />}
        <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
      </div>
    </div>
  );
}

export default function VehicleDashboard() {
  const { vehicle, toggleDriving } = useVehicle();
  const [idleSeconds, setIdleSeconds] = useState(0);

  useEffect(() => {
    if (!vehicle.isDriving) {
      const timer = setInterval(() => setIdleSeconds(s => s + 1), 1000);
      return () => clearInterval(timer);
    } else {
      setIdleSeconds(0);
    }
  }, [vehicle.isDriving]);

  const formatIdleTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1 section-header" style={{ color: 'var(--color-text-main)' }}>车辆仪表盘</h1>
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>实时车辆运行状态监控</p>
      </div>

      <div className="grid grid-cols-3 gap-5">
        {/* Main Speed Gauge */}
        <div className="col-span-2 glass-card p-6 flex flex-col items-center">
          <div className="relative">
            <SpeedGauge speed={vehicle.speed} />
          </div>
          <div className="flex items-center gap-6 mt-4">
            <div className="text-center">
              <div className="text-xs mb-1" style={{ color: 'var(--color-text-secondary)' }}>行驶状态</div>
              <div className={`text-sm font-semibold ${vehicle.isDriving ? 'text-[var(--color-accent)]' : 'text-[var(--color-warning)]'}`}>
                {vehicle.isDriving ? '行驶中' : '已停车'}
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs mb-1" style={{ color: 'var(--color-text-secondary)' }}>怠速计时</div>
              <div className="text-sm font-semibold text-[var(--color-primary)] flex items-center gap-1">
                <Timer size={14} /> {formatIdleTime(idleSeconds)}
              </div>
            </div>
          </div>
          <div className="flex gap-3 mt-5">
            <button
              className={`glow-btn flex items-center gap-2 ${vehicle.isDriving ? 'active' : ''}`}
              onClick={toggleDriving}
            >
              <Play size={16} /> 开始驾驶
            </button>
            <button
              className={`glow-btn flex items-center gap-2 ${!vehicle.isDriving ? 'active' : ''}`}
              onClick={toggleDriving}
              style={!vehicle.isDriving ? { borderColor: '#ff4757', background: 'rgba(255,71,87,0.2)', color: '#ff4757' } : {}}
            >
              <Square size={16} /> 停车
            </button>
          </div>
        </div>

        {/* Right Panel - Mini Gauges */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>运行参数</h3>
          <div className="grid grid-cols-2 gap-4">
            <MiniGauge value={vehicle.rpm} max={8000} label="转速" unit="RPM" color="#ffa502" icon={Gauge} />
            <MiniGauge value={vehicle.fuel} max={100} label="油量" unit="%" color="#00ff88" icon={Fuel} />
            <MiniGauge value={vehicle.waterTemp} max={120} label="水温" unit="℃" color="#ff4757" icon={Thermometer} />
            <MiniGauge value={vehicle.battery} max={100} label="电量" unit="%" color="#00d4ff" icon={CircleDot} />
          </div>
        </div>

        {/* Bottom Panel */}
        <div className="col-span-2 glass-card p-5">
          <h3 className="text-sm font-semibold mb-4">胎压监测</h3>
          <div className="grid grid-cols-4 gap-4">
            {['左前', '右前', '左后', '右后'].map((label, i) => (
              <div key={label} className="text-center">
                <div className="text-xs mb-2" style={{ color: 'var(--color-text-secondary)' }}>{label}</div>
                <div className="relative w-16 h-16 mx-auto">
                  <svg width="64" height="64" viewBox="0 0 64 64">
                    <circle cx="32" cy="32" r="24" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="4" />
                    <circle cx="32" cy="32" r="24" fill="none" stroke={vehicle.tirePressure[i] >= 2.2 && vehicle.tirePressure[i] <= 2.6 ? '#00ff88' : '#ffa502'}
                      strokeWidth="4" strokeDasharray={`${(vehicle.tirePressure[i] / 3.5) * 150.8} 150.8`}
                      transform="rotate(-90 32 32)" strokeLinecap="round"
                      style={{ filter: 'drop-shadow(0 0 4px rgba(0,255,136,0.4))' }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-sm font-bold" style={{ color: '#00ff88' }}>{vehicle.tirePressure[i]}</span>
                  </div>
                </div>
                <div className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>bar</div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-4">车辆数据</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>总里程</span>
              <span className="text-sm font-semibold text-[var(--color-primary)]">{Math.round(vehicle.totalMileage).toLocaleString()} km</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>电池电量</span>
              <span className="text-sm font-semibold text-[var(--color-accent)]">{vehicle.battery}%</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>续航里程</span>
              <span className="text-sm font-semibold text-[var(--color-primary)]">~320 km</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>平均能耗</span>
              <span className="text-sm font-semibold text-[var(--color-warning)]">14.2 kWh/100km</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
