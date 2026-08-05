import { CloudSun, Sun, Cloud, CloudRain, Droplets, Wind, Gauge, Eye, Thermometer, MapPin, RefreshCw, Loader2 } from 'lucide-react';
import { useVehicle } from '../context/VehicleStore';

const iconMap = {
  sun: Sun,
  cloud: Cloud,
  'cloud-rain': CloudRain,
};

export default function Weather() {
  const { weather, location, refreshLocation } = useVehicle();

  const details = [
    { icon: Droplets, label: '湿度', value: `${weather.humidity}%`, color: '#00d4ff' },
    { icon: Wind, label: '风速', value: `${weather.windSpeed} km/h`, color: '#00ff88' },
    { icon: Gauge, label: '气压', value: `${weather.pressure} hPa`, color: '#a78bfa' },
    { icon: Eye, label: '能见度', value: `${weather.visibility} km`, color: '#38bdf8' },
    { icon: Thermometer, label: '紫外线', value: `${weather.uvIndex} 级`, color: '#ffa502' },
  ];

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-1 section-header" style={{ color: 'var(--color-text-main)' }}>天气信息</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            实时天气与未来预报 · {location.loading ? '正在定位...' : location.error ? location.error : `当前定位：${location.city}`}
          </p>
        </div>
        <button onClick={refreshLocation} disabled={location.loading}
          className="flex items-center gap-2 px-4 py-2 rounded-full transition-all"
          style={{
            background: location.loading ? 'rgba(0,212,255,0.1)' : 'rgba(0,212,255,0.05)',
            border: '1px solid rgba(0,212,255,0.2)',
            color: location.loading ? '#00d4ff' : 'var(--color-text-secondary)',
          }}>
          {location.loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          <span className="text-xs font-medium">{location.loading ? '定位中' : '重新定位'}</span>
        </button>
      </div>

      <div className="grid grid-cols-3 gap-5">
        {/* Main Weather Card */}
        <div className="col-span-2 glass-card p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-10"
            style={{ background: 'radial-gradient(circle, #00d4ff, transparent)' }} />
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-4">
              <CloudSun size={20} style={{ color: '#38bdf8' }} />
              <span className="text-sm font-semibold">今日天气</span>
              <span className="ml-auto flex items-center gap-1 text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(0,212,255,0.15)', color: '#00d4ff' }}>
                <MapPin size={10} />
                {location.city}
              </span>
            </div>
            <div className="flex items-center gap-8">
              <div>
                <div className="text-7xl font-bold gradient-text">{weather.temperature}°</div>
                <div className="text-lg mt-1" style={{ color: 'var(--color-text-primary)' }}>{weather.condition}</div>
              </div>
              <div className="relative">
                <Sun size={100} style={{ color: '#ffa502', opacity: 0.8, filter: 'drop-shadow(0 0 20px rgba(255,165,2,0.4))' }} />
              </div>
            </div>
            <div className="grid grid-cols-5 gap-3 mt-6">
              {details.map(d => {
                const Icon = d.icon;
                return (
                  <div key={d.label} className="text-center p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
                    <Icon size={18} className="mx-auto mb-1.5" style={{ color: d.color }} />
                    <div className="text-xs mb-0.5" style={{ color: 'var(--color-text-secondary)' }}>{d.label}</div>
                    <div className="text-sm font-semibold" style={{ color: d.color }}>{d.value}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Side Info */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-4">出行建议</h3>
          <div className="space-y-3">
            <div className="p-3 rounded-xl" style={{ background: 'rgba(0,255,136,0.05)', border: '1px solid rgba(0,255,136,0.2)' }}>
              <div className="text-xs font-medium text-[var(--color-accent)] mb-1">驾驶条件：良好</div>
              <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                天气晴朗，能见度高，适合驾驶出行。
              </div>
            </div>
            <div className="p-3 rounded-xl" style={{ background: 'rgba(255,165,2,0.05)', border: '1px solid rgba(255,165,2,0.2)' }}>
              <div className="text-xs font-medium text-[var(--color-warning)] mb-1">紫外线：中等偏强</div>
              <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                建议开启遮阳板，佩戴太阳镜。
              </div>
            </div>
            <div className="p-3 rounded-xl" style={{ background: 'rgba(0,212,255,0.05)', border: '1px solid rgba(0,212,255,0.2)' }}>
              <div className="text-xs font-medium text-[var(--color-primary)] mb-1">车内温度建议</div>
              <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                室外温度较高，建议空调设定 22-24℃。
              </div>
            </div>
          </div>
        </div>

        {/* Forecast */}
        <div className="col-span-3 glass-card p-5">
          <h3 className="text-sm font-semibold mb-4">未来天气预报</h3>
          <div className="grid grid-cols-5 gap-4">
            {weather.forecast.map((day, i) => {
              const Icon = iconMap[day.icon] || CloudSun;
              return (
                <div
                  key={day.day}
                  className="text-center p-4 rounded-xl transition-all duration-300 hover:scale-105 animate-slide-in"
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid var(--color-border-glow)',
                    animationDelay: `${i * 0.1}s`,
                  }}
                >
                  <div className="text-sm font-medium mb-2">{day.day}</div>
                  <Icon size={32} className="mx-auto mb-2" style={{ color: day.icon === 'sun' ? '#ffa502' : '#38bdf8' }} />
                  <div className="text-xs mb-1" style={{ color: 'var(--color-text-secondary)' }}>{day.condition}</div>
                  <div className="text-lg font-bold text-[var(--color-primary)]">{day.temp}°</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
