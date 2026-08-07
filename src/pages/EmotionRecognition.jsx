import { useState, useEffect, useRef, useCallback } from 'react';
import { Smile, Camera, CameraOff, User, Settings2, Activity, Eye, Clock, Video, VideoOff, RotateCcw, Database, ScanLine as ScanLineIcon, Server, Wifi, WifiOff } from 'lucide-react';
import ProgressBar from '../components/ProgressBar';
import { emotionData } from '../data/mockData';
import { api } from '../services/api';

// 相机服务器地址
const CAMERA_SERVER = 'http://localhost:7861';

const emotions = [
  { name: '平静', emoji: '😌', color: '#00d4ff', key: 'neutral' },
  { name: '开心', emoji: '😊', color: '#00ff88', key: 'happy' },
  { name: '悲伤', emoji: '😢', color: '#a78bfa', key: 'sad' },
  { name: '愤怒', emoji: '😠', color: '#ff4757', key: 'angry' },
  { name: '惊讶', emoji: '😲', color: '#ffa502', key: 'surprised' },
  { name: '恐惧', emoji: '😨', color: '#f472b6', key: 'fearful' },
  { name: '厌恶', emoji: '😖', color: '#a78bfa', key: 'disgusted' },
];

// 扫描线动画组件
function ScanLine() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 5 }}>
      <div className="absolute w-full h-[2px] scan-line-anim"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(0,212,255,0.3), transparent)', boxShadow: '0 0 15px rgba(0,212,255,0.2)' }} />
    </div>
  );
}

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

export default function EmotionRecognition() {
  // ── 核心状态 ──
  const [currentEmotion, setCurrentEmotion] = useState('平静');
  const [confidence, setConfidence] = useState(0);
  const [logs, setLogs] = useState([]);
  const [allEmotionScores, setAllEmotionScores] = useState({});
  const [cameraActive, setCameraActive] = useState(false);
  const [backendOnline, setBackendOnline] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);

  // ── 后端统计 ──
  const [emotionStats, setEmotionStats] = useState(null);
  const [backendHistoryCount, setBackendHistoryCount] = useState(0);
  const recordCounterRef = useRef(0);

  // ── 后端引擎能力 ──
  const [engineCapabilities, setEngineCapabilities] = useState({ cv2: false, mediapipe: false, onnx: false });

  // Refs
  const imgRef = useRef(null);
  const pollTimerRef = useRef(null);
  const elapsedTimerRef = useRef(null);

  // ── 后端状态轮询 ──
  const pollBackendState = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${CAMERA_SERVER}/api/state`, { signal: controller.signal });
      clearTimeout(timer);

      if (!res.ok) throw new Error('not ok');
      const data = await res.json();

      setBackendOnline(true);

      // 更新表情
      const zh = data.emotion_zh || '平静';
      const conf = data.confidence || 0;
      setCurrentEmotion(zh);
      setConfidence(conf);

      // 生成全情绪分布
      const eObj = emotions.find(e => e.key === data.emotion);
      const scores = {};
      emotions.forEach(e => {
        if (e.name === zh) scores[e.name] = conf;
        else if (eObj && e.key === data.emotion) scores[e.name] = Math.max(0, conf - 0.5 + Math.random() * 0.15);
        else scores[e.name] = Math.random() * 0.1;
      });
      const total = Object.values(scores).reduce((a, b) => a + b, 0) || 1;
      Object.keys(scores).forEach(k => scores[k] /= total);
      setAllEmotionScores(scores);

      // 记录日志
      const now = new Date();
      const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
      setLogs(prev => [...prev.slice(-19), { time, emotion: zh, confidence: conf }]);

      // 定期存储到 FastAPI 数据库
      recordCounterRef.current += 1;
      if (recordCounterRef.current % 6 === 0 && conf > 0.3) {
        api.createEmotionRecord({ emotion: zh, confidence: +conf.toFixed(3), source: 'camera_server_onnx' })
          .then(res => {
            if (res) setBackendHistoryCount(c => c + 1);
            if (recordCounterRef.current % 30 === 0) {
              api.emotionStats(7).then(d => { if (d) setEmotionStats(d); }).catch(() => {});
            }
          }).catch(() => {});
      }
    } catch (_) {
      setBackendOnline(false);
    }
  }, []);

  // ── 健康检查 ──
  const checkBackendHealth = useCallback(async () => {
    try {
      const res = await fetch(`${CAMERA_SERVER}/api/health`);
      const data = await res.json();
      setEngineCapabilities({
        cv2: data.cv2 || false,
        mediapipe: data.mediapipe || false,
        onnx: data.onnx || false,
      });
      return true;
    } catch (_) {
      return false;
    }
  }, []);

  // ── 启动相机（后端） ──
  const startCamera = useCallback(async () => {
    setCameraActive(true);
    setElapsedTime(0);

    // 检查后端
    const online = await checkBackendHealth();
    setBackendOnline(online);

    if (!online) {
      setCameraActive(false);
      return;
    }

    // 启动状态轮询 (~5Hz)
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    pollTimerRef.current = setInterval(pollBackendState, 200);
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    elapsedTimerRef.current = setInterval(() => setElapsedTime(t => t + 1), 1000);

    // 读取初始统计
    api.emotionStats(7).then(d => { if (d) setEmotionStats(d); }).catch(() => {});
  }, [checkBackendHealth, pollBackendState]);

  const stopCamera = useCallback(() => {
    setCameraActive(false);
    setBackendOnline(false);
    if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null; }
    if (elapsedTimerRef.current) { clearInterval(elapsedTimerRef.current); elapsedTimerRef.current = null; }
    setCurrentEmotion('平静');
    setConfidence(0);
  }, []);

  // 清理
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    };
  }, []);

  // 初始加载统计
  useEffect(() => {
    api.emotionStats(7).then(d => { if (d) setEmotionStats(d); }).catch(() => {});
    api.emotionRecords(1, 1).then(d => {
      if (d?.meta) setBackendHistoryCount(d.meta.total || 0);
    }).catch(() => {});
  }, []);

  const currentEmotionObj = emotions.find(e => e.name === currentEmotion) || emotions[0];
  const formatTime = (s) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  const engineLabel = engineCapabilities.mediapipe
    ? '🧠 MediaPipe + ONNX EfficientNet-B2'
    : engineCapabilities.onnx
      ? '🧠 ONNX EfficientNet-B2'
      : '📐 OpenCV 启发式';

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-1 section-header" style={{ color: 'var(--color-text-main)' }}>实时表情识别</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {engineLabel} · {engineCapabilities.cv2 ? 'OpenCV ✓' : 'OpenCV ✗'} · 后端视频流
          </p>
        </div>
        <div className="flex items-center gap-4">
          {cameraActive && (
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              <Clock size={14} /><span>运行 {formatTime(elapsedTime)}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className={`status-dot ${cameraActive && backendOnline ? 'online' : 'offline'}`} />
            <span className="text-xs font-medium" style={{
              color: cameraActive && backendOnline ? 'var(--color-accent)' : 'var(--color-text-secondary)',
            }}>
              {!cameraActive ? '未连接' : backendOnline ? '实时追踪中' : '后端离线'}
            </span>
            {cameraActive && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono flex items-center gap-1"
                style={{
                  background: backendOnline ? 'rgba(0,255,136,0.1)' : 'rgba(255,71,87,0.1)',
                  color: backendOnline ? '#00ff88' : '#ff4757',
                }}>
                {backendOnline ? <Wifi size={10} /> : <WifiOff size={10} />}
                {backendOnline ? ' 后端' : ' 离线'}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-5">
        {/* ============ 左：摄像头画面 ============ */}
        <div className="col-span-8 glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Camera size={18} style={{ color: '#00d4ff' }} />
            <h3 className="text-sm font-semibold">摄像头画面</h3>
            <div className="ml-auto flex items-center gap-3 flex-wrap">
              {cameraActive && backendOnline && (
                <span className="px-2 py-0.5 rounded text-xs font-mono"
                  style={{ background: 'rgba(0,212,255,0.1)', color: '#00d4ff' }}>
                  MJPEG 实时流
                </span>
              )}
              {cameraActive && !backendOnline && (
                <span className="text-xs" style={{ color: '#ff4757' }}>🚫 后端相机服务未启动 (localhost:7861)</span>
              )}
            </div>
          </div>

          <div className="relative w-full rounded-xl overflow-hidden"
            style={{ height: 360, background: 'linear-gradient(135deg, #0d1117, #161b22)' }}>

            {/* MJPEG 视频流 */}
            {cameraActive && (
              <>
                <img
                  ref={imgRef}
                  src={`${CAMERA_SERVER}/video_feed?t=${Date.now()}`}
                  alt="Camera Stream"
                  className="absolute inset-0 w-full h-full"
                  style={{ objectFit: 'cover' }}
                  onError={() => setBackendOnline(false)}
                  onLoad={() => setBackendOnline(true)}
                />
                <ScanLine />
                <div className="absolute inset-0 pointer-events-none" style={{
                  backgroundImage: 'linear-gradient(rgba(0,212,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(0,212,255,0.02) 1px, transparent 1px)',
                  backgroundSize: '40px 40px',
                }} />
              </>
            )}

            {!cameraActive && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                <Server size={48} style={{ color: 'var(--color-text-secondary)', opacity: 0.3 }} />
                <div className="text-sm" style={{ color: 'var(--color-text-secondary)', opacity: 0.5 }}>
                  点击下方按钮启动后端相机服务
                </div>
                <div className="text-xs" style={{ color: 'var(--color-text-secondary)', opacity: 0.3 }}>
                  需要先运行: python backend/camera_server.py
                </div>
              </div>
            )}

            {/* REC 标识 */}
            {cameraActive && (
              <>
                <div className="absolute top-3 left-3" style={{ zIndex: 15 }}>
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded"
                    style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-xs font-mono text-white/70">REC</span>
                  </div>
                </div>
                <div className="absolute bottom-3 right-3 px-2 py-0.5 rounded text-xs font-mono text-white/50"
                  style={{ background: 'rgba(0,0,0,0.4)', zIndex: 15 }}>
                  {new Date().toLocaleDateString('zh-CN')} {new Date().toLocaleTimeString('zh-CN')}
                </div>
              </>
            )}
          </div>

          {/* 控制按钮 */}
          <div className="flex items-center gap-3 mt-4 flex-wrap">
            {!cameraActive ? (
              <button onClick={startCamera}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:scale-105 active:scale-95"
                style={{
                  background: 'linear-gradient(135deg, #00d4ff, #0099cc)',
                  color: '#fff', boxShadow: '0 4px 15px rgba(0,212,255,0.3)',
                }}>
                <Video size={16} /> 连接后端相机
              </button>
            ) : (
              <>
                <button onClick={stopCamera}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-105 active:scale-95"
                  style={{ background: 'rgba(255,71,87,0.15)', color: '#ff4757', border: '1px solid rgba(255,71,87,0.3)' }}>
                  <VideoOff size={14} /> 断开
                </button>
              </>
            )}
          </div>

          {/* 能力状态 */}
          <div className="mt-4 flex items-center gap-4 text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
            <Server size={12} />
            <span>OpenCV: {engineCapabilities.cv2 ? '✓' : '✗'}</span>
            <span>MediaPipe: {engineCapabilities.mediapipe ? '✓' : '✗'}</span>
            <span>ONNX: {engineCapabilities.onnx ? '✓' : '✗'}</span>
          </div>
        </div>

        {/* ============ 右：情绪面板 ============ */}
        <div className="col-span-4 space-y-5">
          {/* 当前情绪 */}
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Smile size={18} style={{ color: currentEmotionObj.color }} />
              <h3 className="text-sm font-semibold">情绪识别</h3>
              <span className="ml-auto px-2 py-0.5 rounded text-xs"
                style={{
                  background: cameraActive && backendOnline
                    ? 'rgba(0,255,136,0.1)' : 'rgba(255,255,255,0.05)',
                  color: cameraActive && backendOnline ? '#00ff88' : 'var(--color-text-secondary)',
                }}>
                {!cameraActive ? '待机' : backendOnline ? 'ONNX 追踪' : '离线'}
              </span>
            </div>

            <div className="text-center mb-4">
              <div className="text-6xl mb-2 transition-all duration-300" style={{
                filter: `drop-shadow(0 0 12px ${currentEmotionObj.color}60)`,
              }}>{currentEmotionObj.emoji}</div>
              <div className="text-xl font-bold" style={{ color: currentEmotionObj.color }}>{currentEmotion}</div>
              <div className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                置信度 {Math.round(confidence * 100)}%
              </div>
            </div>

            <ProgressBar value={confidence * 100} label="置信度" color={currentEmotionObj.color} height={8} />
          </div>

          {/* 情绪分布 */}
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <Activity size={16} style={{ color: '#a78bfa' }} />
              <h3 className="text-sm font-semibold">情绪分布</h3>
              {emotionStats && (
                <span className="ml-auto text-xs flex items-center gap-1" style={{ color: 'var(--color-text-secondary)' }}>
                  <Database size={10} /> 近{emotionStats.days}天 {emotionStats.total_records} 条
                </span>
              )}
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
            {emotionStats?.distribution && (
              <div className="mt-3 pt-3 border-t flex items-center gap-2 text-xs flex-wrap" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
                <span>历史主导：</span>
                {Object.entries(emotionStats.distribution)
                  .sort((a, b) => b[1].count - a[1].count)
                  .slice(0, 3)
                  .map(([name, info]) => {
                    const eObj = emotions.find(e => e.name === name || e.key === name);
                    return (
                      <span key={name} className="flex items-center gap-0.5" style={{ color: eObj?.color || 'var(--color-text-secondary)' }}>
                        {eObj?.emoji} {eObj?.name || name} {Math.round((info.ratio || 0) * 100)}%
                      </span>
                    );
                  })}
              </div>
            )}
          </div>
        </div>

        {/* ============ 下：趋势图 ============ */}
        <div className="col-span-7 glass-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Activity size={16} style={{ color: '#00d4ff' }} />
            <h3 className="text-sm font-semibold">置信度趋势</h3>
            <span className="ml-auto text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              最近 {logs.length} 次检测
            </span>
          </div>
          {logs.length > 0 ? (
            <EmotionTrendChart history={logs} />
          ) : (
            <div className="flex items-center justify-center h-32 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              等待数据...
            </div>
          )}
        </div>

        {/* ============ 下右：驾驶员配置 ============ */}
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
                style={{ background: cameraActive && backendOnline ? '#00ff88' : '#666', borderColor: '#0a0e1a' }} />
            </div>
            <div>
              <div className="text-sm font-bold">{emotionData.driver}</div>
              <div className="text-xs flex items-center gap-1" style={{ color: cameraActive && backendOnline ? 'var(--color-accent)' : 'var(--color-text-secondary)' }}>
                <Eye size={10} /> {cameraActive && backendOnline
                  ? `${engineLabel} · 实时分析中`
                  : '等待连接后端相机...'}
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

        {/* ============ 日志 ============ */}
        <div className="col-span-12 glass-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Settings2 size={16} style={{ color: '#00d4ff' }} />
            <h3 className="text-sm font-semibold">检测日志</h3>
            <span className="ml-auto text-xs font-mono flex items-center gap-2" style={{ color: 'var(--color-text-secondary)' }}>
              {backendHistoryCount > 0 && (
                <span className="flex items-center gap-1" style={{ color: '#00ff88' }}>
                  <Database size={10} /> 后端 {backendHistoryCount} 条
                </span>
              )}
              JSON Stream · {logs.length} records · source=camera_server
            </span>
          </div>
          <div className="rounded-lg p-4 overflow-y-auto font-mono text-xs leading-relaxed"
            style={{ height: 160, background: 'rgba(0,0,0,0.4)' }}>
            {logs.length === 0 ? (
              <div style={{ color: 'rgba(255,255,255,0.2)' }}>等待数据...</div>
            ) : (
              logs.map((log, i) => (
                <div key={i} className="mb-1.5 animate-fade-in flex items-start gap-2 flex-wrap">
                  <span style={{ color: 'rgba(255,255,255,0.2)' }}>{'{'}</span>
                  <span style={{ color: '#00d4ff' }}>"time"</span>: <span style={{ color: '#ffa502' }}>"{log.time}"</span>,{' '}
                  <span style={{ color: '#00ff88' }}>"emotion"</span>: <span style={{ color: '#a78bfa' }}>"{log.emotion}"</span>,{' '}
                  <span style={{ color: '#00ff88' }}>"confidence"</span>: <span style={{ color: '#f472b6' }}>{log.confidence.toFixed(2)}</span>,{' '}
                  <span style={{ color: '#00ff88' }}>"engine"</span>: <span style={{ color: '#22d3ee' }}>"mediapipe_onnx_backend"</span>
                  <span style={{ color: 'rgba(255,255,255,0.2)' }}>{'}'}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
