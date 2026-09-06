/**
 * 全局迷你播放条：挂在 Layout 底部，切页面音乐不中断。
 * 仅在有曲目加载后显示。
 */
import { useNavigate } from 'react-router-dom';
import { Play, Pause, SkipBack, SkipForward, Repeat, Repeat1, Shuffle, Music2, Volume2, VolumeX } from 'lucide-react';
import { useMusic, coverOf, formatTime } from '../context/MusicStore';

const MODE_META = {
  sequence: { icon: Repeat, label: '顺序循环' },
  single: { icon: Repeat1, label: '单曲循环' },
  shuffle: { icon: Shuffle, label: '随机播放' },
};

export default function MiniPlayer() {
  const {
    currentSong, isPlaying, currentTime, duration,
    togglePlay, next, prev, seek, mode, cycleMode, buffering, playerError,
    volume, changeVolume,
  } = useMusic();
  const navigate = useNavigate();

  if (!currentSong) return null;

  const ModeIcon = MODE_META[mode]?.icon || Repeat;
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex-shrink-0 animate-fade-in" style={{
      borderTop: '1px solid var(--color-border)',
      background: 'var(--color-card-solid)',
      padding: '8px 24px',
      zIndex: 20,
    }}>
      <div className="flex items-center gap-4">
        {/* 封面 + 曲目信息（点击进音乐页） */}
        <button className="flex items-center gap-3 min-w-0" style={{ width: 260 }}
          onClick={() => navigate('/music')} title="打开音乐页">
          <div className="w-10 h-10 rounded-lg flex-shrink-0 flex items-center justify-center overflow-hidden"
            style={{ background: coverOf(currentSong) }}>
            {currentSong.cover
              ? <img src={currentSong.cover} alt="" className="w-full h-full object-cover" />
              : <Music2 size={18} color="#fff" />}
          </div>
          <div className="min-w-0 text-left">
            <div className="text-sm font-semibold truncate" style={{ color: 'var(--color-text-main)' }}>
              {currentSong.title}
            </div>
            <div className="text-xs truncate" style={{ color: 'var(--color-text-secondary)' }}>
              {currentSong.artist}
            </div>
          </div>
        </button>

        {/* 控制按钮 */}
        <div className="flex items-center gap-2">
          <button onClick={prev} title="上一首"
            className="w-8 h-8 rounded-full flex items-center justify-center transition-transform hover:scale-110"
            style={{ color: 'var(--color-text-secondary)' }}>
            <SkipBack size={16} />
          </button>
          <button onClick={togglePlay} title={isPlaying ? '暂停' : '播放'}
            className="w-9 h-9 rounded-full flex items-center justify-center transition-transform hover:scale-110"
            style={{
              background: 'linear-gradient(135deg, var(--color-primary), var(--color-accent))',
              boxShadow: '0 0 10px rgba(0,212,255,0.3)',
              color: '#0a0e1a',
            }}>
            {isPlaying ? <Pause size={16} /> : <Play size={16} style={{ marginLeft: 2 }} />}
          </button>
          <button onClick={() => next()} title="下一首"
            className="w-8 h-8 rounded-full flex items-center justify-center transition-transform hover:scale-110"
            style={{ color: 'var(--color-text-secondary)' }}>
            <SkipForward size={16} />
          </button>
          <button onClick={cycleMode} title={`播放模式：${MODE_META[mode]?.label || ''}`}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-transform hover:scale-110"
            style={{ color: mode === 'sequence' ? 'var(--color-text-secondary)' : 'var(--color-primary)' }}>
            <ModeIcon size={15} />
          </button>
        </div>

        {/* 进度条 */}
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <span className="text-xs font-mono flex-shrink-0" style={{ color: 'var(--color-text-secondary)' }}>
            {formatTime(currentTime)}
          </span>
          <input type="range" min={0} max={duration || 0} step={0.1} value={currentTime}
            onChange={(e) => seek(Number(e.target.value))}
            className="w-full" style={{ accentColor: 'var(--color-primary)' }}
            aria-label="播放进度" />
          <span className="text-xs font-mono flex-shrink-0" style={{ color: 'var(--color-text-secondary)' }}>
            {formatTime(duration)}
          </span>
        </div>

        {/* 音量控制 */}
        <div className="hidden md:flex items-center gap-1.5 flex-shrink-0" style={{ width: 130 }}>
          <button onClick={() => changeVolume(volume > 0 ? 0 : 0.7)}
            title={volume > 0 ? '静音' : '取消静音'}
            className="flex-shrink-0" style={{ color: 'var(--color-text-secondary)' }}>
            {volume > 0 ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
          <input type="range" min={0} max={1} step={0.01} value={volume}
            onChange={(e) => changeVolume(Number(e.target.value))}
            className="w-full" style={{ accentColor: 'var(--color-primary)' }}
            aria-label="音量" title={`音量 ${Math.round(volume * 100)}%`} />
        </div>

        {/* 状态标签 */}
        <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full flex-shrink-0"
          style={{ background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.2)' }}>
          <span className={`status-dot ${isPlaying ? 'online' : 'offline'}`} />
          <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            {buffering ? '缓冲中…' : isPlaying ? '播放中' : '已暂停'}
          </span>
        </div>
      </div>

      {/* 播放错误提示（音源失败/被浏览器拦截时可见） */}
      {playerError && (
        <div className="text-xs mt-1" style={{ color: '#f87171' }}>{playerError}</div>
      )}

      {/* 底部细进度线 */}
      <div className="mt-1.5 h-0.5 rounded-full overflow-hidden" style={{ background: 'rgba(120,120,120,0.15)' }}>
        <div className="h-full transition-all duration-300" style={{
          width: `${progress}%`,
          background: 'linear-gradient(90deg, var(--color-primary), var(--color-accent))',
        }} />
      </div>
    </div>
  );
}
