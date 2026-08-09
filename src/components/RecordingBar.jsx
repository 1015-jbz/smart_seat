import { Mic, Loader2, Volume2 } from 'lucide-react';

// 录音指示条：显示当前语音交互阶段
// phase: 'idle' | 'tts' | 'listening' | 'processing'
export default function RecordingBar({ phase, audioLevel = 0 }) {
  if (phase === 'idle') return null;

  // TTS 播放中：灰色静态条
  if (phase === 'tts') {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl animate-fade-in"
        style={{
          background: 'rgba(120,120,120,0.08)',
          border: '1px solid rgba(120,120,120,0.15)',
        }}>
        <Volume2 size={16} style={{ color: '#888' }} />
        <div className="flex-1 flex items-center gap-1.5">
          <div className="flex gap-1">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="rounded-full"
                style={{ width: 3, height: 12, background: 'rgba(120,120,120,0.3)' }} />
            ))}
          </div>
          <span className="text-xs font-medium" style={{ color: '#888' }}>小龙正在回复...</span>
        </div>
      </div>
    );
  }

  // 录音中：绿色脉冲波形
  if (phase === 'listening') {
    const bars = 24;
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl animate-fade-in"
        style={{
          background: 'rgba(52,211,153,0.08)',
          border: '1px solid rgba(52,211,153,0.2)',
        }}>
        <Mic size={16} style={{ color: '#34d399' }} className="animate-pulse" />
        <div className="flex-1 flex items-center gap-1">
          {Array.from({ length: bars }).map((_, i) => {
            const base = 4;
            const dynamic = audioLevel * 24;
            const variance = Math.sin(Date.now() / 100 + i * 0.5) * 0.5 + 0.5;
            const h = base + dynamic * variance;
            return (
              <div key={i} className="rounded-full transition-all duration-75"
                style={{
                  width: 2.5,
                  height: Math.max(3, h),
                  background: `rgba(52,211,153,${0.3 + audioLevel * 0.7})`,
                }} />
            );
          })}
          <span className="text-xs font-medium ml-2" style={{ color: '#059669' }}>请说话...</span>
        </div>
      </div>
    );
  }

  // 识别中：蓝色条
  if (phase === 'processing') {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl animate-fade-in"
        style={{
          background: 'rgba(79,140,255,0.08)',
          border: '1px solid rgba(79,140,255,0.2)',
        }}>
        <Loader2 size={16} style={{ color: '#4f8cff' }} className="animate-spin" />
        <span className="text-xs font-medium" style={{ color: '#4f8cff' }}>正在识别...</span>
      </div>
    );
  }

  return null;
}
