/**
 * 音乐娱乐页：搜索曲库 / 风格筛选 / 点击播放 / 正在播放面板
 *
 * 曲库 = 本地音乐（用户放入 backend/music/ 的文件）+ 内置免费演示曲目。
 * 商业版权歌曲不内置，本地目录是合法扩充曲库的方式。
 */
import { useState, useMemo, useRef } from 'react';
import {
  Music2, Search, Play, Pause, SkipBack, SkipForward,
  Repeat, Repeat1, Shuffle, Volume2, RefreshCw, Mic2, FolderOpen, Loader2, Globe,
} from 'lucide-react';
import { useMusic, coverOf, formatTime } from '../context/MusicStore';
import { api } from '../services/api';

const MODE_META = {
  sequence: { icon: Repeat, label: '顺序循环' },
  single: { icon: Repeat1, label: '单曲循环' },
  shuffle: { icon: Shuffle, label: '随机播放' },
};

// 在线曲库（Jamendo）风格分类，后端会映射为英文标签搜索
const ONLINE_GENRES = ['综合热门', '流行', '摇滚', '电子', '爵士', '古典', '轻音乐', '民谣', '金属', '嘻哈', '氛围'];

function SongRow({ song, index, isCurrent, isPlaying, onPlay, onToggle }) {
  return (
    <div
      onClick={() => (isCurrent ? onToggle() : onPlay())}
      className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all group"
      style={{
        background: isCurrent ? 'rgba(0,212,255,0.08)' : 'transparent',
        border: `1px solid ${isCurrent ? 'rgba(0,212,255,0.25)' : 'transparent'}`,
      }}
    >
      <span className="w-6 text-xs font-mono text-center flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>
        {isCurrent ? (
          <span className="inline-flex items-end gap-0.5 h-3.5">
            <span className="w-0.5 bg-[var(--color-primary)] animate-pulse" style={{ height: isPlaying ? '100%' : '40%' }} />
            <span className="w-0.5 bg-[var(--color-primary)] animate-pulse" style={{ height: isPlaying ? '60%' : '30%', animationDelay: '0.15s' }} />
            <span className="w-0.5 bg-[var(--color-primary)] animate-pulse" style={{ height: isPlaying ? '85%' : '35%', animationDelay: '0.3s' }} />
          </span>
        ) : String(index + 1).padStart(2, '0')}
      </span>
      <div className="w-9 h-9 rounded-lg flex-shrink-0 flex items-center justify-center relative overflow-hidden"
        style={{ background: coverOf(song) }}>
        {song.cover
          ? <img src={song.cover} alt="" className="w-full h-full object-cover" />
          : <Music2 size={15} color="#fff" />}
        <span className="absolute inset-0 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ background: 'rgba(0,0,0,0.35)' }}>
          {isCurrent && isPlaying ? <Pause size={14} color="#fff" /> : <Play size={14} color="#fff" />}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate" style={{ color: isCurrent ? 'var(--color-primary)' : 'var(--color-text-main)' }}>
          {song.title}
        </div>
        <div className="text-xs truncate" style={{ color: 'var(--color-text-secondary)' }}>{song.artist}</div>
      </div>
      <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
        style={{
          background: song.source === 'local' ? 'rgba(52,211,153,0.1)' : 'rgba(167,139,250,0.1)',
          color: song.source === 'local' ? '#34d399' : '#a78bfa',
        }}>
        {song.genre}
      </span>
      <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
        style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--color-text-muted)' }}>
        {song.source === 'local' ? '本地' : song.source === 'jamendo' ? '在线' : '演示'}
      </span>
    </div>
  );
}

export default function MusicPlayer() {
  const {
    library, libraryLoading, localDir, refreshLibrary,
    currentSong, isPlaying, currentTime, duration, volume, mode,
    playSong, togglePlay, next, prev, seek, changeVolume, cycleMode,
  } = useMusic();

  const [keyword, setKeyword] = useState('');
  const [genre, setGenre] = useState('全部');
  const [refreshing, setRefreshing] = useState(false);

  // ===== 在线曲库（Jamendo）状态 =====
  const [tab, setTab] = useState('local');
  const [onlineResults, setOnlineResults] = useState([]);
  const [onlineLoading, setOnlineLoading] = useState(false);
  const [onlineError, setOnlineError] = useState('');
  const [onlineTag, setOnlineTag] = useState('综合热门');
  const onlineLoadedRef = useRef(false);

  const genres = useMemo(() => {
    const set = new Set(library.map(t => t.genre));
    return ['全部', ...set];
  }, [library]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return library.filter(t => {
      const genreOk = genre === '全部' || t.genre === genre;
      const kwOk = !kw || t.title.toLowerCase().includes(kw)
        || t.artist.toLowerCase().includes(kw) || t.genre.toLowerCase().includes(kw);
      return genreOk && kwOk;
    });
  }, [library, keyword, genre]);

  const localCount = useMemo(() => library.filter(t => t.source === 'local').length, [library]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshLibrary();
    setRefreshing(false);
  };

  // ===== 在线曲库：热门榜 / 搜索 =====
  const applyOnlineData = (data) => {
    onlineLoadedRef.current = true;
    setOnlineLoading(false);
    if (!data) {
      setOnlineError('在线曲库请求失败，请检查网络连接');
      setOnlineResults([]);
      return;
    }
    if (data.error) {
      setOnlineError(data.error);
      setOnlineResults([]);
      return;
    }
    setOnlineError('');
    setOnlineResults(data.tracks || []);
  };

  const loadOnlineHot = async (tag) => {
    setOnlineTag(tag);
    setKeyword('');
    setOnlineLoading(true);
    setOnlineError('');
    const data = await api.musicOnlineHot(tag === '综合热门' ? '' : tag);
    applyOnlineData(data);
  };

  const handleOnlineSearch = async () => {
    const q = keyword.trim();
    if (!q) return;
    setOnlineTag('');
    setOnlineLoading(true);
    setOnlineError('');
    const data = await api.musicOnlineSearch(q);
    applyOnlineData(data);
  };

  const switchTab = (next) => {
    setTab(next);
    if (next === 'online' && !onlineLoadedRef.current) loadOnlineHot('综合热门');
  };

  const handlePlayAll = () => {
    const list = tab === 'local' ? filtered : onlineResults;
    if (list.length === 0) return;
    playSong(list[0], list);
  };

  const ModeIcon = MODE_META[mode]?.icon || Repeat;
  const nowCover = coverOf(currentSong);

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-1 section-header" style={{ color: 'var(--color-text-main)' }}>音乐娱乐</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            语音点歌 · 本地曲库 {library.length} 首（本地 {localCount} 首）+ 在线曲库数十万首（Jamendo CC 授权）
          </p>
        </div>
        <button onClick={handleRefresh} disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm transition-all"
          style={{
            background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.25)',
            color: 'var(--color-primary)',
          }}>
          {refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          刷新曲库
        </button>
      </div>

      <div className="grid grid-cols-3 gap-5" style={{ height: 'calc(100vh - 190px)' }}>
        {/* 曲库列表 */}
        <div className="col-span-2 glass-card p-5 flex flex-col">
          {/* 搜索栏 */}
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-muted)' }} />
              <input type="text" value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && tab === 'online') handleOnlineSearch(); }}
                placeholder={tab === 'online' ? '搜索在线曲库，回车搜索（英文歌名/歌手效果更佳）…' : '搜索歌名 / 歌手 / 风格…'}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm outline-none transition-all"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid var(--color-border-glow)',
                  color: 'var(--color-text-primary)',
                }} />
            </div>
            <button onClick={handlePlayAll} disabled={filtered.length === 0}
              className="px-4 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 transition-all"
              style={{
                background: filtered.length ? 'linear-gradient(135deg, var(--color-primary), var(--color-accent))' : 'rgba(255,255,255,0.05)',
                color: filtered.length ? '#0a0e1a' : 'var(--color-text-muted)',
              }}>
              <Play size={14} /> 播放全部
            </button>
          </div>

          {/* 曲库来源切换 */}
          <div className="flex items-center gap-2 mb-3">
            {[{ key: 'local', label: '本地曲库' }, { key: 'online', label: '在线曲库（Jamendo）' }].map(({ key, label }) => (
              <button key={key} onClick={() => switchTab(key)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5"
                style={{
                  background: tab === key ? 'rgba(0,212,255,0.12)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${tab === key ? 'var(--color-primary)' : 'var(--color-border-glow)'}`,
                  color: tab === key ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                }}>
                {key === 'online' && <Globe size={12} />}
                {label}
              </button>
            ))}
            {tab === 'online' && (
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>CC 授权免费曲目 · 点击即播</span>
            )}
          </div>

          {/* 风格筛选（本地）/ 热门分类（在线） */}
          <div className="flex flex-wrap gap-2 mb-3">
            {(tab === 'local' ? genres : ONLINE_GENRES).map(g => {
              const active = tab === 'local' ? genre === g : onlineTag === g;
              return (
                <button key={g} onClick={() => (tab === 'local' ? setGenre(g) : loadOnlineHot(g))}
                  className="px-3 py-1 rounded-full text-xs transition-all"
                  style={{
                    background: active ? 'rgba(0,212,255,0.15)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${active ? 'var(--color-primary)' : 'var(--color-border-glow)'}`,
                    color: active ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                  }}>
                  {g}
                </button>
              );
            })}
          </div>

          {/* 列表 */}
          <div className="flex-1 overflow-y-auto space-y-1 pr-1" style={{ minHeight: 0 }}>
            {tab === 'local' ? (
              <>
                {libraryLoading && library.length === 0 && (
                  <div className="flex items-center justify-center gap-2 py-10 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                    <Loader2 size={16} className="animate-spin" /> 曲库加载中…
                  </div>
                )}
                {!libraryLoading && filtered.length === 0 && (
                  <div className="text-center py-10">
                    <Music2 size={36} className="mx-auto mb-3" style={{ color: 'var(--color-text-muted)' }} />
                    <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                      {keyword ? `未找到与「${keyword}」相关的歌曲，可切到在线曲库搜索` : '曲库为空'}
                    </p>
                  </div>
                )}
                {filtered.map((song, i) => (
                  <SongRow key={song.id} song={song} index={i}
                    isCurrent={currentSong?.id === song.id}
                    isPlaying={isPlaying}
                    onPlay={() => playSong(song, filtered)}
                    onToggle={togglePlay} />
                ))}
              </>
            ) : (
              <>
                {onlineLoading && (
                  <div className="flex items-center justify-center gap-2 py-10 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                    <Loader2 size={16} className="animate-spin" /> 正在搜索在线曲库…
                  </div>
                )}
                {!onlineLoading && onlineError && (
                  <div className="mx-2 my-4 px-4 py-3 rounded-xl text-xs leading-relaxed"
                    style={{ background: 'rgba(255,165,2,0.08)', border: '1px solid rgba(255,165,2,0.25)', color: '#ffa502' }}>
                    {onlineError}
                  </div>
                )}
                {!onlineLoading && !onlineError && onlineResults.length === 0 && (
                  <div className="text-center py-10">
                    <Globe size={36} className="mx-auto mb-3" style={{ color: 'var(--color-text-muted)' }} />
                    <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>在线曲库暂无结果，换个关键词试试</p>
                  </div>
                )}
                {onlineResults.map((song, i) => (
                  <SongRow key={song.id} song={song} index={i}
                    isCurrent={currentSong?.id === song.id}
                    isPlaying={isPlaying}
                    onPlay={() => playSong(song, onlineResults)}
                    onToggle={togglePlay} />
                ))}
              </>
            )}
          </div>

          {/* 扩充曲库提示 */}
          <div className="mt-3 flex items-start gap-2.5 px-3 py-2.5 rounded-xl text-xs"
            style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.18)', color: 'var(--color-text-secondary)' }}>
            <FolderOpen size={14} className="flex-shrink-0 mt-0.5" style={{ color: '#34d399' }} />
            <span>
              曲库扩充：① 在线曲库已接入 Jamendo（数十万首 CC 授权曲目，语音点歌本地未命中时自动搜在线）；
              ② 把你合法拥有的音乐文件（mp3/flac/wav/m4a）放入
              <code className="mx-1 px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.06)', color: '#34d399' }}>backend/music/</code>
              文件夹，点「刷新曲库」即可入库点播。商业歌曲受版权保护，系统不内置。
            </span>
          </div>
        </div>

        {/* 正在播放 */}
        <div className="glass-card p-5 flex flex-col items-center overflow-y-auto">
          <div className="flex items-center gap-2 self-start mb-4">
            <Mic2 size={18} style={{ color: '#f472b6' }} />
            <h3 className="text-sm font-semibold">正在播放</h3>
          </div>

          {currentSong ? (
            <>
              {/* 大封面 */}
              <div className={`w-44 h-44 rounded-2xl flex items-center justify-center mb-4 overflow-hidden ${isPlaying ? 'animate-pulse-glow' : ''}`}
                style={{ background: nowCover, boxShadow: '0 8px 32px rgba(0,0,0,0.25)' }}>
                {currentSong.cover
                  ? <img src={currentSong.cover} alt="" className="w-full h-full object-cover" />
                  : <Music2 size={56} color="rgba(255,255,255,0.9)" />}
              </div>
              <div className="text-base font-bold text-center mb-1 w-full truncate" style={{ color: 'var(--color-text-main)' }}>
                {currentSong.title}
              </div>
              <div className="text-xs text-center mb-1 w-full truncate" style={{ color: 'var(--color-text-secondary)' }}>
                {currentSong.artist}
              </div>
              <div className="text-xs mb-4 px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(0,212,255,0.08)', color: 'var(--color-primary)' }}>
                {currentSong.genre}
              </div>

              {/* 进度 */}
              <div className="w-full flex items-center gap-2 mb-1">
                <span className="text-xs font-mono" style={{ color: 'var(--color-text-secondary)' }}>{formatTime(currentTime)}</span>
                <input type="range" min={0} max={duration || 0} step={0.1} value={currentTime}
                  onChange={(e) => seek(Number(e.target.value))}
                  className="w-full" style={{ accentColor: 'var(--color-primary)' }} aria-label="播放进度" />
                <span className="text-xs font-mono" style={{ color: 'var(--color-text-secondary)' }}>{formatTime(duration)}</span>
              </div>

              {/* 控制 */}
              <div className="flex items-center gap-3 my-3">
                <button onClick={prev} title="上一首"
                  className="w-10 h-10 rounded-full flex items-center justify-center transition-transform hover:scale-110"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border-glow)', color: 'var(--color-text-secondary)' }}>
                  <SkipBack size={17} />
                </button>
                <button onClick={togglePlay} title={isPlaying ? '暂停' : '播放'}
                  className="w-14 h-14 rounded-full flex items-center justify-center transition-transform hover:scale-110"
                  style={{
                    background: 'linear-gradient(135deg, var(--color-primary), var(--color-accent))',
                    boxShadow: '0 0 20px rgba(0,212,255,0.4)', color: '#0a0e1a',
                  }}>
                  {isPlaying ? <Pause size={22} /> : <Play size={22} style={{ marginLeft: 3 }} />}
                </button>
                <button onClick={() => next()} title="下一首"
                  className="w-10 h-10 rounded-full flex items-center justify-center transition-transform hover:scale-110"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border-glow)', color: 'var(--color-text-secondary)' }}>
                  <SkipForward size={17} />
                </button>
              </div>

              {/* 模式 + 音量 */}
              <div className="w-full space-y-3 mt-1">
                <button onClick={cycleMode}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs transition-all"
                  style={{ background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.18)', color: 'var(--color-primary)' }}>
                  <ModeIcon size={14} /> {MODE_META[mode]?.label || '顺序循环'}
                </button>
                <div className="flex items-center gap-2">
                  <Volume2 size={15} style={{ color: 'var(--color-text-secondary)' }} />
                  <input type="range" min={0} max={1} step={0.01} value={volume}
                    onChange={(e) => changeVolume(Number(e.target.value))}
                    className="w-full" style={{ accentColor: 'var(--color-primary)' }} aria-label="音量" />
                  <span className="text-xs font-mono w-9 text-right" style={{ color: 'var(--color-text-secondary)' }}>
                    {Math.round(volume * 100)}%
                  </span>
                </div>
              </div>

              {/* 语音点歌提示 */}
              <div className="mt-4 w-full px-3 py-2.5 rounded-xl text-xs leading-relaxed"
                style={{ background: 'rgba(244,114,182,0.06)', border: '1px solid rgba(244,114,182,0.18)', color: 'var(--color-text-secondary)' }}>
                🎤 语音点歌：唤醒「小龙」后直接说，如：
                <br />· "播放演示音轨 03" · "来一首轻音乐"
                <br />· "下一首" · "暂停" · "音量调到50%"
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <Music2 size={48} className="mb-4" style={{ color: 'var(--color-text-muted)' }} />
              <p className="text-sm mb-1" style={{ color: 'var(--color-text-secondary)' }}>还没有播放的歌曲</p>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                点击左侧列表播放，或对「小龙」说"播放音乐"
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
