import { useState } from 'react';
import {
  Wind, Thermometer, Monitor, Volume2, Car, Lightbulb,
  Armchair, Zap, ChevronUp, ChevronDown
} from 'lucide-react';

export default function CabinControl() {
  const [acOn, setAcOn] = useState(true);
  const [acTemp, setAcTemp] = useState(24);
  const [windows, setWindows] = useState([false, false, false, false]);
  const [seatHeating, setSeatHeating] = useState(false);
  const [ambientLight, setAmbientLight] = useState(true);
  const [ambientColor, setAmbientColor] = useState('#00d4ff');
  const [drivingMode, setDrivingMode] = useState('comfort');
  const [volume, setVolume] = useState(35);

  const toggleWindow = (idx) => {
    const nw = [...windows];
    nw[idx] = !nw[idx];
    setWindows(nw);
  };

  const modes = [
    { id: 'comfort', name: '舒适模式', color: '#00d4ff', desc: '平衡动力与舒适性' },
    { id: 'sport', name: '运动模式', color: '#ff4757', desc: '最大化动力输出' },
    { id: 'eco', name: '经济模式', color: '#00ff88', desc: '最优能耗表现' },
  ];

  const colors = ['#00d4ff', '#00ff88', '#a78bfa', '#f472b6', '#ffa502', '#ff4757'];

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1 section-header" style={{ color: 'var(--color-text-main)' }}>座舱控制</h1>
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>硬件控制与驾驶模式设置</p>
      </div>

      <div className="grid grid-cols-3 gap-5">
        {/* AC Control */}
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Wind size={18} style={{ color: '#00d4ff' }} />
            <h3 className="text-sm font-semibold">空调控制</h3>
          </div>
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>电源开关</span>
            <button
              onClick={() => setAcOn(!acOn)}
              className={`w-12 h-6 rounded-full transition-all duration-300 ${acOn ? '' : ''}`}
              style={{
                background: acOn ? 'linear-gradient(90deg, #00d4ff, #00ff88)' : 'rgba(255,255,255,0.1)',
                boxShadow: acOn ? '0 0 12px rgba(0,212,255,0.4)' : 'none',
              }}
            >
              <div className={`w-5 h-5 rounded-full bg-white transition-transform duration-300 ${acOn ? 'translate-x-6' : 'translate-x-0.5'}`} />
            </button>
          </div>
          {acOn && (
            <div className="animate-fade-in">
              <div className="text-center mb-3">
                <div className="text-4xl font-bold text-[var(--color-primary)]">{acTemp}°</div>
                <div className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>设定温度</div>
              </div>
              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={() => setAcTemp(Math.max(16, acTemp - 1))}
                  className="w-10 h-10 rounded-xl flex items-center justify-center border border-[var(--color-border-glow)] hover:bg-[rgba(0,212,255,0.1)] transition-colors"
                >
                  <ChevronDown size={20} style={{ color: 'var(--color-primary)' }} />
                </button>
                <div className="flex-1">
                  <input
                    type="range" min="16" max="30" value={acTemp}
                    onChange={(e) => setAcTemp(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
                <button
                  onClick={() => setAcTemp(Math.min(30, acTemp + 1))}
                  className="w-10 h-10 rounded-xl flex items-center justify-center border border-[var(--color-border-glow)] hover:bg-[rgba(0,212,255,0.1)] transition-colors"
                >
                  <ChevronUp size={20} style={{ color: 'var(--color-primary)' }} />
                </button>
              </div>
              <div className="flex justify-between mt-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                <span>16℃</span><span>30℃</span>
              </div>
            </div>
          )}
        </div>

        {/* Window Control */}
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Monitor size={18} style={{ color: '#00ff88' }} />
            <h3 className="text-sm font-semibold">车窗控制</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {['左前', '右前', '左后', '右后'].map((label, i) => (
              <button
                key={label}
                onClick={() => toggleWindow(i)}
                className="p-3 rounded-xl border transition-all duration-300 text-center"
                style={{
                  borderColor: windows[i] ? '#ffa502' : 'var(--color-border-glow)',
                  background: windows[i] ? 'rgba(255,165,2,0.1)' : 'transparent',
                  boxShadow: windows[i] ? '0 0 12px rgba(255,165,2,0.2)' : 'none',
                }}
              >
                <Car size={20} className="mx-auto mb-1" style={{ color: windows[i] ? '#ffa502' : 'var(--color-text-secondary)' }} />
                <div className="text-xs font-medium">{label}</div>
                <div className="text-xs mt-0.5" style={{ color: windows[i] ? '#ffa502' : 'var(--color-text-secondary)' }}>
                  {windows[i] ? '已开启' : '已关闭'}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Ambient & Seat */}
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Lightbulb size={18} style={{ color: '#a78bfa' }} />
            <h3 className="text-sm font-semibold">舒适设置</h3>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Armchair size={16} style={{ color: 'var(--color-text-secondary)' }} />
                <span className="text-xs">座椅加热</span>
              </div>
              <button
                onClick={() => setSeatHeating(!seatHeating)}
                className="w-12 h-6 rounded-full transition-all duration-300"
                style={{
                  background: seatHeating ? 'linear-gradient(90deg, #ff4757, #ffa502)' : 'rgba(255,255,255,0.1)',
                  boxShadow: seatHeating ? '0 0 12px rgba(255,71,87,0.4)' : 'none',
                }}
              >
                <div className={`w-5 h-5 rounded-full bg-white transition-transform duration-300 ${seatHeating ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lightbulb size={16} style={{ color: 'var(--color-text-secondary)' }} />
                <span className="text-xs">氛围灯</span>
              </div>
              <button
                onClick={() => setAmbientLight(!ambientLight)}
                className="w-12 h-6 rounded-full transition-all duration-300"
                style={{
                  background: ambientLight ? `linear-gradient(90deg, ${ambientColor}, ${ambientColor}80)` : 'rgba(255,255,255,0.1)',
                  boxShadow: ambientLight ? `0 0 12px ${ambientColor}40` : 'none',
                }}
              >
                <div className={`w-5 h-5 rounded-full bg-white transition-transform duration-300 ${ambientLight ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </button>
            </div>
            {ambientLight && (
              <div className="animate-fade-in">
                <div className="text-xs mb-2" style={{ color: 'var(--color-text-secondary)' }}>灯光颜色</div>
                <div className="flex gap-2">
                  {colors.map(c => (
                    <button
                      key={c}
                      onClick={() => setAmbientColor(c)}
                      className="w-7 h-7 rounded-full transition-all duration-200"
                      style={{
                        background: c,
                        boxShadow: ambientColor === c ? `0 0 12px ${c}` : 'none',
                        border: ambientColor === c ? '2px solid white' : '2px solid transparent',
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Driving Mode */}
        <div className="col-span-2 glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Zap size={18} style={{ color: '#ffa502' }} />
            <h3 className="text-sm font-semibold">驾驶模式</h3>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {modes.map(mode => (
              <button
                key={mode.id}
                onClick={() => setDrivingMode(mode.id)}
                className="p-4 rounded-xl border transition-all duration-300 text-left"
                style={{
                  borderColor: drivingMode === mode.id ? mode.color : 'var(--color-border-glow)',
                  background: drivingMode === mode.id ? `${mode.color}15` : 'transparent',
                  boxShadow: drivingMode === mode.id ? `0 0 20px ${mode.color}20` : 'none',
                }}
              >
                <div className="text-sm font-semibold mb-1" style={{ color: drivingMode === mode.id ? mode.color : 'var(--color-text-primary)' }}>
                  {mode.name}
                </div>
                <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{mode.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Volume */}
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Volume2 size={18} style={{ color: '#f472b6' }} />
            <h3 className="text-sm font-semibold">音量设置</h3>
          </div>
          <div className="text-center mb-3">
            <span className="text-3xl font-bold text-[var(--color-primary)]">{volume}</span>
            <span className="text-sm ml-1" style={{ color: 'var(--color-text-secondary)' }}>/ 100</span>
          </div>
          <input
            type="range" min="0" max="100" value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between mt-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            <span>静音</span><span>最大</span>
          </div>
        </div>
      </div>
    </div>
  );
}
