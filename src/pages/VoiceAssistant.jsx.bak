import { useState, useRef, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { MessageCircle, Send, Mic, MicOff, Trash2, Settings2, User, Bot, Volume2, Loader2 } from 'lucide-react';
import { voiceSettings } from '../data/mockData';
import { useVehicle } from '../context/VehicleStore';
import { useVoice } from '../context/VoiceStore';
import { api } from '../services/api';

const nowHHMM = () => {
  const now = new Date();
  return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
};

const QUICK_COMMANDS = ['小龙', '导航到北京站', '播放流行音乐', '温度调到24度', '打开全部车窗', '明天天气', '打电话给张三'];

function AudioVisualizer({ analyser, isActive }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  useEffect(() => {
    if (!isActive || !analyser) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const buf = new Uint8Array(analyser.frequencyBinCount);
    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      analyser.getByteTimeDomainData(buf);
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#00d4ff';
      ctx.shadowColor = '#00d4ff';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      const sw = canvas.width / buf.length;
      let x = 0;
      for (let i = 0; i < buf.length; i++) {
        const y = (buf[i] / 128.0) * canvas.height / 2;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += sw;
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    };
    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [isActive, analyser]);
  return <canvas ref={canvasRef} width={300} height={50} className="rounded-lg w-full" style={{ height: 50, background: 'rgba(0,0,0,0.2)' }} />;
}

export default function VoiceAssistant() {
  const { username } = useOutletContext();
  const { location } = useVehicle();
  // voicePhase / audioLevel 从全局 VoiceStore 读取 → RecordingBar 在右侧栏全局展示
  const {
    messages, pushMessage, clearMessages, enqueueSpeech,
    voicePhase, setVoicePhase, audioLevel, setAudioLevel,
  } = useVoice();

  const [inputText, setInputText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [settings, setSettings] = useState(voiceSettings);
  const [micError, setMicError] = useState(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  const chatEndRef = useRef(null);
  const streamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const recognitionRef = useRef(null);
  const levelTimerRef = useRef(null);
  const recTimerRef = useRef(null);
  const processedRef = useRef(false);

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    setSpeechSupported(!!SR);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 清理
  useEffect(() => {
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (audioCtxRef.current) audioCtxRef.current.close();
      if (recognitionRef.current) try { recognitionRef.current.abort(); } catch(e) {}
      if (levelTimerRef.current) clearInterval(levelTimerRef.current);
      if (recTimerRef.current) clearInterval(recTimerRef.current);
    };
  }, []);

  // ===== 本地命令识别（与全局 RightPanel 保持一致）=====
  const localCommand = useCallback((text) => {
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
  }, []);

  const generateReply = useCallback(async (text) => {
    const local = localCommand(text);
    if (local) return { reply: local, source: 'local' };
    setAiLoading(true);
    try {
      const ctx = { city: location.city };
      const res = await api.chat(text, ctx);
      if (res && res.reply) return { reply: res.reply, source: res.source };
    } catch (_) {}
    finally { setAiLoading(false); }
    return { reply: '抱歉，AI 服务暂时不可用，请稍后再试。', source: 'fallback' };
  }, [location.city, localCommand]);

  const addAssistantReply = useCallback(async (userText) => {
    const { reply } = await generateReply(userText);
    pushMessage('assistant', reply, 'tts');
    await enqueueSpeech(reply, 'normal');
  }, [generateReply, pushMessage, enqueueSpeech]);

  // ===== 停止麦克风硬件（手动模式专用，注意同步全局 setAudioLevel）=====
  const stopMicHardware = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) { audioCtxRef.current.close(); audioCtxRef.current = null; }
    analyserRef.current = null;
    if (recognitionRef.current) { try { recognitionRef.current.abort(); } catch(e) {} recognitionRef.current = null; }
    if (levelTimerRef.current) { clearInterval(levelTimerRef.current); levelTimerRef.current = null; }
    if (recTimerRef.current) { clearInterval(recTimerRef.current); recTimerRef.current = null; }
    setIsRecording(false);
    setAudioLevel(0);
    setRecordingTime(0);
  }, [setAudioLevel]);

  // ===== 手动录音识别结果处理（同步全局 voicePhase）=====
  const processVoiceCommand = useCallback((text) => {
    setVoicePhase('processing');
    if (!text) {
      setTimeout(() => { setVoicePhase('idle'); }, 600);
      return;
    }
    pushMessage('user', text, 'voice');
    setInputText('');
    setInterimText('');
    setTimeout(async () => {
      await addAssistantReply(text);
      setTimeout(() => { setVoicePhase('idle'); }, 800);
    }, 400);
  }, [addAssistantReply, pushMessage, setVoicePhase]);

  // ===== 手动开始录音（点击麦克风按钮）=====
  const startRecording = useCallback(async () => {
    try {
      setMicError(null);
      processedRef.current = false;
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
      setRecordingTime(0);
      recTimerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SR) {
        const recognition = new SR();
        recognition.lang = 'zh-CN';
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.onresult = (event) => {
          let interim = '';
          let final = '';
          for (let i = 0; i < event.results.length; i++) {
            const t = event.results[i][0].transcript;
            if (event.results[i].isFinal) final += t;
            else interim += t;
          }
          setInterimText(interim);
          if (final && !processedRef.current) {
            processedRef.current = true;
            stopMicHardware();
            processVoiceCommand(final.trim());
          }
        };
        recognition.onerror = (e) => {
          console.warn('语音识别错误:', e.error);
          if (e.error === 'not-allowed') setMicError('麦克风权限被拒绝');
        };
        recognition.onend = () => {
          if (streamRef.current && recognitionRef.current === recognition && !processedRef.current) {
            try { recognition.start(); } catch(e) {}
          }
        };
        try { recognition.start(); } catch(e) {}
        recognitionRef.current = recognition;
      }
      setIsRecording(true);
      setVoicePhase('listening');
    } catch (err) {
      console.error('麦克风启动失败:', err);
      let msg = '麦克风访问失败';
      if (err.name === 'NotAllowedError') msg = '麦克风权限被拒绝，请在浏览器设置中允许';
      else if (err.name === 'NotFoundError') msg = '未检测到麦克风';
      else if (err.name === 'NotReadableError') msg = '麦克风被其他程序占用';
      setMicError(msg);
      setVoicePhase('idle');
    }
  }, [stopMicHardware, processVoiceCommand, setAudioLevel, setVoicePhase]);

  // ===== 触发唤醒（手动场景：用户在输入框输入「小龙」或点快捷指令）=====
  const triggerWake = useCallback(async () => {
    setVoicePhase('tts');
    pushMessage('assistant', '我在，请说您的需求。', 'tts');
    await enqueueSpeech('我在，请说您的需求。', 'greeting');
    setVoicePhase('listening');
    startRecording();
  }, [pushMessage, enqueueSpeech, setVoicePhase, startRecording]);

  const stopRecording = useCallback(() => {
    processedRef.current = true;
    stopMicHardware();
    setInputText('');
    setInterimText('');
  }, [stopMicHardware]);

  const handleSend = () => {
    if (!inputText.trim()) return;
    const text = inputText.trim();
    setInputText('');
    setInterimText('');
    if (text === '小龙' || text.toLowerCase() === 'xiaolong') {
      triggerWake();
      return;
    }
    pushMessage('user', text, 'text');
    setTimeout(() => addAssistantReply(text), 500);
  };

  const handleQuickCommand = (cmd) => {
    setInputText('');
    setInterimText('');
    if (cmd === '小龙') { triggerWake(); return; }
    pushMessage('user', cmd, 'voice');
    setTimeout(() => addAssistantReply(cmd), 500);
  };

  const handleClear = () => clearMessages();

  const formatRecTime = (s) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  // 全局右栏 RecordingBar 使用 voicePhase 判断当前阶段。本页只在手动录音时显示详细面板。
  // 注意：voicePhase 同时会被全局唤醒录音修改。

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-1 section-header" style={{ color: 'var(--color-text-main)' }}>智能语音对话</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            语音 / 文字双模态交互 · 全局唤醒词「<span style={{ color: '#00d4ff', fontWeight: 600 }}>小龙</span>」
          </p>
        </div>
        {/* 交互阶段指示（小标签） */}
        <div className="flex items-center gap-3">
          {voicePhase === 'tts' && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full"
              style={{ background: 'rgba(120,120,120,0.08)', border: '1px solid rgba(120,120,120,0.2)' }}>
              <Volume2 size={13} style={{ color: '#888' }} />
              <span className="text-xs font-medium" style={{ color: '#888' }}>小龙回复中</span>
            </div>
          )}
          {voicePhase === 'listening' && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full animate-pulse"
              style={{ background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.3)' }}>
              <Mic size={13} style={{ color: '#34d399' }} />
              <span className="text-xs font-medium" style={{ color: '#34d399' }}>聆听中</span>
            </div>
          )}
          {voicePhase === 'processing' && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full"
              style={{ background: 'rgba(79,140,255,0.12)', border: '1px solid rgba(79,140,255,0.3)' }}>
              <Loader2 size={13} style={{ color: '#4f8cff' }} className="animate-spin" />
              <span className="text-xs font-medium" style={{ color: '#4f8cff' }}>识别处理中</span>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-5" style={{ height: 'calc(100vh - 160px)' }}>
        {/* 聊天区域 */}
        <div className="col-span-2 glass-card p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <MessageCircle size={18} style={{ color: '#f472b6' }} />
              <h3 className="text-sm font-semibold">对话记录</h3>
            </div>
            <div className="flex items-center gap-2">
              <span className={`status-dot ${speechSupported ? 'online' : 'offline'}`} />
              <span className="text-xs" style={{ color: speechSupported ? 'var(--color-accent)' : 'var(--color-text-muted)' }}>
                {speechSupported ? '语音识别就绪' : '浏览器不支持语音识别'}
              </span>
            </div>
          </div>

          {/* 消息列表 */}
          <div className="flex-1 overflow-y-auto mb-4 space-y-3 pr-2" style={{ minHeight: 0 }}>
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-slide-in`}>
                <div className={`flex gap-2 max-w-[75%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center" style={{
                    background: msg.role === 'user' ? 'rgba(0,212,255,0.15)' : 'rgba(244,114,182,0.15)',
                  }}>
                    {msg.role === 'user' ? <User size={16} style={{ color: '#00d4ff' }} /> : <Bot size={16} style={{ color: '#f472b6' }} />}
                  </div>
                  <div>
                    {msg.role === 'user' && (
                      <div className="text-xs mb-1 text-right" style={{ color: 'var(--color-text-secondary)' }}>{username}</div>
                    )}
                    <div className={`rounded-2xl px-4 py-2.5 text-sm ${msg.role === 'user' ? 'rounded-tr-sm' : 'rounded-tl-sm'}`} style={{
                      background: msg.role === 'user'
                        ? 'linear-gradient(135deg, rgba(0,212,255,0.2), rgba(0,255,136,0.1))'
                        : 'rgba(255,255,255,0.05)',
                      border: `1px solid ${msg.role === 'user' ? 'rgba(0,212,255,0.3)' : 'rgba(255,255,255,0.08)'}`,
                    }}>
                      {msg.text}
                    </div>
                    <div className={`text-xs mt-1 ${msg.role === 'user' ? 'text-right' : ''}`} style={{ color: 'var(--color-text-secondary)' }}>
                      {msg.time}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* 手动录音详细面板（仅本页麦克风按钮触发时显示） */}
          {isRecording && (
            <div className="mb-3 p-3 rounded-xl animate-fade-in" style={{
              background: 'rgba(255,71,87,0.06)', border: '1px solid rgba(255,71,87,0.2)',
            }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#ff4757] animate-pulse" />
                  <span className="text-xs font-medium" style={{ color: '#ff4757' }}>录音中 {formatRecTime(recordingTime)}</span>
                </div>
                <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(0,212,255,0.1)', color: '#00d4ff' }}>语音识别中</span>
              </div>
              <AudioVisualizer analyser={analyserRef.current} isActive={isRecording} />
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>音量</span>
                <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <div className="h-full rounded-full transition-all duration-100" style={{
                    width: `${audioLevel * 100}%`,
                    background: audioLevel > 0.5 ? '#ff4757' : audioLevel > 0.2 ? '#ffa502' : '#00d4ff',
                  }} />
                </div>
                <span className="text-xs font-mono" style={{ color: '#00d4ff' }}>{Math.round(audioLevel * 100)}%</span>
              </div>
              {interimText && (
                <div className="mt-2 text-xs italic" style={{ color: 'var(--color-text-sub)' }}>
                  识别中: {interimText}
                </div>
              )}
            </div>
          )}

          {/* 输入区域 */}
          <div className="flex items-center gap-3">
            <button onClick={isRecording ? stopRecording : startRecording}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 flex-shrink-0 ${isRecording ? 'animate-pulse-glow' : ''}`}
              style={{
                background: isRecording ? 'rgba(255,71,87,0.2)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${isRecording ? '#ff4757' : 'var(--color-border-glow)'}`,
              }}
              title={isRecording ? '取消录音' : '开始录音'}>
              {isRecording ? <MicOff size={18} style={{ color: '#ff4757' }} /> : <Mic size={18} style={{ color: 'var(--color-text-secondary)' }} />}
            </button>
            <div className="flex-1 relative">
              <input type="text" value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder={isRecording ? '正在聆听...说话内容将自动显示' : '输入消息或点击麦克风说话...'}
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: `1px solid ${isRecording ? 'rgba(0,212,255,0.3)' : 'var(--color-border-glow)'}`,
                  color: 'var(--color-text-primary)',
                }} />
            </div>
            <button onClick={handleSend} disabled={aiLoading}
              className="w-10 h-10 rounded-full flex items-center justify-center transition-all"
              style={{ background: aiLoading ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg, var(--color-primary), var(--color-accent))', boxShadow: aiLoading ? 'none' : '0 0 12px rgba(0,212,255,0.3)' }}>
              {aiLoading ? <Loader2 size={16} className="animate-spin" color="#00d4ff" /> : <Send size={16} color="#0a0e1a" />}
            </button>
          </div>
          {micError && <div className="mt-2 text-xs" style={{ color: '#ff4757' }}>{micError}</div>}

          {/* 快捷指令按钮 */}
          <div className="mt-3 flex flex-wrap gap-2">
            {QUICK_COMMANDS.map(cmd => (
              <button key={cmd} onClick={() => handleQuickCommand(cmd)}
                className="px-3 py-1.5 rounded-full text-xs transition-all hover:scale-105"
                style={{ background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.2)', color: 'var(--color-text-secondary)' }}>
                {cmd}
              </button>
            ))}
          </div>
        </div>

        {/* 右侧设置 */}
        <div className="glass-card p-5 overflow-y-auto">
          <div className="flex items-center gap-2 mb-4">
            <Settings2 size={18} style={{ color: '#a78bfa' }} />
            <h3 className="text-sm font-semibold">语音设置</h3>
          </div>

          {/* 唤醒词 */}
          <div className="mb-5 p-3 rounded-xl" style={{ background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.15)' }}>
            <div className="flex items-center gap-2 mb-2">
              <Volume2 size={14} style={{ color: '#00d4ff' }} />
              <span className="text-xs font-semibold" style={{ color: 'var(--color-text-main)' }}>全局唤醒词</span>
            </div>
            <div className="text-2xl font-bold text-center py-2" style={{ color: '#00d4ff' }}>小龙</div>
            <div className="text-xs text-center mb-2" style={{ color: 'var(--color-text-secondary)' }}>
              任意页面直接说「<span style={{ color: '#00d4ff', fontWeight: 600 }}>小龙</span>」即可唤起对话
            </div>
            <div className="flex items-center justify-center gap-1.5 py-1.5"
                 style={{ background: 'rgba(0,212,255,0.04)', borderRadius: 8 }}>
              <div className="w-1.5 h-1.5 rounded-full bg-[#00d4ff] animate-pulse" />
              <span className="text-xs" style={{ color: '#00d4ff' }}>右栏全局监听中</span>
            </div>
          </div>

          {/* 语音角色 */}
          <div className="mb-5">
            <label className="text-xs mb-2 block" style={{ color: 'var(--color-text-secondary)' }}>语音角色</label>
            <select value={settings.selectedRole} onChange={(e) => setSettings({ ...settings, selectedRole: Number(e.target.value) })}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border-glow)', color: 'var(--color-text-primary)' }}>
              {settings.roles.map((r, i) => <option key={i} value={i} style={{ background: '#0a0e1a' }}>{r}</option>)}
            </select>
          </div>

          <div className="mb-5">
            <div className="flex justify-between mb-2">
              <label className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>音高偏移</label>
              <span className="text-xs font-medium text-[var(--color-primary)]">{settings.pitchOffset > 0 ? '+' : ''}{settings.pitchOffset}</span>
            </div>
            <input type="range" min="-5" max="5" value={settings.pitchOffset}
              onChange={(e) => setSettings({ ...settings, pitchOffset: Number(e.target.value) })} className="w-full" />
          </div>

          <div className="mb-5">
            <div className="flex justify-between mb-2">
              <label className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>语速偏移</label>
              <span className="text-xs font-medium text-[var(--color-primary)]">{settings.speedOffset > 0 ? '+' : ''}{settings.speedOffset}</span>
            </div>
            <input type="range" min="-5" max="5" value={settings.speedOffset}
              onChange={(e) => setSettings({ ...settings, speedOffset: Number(e.target.value) })} className="w-full" />
          </div>

          <div className="mb-5">
            <label className="text-xs mb-2 block" style={{ color: 'var(--color-text-secondary)' }}>风格预设</label>
            <div className="grid grid-cols-2 gap-2">
              {settings.styles.map((style, i) => (
                <button key={style} onClick={() => setSettings({ ...settings, selectedStyle: i })}
                  className="px-3 py-2 rounded-lg text-xs transition-all"
                  style={{
                    background: settings.selectedStyle === i ? 'rgba(0,212,255,0.15)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${settings.selectedStyle === i ? 'var(--color-primary)' : 'var(--color-border-glow)'}`,
                    color: settings.selectedStyle === i ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                  }}>{style}</button>
              ))}
            </div>
          </div>

          {/* 设备状态 */}
          <div className="mb-5 p-3 rounded-xl" style={{ background: 'rgba(0,212,255,0.04)', border: '1px solid rgba(0,212,255,0.1)' }}>
            <div className="flex items-center gap-2 mb-2">
              <Volume2 size={14} style={{ color: '#00d4ff' }} />
              <span className="text-xs font-semibold" style={{ color: 'var(--color-text-main)' }}>设备状态</span>
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>麦克风</span>
                <span className="text-xs" style={{ color: isRecording ? '#00ff88' : 'var(--color-text-muted)' }}>{isRecording ? '已连接' : '未激活'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>语音识别</span>
                <span className="text-xs" style={{ color: speechSupported ? '#00ff88' : '#ffa502' }}>{speechSupported ? '支持' : '不支持'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>全局唤醒</span>
                <span className="text-xs" style={{ color: '#00ff88' }}>右栏监听中</span>
              </div>
            </div>
          </div>

          <button onClick={handleClear}
            className="w-full py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm transition-all"
            style={{ background: 'rgba(255,71,87,0.1)', border: '1px solid rgba(255,71,87,0.3)', color: '#ff4757' }}>
            <Trash2 size={14} /> 清空对话
          </button>
        </div>
      </div>
    </div>
  );
}
