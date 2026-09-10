/**
 * 全局音乐播放器状态（跨页面不中断）
 *
 * - 曲库来源：后端 /music/library（本地音乐 + 内置免费演示曲目）；
 *   后端不可用时自动降级为内置演示曲目，保证功能可用。
 * - 播放模式：sequence（顺序循环）/ single（单曲循环）/ shuffle（随机）
 * - 对外提供 useMusic()（播放器控制）与 useMusicVoiceCommand()（语音点歌指令解析）
 */
import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { api } from '../services/api';

// ===== 内置免费演示曲目（后端不可用时的离线兜底，与后端保持一致）=====
const DEMO_GENRES = ['电子', '流行', '轻音乐', '摇滚', '爵士', '民谣', '电子', '流行', '轻音乐', '摇滚', '爵士', '古典'];
export const FALLBACK_TRACKS = DEMO_GENRES.map((genre, i) => {
  const idx = i + 1;
  return {
    id: `demo-${String(idx).padStart(2, '0')}`,
    title: `演示音轨 ${String(idx).padStart(2, '0')}`,
    artist: 'SoundHelix（免费演示音源）',
    album: '内置演示曲库',
    genre,
    source: 'demo',
    url: `https://www.soundhelix.com/examples/mp3/SoundHelix-Song-${idx}.mp3`,
  };
});

// 封面渐变调色板：按曲目 id 哈希选取，无需图片资源
const COVER_GRADIENTS = [
  'linear-gradient(135deg, #4f8cff, #00d4ff)',
  'linear-gradient(135deg, #f472b6, #a78bfa)',
  'linear-gradient(135deg, #34d399, #00d4ff)',
  'linear-gradient(135deg, #ffa502, #ff6b81)',
  'linear-gradient(135deg, #a78bfa, #4f8cff)',
  'linear-gradient(135deg, #00ff88, #059669)',
];

export function coverOf(song) {
  if (!song) return COVER_GRADIENTS[0];
  let hash = 0;
  for (const ch of song.id || song.title || '') hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return COVER_GRADIENTS[hash % COVER_GRADIENTS.length];
}

export function formatTime(sec) {
  if (!sec || !isFinite(sec)) return '00:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const MusicContext = createContext();

export function MusicProvider({ children }) {
  const audioRef = useRef(null);        // 全局唯一 Audio 元素
  const queueRef = useRef([]);          // 当前播放上下文（歌单）
  const indexRef = useRef(-1);          // 当前曲目在歌单中的下标
  const modeRef = useRef('sequence');
  const endedHandlerRef = useRef(null); // 供 audio 事件回调调用最新的 next 逻辑

  const [library, setLibrary] = useState([]);
  const [localDir, setLocalDir] = useState('');
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [currentSong, setCurrentSong] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(() => {
    // 注意：localStorage 无值时 getItem 返回 null，Number(null)===0，
    // 若不过滤会导致首次使用音量为 0（静音）；仅正数才视为有效保存值。
    const raw = localStorage.getItem('musicVolume');
    const v = raw === null ? NaN : Number(raw);
    return isFinite(v) && v > 0 && v <= 1 ? v : 0.7;
  });
  const [mode, setModeState] = useState('sequence');
  const [buffering, setBuffering] = useState(false);   // 音源加载中（海外源/大文件时可见）
  const [playerError, setPlayerError] = useState('');   // 用户可见的播放错误提示

  // ===== 懒创建全局 Audio 元素（只创建一次，切页面不销毁）=====
  const ensureAudio = useCallback(() => {
    if (audioRef.current) return audioRef.current;
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.volume = volume;
    audio.addEventListener('timeupdate', () => setCurrentTime(audio.currentTime || 0));
    audio.addEventListener('loadedmetadata', () => setDuration(audio.duration || 0));
    audio.addEventListener('play', () => setIsPlaying(true));
    audio.addEventListener('pause', () => setIsPlaying(false));
    audio.addEventListener('ended', () => endedHandlerRef.current?.());
    // 缓冲状态：等待数据时提示“缓冲中”，可播放后消除（避免误以为“没声音”）
    audio.addEventListener('waiting', () => setBuffering(true));
    audio.addEventListener('stalled', () => setBuffering(true));
    audio.addEventListener('playing', () => setBuffering(false));
    audio.addEventListener('canplay', () => setBuffering(false));
    audio.addEventListener('error', () => {
      console.warn('[MusicStore] 音频加载失败:', audio.src);
      setIsPlaying(false);
      setBuffering(false);
      setPlayerError('音频加载失败：音源无法访问，请换一首试试（本地曲目不受网络影响）');
    });
    audioRef.current = audio;
    return audio;
  }, [volume]);

  // ===== 曲库加载：后端优先，失败降级内置演示曲目 =====
  const loadLibrary = useCallback(async (silent = false) => {
    if (!silent) setLibraryLoading(true);
    try {
      const data = await api.musicLibrary();
      if (data && Array.isArray(data.tracks) && data.tracks.length > 0) {
        setLibrary(data.tracks);
        setLocalDir(data.local_dir || '');
        return data.tracks;
      }
    } catch (_) { /* 静默降级 */ }
    // 后端不可用：仅用内置演示曲目兜底（本地音乐不可用）
    setLibrary(prev => (prev.length > 0 ? prev : FALLBACK_TRACKS));
    return FALLBACK_TRACKS;
  }, []);

  useEffect(() => { loadLibrary(); }, [loadLibrary]);

  // 刷新曲库（重新扫描本地目录）
  const refreshLibrary = useCallback(async () => {
    const data = await api.musicRefresh();
    if (data && Array.isArray(data.tracks)) {
      setLibrary(data.tracks);
      setLocalDir(data.local_dir || '');
      return data.tracks;
    }
    return loadLibrary(true);
  }, [loadLibrary]);

  // ===== 播放控制 =====
  /** 播放指定歌曲；contextList 为本轮播放的歌单（缺省=当前曲库） */
  const playSong = useCallback((song, contextList = null) => {
    if (!song) return;
    const list = (contextList && contextList.length > 0) ? contextList : library;
    const idx = list.findIndex(t => t.id === song.id);
    queueRef.current = idx >= 0 ? list : [song];
    indexRef.current = idx >= 0 ? idx : 0;
    const audio = ensureAudio();
    setPlayerError('');
    setBuffering(true);
    audio.src = song.url;
    audio.currentTime = 0;
    audio.volume = volume;
    setCurrentSong(song);
    setCurrentTime(0);
    setDuration(0);
    audio.play().catch(err => {
      // AbortError：上一次 play() 被新切歌打断，属正常竞态，静默忽略（新歌会自己负责播放）
      if (err?.name === 'AbortError') return;
      setIsPlaying(false);
      if (err?.name === 'NotAllowedError') {
        setPlayerError('浏览器拦截了自动播放，请手动点一下播放按钮');
      } else {
        setPlayerError('播放失败：' + (err?.message || '未知错误'));
      }
    });
  }, [library, ensureAudio, volume]);

  const togglePlay = useCallback(() => {
    if (!currentSong) {
      // 还没选过歌：默认播放曲库第一首
      if (library.length > 0) playSong(library[0], library);
      return;
    }
    const audio = ensureAudio();
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  }, [currentSong, library, playSong, ensureAudio]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const resume = useCallback(() => {
    if (!currentSong) {
      if (library.length > 0) playSong(library[0], library);
      return;
    }
    audioRef.current?.play().catch(() => {});
  }, [currentSong, library, playSong]);

  /** auto=true 表示播放到结尾自动切换（单曲循环模式生效） */
  const next = useCallback((auto = false) => {
    const list = queueRef.current;
    if (list.length === 0) return;
    if (auto) {
      const audio = audioRef.current;
      // 防护：媒体时长异常（0/Infinity）说明音源加载有问题，停止自动切歌避免死循环
      if (audio && (!isFinite(audio.duration) || audio.duration <= 0)) {
        setPlayerError('音源加载异常（无法解析时长），已停止自动播放');
        return;
      }
      if (modeRef.current === 'single') {
        const a = ensureAudio();
        a.currentTime = 0;
        a.play().catch(() => {});
        return;
      }
    }
    let idx;
    if (modeRef.current === 'shuffle' && list.length > 1) {
      do { idx = Math.floor(Math.random() * list.length); } while (idx === indexRef.current);
    } else {
      idx = (indexRef.current + 1) % list.length;
    }
    playSong(list[idx], list);
  }, [playSong, ensureAudio]);

  const prev = useCallback(() => {
    const list = queueRef.current;
    if (list.length === 0) return;
    const idx = (indexRef.current - 1 + list.length) % list.length;
    playSong(list[idx], list);
  }, [playSong]);

  useEffect(() => { endedHandlerRef.current = () => next(true); }, [next]);

  const seek = useCallback((t) => {
    const audio = audioRef.current;
    if (audio && isFinite(t)) audio.currentTime = t;
  }, []);

  const changeVolume = useCallback((v) => {
    const val = Math.min(1, Math.max(0, v));
    setVolumeState(val);
    localStorage.setItem('musicVolume', String(val));
    if (audioRef.current) audioRef.current.volume = val;
  }, []);

  const cycleMode = useCallback(() => {
    setModeState(prev => {
      const nextMode = prev === 'sequence' ? 'single' : prev === 'single' ? 'shuffle' : 'sequence';
      modeRef.current = nextMode;
      return nextMode;
    });
  }, []);

  const setMode = useCallback((newMode) => {
    if (['sequence', 'single', 'shuffle'].includes(newMode)) {
      setModeState(newMode);
      modeRef.current = newMode;
    }
  }, []);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setIsPlaying(false);
    setCurrentSong(null);
  }, []);

  // ===== 搜索（本地过滤，曲库规模下性能足够）=====
  const searchSongs = useCallback((q) => {
    const kw = (q || '').trim().toLowerCase();
    if (!kw) return library;
    return library.filter(t =>
      t.title.toLowerCase().includes(kw) ||
      t.artist.toLowerCase().includes(kw) ||
      t.genre.toLowerCase().includes(kw)
    );
  }, [library]);

  return (
    <MusicContext.Provider value={{
      library, libraryLoading, localDir,
      loadLibrary, refreshLibrary, searchSongs,
      currentSong, isPlaying, currentTime, duration,
      volume, mode, buffering, playerError,
      playSong, togglePlay, pause, resume, next, prev, seek, changeVolume, cycleMode, setMode, stop,
    }}>
      {children}
    </MusicContext.Provider>
  );
}

export function useMusic() {
  const ctx = useContext(MusicContext);
  if (!ctx) throw new Error('useMusic must be used within MusicProvider');
  return ctx;
}

// ============ 语音点歌指令解析 ============
/**
 * useMusicVoiceCommand：把语音/文字指令解析为播放器操作。
 * 返回 async handle(text)：命中音乐指令返回 { reply }，否则返回 null（交给其他逻辑）。
 * 点歌时优先搜本地曲库，未命中自动搜索在线曲库（Jamendo）。
 */
export function useMusicVoiceCommand() {
  const music = useMusic();

  return useCallback(async (text) => {
    if (!text) return null;
    const t = text.trim();

    // ---- 音量控制 ----
    const volPct = t.match(/音量(?:调到|设为|设置为|到)?(\d{1,3})/);
    if (volPct && (t.includes('音量') || t.includes('声音'))) {
      const v = Math.min(100, Number(volPct[1])) / 100;
      music.changeVolume(v);
      return { reply: `好的，音量已调整到${volPct[1]}%。` };
    }
    if (/(音量|声音).*(大|高|响)/.test(t)) {
      music.changeVolume(Math.min(1, music.volume + 0.15));
      return { reply: '音量已调高。' };
    }
    if (/(音量|声音).*(小|低|轻)/.test(t)) {
      music.changeVolume(Math.max(0, music.volume - 0.15));
      return { reply: '音量已调低。' };
    }

    // ---- 播放控制 ----
    if (/暂停播放|暂停|静音/.test(t)) {
      music.pause();
      return { reply: '音乐已暂停。' };
    }
    if (/停止播放|停止|关闭音乐|关掉音乐/.test(t)) {
      music.stop();
      return { reply: '音乐已停止。' };
    }
    if (/继续播放|恢复播放|继续/.test(t)) {
      music.resume();
      return { reply: '好的，继续播放。' };
    }
    if (/下一首|切歌|换一首|跳过/.test(t)) {
      if (!music.currentSong) return { reply: '当前没有在播放的歌曲，请先点一首歌。' };
      music.next();
      return { reply: '已切换到下一首。' };
    }
    if (/上一首/.test(t)) {
      if (!music.currentSong) return { reply: '当前没有在播放的歌曲，请先点一首歌。' };
      music.prev();
      return { reply: '已切换到上一首。' };
    }

    // ---- 循环模式 ----
    if (/单曲循环/.test(t)) {
      music.setMode('single');
      return { reply: '已切换到单曲循环模式。' };
    }
    if (/随机播放|随机模式/.test(t)) {
      music.setMode('shuffle');
      return { reply: '已切换到随机播放模式。' };
    }
    if (/顺序播放|列表循环/.test(t)) {
      music.setMode('sequence');
      return { reply: '已切换到顺序播放模式。' };
    }
    if (/切换模式|换个模式/.test(t)) {
      music.cycleMode();
      const modeNames = { sequence: '顺序播放', single: '单曲循环', shuffle: '随机播放' };
      return { reply: `已切换到${modeNames[music.mode]}模式。` };
    }

    // ---- 当前歌曲查询 ----
    if (/现在播放什么|这是什么歌|当前歌曲|现在放什么|正在播放/.test(t)) {
      if (!music.currentSong) return { reply: '当前没有播放歌曲。' };
      const modeNames = { sequence: '顺序播放', single: '单曲循环', shuffle: '随机播放' };
      return { reply: `正在播放：《${music.currentSong.title}》，${music.currentSong.artist}，${modeNames[music.mode]}模式。` };
    }

    // ---- 点歌 ----
    const m = t.match(/(?:帮我播放|播放一首|播放一首|播放|来一首|来首|我想听|我要听|放一首|放|想听)(.+)/);
    if (!m) {
      // 泛化指令：「播放音乐」「随便来首歌」
      if (/播放音乐|放音乐|听歌|来首歌|随便来点|随机播放/.test(t)) {
        if (music.library.length === 0) return { reply: '曲库为空，请先添加音乐文件。' };
        const pool = music.library;
        const pick = pool[Math.floor(Math.random() * pool.length)];
        music.playSong(pick, pool);
        return { reply: `好的，正在为您播放《${pick.title}》，演唱：${pick.artist}。` };
      }
      return null;
    }

    let query = m[1].trim();
    // 去掉语气词尾巴
    query = query.replace(/[。！!，,吧呀啊哦嘛~]/g, '').trim();
    if (!query) return null;

    // 先按原词搜索
    let results = music.searchSongs(query);
    // 「播放流行音乐」→ 去掉「音乐/歌曲」后缀再按风格搜
    if (results.length === 0) {
      const stripped = query.replace(/音乐|歌曲|的歌|歌$/, '').trim();
      if (stripped) results = music.searchSongs(stripped);
    }
    // 泛化：「播放音乐」「随便来点歌」→ 随机一首
    if (results.length === 0 && /^(音乐|歌|歌曲|随机|随便)$/.test(query)) {
      results = music.library;
    }

    if (results.length === 0) {
      // 本地未命中 → 搜索在线曲库（Jamendo）
      const online = await api.musicOnlineSearch(query);
      if (online && !online.error && Array.isArray(online.tracks) && online.tracks.length > 0) {
        const pick = online.tracks[0];
        music.playSong(pick, online.tracks);
        return { reply: `已在在线曲库为您找到，正在播放《${pick.title}》，演唱：${pick.artist}。` };
      }
      const extra = online?.error ? `（在线曲库未启用：${online.error}）` : '';
      return { reply: `抱歉，本地和在线曲库都未找到「${query}」${extra}。您可以把音乐文件放入 backend/music 文件夹，就能点播啦。` };
    }
    const pick = results[0];
    music.playSong(pick, results);
    const more = results.length > 1 ? `，已为您建立${results.length}首的播放列表` : '';
    return { reply: `好的，正在为您播放《${pick.title}》，演唱：${pick.artist}${more}。` };
  }, [music]);
}
