import { useState, useRef, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { MessageCircle, Send, Mic, MicOff, Trash2, Settings2, User, Bot, Volume2, Bell } from 'lucide-react';
import { voiceMessages, voiceSettings } from '../data/mockData';

const WAKE_WORD = '小龙';

// 音频波形
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
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
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
  const [messages, setMessages] = useState(voiceMessages);
  const [inputText, setInputText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [settings, setSettings] = useState(voiceSettings);
  const [micError, setMicError] = useState(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [recordingTime, setRecordingTime] = useState(0);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [wakeListening, setWakeListening] = useState(false); // 唤醒词监听中
  const [wakeDetected, setWakeDetected] = useState(false); // 刚检测到唤醒词
  const [interimText, setInterimText] = useState(''); // 实时识别中间结果
  const [micPermission, setMicPermission] = useState('prompt'); // prompt | granted | denied
  const chatEndRef = useRef(null);
  const streamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const recognitionRef = useRef(null);
  const wakeRecognitionRef = useRef(null);
  const levelTimerRef = useRef(null);
  const recTimerRef = useRef(null);

  // 检测语音识别支持
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
      if (wakeRecognitionRef.current) try { wakeRecognitionRef.current.abort(); } catch(e) {}
      if (levelTimerRef.current) clearInterval(levelTimerRef.current);
      if (recTimerRef.current) clearInterval(recTimerRef.current);
    };
  }, []);

  // TTS 语音回复
  const speak = useCallback((text) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'zh-CN';
    utter.rate = 1 + settings.speedOffset * 0.1;
    utter.pitch = 1 + settings.pitchOffset * 0.1;
    // 尝试选择中文语音
    const voices = window.speechSynthesis.getVoices();
    const zhVoice = voices.find(v => v.lang.includes('zh'));
    if (zhVoice) utter.voice = zhVoice;
    window.speechSynthesis.speak(utter);
  }, [settings.speedOffset, settings.pitchOffset]);

  // 智能回复 - 精确识别并执行指令
  const generateReply = (text) => {
    const lower = text.toLowerCase();
    
    // ===== 导航类指令 =====
    if (lower.includes('导航到') || lower.includes('去') || lower.includes('目的地是')) {
      // 提取目的地
      let dest = '未知地点';
      const match = text.match(/(导航到|去|目的地是)\s*([\u4e00-\u9fa5a-zA-Z0-9]+)/);
      if (match && match[2]) dest = match[2];
      return `好的，已为您规划前往${dest}的路线。全程12.5公里，预计行驶时间25分钟，当前路况良好。`; 
    }
    if (lower.includes('加油站') || lower.includes('充电')) return '好的，已为您搜索附近加油站。前方2.3公里处有中国石化加油站，评分4.8星，油价7.5元/升。';
    if (lower.includes('停车场') || lower.includes('停车')) return '已为您找到最近停车场，距离300米，剩余车位充足，收费标准每小时5元。';
    
    // ===== 音乐类指令 =====
    if (lower.includes('播放') && (lower.includes('音乐') || lower.includes('歌'))) {
      if (lower.includes('流行') || lower.includes('热门')) return '正在为您播放最新流行歌曲榜，当前曲目：七里香 - 周杰伦';
      if (lower.includes('古典') || lower.includes('轻音乐')) return '正在为您播放古典音乐合集，当前曲目：River Flows in You - Yiruma';
      if (lower.includes('摇滚')) return '正在为您播放摇滚经典，当前曲目：Bohemian Rhapsody - Queen';
      return '正在为您播放推荐歌单，当前曲目：晴天 - 周杰伦';
    }
    if (lower.includes('暂停') || lower.includes('停止播放')) return '音乐已暂停。';
    if (lower.includes('下一首') || lower.includes('切歌')) return '已切换到下一首：稻香 - 周杰伦';
    if (lower.includes('音量') && (lower.includes('大') || lower.includes('高'))) return '音量已调至70%。';
    if (lower.includes('音量') && (lower.includes('小') || lower.includes('低'))) return '音量已调至30%。';
    
    // ===== 空调类指令 =====
    if (lower.includes('温度') || lower.includes('空调')) {
      const tempMatch = text.match(/(\d+)度/);
      if (tempMatch) {
        const temp = tempMatch[1];
        return `已将空调温度设置为${temp}度，风量自动调节中。`;
      }
      if (lower.includes('冷') || lower.includes('降温')) return '已为您将空调温度调低至20度，开启制冷模式。';
      if (lower.includes('热') || lower.includes('升温')) return '已为您将空调温度调高至26度，开启制热模式。';
      if (lower.includes('关闭') || lower.includes('关掉')) return '空调已关闭。';
      return '已为您调整空调温度至22度，风量调至中档。';
    }
    if (lower.includes('风速') || lower.includes('风量')) {
      if (lower.includes('大') || lower.includes('强')) return '风量已调至高档。';
      if (lower.includes('小') || lower.includes('弱')) return '风量已调至低档。';
      return '风量已调至中档。';
    }
    
    // ===== 车窗类指令 =====
    if (lower.includes('开窗') || lower.includes('打开窗')) {
      if (lower.includes('全部') || lower.includes('所有')) return '好的，已为您打开全部车窗。';
      if (lower.includes('主驾') || lower.includes('驾驶')) return '好的，已为您打开驾驶员侧车窗。';
      if (lower.includes('副驾') || lower.includes('乘客')) return '好的，已为您打开副驾驶侧车窗。';
      return '好的，已为您打开驾驶员侧车窗。';
    }
    if (lower.includes('关窗') || lower.includes('关闭窗')) return '好的，已为您关闭全部车窗。';
    
    // ===== 天气查询 =====
    if (lower.includes('天气')) {
      if (lower.includes('明天')) return '明天北京天气多云转晴，气温22-28度，风力2级，适合出行。';
      if (lower.includes('后天')) return '后天北京天气晴朗，气温20-26度，空气质量优。';
      return '当前北京天气晴朗，气温28度，湿度45%，PM2.5指数35，空气质量良好，适合驾驶出行。';
    }
    
    // ===== 疲劳提醒 =====
    if (lower.includes('疲劳') || lower.includes('累') || lower.includes('困')) {
      return '检测到您已连续驾驶1小时，建议在前方3公里处的服务区休息15分钟。已为您搜索附近咖啡厅和便利店。';
    }
    
    // ===== 电话类指令 =====
    if (lower.includes('打电话') || lower.includes('拨打')) {
      const nameMatch = text.match(/(打电话|拨打)\s*([\u4e00-\u9fa5a-zA-Z]+)/);
      if (nameMatch && nameMatch[2]) return `正在为您拨打${nameMatch[2]}的电话...`;
      return '请问您要拨打谁的电话？';
    }
    if (lower.includes('接听')) return '已为您接通来电。';
    if (lower.includes('挂断') || lower.includes('拒接')) return '通话已结束。';
    
    // ===== 日程提醒 =====
    if (lower.includes('日程') || lower.includes('安排') || lower.includes('会议')) {
      return '您今天下午3点有一个重要会议，地点在公司A栋3楼会议室。距离会议还有2小时，建议提前出发。';
    }
    
    // ===== 问候与闲聊 =====
    if (lower.includes('你好') || lower.includes('嗨') || lower.includes('在吗')) return '我在，有什么可以帮您的？';
    if (lower.includes('谢谢') || lower.includes('感谢')) return '不客气，随时为您服务！';
    if (lower.includes('再见') || lower.includes('拜拜')) return '祝您一路平安，再见！';
    
    // ===== 默认回复 =====
    return '已收到您的指令，正在为您处理。如需帮助，可以说"导航到XXX"、"播放音乐"、"调整温度"等。';
  };

  // 添加消息并语音回复
  const addAssistantReply = useCallback((userText) => {
    const now = new Date();
    const time = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
    const reply = generateReply(userText);
    setMessages(prev => [...prev, { role: 'assistant', text: reply, time }]);
    speak(reply);
  }, [speak]);

  const handleSend = () => {
    if (!inputText.trim()) return;
    const text = inputText.trim();
    setInputText('');
    setInterimText('');

    // 文字唤醒：输入"小龙"触发唤醒流程
    if (text === '小龙' || text.toLowerCase() === 'xiaolong') {
      setWakeDetected(true);
      const now = new Date();
      const time = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
      setMessages(prev => [...prev, { role: 'assistant', text: '我在，请说您的需求。', time }]);
      speak('我在，请说您的需求。');
      setTimeout(() => setWakeDetected(false), 2000);
      return;
    }

    const now = new Date();
    const time = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
    setMessages(prev => [...prev, { role: 'user', text, time }]);
    setTimeout(() => addAssistantReply(text), 500);
  };

  const handleClear = () => setMessages([]);

  // 启动麦克风 + 语音识别（用户手动点击）
  const startRecording = useCallback(async () => {
    try {
      setMicError(null);
      // 如果唤醒监听中，先停止
      if (wakeRecognitionRef.current) {
        try { wakeRecognitionRef.current.abort(); } catch(e) {}
        wakeRecognitionRef.current = null;
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

      // 音量检测
      const dataArr = new Uint8Array(analyser.frequencyBinCount);
      levelTimerRef.current = setInterval(() => {
        analyser.getByteTimeDomainData(dataArr);
        let sum = 0;
        for (let i = 0; i < dataArr.length; i++) { const v = (dataArr[i] - 128) / 128; sum += v * v; }
        setAudioLevel(Math.min(1, Math.sqrt(sum / dataArr.length) * 3));
      }, 100);

      setRecordingTime(0);
      recTimerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);

      // 语音识别
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
          if (final) {
            setInputText(prev => prev + final);
            setInterimText('');
          }
        };
        recognition.onerror = (e) => {
          console.warn('语音识别错误:', e.error);
          if (e.error === 'not-allowed') setMicError('麦克风权限被拒绝');
        };
        recognition.onend = () => {
          // 如果还在录音中，自动重启识别
          if (streamRef.current && recognitionRef.current === recognition) {
            try { recognition.start(); } catch(e) {}
          }
        };
        try { recognition.start(); } catch(e) {}
        recognitionRef.current = recognition;
      }

      setIsRecording(true);
    } catch (err) {
      console.error('麦克风启动失败:', err);
      let msg = '麦克风访问失败';
      if (err.name === 'NotAllowedError') msg = '麦克风权限被拒绝，请在浏览器设置中允许';
      else if (err.name === 'NotFoundError') msg = '未检测到麦克风';
      else if (err.name === 'NotReadableError') msg = '麦克风被其他程序占用';
      setMicError(msg);
    }
  }, []);

  // 停止录音
  const stopRecording = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) { audioCtxRef.current.close(); audioCtxRef.current = null; }
    analyserRef.current = null;
    if (recognitionRef.current) { try { recognitionRef.current.abort(); } catch(e) {} recognitionRef.current = null; }
    if (levelTimerRef.current) { clearInterval(levelTimerRef.current); levelTimerRef.current = null; }
    if (recTimerRef.current) { clearInterval(recTimerRef.current); recTimerRef.current = null; }

    // 发送已识别的文字
    const textToSend = (inputText + interimText).trim();
    if (textToSend) {
      const now = new Date();
      const time = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
      setMessages(prev => [...prev, { role: 'user', text: textToSend, time }]);
      setInputText('');
      setInterimText('');
      setTimeout(() => addAssistantReply(textToSend), 500);
    }

    setIsRecording(false);
    setAudioLevel(0);
    setRecordingTime(0);

    // 重新启动唤醒词监听
    setTimeout(() => startWakeListening(), 500);
  }, [inputText, interimText, addAssistantReply]);

  // ===== 唤醒词监听 =====
  const startWakeListening = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    // 如果已在监听或正在录音，不启动
    if (wakeRecognitionRef.current || isRecording) return;

    try {
      const wakeRec = new SR();
      wakeRec.lang = 'zh-CN';
      wakeRec.continuous = true;
      wakeRec.interimResults = true;

      wakeRec.onresult = (event) => {
        for (let i = 0; i < event.results.length; i++) {
          const text = event.results[i][0].transcript.toLowerCase();
          if (text.includes(WAKE_WORD.toLowerCase())) {
            setWakeDetected(true);
            // 停止唤醒监听
            try { wakeRec.abort(); } catch(e) {}
            wakeRecognitionRef.current = null;
            setWakeListening(false);
            // 自动启动录音
            setTimeout(() => {
              setWakeDetected(false);
              // 添加唤醒提示消息
              const now = new Date();
              const time = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
              setMessages(prev => [...prev, { role: 'assistant', text: '我在，请说您的需求。', time }]);
              speak('我在，请说您的需求。');
              startRecording();
            }, 800);
            break;
          }
        }
      };
      wakeRec.onerror = (e) => {
        if (e.error !== 'no-speech' && e.error !== 'aborted') {
          console.warn('唤醒监听错误:', e.error);
        }
      };
      wakeRec.onend = () => {
        // 自动重启唤醒监听（持续监听）
        if (wakeRecognitionRef.current === wakeRec && !isRecording) {
          try { wakeRec.start(); } catch(e) {}
        }
      };
      try { wakeRec.start(); } catch(e) {}
      wakeRecognitionRef.current = wakeRec;
      setWakeListening(true);
    } catch (e) {
      console.warn('启动唤醒监听失败:', e);
    }
  }, [isRecording, startRecording, speak]);

  // 手动开启唤醒词监听（需要用户交互后才能请求麦克风权限）
  const enableWakeWord = useCallback(() => {
    startWakeListening();
  }, [startWakeListening]);

  const formatRecTime = (s) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-1 section-header" style={{ color: 'var(--color-text-main)' }}>智能语音对话</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            语音 / 文字双模态交互 · 唤醒词「<span style={{ color: '#00d4ff', fontWeight: 600 }}>小龙</span>」
          </p>
        </div>
        <div className="flex items-center gap-3">
          {wakeListening && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full animate-pulse"
              style={{ background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.2)' }}>
              <Bell size={13} style={{ color: '#00d4ff' }} />
              <span className="text-xs font-medium" style={{ color: '#00d4ff' }}>等待唤醒</span>
            </div>
          )}
          {wakeDetected && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full"
              style={{ background: 'rgba(52,211,153,0.15)', border: '1px solid rgba(52,211,153,0.3)' }}>
              <span className="text-xs font-bold" style={{ color: '#34d399' }}>已唤醒!</span>
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

          {/* 录音面板 */}
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
              {/* 实时识别文字 */}
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
              title={isRecording ? '停止录音并发送' : '开始录音'}>
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
            <button onClick={handleSend}
              className="w-10 h-10 rounded-full flex items-center justify-center transition-all"
              style={{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-accent))', boxShadow: '0 0 12px rgba(0,212,255,0.3)' }}>
              <Send size={16} color="#0a0e1a" />
            </button>
          </div>
          {micError && <div className="mt-2 text-xs" style={{ color: '#ff4757' }}>{micError}</div>}

          {/* 快捷指令按钮 */}
          <div className="mt-3 flex flex-wrap gap-2">
            {['小龙', '导航到北京站', '播放流行音乐', '温度调到24度', '打开全部车窗', '明天天气', '打电话给张三'].map(cmd => (
              <button key={cmd} onClick={() => { setInputText(cmd); setTimeout(() => { const now = new Date(); const time = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`; if (cmd === '小龙') { setWakeDetected(true); setMessages(prev => [...prev, { role: 'assistant', text: '我在，请说您的需求。', time }]); speak('我在，请说您的需求。'); setTimeout(() => setWakeDetected(false), 2000); } else { setMessages(prev => [...prev, { role: 'user', text: cmd, time }]); setTimeout(() => addAssistantReply(cmd), 500); } setInputText(''); }, 100); }}
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
              <Bell size={14} style={{ color: '#00d4ff' }} />
              <span className="text-xs font-semibold" style={{ color: 'var(--color-text-main)' }}>唤醒词</span>
            </div>
            <div className="text-2xl font-bold text-center py-2" style={{ color: '#00d4ff' }}>小龙</div>
            <div className="text-xs text-center mb-2" style={{ color: 'var(--color-text-secondary)' }}>
              {wakeListening ? '正在监听唤醒词...' : wakeDetected ? '已唤醒!' : '点击下方按钮启用语音唤醒'}
            </div>
            {!wakeListening && (
              <button onClick={enableWakeWord}
                className="w-full py-2 rounded-lg text-xs font-medium transition-all"
                style={{ background: 'rgba(0,212,255,0.15)', border: '1px solid rgba(0,212,255,0.3)', color: '#00d4ff' }}>
                启用唤醒词监听
              </button>
            )}
            {wakeListening && (
              <div className="flex items-center justify-center gap-1.5 py-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-[#00d4ff] animate-pulse" />
                <span className="text-xs" style={{ color: '#00d4ff' }}>监听中</span>
              </div>
            )}
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

          {/* 麦克风状态 */}
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
                <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>唤醒监听</span>
                <span className="text-xs" style={{ color: wakeListening ? '#00ff88' : 'var(--color-text-muted)' }}>{wakeListening ? '监听中' : '未启动'}</span>
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
