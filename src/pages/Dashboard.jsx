import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Cloud, Car, Heart, ThermometerSun, MessageCircle, User, Bot
} from 'lucide-react';
import { useVehicle } from '../context/VehicleStore';
import { useVoice } from '../context/VoiceStore';

export default function Dashboard() {
  const navigate = useNavigate();
  const { vehicle, safety, weather } = useVehicle();
  const { messages } = useVoice();
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

  const recentMessages = messages.filter(m => m.role !== 'system' && m.source !== 'alert').slice(-3);

  return (
    <div className="animate-fade-in flex flex-col items-center" style={{ minHeight: 'calc(100vh - 60px)' }}>
      {/* 大时钟区域 */}
      <div className="flex flex-col items-center animate-slide-up" style={{ marginTop: 48, marginBottom: 32 }}>
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
      <div className="w-full max-w-4xl grid grid-cols-4 gap-4 animate-slide-up" style={{ marginBottom: 32, animationDelay: '0.15s' }}>
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

      {/* 最近语音对话卡片 */}
      <div className="w-full max-w-4xl animate-slide-up" style={{ animationDelay: '0.2s' }}>
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <MessageCircle size={18} style={{ color: '#00d4ff' }} />
              <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-main)' }}>最近对话</h3>
            </div>
            <button
              onClick={() => navigate('/voice')}
              className="text-xs px-3 py-1 rounded-full transition-all"
              style={{ background: 'rgba(0,212,255,0.1)', color: '#00d4ff', border: '1px solid rgba(0,212,255,0.2)' }}
            >
              查看全部
            </button>
          </div>
          {recentMessages.length === 0 ? (
            <div className="text-center py-4 text-xs" style={{ color: 'var(--color-text-muted)' }}>
              暂无对话记录
            </div>
          ) : (
            <div className="space-y-2">
              {recentMessages.map((msg, i) => (
                <div key={i} className={`flex gap-2 text-xs ${msg.role === 'user' ? 'justify-end' : ''}`}>
                  <div className="flex gap-2 items-center max-w-full">
                    {msg.role !== 'user' && (
                      <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ background: 'rgba(244,114,182,0.15)' }}>
                        <Bot size={10} style={{ color: '#f472b6' }} />
                      </div>
                    )}
                    <div
                      className="px-3 py-1.5 rounded-lg max-w-[80%] truncate"
                      style={{
                        background: msg.role === 'user'
                          ? 'linear-gradient(135deg, rgba(0,212,255,0.2), rgba(0,255,136,0.1))'
                          : 'rgba(255,255,255,0.05)',
                        border: `1px solid ${msg.role === 'user' ? 'rgba(0,212,255,0.3)' : 'rgba(255,255,255,0.08)'}`,
                        color: 'var(--color-text-main)',
                      }}
                      title={msg.text}
                    >
                      {msg.text}
                    </div>
                    {msg.role === 'user' && (
                      <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ background: 'rgba(0,212,255,0.15)' }}>
                        <User size={10} style={{ color: '#00d4ff' }} />
                      </div>
                    )}
                  </div>
                  <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>{msg.time}</span>
                </div>
              ))}
            </div>
          )}
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
