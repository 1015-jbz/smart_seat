import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { voiceMessages, voiceSettings as voiceDefaults } from '../data/mockData';

const VoiceContext = createContext();

// 后端 TTS 服务（多引擎 + 8 音色 + 情绪切音）
const TTS_SERVER = 'http://localhost:7862';
// 音色设置持久化键：保证刷新后、以及不进入语音页时全局仍生效
const SETTINGS_KEY = 'smartSeatVoiceSettings';

const nowHHMM = () => {
  const now = new Date();
  return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
};

// 逐句切分：TTS 按句合成，首句延迟更低，长文本也不会卡住
const splitIntoSentences = (text) => {
  return String(text || '')
    .split(/(?<=[。！？!?…])/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
};

const clampOffset = (v) => {
  const n = Number(v);
  if (!isFinite(n)) return 0;
  return Math.max(-5, Math.min(5, Math.round(n)));
};

// 读取上次保存的音色设置（角色 / 语速 / 音高 / 音量）
function loadVoiceSettings() {
  const base = {
    selectedRole: voiceDefaults?.selectedRole ?? 2,
    speedOffset: 0,
    pitchOffset: 0,
    volumeOffset: 0,
    selectedStyle: 0,
  };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw) || {};
    return {
      selectedRole: Math.max(0, Math.min(7, Number(saved.selectedRole) || 0)),
      speedOffset: clampOffset(saved.speedOffset),
      pitchOffset: clampOffset(saved.pitchOffset),
      volumeOffset: clampOffset(saved.volumeOffset),
      selectedStyle: Number(saved.selectedStyle) || 0,
    };
  } catch (_) {
    return base;
  }
}

// 浏览器兜底 TTS 优先挑温柔女声
const FEMALE_SOFT_KEYS = ['温柔', '女', '晓晓', '小希', '小雅', '小美', '晓晴', 'tingting', 'yaoyao', 'meijia', 'female'];

export function VoiceProvider({ children }) {
  const [messages, setMessages] = useState(voiceMessages);
  const [latestAlert, setLatestAlert] = useState(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  // 全局录音阶段：'idle' | 'tts' | 'listening' | 'processing'
  const [voicePhase, setVoicePhase] = useState('idle');
  // 全局麦克风音量 0-1，供 RecordingBar 波形驱动
  const [audioLevel, setAudioLevel] = useState(0);

  // ===== 音色设置（state 供 UI，ref 供播放热路径实时读取）=====
  const [voiceSettings, setVoiceSettingsState] = useState(loadVoiceSettings);
  const voiceSettingsRef = useRef(voiceSettings);
  // 当前情绪（摄像头表情 → 后端叠加音色参数），用 ref 避免频繁重渲染
  const emotionRef = useRef('neutral');
  // 当前生效引擎：edge-tts / winrt / pyttsx3 / pregen / browser（降级）
  const [ttsEngine, setTtsEngine] = useState('checking');
  const ttsOnlineRef = useRef(true);

  const setVoiceSettings = useCallback((patch) => {
    setVoiceSettingsState(prev => {
      const next = { ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) };
      next.selectedRole = Math.max(0, Math.min(7, Number(next.selectedRole) || 0));
      next.speedOffset = clampOffset(next.speedOffset);
      next.pitchOffset = clampOffset(next.pitchOffset);
      next.volumeOffset = clampOffset(next.volumeOffset);
      // 同步写 ref：正在播放的下一句立刻用上新音色
      voiceSettingsRef.current = next;
      try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch (_) {}
      return next;
    });
  }, []);

  const setEmotion = useCallback((emotion) => {
    emotionRef.current = emotion || 'neutral';
  }, []);

  // ===== 语音队列（串行播放，防重叠）=====
  const voiceQueueRef = useRef([]);
  const isSpeakingRef = useRef(false);
  const lastSpokenRef = useRef({});        // { textKey: ts } — 30s 内相同文本去重
  const lastLevelSpeechRef = useRef({});   // { priority: ts } — 30s 内同等级冷却
  const curPriorityRef = useRef(null);
  const currentAudioRef = useRef(null);
  const previewAudioRef = useRef(null);
  const playSentencesRef = useRef(null);

  const PRIORITY_RANK = { critical: 4, alert: 3, greeting: 2, normal: 1 };

  const pushMessage = useCallback((role, text, source = 'text') => {
    const msg = { role, text, time: nowHHMM(), source };
    setMessages(prev => [...prev, msg]);
    return msg;
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  const pushAlert = useCallback((text, level = 'info') => {
    const alert = { text, level, time: nowHHMM() };
    setLatestAlert(alert);
    setMessages(prev => [...prev, { role: 'system', text, time: alert.time, source: 'alert' }]);
    return alert;
  }, []);

  // ===== TTS URL 构造：角色 + 情绪 + 手动偏移（语速/音高/音量）=====
  const buildTtsUrl = useCallback((sentence, settings, emotion) => {
    const s = settings || voiceSettingsRef.current || {};
    const params = new URLSearchParams({
      text: sentence,
      role: String(s.selectedRole ?? 2),
      emotion: emotion || 'neutral',
      rate: String(s.speedOffset ?? 0),
      pitch: String(s.pitchOffset ?? 0),
      volume: String(s.volumeOffset ?? 0),
    });
    return `${TTS_SERVER}/api/tts?${params.toString()}`;
  }, []);

  // ===== 后端 TTS 不可用时的降级：浏览器内置语音 =====
  const markTtsDown = useCallback(() => {
    if (ttsOnlineRef.current === false) return;
    ttsOnlineRef.current = false;
    setTtsEngine('browser');
    console.warn('[VoiceStore] TTS 服务(7862)不可用，已降级到浏览器内置语音');
  }, []);

  const markTtsUp = useCallback((engine) => {
    ttsOnlineRef.current = true;
    setTtsEngine(engine || 'edge-tts');
  }, []);

  const speakBrowser = useCallback((sentence) => new Promise((resolve) => {
    if (!window.speechSynthesis || !sentence) { resolve(); return; }
    const s = voiceSettingsRef.current || {};
    const utter = new SpeechSynthesisUtterance(sentence);
    utter.lang = 'zh-CN';
    // 滑块格数映射到浏览器 TTS 的 rate/pitch/volume（1.0 为基准）
    utter.rate = Math.max(0.5, Math.min(2, 1 + (s.speedOffset || 0) * 0.1));
    utter.pitch = Math.max(0.5, Math.min(2, 1.15 + (s.pitchOffset || 0) * 0.1));
    utter.volume = Math.max(0, Math.min(1, 1 + (s.volumeOffset || 0) * 0.1));
    const zhVoices = (window.speechSynthesis.getVoices() || []).filter(v => (v.lang || '').toLowerCase().includes('zh'));
    if (zhVoices.length > 0) {
      const hit = zhVoices.find(v => FEMALE_SOFT_KEYS.some(k => (v.name || '').toLowerCase().includes(k)));
      utter.voice = hit || zhVoices[0];
    }
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    utter.onend = finish;
    utter.onerror = finish;
    setTimeout(finish, Math.max(3000, sentence.length * 250));
    try { window.speechSynthesis.speak(utter); } catch (_) { finish(); }
  }), []);

  // 启动时探测后端 TTS，之后每分钟复检（服务起来后自动恢复，不用刷新页面）
  useEffect(() => {
    let alive = true;
    const probe = () => {
      const signal = typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(3000) : undefined;
      fetch(`${TTS_SERVER}/api/health`, { signal })
        .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then(d => { if (alive) markTtsUp(d?.engine); })
        .catch(() => { if (alive) markTtsDown(); });
    };
    probe();
    const timer = setInterval(probe, 60000);
    return () => { alive = false; clearInterval(timer); };
  }, [markTtsDown, markTtsUp]);

  // ===== 播放入口 =====
  const speak = useCallback((text, priority = 'normal') => {
    return new Promise((resolve) => {
      const newRank = PRIORITY_RANK[priority] ?? 0;
      const curRank = curPriorityRef.current ? (PRIORITY_RANK[curPriorityRef.current] ?? 0) : 0;

      // 高优先级打断当前播放（critical 可打断一切，安全优先）
      if (newRank > curRank && currentAudioRef.current) {
        try { currentAudioRef.current.pause(); } catch (e) {}
        currentAudioRef.current = null;
        if (window.speechSynthesis && !ttsOnlineRef.current) {
          try { window.speechSynthesis.cancel(); } catch (e) {}
        }
      }

      const sentences = splitIntoSentences(text);
      if (sentences.length === 0) { resolve(); return; }

      // 优先级不够且正在播 → 轮询等待，不抢占
      if (newRank <= curRank && isSpeakingRef.current) {
        let retries = 0;
        const tryStart = () => {
          if (!isSpeakingRef.current || retries >= 20) {
            curPriorityRef.current = priority;
            playSentencesRef.current?.(sentences, priority, resolve);
          } else {
            retries++;
            setTimeout(tryStart, 300);
          }
        };
        setTimeout(tryStart, 300);
        return;
      }

      curPriorityRef.current = priority;
      playSentencesRef.current?.(sentences, priority, resolve);
    });
  }, []);

  const prefetchAudio = (url) => {
    try {
      const audio = new Audio();
      audio.preload = 'auto';
      audio.src = url;
    } catch (_) {}
  };

  // 逐句播放：每句播放前都重新读 ref，因此切换角色/情绪立即生效
  playSentencesRef.current = (sentences, priority, resolve) => {
    let idx = 0;
    let done = false;
    let activeTimers = [];

    const clearTimers = () => {
      activeTimers.forEach(t => clearTimeout(t));
      activeTimers = [];
    };

    const finish = () => {
      if (done) return;
      done = true;
      clearTimers();
      curPriorityRef.current = null;
      currentAudioRef.current = null;
      resolve();
    };

    // 总超时兜底：防止队列永久卡死
    activeTimers.push(setTimeout(finish, Math.max(20000, sentences.join('').length * 800)));

    // 预取：按当前音色把后续句子提前请求，减少句间停顿
    const initSettings = { ...voiceSettingsRef.current };
    const initEmotion = emotionRef.current || 'neutral';
    sentences.forEach(s => prefetchAudio(buildTtsUrl(s, initSettings, initEmotion)));

    const playNext = () => {
      if (done) return;
      if (idx >= sentences.length) { finish(); return; }

      const sentence = sentences[idx];
      const gap = priority === 'alert' ? 50 : (80 + Math.random() * 50);
      const advance = () => {
        if (done) return;
        idx++;
        activeTimers.push(setTimeout(playNext, gap));
      };

      // 后端 TTS 已判定不可用 → 直接走浏览器兜底
      if (!ttsOnlineRef.current) {
        speakBrowser(sentence).then(advance);
        return;
      }

      const curSettings = voiceSettingsRef.current;
      const curEmotion = emotionRef.current || 'neutral';
      const url = buildTtsUrl(sentence, curSettings, curEmotion);

      // 音色中途变了 → 用新参数重新预取剩余句子
      if (curSettings.selectedRole !== initSettings.selectedRole) {
        initSettings.selectedRole = curSettings.selectedRole;
        for (let i = idx + 1; i < sentences.length; i++) {
          prefetchAudio(buildTtsUrl(sentences[i], curSettings, curEmotion));
        }
      }

      const audio = new Audio();
      audio.preload = 'auto';
      audio.src = url;
      currentAudioRef.current = audio;

      let advanced = false;
      const step = () => {
        if (advanced || done) return;
        advanced = true;
        try { audio.pause(); } catch (e) {}
        advance();
      };

      audio.onended = step;
      // 加载失败：标记服务不可用并改用浏览器语音念这一句，不让整段话变哑
      audio.onerror = () => {
        if (advanced || done) return;
        advanced = true;
        markTtsDown();
        speakBrowser(sentence).then(advance);
      };
      // 单句最长 15s（首次合成可能较慢），超时则跳过
      activeTimers.push(setTimeout(step, 15000));

      audio.play().catch(() => {
        if (advanced || done) return;
        // 自动播放被拦截等场景：重试一次，仍失败则浏览器兜底
        setTimeout(() => {
          if (advanced || done) return;
          audio.play().catch(() => {
            if (advanced || done) return;
            advanced = true;
            speakBrowser(sentence).then(advance);
          });
        }, 200);
      });
    };

    playNext();
  };

  // ===== 队列消费 =====
  const speakNext = useCallback(() => {
    if (isSpeakingRef.current) return;
    const queue = voiceQueueRef.current;
    if (queue.length === 0) return;

    const next = queue.shift();
    isSpeakingRef.current = true;
    setIsSpeaking(true);

    // 看门狗：30s 还没播完就强制复位，避免队列永久阻塞
    const watchdog = setTimeout(() => {
      if (!isSpeakingRef.current) return;
      console.warn('[VoiceStore] Watchdog: force reset after 30s');
      isSpeakingRef.current = false;
      setIsSpeaking(false);
      curPriorityRef.current = null;
      if (currentAudioRef.current) {
        try { currentAudioRef.current.pause(); } catch (e) {}
        currentAudioRef.current = null;
      }
    }, 30000);

    speak(next.text, next.priority).then(() => {
      clearTimeout(watchdog);
      isSpeakingRef.current = false;
      setIsSpeaking(false);
      next.resolve?.();
      const gap = next.gap ?? (next.priority === 'alert' ? 0 : 200);
      setTimeout(() => speakNext(), gap);
    });
  }, [speak]);

  // ===== 全局唯一语音入口（返回 Promise，resolve = 播完）=====
  // opts: { loop?: boolean, gap?: number }
  const enqueueSpeech = useCallback((text, priority = 'normal', opts = {}) => {
    return new Promise((resolve) => {
      const now = Date.now();

      if (opts?.loop) {
        // 告警循环模式：跳过去重/冷却，但同文本不重复积压
        if (voiceQueueRef.current.some(item => item.text === text)) {
          resolve();
          return;
        }
        voiceQueueRef.current.push({
          id: now, text, priority: 'alert', ts: now, gap: opts.gap ?? 0, resolve,
        });
        speakNext();
        return;
      }

      // 普通模式：30s 相同文本去重 + 同等级冷却
      const textKey = text.substring(0, 20);
      if (lastSpokenRef.current[textKey] && now - lastSpokenRef.current[textKey] < 30000) {
        resolve();
        return;
      }
      if ((priority === 'alert' || priority === 'critical') &&
          lastLevelSpeechRef.current[priority] &&
          now - lastLevelSpeechRef.current[priority] < 30000) {
        resolve();
        return;
      }
      lastSpokenRef.current[textKey] = now;
      if (priority === 'alert' || priority === 'critical') {
        lastLevelSpeechRef.current[priority] = now;
      }

      if (priority === 'critical') {
        // critical：清空队列 + 打断当前 + 立即播
        voiceQueueRef.current = [{ id: now, text, priority, ts: now, gap: 0, resolve }];
        isSpeakingRef.current = false;
        setIsSpeaking(false);
        curPriorityRef.current = null;
        if (currentAudioRef.current) {
          try { currentAudioRef.current.pause(); } catch (e) {}
          currentAudioRef.current = null;
        }
        if (window.speechSynthesis) { try { window.speechSynthesis.cancel(); } catch (e) {} }
        setTimeout(() => speakNext(), 100);
      } else {
        const gap = opts.gap ?? (priority === 'alert' ? 0 : 200);
        voiceQueueRef.current.push({ id: now, text, priority, ts: now, gap, resolve });
        speakNext();
      }
    });
  }, [speakNext]);

  const cancelAllSpeech = useCallback(() => {
    voiceQueueRef.current = [];
    isSpeakingRef.current = false;
    setIsSpeaking(false);
    curPriorityRef.current = null;
    if (currentAudioRef.current) {
      try { currentAudioRef.current.pause(); } catch (e) {}
      currentAudioRef.current = null;
    }
    if (previewAudioRef.current) {
      try { previewAudioRef.current.pause(); } catch (e) {}
      previewAudioRef.current = null;
    }
    if (window.speechSynthesis) { try { window.speechSynthesis.cancel(); } catch (e) {} }
  }, []);

  // ===== 试听：不经过队列，用当前音色设置立刻念一句 =====
  const previewVoice = useCallback((text = '你好，我是小龙，很高兴为你服务。') => {
    try { previewAudioRef.current?.pause?.(); } catch (e) {}
    if (!ttsOnlineRef.current) { speakBrowser(text); return; }
    const audio = new Audio(buildTtsUrl(text, voiceSettingsRef.current, emotionRef.current));
    previewAudioRef.current = audio;
    audio.play().catch(() => {
      markTtsDown();
      speakBrowser(text);
    });
  }, [buildTtsUrl, markTtsDown, speakBrowser]);

  return (
    <VoiceContext.Provider value={{
      messages, pushMessage, clearMessages, latestAlert, pushAlert,
      enqueueSpeech, cancelAllSpeech, isSpeaking, voicePhase, setVoicePhase,
      audioLevel, setAudioLevel,
      // 音色调节
      voiceSettings, setVoiceSettings, setEmotion,
      ttsEngine, previewVoice,
    }}>
      {children}
    </VoiceContext.Provider>
  );
}

export function useVoice() {
  const ctx = useContext(VoiceContext);
  if (!ctx) throw new Error('useVoice must be used within VoiceProvider');
  return ctx;
}
