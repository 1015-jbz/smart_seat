import { useEffect, useRef, useCallback, useState } from 'react';
import { useVehicle } from '../context/VehicleStore';
import { useVoice } from '../context/VoiceStore';
import { api } from '../services/api';
import CameraFeed from './CameraFeed';
import NotifyPanel from './NotifyPanel';
import MiniChat from './MiniChat';
import RecordingBar from './RecordingBar';

const WAKE_WORD = '小龙';

// ===== 本地命令识别（与 VoiceAssistant 保持一致）=====
function localCommandMatch(text) {
  const lower = text.toLowerCase();
  if (lower.includes('开窗') || lower.includes('打开窗')) {
    if (lower.includes('全部') || lower.includes('所有')) return '好的，已为您打开全部车窗。';
    if (lower.includes('主驾') || lower.includes('驾驶')) return '好的，已为您打开驾驶员侧车窗。';
    return '好的，已为您打开驾驶员侧车窗。';
  }
  if (lower.includes('关窗') || lower.includes('关闭窗')) return '好的，已为您关闭全部车窗。';
  if (lower.includes('温度') || lower.includes('空调')) {
    const tempMatch = text.match(/(\d+)度/);
    if (tempMatch) return `已将空调温度设置为${tempMatch[1]}度。`;
    if (lower.includes('冷') || lower.includes('降温')) return '已调低空调温度，开启制冷模式。';
    if (lower.includes('热') || lower.includes('升温')) return '已调高空调温度，开启制热模式。';
    if (lower.includes('关闭') || lower.includes('关掉')) return '空调已关闭。';
    return '已为您调整空调温度至22度。';
  }
  if (lower.includes('风速') || lower.includes('风量')) {
    if (lower.includes('大') || lower.includes('强')) return '风量已调至高档。';
    if (lower.includes('小') || lower.includes('弱')) return '风量已调至低档。';
    return '风量已调至中档。';
  }
  if (lower.includes('暂停') || lower.includes('停止播放')) return '音乐已暂停。';
  if (lower.includes('下一首') || lower.includes('切歌')) return '已切换到下一首。';
  if (lower.includes('音量') && lower.includes('大')) return '音量已调高。';
  if (lower.includes('音量') && lower.includes('小')) return '音量已调低。';
  if (lower.includes('接听')) return '已为您接通来电。';
  if (lower.includes('挂断') || lower.includes('拒接')) return '通话已结束。';
  return null;
}

export default function RightPanel() {
  const { setVoiceAlertCallback, setGreetingCallback, location, weather } = useVehicle();
  const {
    pushAlert, enqueueSpeech, pushMessage,
    voicePhase, setVoicePhase, audioLevel, setAudioLevel,
  } = useVoice();

  // ===== 全局唤醒 & 录音 refs =====
  const streamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const wakeRecRef = useRef(null);
  const recRef = useRef(null);
  const levelTimerRef = useRef(null);
  const processedRef = useRef(false);
  const [wakeListening, setWakeListening] = useState(false);
  const [micError, setMicError] = useState(null);
  const isRecordingRef = useRef(false);

  // ===== 清理：组件卸载时释放所有硬件资源 =====
  useEffect(() => {
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (audioCtxRef.current) audioCtxRef.current.close();
      if (wakeRecRef.current) try { wakeRecRef.current.abort(); } catch(e) {}
      if (recRef.current) try { recRef.current.abort(); } catch(e) {}
      if (levelTimerRef.current) clearInterval(levelTimerRef.current);
    };
  }, []);

  // ===== 生成回复（本地命令 → API → fallback）=====
  const generateReply = useCallback(async (text) => {
    const local = localCommandMatch(text);
    if (local) return { reply: local, source: 'local' };
    try {
      const ctx = { city: location?.city || '北京' };
      const res = await api.chat(text, ctx);
      if (res && res.reply) return { reply: res.reply, source: res.source };
    } catch (_) {}
    return { reply: '抱歉，AI 服务暂时不可用，请稍后再试。', source: 'fallback' };
  }, [location.city]);

  // ===== 停止麦克风硬件 =====
  const stopMicHardware = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) { audioCtxRef.current.close(); audioCtxRef.current = null; }
    analyserRef.current = null;
    if (recRef.current) { try { recRef.current.abort(); } catch(e) {} recRef.current = null; }
    if (levelTimerRef.current) { clearInterval(levelTimerRef.current); levelTimerRef.current = null; }
    isRecordingRef.current = false;
    setAudioLevel(0);
  }, [setAudioLevel]);

  // ===== 处理识别到的语音指令 =====
  const processVoiceCommand = useCallback(async (text) => {
    setVoicePhase('processing');
    if (!text) {
      setTimeout(() => { setVoicePhase('idle'); startWakeListen(); }, 600);
      return;
    }
    pushMessage('user', text, 'voice');
    setTimeout(async () => {
      const { reply } = await generateReply(text);
      pushMessage('assistant', reply, 'tts');
      await enqueueSpeech(reply, 'normal');
      setTimeout(() => { setVoicePhase('idle'); startWakeListen(); }, 800);
    }, 400);
  }, [generateReply, pushMessage, enqueueSpeech, setVoicePhase]);

  // ===== 开始录音（唤醒成功后）=====
  const startRecording = useCallback(async () => {
    try {
      setMicError(null);
      processedRef.current = false;
      // 录音开始前停掉唤醒监听，避免抢麦克风
      if (wakeRecRef.current) {
        try { wakeRecRef.current.abort(); } catch(e) {}
        wakeRecRef.current = null;
        setWakeListening(false);
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      analyserRef.current = analyser;
      const dataArr = new Uint8Array(analyser.frequencyBinCount);
      levelTimerRef.current = setInterval(() => {
        analyser.getByteTimeDomainData(dataArr);
        let sum = 0;
        for (let i = 0; i < dataArr.length; i++) { const v = (dataArr[i] - 128) / 128; sum += v * v; }
        setAudioLevel(Math.min(1, Math.sqrt(sum / dataArr.length) * 3));
      }, 100);
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SR) {
        const recognition = new SR();
        recognition.lang = 'zh-CN';
        recognition.continuous = true;
        recognition.interimResults = true;
        let finalText = '';
        recognition.onresult = (event) => {
          let interim = '';
          for (let i = 0; i < event.results.length; i++) {
            const t = event.results[i][0].transcript;
            if (event.results[i].isFinal) finalText += t;
            else interim += t;
          }
          if (finalText && !processedRef.current) {
            processedRef.current = true;
            stopMicHardware();
            processVoiceCommand(finalText.trim());
          }
        };
        recognition.onerror = (e) => {
          if (e.error === 'not-allowed') setMicError('麦克风权限被拒绝');
        };
        recognition.onend = () => {
          if (streamRef.current && recRef.current === recognition && !processedRef.current) {
            try { recognition.start(); } catch(e) {}
          }
        };
        try { recognition.start(); } catch(e) {}
        recRef.current = recognition;
      }
      isRecordingRef.current = true;
    } catch (err) {
      console.error('麦克风启动失败:', err);
      let msg = '麦克风访问失败';
      if (err.name === 'NotAllowedError') msg = '麦克风权限被拒绝，请在浏览器设置中允许';
      else if (err.name === 'NotFoundError') msg = '未检测到麦克风';
      else if (err.name === 'NotReadableError') msg = '麦克风被其他程序占用';
      setMicError(msg);
      setVoicePhase('idle');
      setTimeout(() => startWakeListen(), 500);
    }
  }, [stopMicHardware, processVoiceCommand, setVoicePhase, setAudioLevel]);

  // ===== 唤醒成功回调：TTS 播完再开麦 =====
  const triggerWake = useCallback(async () => {
    setVoicePhase('tts');
    pushMessage('assistant', '我在，请说您的需求。', 'tts');
    await enqueueSpeech('我在，请说您的需求。', 'greeting');
    setVoicePhase('listening');
    startRecording();
  }, [pushMessage, enqueueSpeech, setVoicePhase, startRecording]);

  // ===== 全局唤醒监听（持续运行，所有页面生效）=====
  const startWakeListen = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    if (wakeRecRef.current || isRecordingRef.current) return;
    try {
      const wakeRec = new SR();
      wakeRec.lang = 'zh-CN';
      wakeRec.continuous = true;
      wakeRec.interimResults = true;
      wakeRec.onresult = (event) => {
        for (let i = 0; i < event.results.length; i++) {
          const text = event.results[i][0].transcript.toLowerCase();
          if (text.includes(WAKE_WORD.toLowerCase())) {
            try { wakeRec.abort(); } catch(e) {}
            wakeRecRef.current = null;
            setWakeListening(false);
            setTimeout(() => { triggerWake(); }, 50);
            break;
          }
        }
      };
      wakeRec.onerror = (e) => {
        if (e.error !== 'no-speech' && e.error !== 'aborted') {
          console.warn('全局唤醒监听错误:', e.error);
        }
      };
      wakeRec.onend = () => {
        if (wakeRecRef.current === wakeRec && !isRecordingRef.current) {
          try { wakeRec.start(); } catch(e) {}
        }
      };
      try { wakeRec.start(); } catch(e) {}
      wakeRecRef.current = wakeRec;
      setWakeListening(true);
    } catch (e) {
      console.warn('启动全局唤醒监听失败:', e);
    }
  }, [triggerWake]);

  // 挂载后启动全局唤醒监听
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    // 等 1.5s 让页面就绪再启动，避免与其他初始化抢资源
    const t = setTimeout(() => startWakeListen(), 1500);
    return () => clearTimeout(t);
  }, [startWakeListen]);

  // ===== 疲劳告警回调（保留原逻辑）=====
  useEffect(() => {
    setVoiceAlertCallback((text, level, opts = {}) => {
      pushAlert(text, level);
      if (opts.logOnly) return;
      enqueueSpeech(text, level === 'critical' ? 'critical' : 'alert', { loop: !!opts.loop });
    });
  }, [setVoiceAlertCallback, pushAlert, enqueueSpeech]);

  // ===== 人脸问候回调（保留原逻辑）=====
  useEffect(() => {
    setGreetingCallback(() => {
      const now = new Date();
      const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
      const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 星期${weekDays[now.getDay()]}`;
      const hour = now.getHours();
      const timeGreet = hour < 6 ? '凌晨好' : hour < 12 ? '上午好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好';
      const city = location?.city || '';
      const weatherDesc = weather?.description ? `，${weather.description}` : '';
      const tempDesc = weather?.temperature != null ? `，${Math.round(weather.temperature)}度` : '';
      const greeting = `${timeGreet}！今天是${dateStr}${city ? '，' + city : ''}${weatherDesc}${tempDesc}。智能座舱为您服务，祝您一路平安。`;
      enqueueSpeech(greeting, 'greeting');
    });
  }, [setGreetingCallback, enqueueSpeech, location.city, weather.description, weather.temperature]);

  return (
    <aside
      className="flex flex-col gap-3 flex-shrink-0 p-3"
      style={{ width: 320, borderLeft: '1px solid var(--color-border)' }}
    >
      {/* 全局录音指示条：所有页面恒挂载，根据 voicePhase 决定是否显示 */}
      <div className="flex-shrink-0">
        <RecordingBar phase={voicePhase} audioLevel={audioLevel} />
        {wakeListening && voicePhase === 'idle' && (
          <div className="mt-2 flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg animate-pulse text-xs"
               style={{ background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.15)' }}>
            <span style={{ color: '#00d4ff' }}>●</span>
            <span style={{ color: 'var(--color-text-secondary)' }}>
              唤醒词「<span style={{ color: '#00d4ff', fontWeight: 600 }}>小龙</span>」聆听中
            </span>
          </div>
        )}
        {micError && (
          <div className="mt-2 text-xs px-2 py-1 rounded" style={{ color: '#ff4757', background: 'rgba(255,71,87,0.08)' }}>
            {micError}
          </div>
        )}
      </div>

      <CameraFeed />
      <NotifyPanel />
      <MiniChat />
    </aside>
  );
}
