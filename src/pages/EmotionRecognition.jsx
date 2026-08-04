import { useState, useEffect, useRef, useCallback } from 'react';
import { Smile, Camera, CameraOff, User, Settings2, Activity, Eye, Clock, Video, VideoOff, RotateCcw } from 'lucide-react';
import ProgressBar from '../components/ProgressBar';
import { emotionData } from '../data/mockData';

const emotions = [
  { name: '平静', emoji: '😌', color: '#00d4ff' },
  { name: '开心', emoji: '😊', color: '#00ff88' },
  { name: '悲伤', emoji: '😢', color: '#a78bfa' },
  { name: '愤怒', emoji: '😠', color: '#ff4757' },
  { name: '惊讶', emoji: '😲', color: '#ffa502' },
  { name: '恐惧', emoji: '😨', color: '#f472b6' },
  { name: '专注', emoji: '🧐', color: '#38bdf8' },
];

// 面部关键点
const faceLandmarks = [
  { x: 38, y: 32 }, { x: 41, y: 31 }, { x: 44, y: 32 }, { x: 41, y: 34 },
  { x: 56, y: 32 }, { x: 59, y: 31 }, { x: 62, y: 32 }, { x: 59, y: 34 },
  { x: 50, y: 42 },
  { x: 44, y: 52 }, { x: 50, y: 54 }, { x: 56, y: 52 }, { x: 50, y: 56 },
  { x: 37, y: 27 }, { x: 43, y: 26 }, { x: 57, y: 26 }, { x: 63, y: 27 },
  { x: 35, y: 40 }, { x: 37, y: 48 }, { x: 42, y: 55 }, { x: 50, y: 58 },
  { x: 58, y: 55 }, { x: 63, y: 48 }, { x: 65, y: 40 },
];

// 情绪趋势图
function EmotionTrendChart({ history }) {
  const width = 520, height = 120;
  const pad = { top: 10, right: 10, bottom: 25, left: 35 };
  const cW = width - pad.left - pad.right;
  const cH = height - pad.top - pad.bottom;

  const points = history.map((h, i) => {
    const x = pad.left + (i / Math.max(history.length - 1, 1)) * cW;
    const y = pad.top + cH - (h.confidence * cH);
    const eObj = emotions.find(e => e.name === h.emotion);
    return { x, y, ...h, color: eObj?.color || '#00d4ff' };
  });

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const areaD = pathD + ` L${points[points.length - 1]?.x || 0},${pad.top + cH} L${points[0]?.x || 0},${pad.top + cH} Z`;

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      {[0, 0.25, 0.5, 0.75, 1].map(v => {
        const y = pad.top + cH - v * cH;
        return (
          <g key={v}>
            <line x1={pad.left} y1={y} x2={pad.left + cW} y2={y} stroke="rgba(255,255,255,0.06)" strokeDasharray="3,3" />
            <text x={pad.left - 5} y={y + 3} textAnchor="end" fill="rgba(255,255,255,0.3)" fontSize="9">{Math.round(v * 100)}%</text>
          </g>
        );
      })}
      {points.length > 1 && <path d={areaD} fill="url(#trendGrad)" opacity="0.3" />}
      {points.length > 1 && <path d={pathD} fill="none" stroke="#00d4ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="4" fill={p.color} stroke="#0a0e1a" strokeWidth="2" />
          <text x={p.x} y={pad.top + cH + 15} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="8">{p.time.slice(3)}</text>
        </g>
      ))}
      <defs>
        <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#00d4ff" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#00d4ff" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

// 扫描线
function ScanLine() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 5 }}>
      <div className="absolute w-full h-[2px] scan-line-anim"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(0,212,255,0.3), transparent)', boxShadow: '0 0 15px rgba(0,212,255,0.2)' }} />
    </div>
  );
}

export default function EmotionRecognition() {
  const [currentEmotion, setCurrentEmotion] = useState(emotionData.currentEmotion);
  const [confidence, setConfidence] = useState(emotionData.confidence);
  const [logs, setLogs] = useState(emotionData.emotionHistory);
  const [faceBox, setFaceBox] = useState({ x: 30, y: 15, w: 35, h: 50 });
  const [fps, setFps] = useState(0);
  const [showLandmarks, setShowLandmarks] = useState(true);
  const [allEmotionScores, setAllEmotionScores] = useState(
    Object.fromEntries(emotions.map(e => [e.name, e.name === emotionData.currentEmotion ? emotionData.confidence : Math.random() * 0.2]))
  );
  const [detectionStatus, setDetectionStatus] = useState('idle');
  const [elapsedTime, setElapsedTime] = useState(0);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [facingMode, setFacingMode] = useState('user');
  const [videoResolution, setVideoResolution] = useState({ w: 0, h: 0 });

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fpsCountRef = useRef(0);
  const lastFpsTimeRef = useRef(Date.now());

  // 启动摄像头
  const startCamera = useCallback(async (facing = facingMode) => {
    try {
      setCameraError(null);
      setDetectionStatus('starting');

      // 先停止已有流
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }

      const constraints = {
        video: {
          facingMode: facing,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        // 获取实际分辨率
        const track = stream.getVideoTracks()[0];
        const settings = track.getSettings();
        setVideoResolution({ w: settings.width || 640, h: settings.height || 480 });
      }

      setCameraActive(true);
      setDetectionStatus('tracking');
      setElapsedTime(0);
    } catch (err) {
      console.error('摄像头启动失败:', err);
      let msg = '摄像头访问失败';
      if (err.name === 'NotAllowedError') msg = '摄像头权限被拒绝，请在浏览器设置中允许访问';
      else if (err.name === 'NotFoundError') msg = '未检测到摄像头设备';
      else if (err.name === 'NotReadableError') msg = '摄像头被其他程序占用';
      else if (err.name === 'OverconstrainedError') msg = '摄像头不支持请求的参数';
      setCameraError(msg);
      setCameraActive(false);
      setDetectionStatus('error');
    }
  }, [facingMode]);

  // 停止摄像头
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setDetectionStatus('idle');
    setElapsedTime(0);
  }, []);

  // 切换前后摄像头
  const switchCamera = useCallback(() => {
    const newFacing = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(newFacing);
    if (cameraActive) {
      setTimeout(() => startCamera(newFacing), 100);
    }
  }, [facingMode, cameraActive, startCamera]);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  // FPS 计算
  useEffect(() => {
    if (!cameraActive) { setFps(0); return; }
    const video = videoRef.current;
    if (!video) return;

    let rafId;
    const countFrames = () => {
      fpsCountRef.current++;
      const now = Date.now();
      if (now - lastFpsTimeRef.current >= 1000) {
        setFps(fpsCountRef.current);
        fpsCountRef.current = 0;
        lastFpsTimeRef.current = now;
      }
      rafId = requestAnimationFrame(countFrames);
    };
    rafId = requestAnimationFrame(countFrames);
    return () => cancelAnimationFrame(rafId);
  }, [cameraActive]);

  // 计时器
  useEffect(() => {
    if (!cameraActive) return;
    const timer = setInterval(() => setElapsedTime(t => t + 1), 1000);
    return () => clearInterval(timer);
  }, [cameraActive]);

  // 情绪相似度矩阵（用于自然过渡）
  const emotionTransitions = {
    '平静': { '平静': 0.45, '专注': 0.25, '开心': 0.15, '悲伤': 0.05, '惊讶': 0.05, '愤怒': 0.02, '恐惧': 0.03 },
    '开心': { '开心': 0.40, '平静': 0.25, '惊讶': 0.15, '专注': 0.10, '悲伤': 0.03, '愤怒': 0.03, '恐惧': 0.04 },
    '专注': { '专注': 0.45, '平静': 0.30, '开心': 0.10, '惊讶': 0.05, '悲伤': 0.03, '愤怒': 0.04, '恐惧': 0.03 },
    '悲伤': { '悲伤': 0.40, '平静': 0.30, '愤怒': 0.12, '恐惧': 0.10, '开心': 0.03, '惊讶': 0.03, '专注': 0.02 },
    '愤怒': { '愤怒': 0.35, '平静': 0.20, '悲伤': 0.15, '恐惧': 0.12, '惊讶': 0.10, '开心': 0.03, '专注': 0.05 },
    '惊讶': { '惊讶': 0.30, '开心': 0.20, '平静': 0.20, '恐惧': 0.15, '专注': 0.08, '悲伤': 0.04, '愤怒': 0.03 },
    '恐惧': { '恐惧': 0.35, '惊讶': 0.20, '悲伤': 0.18, '平静': 0.12, '愤怒': 0.08, '专注': 0.04, '开心': 0.03 },
  };

  // 基于视频帧分析 + 加权情绪模拟
  const analysisCanvasRef = useRef(null);
  const emotionStateRef = useRef({
    current: emotionData.currentEmotion,
    baseConfidence: 0.88,
    frameCount: 0,
    lastAnalysis: 0,
    brightnessHistory: [],
  });

  useEffect(() => {
    if (!cameraActive) return;

    // 分析画布用于采样视频帧
    const aCanvas = analysisCanvasRef.current || document.createElement('canvas');
    aCanvas.width = 32;
    aCanvas.height = 32;
    analysisCanvasRef.current = aCanvas;
    const aCtx = aCanvas.getContext('2d', { willReadFrequently: true });

    // 情绪分析主循环
    const analyzeInterval = setInterval(() => {
      const state = emotionStateRef.current;
      state.frameCount++;

      // 采样视频帧获取亮度信息
      let brightness = 0;
      let variance = 0;
      if (videoRef.current && videoRef.current.readyState >= 2) {
        try {
          aCtx.drawImage(videoRef.current, 0, 0, 32, 32);
          const imgData = aCtx.getImageData(0, 0, 32, 32);
          const pixels = [];
          for (let i = 0; i < imgData.data.length; i += 4) {
            const b = (imgData.data[i] * 0.299 + imgData.data[i+1] * 0.587 + imgData.data[i+2] * 0.114);
            pixels.push(b);
            brightness += b;
          }
          brightness /= pixels.length;
          variance = pixels.reduce((s, p) => s + (p - brightness) ** 2, 0) / pixels.length;
        } catch (e) { /* 忽略跨域错误 */ }
      }

      state.brightnessHistory.push(brightness);
      if (state.brightnessHistory.length > 10) state.brightnessHistory.shift();

      // 基于亮度变化模拟「面部活动度」
      const brightChange = state.brightnessHistory.length > 1
        ? Math.abs(brightness - state.brightnessHistory[state.brightnessHistory.length - 2])
        : 0;
      const activityLevel = Math.min(brightChange / 30, 1); // 0~1

      // 阶段一：分析中（每5次循环有1次进入深度分析）
      if (state.frameCount % 5 === 0) {
        setDetectionStatus('analyzing');
        // 模拟分析耗时
        setTimeout(() => {
          performEmotionUpdate(state, activityLevel, variance);
          setDetectionStatus('tracking');
        }, 600 + Math.random() * 400);
      } else {
        performEmotionUpdate(state, activityLevel, variance);
      }
    }, 2000);

    function performEmotionUpdate(state, activityLevel, variance) {
      // 加权随机游走选择新情绪
      const transWeights = emotionTransitions[state.current] || {};
      const roll = Math.random();
      let cumulative = 0;
      let nextEmotion = state.current;
      for (const [emotion, weight] of Object.entries(transWeights)) {
        cumulative += weight;
        if (roll <= cumulative) {
          nextEmotion = emotion;
          break;
        }
      }

      // 活动度影响：高活动度时更可能是 开心/惊讶，低活动度更可能是 平静/专注
      if (activityLevel > 0.5 && Math.random() < 0.3) {
        const activeEmotions = ['开心', '惊讶'];
        nextEmotion = activeEmotions[Math.floor(Math.random() * activeEmotions.length)];
      } else if (activityLevel < 0.15 && Math.random() < 0.4) {
        const calmEmotions = ['平静', '专注'];
        nextEmotion = calmEmotions[Math.floor(Math.random() * calmEmotions.length)];
      }

      // 置信度：基于画面稳定性，稳定时置信度高
      const baseConf = state.baseConfidence;
      const stabilityFactor = Math.max(0, 1 - activityLevel * 0.3); // 越稳定越高
      const newConf = Math.min(0.97, Math.max(0.62,
        baseConf * 0.7 + stabilityFactor * 0.2 + (Math.random() - 0.5) * 0.08
      ));
      state.baseConfidence = newConf * 0.6 + baseConf * 0.4; // 平滑基准

      state.current = nextEmotion;
      setCurrentEmotion(nextEmotion);
      setConfidence(newConf);

      // 生成合理的全情绪分布（softmax 风格）
      const scores = {};
      let totalWeight = 0;
      emotions.forEach(e => {
        let w;
        if (e.name === nextEmotion) {
          w = newConf;
        } else if (emotionTransitions[nextEmotion]?.[e.name] > 0.15) {
          // 相似情绪给一些分数
          w = emotionTransitions[nextEmotion][e.name] * (0.3 + Math.random() * 0.2);
        } else {
          w = Math.random() * 0.06;
        }
        scores[e.name] = w;
        totalWeight += w;
      });
      // 归一化
      Object.keys(scores).forEach(k => { scores[k] = scores[k] / totalWeight; });
      setAllEmotionScores(scores);

      // 人脸框微动（基于画面活动度）
      const jitter = Math.max(0.5, activityLevel * 3);
      setFaceBox(prev => ({
        x: Math.max(15, Math.min(45, prev.x + (Math.random() - 0.5) * jitter)),
        y: Math.max(8, Math.min(25, prev.y + (Math.random() - 0.5) * jitter)),
        w: Math.max(28, Math.min(42, prev.w + (Math.random() - 0.5) * jitter * 0.5)),
        h: Math.max(42, Math.min(58, prev.h + (Math.random() - 0.5) * jitter * 0.5)),
      }));

      // 写日志
      const now = new Date();
      const time = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`;
      setLogs(prev => [...prev.slice(-14), { time, emotion: nextEmotion, confidence: newConf }]);
    }

    return () => clearInterval(analyzeInterval);
  }, [cameraActive]);

  const currentEmotionObj = emotions.find(e => e.name === currentEmotion) || emotions[0];
  const formatTime = (s) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-1 section-header" style={{ color: 'var(--color-text-main)' }}>实时表情识别</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>基于端侧 AI 的驾驶员面部情绪分析</p>
        </div>
        <div className="flex items-center gap-4">
          {cameraActive && (
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              <Clock size={14} />
              <span>运行 {formatTime(elapsedTime)}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className={`status-dot ${cameraActive ? 'online' : 'offline'}`} />
            <span className="text-xs font-medium" style={{
              color: cameraActive ? 'var(--color-accent)' : 'var(--color-text-secondary)',
            }}>
              {!cameraActive ? '未连接' : detectionStatus === 'tracking' ? '追踪中' : detectionStatus === 'analyzing' ? '分析中' : '启动中'}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-5">
        {/* 摄像头画面 */}
        <div className="col-span-8 glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Camera size={18} style={{ color: '#00d4ff' }} />
            <h3 className="text-sm font-semibold">摄像头画面</h3>
            <div className="ml-auto flex items-center gap-3">
              {cameraActive && (
                <>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <div className="w-7 h-4 rounded-full transition-colors"
                      style={{ background: showLandmarks ? 'var(--color-primary)' : 'rgba(255,255,255,0.1)' }}
                      onClick={() => setShowLandmarks(!showLandmarks)}>
                      <div className="w-3 h-3 rounded-full bg-white transition-all mt-0.5"
                        style={{ transform: showLandmarks ? 'translateX(14px)' : 'translateX(2px)' }} />
                    </div>
                    <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>关键点</span>
                  </label>
                  <span className="px-2 py-0.5 rounded text-xs font-mono"
                    style={{ background: 'rgba(0,212,255,0.1)', color: '#00d4ff' }}>
                    {fps} FPS
                  </span>
                  {videoResolution.w > 0 && (
                    <span className="text-xs font-mono" style={{ color: 'var(--color-text-secondary)' }}>
                      {videoResolution.w}×{videoResolution.h}
                    </span>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="relative w-full rounded-xl overflow-hidden"
            style={{ height: 360, background: 'linear-gradient(135deg, #0d1117, #161b22)' }}>

            {/* 真实摄像头视频 */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full"
              style={{
                objectFit: 'cover',
                transform: facingMode === 'user' ? 'scaleX(-1)' : 'none', // 前置摄像头镜像
                display: cameraActive ? 'block' : 'none',
              }}
            />

            {/* 摄像头未开启时的占位 */}
            {!cameraActive && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                {cameraError ? (
                  <>
                    <CameraOff size={48} style={{ color: '#ff4757', opacity: 0.5 }} />
                    <div className="text-center">
                      <div className="text-sm font-medium mb-1" style={{ color: '#ff4757' }}>{cameraError}</div>
                      <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                        请检查摄像头连接和浏览器权限设置
                      </div>
                    </div>
                    <button onClick={() => startCamera()}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:scale-105"
                      style={{ background: 'rgba(0,212,255,0.15)', color: '#00d4ff', border: '1px solid rgba(0,212,255,0.3)' }}>
                      <RotateCcw size={14} /> 重试
                    </button>
                  </>
                ) : (
                  <>
                    <Video size={48} style={{ color: 'var(--color-text-secondary)', opacity: 0.3 }} />
                    <div className="text-sm" style={{ color: 'var(--color-text-secondary)', opacity: 0.5 }}>
                      点击下方按钮启动摄像头
                    </div>
                  </>
                )}
              </div>
            )}

            {/* 摄像头开启后的叠加层 */}
            {cameraActive && (
              <>
                <ScanLine />
                {/* 网格 */}
                <div className="absolute inset-0 pointer-events-none" style={{
                  backgroundImage: 'linear-gradient(rgba(0,212,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(0,212,255,0.02) 1px, transparent 1px)',
                  backgroundSize: '40px 40px',
                }} />

                {/* 人脸检测框 */}
                <div className="absolute transition-all duration-700 ease-out"
                  style={{
                    left: `${faceBox.x}%`, top: `${faceBox.y}%`,
                    width: `${faceBox.w}%`, height: `${faceBox.h}%`,
                    zIndex: 10,
                  }}>
                  {/* 四角 L 形 */}
                  {[
                    { pos: 'top-0 left-0', border: 'borderTop borderLeft' },
                    { pos: 'top-0 right-0', border: 'borderTop borderRight' },
                    { pos: 'bottom-0 left-0', border: 'borderBottom borderLeft' },
                    { pos: 'bottom-0 right-0', border: 'borderBottom borderRight' },
                  ].map((corner, i) => {
                    const style = { position: 'absolute' };
                    corner.border.split(' ').forEach(b => {
                      style[b] = `2px solid ${currentEmotionObj.color}`;
                    });
                    return <div key={i} className={`absolute ${corner.pos} w-5 h-5`} style={style} />;
                  })}

                  <div className="absolute inset-0" style={{
                    boxShadow: `0 0 15px ${currentEmotionObj.color}40, inset 0 0 15px ${currentEmotionObj.color}10`,
                  }} />

                  {/* 标签 */}
                  <div className="absolute -top-7 left-0 flex items-center gap-1.5 px-2 py-1 rounded-md"
                    style={{ background: `${currentEmotionObj.color}E6`, backdropFilter: 'blur(4px)' }}>
                    <span className="text-xs font-bold" style={{ color: '#0a0e1a' }}>
                      {currentEmotionObj.emoji} {currentEmotion}
                    </span>
                    <span className="text-xs font-mono" style={{ color: '#0a0e1a', opacity: 0.8 }}>
                      {Math.round(confidence * 100)}%
                    </span>
                  </div>

                  <div className="absolute -bottom-6 right-0 px-1.5 py-0.5 rounded text-xs font-mono"
                    style={{ background: 'rgba(0,212,255,0.2)', color: '#00d4ff' }}>
                    ID: {emotionData.driver}
                  </div>

                  {/* 面部关键点 */}
                  {showLandmarks && faceLandmarks.map((lm, i) => {
                    const relX = ((lm.x - faceBox.x) / faceBox.w) * 100;
                    const relY = ((lm.y - faceBox.y) / faceBox.h) * 100;
                    if (relX < 0 || relX > 100 || relY < 0 || relY > 100) return null;
                    return (
                      <div key={i} className="absolute rounded-full" style={{
                        left: `${relX}%`, top: `${relY}%`,
                        width: 5, height: 5,
                        background: '#00ff88',
                        boxShadow: '0 0 8px rgba(0,255,136,0.7)',
                        transform: 'translate(-50%, -50%)',
                        zIndex: 11,
                      }} />
                    );
                  })}
                </div>

                {/* 左上角 REC + 信息 */}
                <div className="absolute top-3 left-3 space-y-1" style={{ zIndex: 15 }}>
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded"
                    style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-xs font-mono text-white/70">REC</span>
                  </div>
                  <div className="px-2 py-0.5 rounded text-xs font-mono text-white/50"
                    style={{ background: 'rgba(0,0,0,0.4)' }}>
                    {videoResolution.w}×{videoResolution.h} | {fps}FPS
                  </div>
                </div>

                {/* 右下角时间戳 */}
                <div className="absolute bottom-3 right-3 px-2 py-0.5 rounded text-xs font-mono text-white/50"
                  style={{ background: 'rgba(0,0,0,0.4)', zIndex: 15 }}>
                  {new Date().toLocaleDateString('zh-CN')} {new Date().toLocaleTimeString('zh-CN')}
                </div>
              </>
            )}
          </div>

          {/* 摄像头控制按钮 */}
          <div className="flex items-center gap-3 mt-4">
            {!cameraActive ? (
              <button onClick={() => startCamera()}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:scale-105 active:scale-95"
                style={{
                  background: 'linear-gradient(135deg, #00d4ff, #0099cc)',
                  color: '#fff',
                  boxShadow: '0 4px 15px rgba(0,212,255,0.3)',
                }}>
                <Video size={16} /> 启动摄像头
              </button>
            ) : (
              <>
                <button onClick={stopCamera}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-105 active:scale-95"
                  style={{ background: 'rgba(255,71,87,0.15)', color: '#ff4757', border: '1px solid rgba(255,71,87,0.3)' }}>
                  <VideoOff size={14} /> 关闭
                </button>
                <button onClick={switchCamera}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-105 active:scale-95"
                  style={{ background: 'rgba(0,212,255,0.1)', color: '#00d4ff', border: '1px solid rgba(0,212,255,0.2)' }}>
                  <RotateCcw size={14} /> 切换摄像头
                </button>
              </>
            )}
            {cameraError && (
              <span className="text-xs" style={{ color: '#ff4757' }}>{cameraError}</span>
            )}
          </div>
        </div>

        {/* 右侧情绪面板 */}
        <div className="col-span-4 space-y-5">
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Smile size={18} style={{ color: currentEmotionObj.color }} />
              <h3 className="text-sm font-semibold">情绪识别</h3>
              <span className="ml-auto px-2 py-0.5 rounded text-xs"
                style={{
                  background: cameraActive ? (detectionStatus === 'tracking' ? 'rgba(0,255,136,0.1)' : 'rgba(255,165,2,0.1)') : 'rgba(255,255,255,0.05)',
                  color: cameraActive ? (detectionStatus === 'tracking' ? '#00ff88' : '#ffa502') : 'var(--color-text-secondary)',
                }}>
                {!cameraActive ? '待机' : detectionStatus === 'tracking' ? '实时追踪' : 'AI 分析中...'}
              </span>
            </div>

            <div className="text-center mb-4">
              <div className="text-6xl mb-2 transition-all duration-300" style={{
                filter: `drop-shadow(0 0 12px ${currentEmotionObj.color}60)`,
              }}>
                {currentEmotionObj.emoji}
              </div>
              <div className="text-xl font-bold" style={{ color: currentEmotionObj.color }}>{currentEmotion}</div>
              <div className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>置信度 {Math.round(confidence * 100)}%</div>
            </div>

            <ProgressBar value={confidence * 100} label="置信度" color={currentEmotionObj.color} height={8} />
          </div>

          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <Activity size={16} style={{ color: '#a78bfa' }} />
              <h3 className="text-sm font-semibold">情绪分布</h3>
            </div>
            <div className="space-y-2.5">
              {emotions.map(e => {
                const score = allEmotionScores[e.name] || 0;
                const isActive = e.name === currentEmotion;
                return (
                  <div key={e.name} className="flex items-center gap-2">
                    <span className="text-sm w-6">{e.emoji}</span>
                    <span className="text-xs w-8" style={{
                      color: isActive ? e.color : 'var(--color-text-secondary)',
                      fontWeight: isActive ? 600 : 400,
                    }}>{e.name}</span>
                    <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                      <div className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${score * 100}%`,
                          background: `linear-gradient(90deg, ${e.color}80, ${e.color})`,
                          boxShadow: isActive ? `0 0 8px ${e.color}40` : 'none',
                        }} />
                    </div>
                    <span className="text-xs font-mono w-10 text-right" style={{
                      color: isActive ? e.color : 'var(--color-text-secondary)',
                    }}>{Math.round(score * 100)}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 情绪趋势图 */}
        <div className="col-span-7 glass-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Activity size={16} style={{ color: '#00d4ff' }} />
            <h3 className="text-sm font-semibold">置信度趋势</h3>
            <span className="ml-auto text-xs" style={{ color: 'var(--color-text-secondary)' }}>最近 {logs.length} 次检测</span>
          </div>
          <EmotionTrendChart history={logs} />
        </div>

        {/* 驾驶员配置 */}
        <div className="col-span-5 glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <User size={18} style={{ color: '#a78bfa' }} />
            <h3 className="text-sm font-semibold">驾驶员配置</h3>
            <span className="ml-auto text-xs px-2 py-0.5 rounded"
              style={{ background: 'rgba(167,139,250,0.1)', color: '#a78bfa' }}>已自动调节</span>
          </div>

          <div className="flex items-center gap-3 mb-4 p-3 rounded-xl" style={{ background: 'rgba(167,139,250,0.05)' }}>
            <div className="w-12 h-12 rounded-full flex items-center justify-center relative"
              style={{ background: 'rgba(167,139,250,0.15)', border: '2px solid rgba(167,139,250,0.3)' }}>
              <User size={20} style={{ color: '#a78bfa' }} />
              <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2"
                style={{ background: cameraActive ? '#00ff88' : '#666', borderColor: '#0a0e1a' }} />
            </div>
            <div>
              <div className="text-sm font-bold">{emotionData.driver}</div>
              <div className="text-xs flex items-center gap-1" style={{ color: cameraActive ? 'var(--color-accent)' : 'var(--color-text-secondary)' }}>
                <Eye size={10} /> {cameraActive ? '人脸已识别 · 驾驶习惯已加载' : '等待摄像头启动...'}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {[
              { label: '座椅温度', value: `${emotionData.driverPreferences.seatTemp}℃`, icon: '🌡️', color: '#ff6b6b' },
              { label: '氛围灯', value: emotionData.driverPreferences.ambientLight, icon: '💡', color: '#a78bfa' },
              { label: '音乐音量', value: `${emotionData.driverPreferences.musicVolume}%`, icon: '🎵', color: '#00d4ff' },
              { label: '驾驶模式', value: emotionData.driverPreferences.drivingMode, icon: '🚗', color: '#00ff88' },
            ].map(item => (
              <div key={item.label} className="p-3 rounded-lg flex items-center gap-2"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <span className="text-lg">{item.icon}</span>
                <div>
                  <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{item.label}</div>
                  <div className="text-sm font-semibold" style={{ color: item.color }}>{item.value}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* JSON 日志 */}
        <div className="col-span-12 glass-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Settings2 size={16} style={{ color: '#00d4ff' }} />
            <h3 className="text-sm font-semibold">检测日志</h3>
            <span className="ml-auto text-xs font-mono" style={{ color: 'var(--color-text-secondary)' }}>
              JSON Stream · {logs.length} records
            </span>
          </div>
          <div className="rounded-lg p-4 overflow-y-auto font-mono text-xs leading-relaxed"
            style={{ height: 160, background: 'rgba(0,0,0,0.4)' }}>
            {logs.map((log, i) => (
              <div key={i} className="mb-1.5 animate-fade-in flex items-start gap-2">
                <span style={{ color: 'rgba(255,255,255,0.2)' }}>{'{'}</span>
                <span style={{ color: '#00d4ff' }}>"time"</span>: <span style={{ color: '#ffa502' }}>"{log.time}"</span>,{' '}
                <span style={{ color: '#00ff88' }}>"emotion"</span>: <span style={{ color: '#a78bfa' }}>"{log.emotion}"</span>,{' '}
                <span style={{ color: '#00ff88' }}>"confidence"</span>: <span style={{ color: '#f472b6' }}>{log.confidence.toFixed(2)}</span>,{' '}
                <span style={{ color: '#00ff88' }}>"face_detected"</span>: <span style={{ color: '#38bdf8' }}>{cameraActive ? 'true' : 'false'}</span>,{' '}
                <span style={{ color: '#00ff88' }}>"driver"</span>: <span style={{ color: '#ffa502' }}>"{emotionData.driver}"</span>
                <span style={{ color: 'rgba(255,255,255,0.2)' }}>{'}'}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
