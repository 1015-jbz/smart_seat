import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Smile, Gauge, Settings, MessageCircle, Shield, CloudSun,
  Search, Cloud, Car, Heart, ThermometerSun, Calendar
} from 'lucide-react';
import { useVehicle } from '../context/VehicleStore';
import { emotionData } from '../data/mockData';

export default function Dashboard() {
  const navigate = useNavigate();
  const { vehicle, safety, weather } = useVehicle();
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const hours = time.getHours().toString().padStart(2, '0');
  const minutes = time.getMinutes().toString().padStart(2, '0');
  const dateStr = time.toLocaleDateString('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });

  // 模块图标配置
  const moduleIcons = [
    {
      icon: Smile,
      title: '表情识别',
      path: '/emotion',
      color: '#a78bfa',
      bg: 'linear-gradient(135deg, #c4b5fd, #a78bfa)',
      status: emotionData.faceDetected ? '检测中' : '离线',
    },
    {
      icon: Gauge,
      title: '车辆仪表',
      path: '/vehicle',
      color: '#3b82f6',
      bg: 'linear-gradient(135deg, #60a5fa, #3b82f6)',
      status: vehicle.isDriving ? '行驶中' : '已停车',
    },
    {
      icon: Settings,
      title: '座舱控制',
      path: '/cabin',
      color: '#10b981',
      bg: 'linear-gradient(135deg, #34d399, #10b981)',
      status: '正常',
    },
    {
      icon: MessageCircle,
      title: '语音助手',
      path: '/voice',
      color: '#f472b6',
      bg: 'linear-gradient(135deg, #f9a8d4, #f472b6)',
      status: '在线',
    },
    {
      icon: Shield,
      title: '安全监控',
      path: '/safety',
      color: safety.alertLevel === 'normal' ? '#10b981' : '#f59e0b',
      bg: safety.alertLevel === 'normal'
        ? 'linear-gradient(135deg, #34d399, #10b981)'
        : 'linear-gradient(135deg, #fbbf24, #f59e0b)',
      status: safety.alertLevel === 'normal' ? '安全' : '注意',
    },
    {
      icon: CloudSun,
      title: '天气信息',
      path: '/weather',
      color: '#0ea5e9',
      bg: 'linear-gradient(135deg, #38bdf8, #0ea5e9)',
      status: '已更新',
    },
  ];

  // 快捷状态卡片
  const quickWidgets = [
    {
      icon: Cloud,
      label: '天气',
      value: `${weather.temperature}°`,
      sub: weather.condition,
      color: '#0ea5e9',
      bg: 'linear-gradient(135deg, #e0f2fe, #bae6fd)',
    },
    {
      icon: Car,
      label: '车速',
      value: `${vehicle.speed}`,
      sub: 'km/h',
      color: '#3b82f6',
      bg: 'linear-gradient(135deg, #dbeafe, #bfdbfe)',
    },
    {
      icon: Heart,
      label: '疲劳评分',
      value: `${safety.fatigueScore}`,
      sub: safety.alertLevel === 'normal' ? '状态良好' : '需注意',
      color: safety.alertLevel === 'normal' ? '#10b981' : '#f59e0b',
      bg: safety.alertLevel === 'normal'
        ? 'linear-gradient(135deg, #d1fae5, #a7f3d0)'
        : 'linear-gradient(135deg, #fef3c7, #fde68a)',
    },
    {
      icon: ThermometerSun,
      label: '车内温度',
      value: '24°',
      sub: '空调已开',
      color: '#f97316',
      bg: 'linear-gradient(135deg, #ffedd5, #fed7aa)',
    },
  ];

  return (
    <div className="animate-fade-in flex flex-col items-center" style={{ minHeight: 'calc(100vh - 60px)' }}>
      {/* 大时钟区域 */}
      <div className="flex flex-col items-center animate-slide-up" style={{ marginTop: 48, marginBottom: 48 }}>
        <div className="flex items-baseline gap-1">
          <span className="font-light tracking-tight" style={{
            fontSize: 'clamp(64px, 10vw, 96px)',
            color: 'var(--color-text-main)',
            fontVariantNumeric: 'tabular-nums',
            lineHeight: 1,
          }}>
            {hours}
          </span>
          <span className="clock-colon font-light" style={{
            fontSize: 'clamp(48px, 8vw, 72px)',
            color: 'var(--color-text-muted)',
            lineHeight: 1,
          }}>
            :
          </span>
          <span className="font-light tracking-tight" style={{
            fontSize: 'clamp(64px, 10vw, 96px)',
            color: 'var(--color-text-main)',
            fontVariantNumeric: 'tabular-nums',
            lineHeight: 1,
          }}>
            {minutes}
          </span>
        </div>
        <div className="mt-2 text-base" style={{ color: 'var(--color-text-sub)' }}>
          {dateStr}
        </div>
      </div>

      {/* 快捷状态卡片行 */}
      <div className="w-full max-w-4xl grid grid-cols-4 gap-4 animate-slide-up" style={{ marginBottom: 56, animationDelay: '0.15s' }}>
        {quickWidgets.map((widget, i) => {
          const Icon = widget.icon;
          return (
            <div
              key={widget.label}
              className="glass-card p-4 flex items-center gap-3 cursor-pointer"
              style={{ animationDelay: `${0.2 + i * 0.05}s` }}
            >
              <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: widget.bg }}>
                <Icon size={20} style={{ color: widget.color }} />
              </div>
              <div className="min-w-0">
                <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{widget.label}</div>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-semibold tabular-nums" style={{ color: widget.color }}>
                    {widget.value}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--color-text-sub)' }}>{widget.sub}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 模块图标网格 */}
      <div className="w-full max-w-4xl animate-slide-up" style={{ marginTop: 20, animationDelay: '0.2s' }}>
        <div className="grid grid-cols-3 gap-x-16 gap-y-10 justify-items-center">
          {moduleIcons.map((mod) => {
            const Icon = mod.icon;
            return (
              <div
                key={mod.title}
                className="module-icon"
                onClick={() => navigate(mod.path)}
              >
                <div className="icon-box" style={{ background: mod.bg }}>
                  <Icon size={24} color="#fff" strokeWidth={2} />
                </div>
                <span className="icon-label">{mod.title}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 底部信息 */}
      <div className="mt-auto pt-8 pb-4 text-center animate-fade-in" style={{ animationDelay: '0.3s' }}>
        <div className="flex items-center justify-center gap-4 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          <span className="flex items-center gap-1.5">
            <span className="status-dot online" />
            系统在线
          </span>
          <span>·</span>
          <span>LoongArch 64</span>
          <span>·</span>
          <span>端侧 AI 就绪</span>
        </div>
      </div>
    </div>
  );
}
