import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { voiceMessages } from '../data/mockData';

const VoiceContext = createContext();

const nowHHMM = () => {
  const now = new Date();
  return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
};

export function VoiceProvider({ children }) {
  const [messages, setMessages] = useState(voiceMessages);
  const [latestAlert, setLatestAlert] = useState(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  // 全局录音阶段：'idle' | 'tts' | 'listening' | 'processing'
  // 供 RecordingBar 在任意页面读取，不局限于 VoiceAssistant
  const [voicePhase, setVoicePhase] = useState('idle');
  // 全局麦克风音量 0-1，供 RecordingBar 波形驱动
  const [audioLevel, setAudioLevel] = useState(0);

  // ===== 语音队列（串行播放，防重叠）=====
  const voiceQueueRef = useRef([]);
  const isSpeakingRef = useRef(false);
  const lastSpokenRef = useRef({});        // { textKey: ts } — 30s 内相同文本去重（普通模式）
  const lastLevelSpeechRef = useRef({});   // { priority: ts } — 30s 内同等级冷却（普通模式）

  // 中文语音包检测（龙芯等平台可能缺少中文 TTS）
  useEffect(() => {
    const checkVoices = () => {
      const voices = window.speechSynthesis?.getVoices() || [];
      const hasZh = voices.some(v => v.lang.includes('zh'));
      if (!hasZh) {
        console.warn('[VoiceStore] 未检测到中文语音包，TTS 可能无声');
      }
    };
    checkVoices();
    // voices 可能异步加载
    window.speechSynthesis?.addEventListener?.('voiceschanged', checkVoices);
    return () => window.speechSynthesis?.removeEventListener?.('voiceschanged', checkVoices);
  }, []);

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

  // 优先级排序数值（越大越有资格打断）
  const PRIORITY_RANK = { critical: 4, alert: 3, greeting: 2, normal: 1 };
  // 记录当前正在播放的优先级（speak 内部 cancel 判断时用）
  const curPriorityRef = useRef(null);

  // ===== 内置 TTS =====
  // greeting 优先级语速微快(1.15)以减少唤醒等待感，其他保持 1.0
  const speak = useCallback((text, priority = 'normal') => {
    return new Promise((resolve) => {
      if (!window.speechSynthesis) { resolve(); return; }
      // 智能 cancel：仅在"新优先级 > 正在播的优先级"时才打断。
      // 同级不 cancel：避免告警之间（warning↔high）互相打断导致"念不完"
      // critical 可以打断一切（安全优先）
      const newRank = PRIORITY_RANK[priority] ?? 0;
      const curRank = curPriorityRef.current ? (PRIORITY_RANK[curPriorityRef.current] ?? 0) : 0;
      const synth = window.speechSynthesis;
      if (newRank > curRank) {
        try { synth.cancel(); } catch(e) {}
      }
      // 如果优先级不够且正在说话，则排队由 speakNext 串行消费（不立即播）
      if (newRank <= curRank && (synth.speaking || synth.pending)) {
        // 不 cancel、不立即播，直接走队列——但 speak 本身是 speakNext 调用的，
        // 到这里说明已经出队了；理论上 speaking 时 speakNext 不会再调 speak。
        // 加个兜底：排队 200ms 重试，不立即打断。
        setTimeout(() => {
          if (!window.speechSynthesis) { resolve(); return; }
          const utter = new SpeechSynthesisUtterance(text);
          utter.lang = 'zh-CN';
          utter.rate = priority === 'greeting' ? 1.15 : 1.0;
          utter.pitch = 1.0;
          const voices = window.speechSynthesis.getVoices();
          const zhVoice = voices.find(v => v.lang.includes('zh'));
          if (zhVoice) utter.voice = zhVoice;
          let done = false;
          const finish = () => {
            if (!done) { done = true; curPriorityRef.current = null; resolve(); }
          };
          utter.onend = finish;
          utter.onerror = finish;
          setTimeout(finish, Math.max(3000, text.length * 200));
          utter.onstart = () => { curPriorityRef.current = priority; };
          window.speechSynthesis.speak(utter);
        }, 250);
        return;
      }
      curPriorityRef.current = priority;
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'zh-CN';
      utter.rate = priority === 'greeting' ? 1.15 : 1.0;
      utter.pitch = 1.0;
      const voices = window.speechSynthesis.getVoices();
      const zhVoice = voices.find(v => v.lang.includes('zh'));
      if (zhVoice) utter.voice = zhVoice;
      // 双重兜底：即使 onend 没触发（Chrome 偶发 bug），最长 10s 也强制 resolve，防止队列卡死
      let done = false;
      const finish = () => { if (!done) { done = true; curPriorityRef.current = null; resolve(); } };
      utter.onend = finish;
      utter.onerror = finish;
      setTimeout(finish, Math.max(3000, text.length * 200));  // 估算：每字 200ms，最少 3s
      utter.onstart = () => { curPriorityRef.current = priority; };
      window.speechSynthesis.speak(utter);
    });
  }, []);

  // ===== 队列消费（gap: 播完后下一条之间的间隔）=====
  const speakNext = useCallback(() => {
    if (isSpeakingRef.current) return;
    const queue = voiceQueueRef.current;
    if (queue.length === 0) return;

    const next = queue.shift();
    isSpeakingRef.current = true;
    setIsSpeaking(true);

    speak(next.text, next.priority).then(() => {
      isSpeakingRef.current = false;
      setIsSpeaking(false);
      // resolve: 告诉调用方 enqueueSpeech 的 Promise 播完了
      next.resolve?.();
      const gap = next.gap ?? (next.priority === 'alert' ? 0 : 200);
      setTimeout(() => speakNext(), gap);
    });
  }, [speak]);

  // ===== 全局唯一语音入口（返回 Promise，resolve = TTS 播完）=====
  // opts: { loop?: boolean, gap?: number }
  //   loop=true  => 跳30s去重/冷却, 同文本队列里不重复积压, gap默认0
  //   loop=false => 普通模式, 30s 去重+冷却生效
  const enqueueSpeech = useCallback((text, priority = 'normal', opts = {}) => {
    return new Promise((resolve) => {
      const now = Date.now();

      if (opts?.loop) {
        // ===== loop 模式（告警循环用）=====
        // 队列去重：同文本队列里已经有一条了，就不再加（防止 interval 积压）
        if (voiceQueueRef.current.some(item => item.text === text)) {
          resolve();  // 未入队但 Promise 仍 resolve（不会有调用方 await loop 模式）
          return;
        }
        const gap = opts.gap ?? 0;
        voiceQueueRef.current.push({
          id: now, text, priority: 'alert', ts: now, gap, resolve,
        });
        speakNext();
        return;
      }

      // ===== 普通模式：30s 相同文本 + 同等级冷却 =====
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
        // critical 清空队列 + 打断当前 + 立即播
        voiceQueueRef.current = [{ id: now, text, priority, ts: now, gap: 0, resolve }];
        isSpeakingRef.current = false;
        setIsSpeaking(false);
        curPriorityRef.current = null;
        if (window.speechSynthesis) window.speechSynthesis.cancel();
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
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }, []);

  return (
    <VoiceContext.Provider value={{
      messages,
      pushMessage,
      clearMessages,
      latestAlert,
      pushAlert,
      enqueueSpeech,
      cancelAllSpeech,
      isSpeaking,
      // 全局录音阶段 & 音量
      voicePhase,
      setVoicePhase,
      audioLevel,
      setAudioLevel,
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
