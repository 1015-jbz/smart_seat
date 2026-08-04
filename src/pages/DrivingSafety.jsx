import { useState, useEffect, useRef, useCallback } from 'react';
import { Shield, AlertTriangle, Eye, Activity, Brain, Clock, Camera, Video, VideoOff, RotateCcw, CameraOff, Timer } from 'lucide-react';
import GaugeChart from '../components/GaugeChart';
import ProgressBar from '../components/ProgressBar';
import { useVehicle } from '../context/VehicleStore';

// 扫描线效果
function ScanLine() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 5 }}>
      <div className="absolute w-full h-[2px] scan-line-anim"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(0,212,255,0.3), transparent)', boxShadow: '0 0 15px rgba(0,212,255,0.2)' }} />
    </div>
  );
}

export default function DrivingSafety() {
  const { safety, getDrivingDuration } = useVehicle();
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [drivingTime, setDrivingTime] = useState(0);

  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const alertColors = { normal: '#00ff88', warning: '#ffa502', danger: '#ff4757' };
  const alertLabels = { normal: '正常', warning: '预警', danger: '危险' };

  // 启动摄像头
  const startCamera = useCallback(async () => {
    try {
      setCameraError(null);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
    } catch (err) {
      console.error('摄像头启动失败:', err);
      let msg = '摄像头访问失败';
      if (err.name === 'NotAllowedError') msg = '摄像头权限被拒绝';
      else if (err.name === 'NotFoundError') msg = '未检测到摄像头';
      else if (err.name === 'NotReadableError') msg = '摄像头被其他程序占用';
      setCameraError(msg);
      setCameraActive(false);
    }
  }, []);

  // 停止摄像头
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
  }, []);

  // 组件卸载清理
  useEffect(() => {
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, []);

  // 同步驾驶时长显示
  useEffect(() => {
    const timer = setInterval(() => {
      setDrivingTime(getDrivingDuration());
    }, 1000);
    return () => clearInterval(timer);
  }, [getDrivingDuration]);

  const formatTime = (s) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  // 疲劳等级描述
  const getFatigueDesc = (score) => {
    if (score >= 80) return { text: '状态良好', color: '#00ff88' };
    if (score >= 60) return { text: '轻度疲劳', color: '#ffa502' };
    if (score >= 40) return { text: '中度疲劳', color: '#ff6348' };
    return { text: '严重疲劳', color: '#ff4757' };
  };

  const fatigueDesc = getFatigueDesc(safety.fatigueScore);

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-1 section-header" style={{ color: 'var(--color-text-main)' }}>驾驶安全监控</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>摄像头实时监测驾驶员状态 · 驾驶越久疲劳越深</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.15)' }}>
            <Timer size={14} style={{ color: '#00d4ff' }} />
            <span className="text-xs font-mono font-medium" style={{ color: '#00d4ff' }}>
              驾驶时长 {formatTime(drivingTime)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`status-dot ${cameraActive ? 'online' : 'offline'}`} />
            <span className="text-xs font-medium" style={{ color: cameraActive ? '#00ff88' : 'var(--color-text-secondary)' }}>
              {cameraActive ? '监控中' : '未连接'}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-5">
        {/* 摄像头实时监控 */}
        <div className="col-span-5 glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Camera size={18} style={{ color: '#00d4ff' }} />
            <h3 className="text-sm font-semibold">驾驶员监控</h3>
            {cameraActive && (
              <span className="ml-auto flex items-center gap-1 text-xs" style={{ color: '#00ff88' }}>
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                REC
              </span>
            )}
          </div>

          <div className="relative w-full rounded-xl overflow-hidden" style={{ height: 300, background: 'linear-gradient(135deg, #0d1117, #161b22)' }}>
            {/* 摄像头视频 */}
            <video ref={videoRef} autoPlay playsInline muted
              className="absolute inset-0 w-full h-full"
              style={{ objectFit: 'cover', transform: 'scaleX(-1)', display: cameraActive ? 'block' : 'none' }}
            />

            {/* 未开启占位 */}
            {!cameraActive && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                {cameraError ? (
                  <>
                    <CameraOff size={40} style={{ color: '#ff4757', opacity: 0.5 }} />
                    <div className="text-xs" style={{ color: '#ff4757' }}>{cameraError}</div>
                    <button onClick={startCamera}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:scale-105"
                      style={{ background: 'rgba(0,212,255,0.15)', color: '#00d4ff', border: '1px solid rgba(0,212,255,0.3)' }}>
                      <RotateCcw size={12} /> 重试
                    </button>
                  </>
                ) : (
                  <>
                    <Video size={40} style={{ color: 'var(--color-text-secondary)', opacity: 0.3 }} />
                    <div className="text-xs" style={{ color: 'var(--color-text-secondary)', opacity: 0.5 }}>
                      点击下方按钮启动摄像头
                    </div>
                  </>
                )}
              </div>
            )}

            {/* 摄像头开启叠加层 */}
            {cameraActive && (
              <>
                <ScanLine />
                {/* 人脸检测框 */}
                <div className="absolute transition-all duration-700" style={{
                  left: '25%', top: '12%', width: '50%', height: '70%', zIndex: 10,
                }}>
                  {/* 四角 L 形 */}
                  {[
                    { pos: 'top-0 left-0', borders: ['borderTop', 'borderLeft'] },
                    { pos: 'top-0 right-0', borders: ['borderTop', 'borderRight'] },
                    { pos: 'bottom-0 left-0', borders: ['borderBottom', 'borderLeft'] },
                    { pos: 'bottom-0 right-0', borders: ['borderBottom', 'borderRight'] },
                  ].map((corner, i) => {
                    const style = { position: 'absolute' };
                    corner.borders.forEach(b => { style[b] = `2px solid ${alertColors[safety.alertLevel]}`; });
                    return <div key={i} className={`absolute ${corner.pos} w-5 h-5`} style={style} />;
                  })}
                  <div className="absolute inset-0" style={{
                    boxShadow: `0 0 15px ${alertColors[safety.alertLevel]}40, inset 0 0 15px ${alertColors[safety.alertLevel]}10`,
                  }} />
                  {/* 标签 */}
                  <div className="absolute -top-7 left-0 flex items-center gap-1.5 px-2 py-1 rounded-md"
                    style={{ background: `${alertColors[safety.alertLevel]}E6`, backdropFilter: 'blur(4px)' }}>
                    <span className="text-xs font-bold" style={{ color: '#0a0e1a' }}>
                      {fatigueDesc.text} · {safety.fatigueScore}分
                    </span>
                  </div>
                </div>

                {/* 左上角信息 */}
                <div className="absolute top-3 left-3 space-y-1" style={{ zIndex: 15 }}>
                  <div className="px-2 py-0.5 rounded text-xs font-mono"
                    style={{ background: 'rgba(0,0,0,0.5)', color: 'rgba(255,255,255,0.7)' }}>
                    驾驶 {formatTime(drivingTime)}
                  </div>
                </div>

                {/* 右下角时间戳 */}
                <div className="absolute bottom-3 right-3 px-2 py-0.5 rounded text-xs font-mono"
                  style={{ background: 'rgba(0,0,0,0.4)', color: 'rgba(255,255,255,0.5)', zIndex: 15 }}>
                  {new Date().toLocaleTimeString('zh-CN')}
                </div>
              </>
            )}
          </div>

          {/* 摄像头控制按钮 */}
          <div className="flex items-center gap-3 mt-4">
            {!cameraActive ? (
              <button onClick={startCamera}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:scale-105 active:scale-95"
                style={{
                  background: 'linear-gradient(135deg, #00d4ff, #0099cc)',
                  color: '#fff',
                  boxShadow: '0 4px 15px rgba(0,212,255,0.3)',
                }}>
                <Video size={16} /> 启动摄像头
              </button>
            ) : (
              <button onClick={stopCamera}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-105 active:scale-95"
                style={{ background: 'rgba(255,71,87,0.15)', color: '#ff4757', border: '1px solid rgba(255,71,87,0.3)' }}>
                <VideoOff size={14} /> 关闭
              </button>
            )}
          </div>
        </div>

        {/* 右侧面板 */}
        <div className="col-span-7 space-y-5">
          <div className="grid grid-cols-3 gap-5">
            {/* 疲劳评分 */}
            <div className="glass-card p-5 flex flex-col items-center">
              <div className="flex items-center gap-2 mb-3 w-full">
                <Brain size={16} style={{ color: '#a78bfa' }} />
                <h3 className="text-sm font-semibold">疲劳评分</h3>
              </div>
              <div className="relative">
                <GaugeChart value={safety.fatigueScore} max={100} size={150} color="#a78bfa" warning={60} danger={40} />
              </div>
              <div className="mt-2 text-center">
                <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ color: fatigueDesc.color, background: `${fatigueDesc.color}15` }}>
                  {fatigueDesc.text}
                </span>
              </div>
            </div>

            {/* 告警等级 */}
            <div className="glass-card p-5 flex flex-col items-center justify-center">
              <div className="flex items-center gap-2 mb-4 w-full">
                <AlertTriangle size={16} style={{ color: alertColors[safety.alertLevel] }} />
                <h3 className="text-sm font-semibold">告警等级</h3>
              </div>
              <div className="w-20 h-20 rounded-full flex items-center justify-center"
                style={{
                  background: `${alertColors[safety.alertLevel]}15`,
                  border: `3px solid ${alertColors[safety.alertLevel]}`,
                  boxShadow: `0 0 20px ${alertColors[safety.alertLevel]}30`,
                }}>
                <span className="text-lg font-bold" style={{ color: alertColors[safety.alertLevel] }}>
                  {alertLabels[safety.alertLevel]}
                </span>
              </div>
              <div className="mt-3 flex gap-2">
                {['normal', 'warning', 'danger'].map(level => (
                  <span key={level} className="status-dot" style={{
                    background: alertColors[level],
                    boxShadow: safety.alertLevel === level ? `0 0 8px ${alertColors[level]}` : 'none',
                    opacity: safety.alertLevel === level ? 1 : 0.3,
                  }} />
                ))}
              </div>
            </div>

            {/* 心率 */}
            <div className="glass-card p-5 flex flex-col items-center">
              <div className="flex items-center gap-2 mb-3 w-full">
                <Activity size={16} style={{ color: '#ff4757' }} />
                <h3 className="text-sm font-semibold">心率监测</h3>
              </div>
              <div className="relative">
                <GaugeChart value={safety.heartRate} max={150} size={150} color="#ff4757" warning={100} danger={120} unit="BPM" />
              </div>
              <div className="mt-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>60-100 BPM 正常</div>
            </div>
          </div>

          {/* 多维度实时数据 - 大数字面板 */}
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Eye size={16} style={{ color: '#00d4ff' }} />
              <h3 className="text-sm font-semibold">多维度安全数据</h3>
              <span className="ml-auto text-xs px-2 py-0.5 rounded-full animate-pulse"
                style={{ background: 'rgba(0,212,255,0.1)', color: '#00d4ff' }}>实时</span>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {/* 眼睑闭合率 */}
              <div className="text-center p-3 rounded-xl" style={{ background: 'rgba(0,212,255,0.04)', border: '1px solid rgba(0,212,255,0.1)' }}>
                <div className="text-xs mb-2" style={{ color: 'var(--color-text-secondary)' }}>眼睑闭合率</div>
                <div className="text-2xl font-bold font-mono tabular-nums transition-all duration-200"
                  style={{ color: safety.eyeClosureRate > 0.2 ? '#ff4757' : '#00d4ff' }}>
                  {(safety.eyeClosureRate * 100).toFixed(1)}<span className="text-sm">%</span>
                </div>
                <div className="mt-2 w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <div className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.min(100, safety.eyeClosureRate * 100 / 0.8 * 100)}%`,
                      background: safety.eyeClosureRate > 0.2 ? 'linear-gradient(90deg, #ff6348, #ff4757)' : 'linear-gradient(90deg, #00d4ff80, #00d4ff)',
                    }} />
                </div>
              </div>
              {/* 哈欠次数 */}
              <div className="text-center p-3 rounded-xl" style={{ background: 'rgba(0,255,136,0.04)', border: '1px solid rgba(0,255,136,0.1)' }}>
                <div className="text-xs mb-2" style={{ color: 'var(--color-text-secondary)' }}>哈欠/分钟</div>
                <div className="text-2xl font-bold font-mono tabular-nums transition-all duration-200"
                  style={{ color: safety.yawnsPerMin >= 3 ? '#ff4757' : safety.yawnsPerMin >= 1 ? '#ffa502' : '#00ff88' }}>
                  {safety.yawnsPerMin}<span className="text-sm">次</span>
                </div>
                <div className="mt-2 flex justify-center gap-0.5">
                  {[0,1,2,3,4].map(i => (
                    <div key={i} className="w-2 h-4 rounded-sm transition-all duration-300"
                      style={{
                        background: i < safety.yawnsPerMin ? '#ffa502' : 'rgba(255,255,255,0.06)',
                        boxShadow: i < safety.yawnsPerMin ? '0 0 4px rgba(255,165,2,0.4)' : 'none',
                      }} />
                  ))}
                </div>
              </div>
              {/* 视线方向 */}
              <div className="text-center p-3 rounded-xl" style={{ background: safety.gazeDirection === '前方' ? 'rgba(0,255,136,0.04)' : 'rgba(255,165,2,0.06)', border: `1px solid ${safety.gazeDirection === '前方' ? 'rgba(0,255,136,0.1)' : 'rgba(255,165,2,0.15)'}` }}>
                <div className="text-xs mb-2" style={{ color: 'var(--color-text-secondary)' }}>视线方向</div>
                <div className="text-lg font-bold transition-all duration-200"
                  style={{ color: safety.gazeDirection === '前方' ? '#00ff88' : '#ffa502' }}>
                  {safety.gazeDirection}
                </div>
                <div className="mt-2 text-xs" style={{ color: safety.gazeDirection === '前方' ? '#00ff88' : '#ffa502' }}>
                  {safety.gazeDirection === '前方' ? '✓ 正常' : '⚠ 偏移'}
                </div>
              </div>
              {/* 分心时长 */}
              <div className="text-center p-3 rounded-xl" style={{ background: 'rgba(0,212,255,0.04)', border: '1px solid rgba(0,212,255,0.1)' }}>
                <div className="text-xs mb-2" style={{ color: 'var(--color-text-secondary)' }}>分心时长</div>
                <div className="text-2xl font-bold font-mono tabular-nums transition-all duration-200"
                  style={{ color: safety.distractionDuration > 5 ? '#ff4757' : safety.distractionDuration > 2 ? '#ffa502' : '#00d4ff' }}>
                  {safety.distractionDuration}<span className="text-sm">s</span>
                </div>
                <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <div className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.min(100, safety.distractionDuration / 12 * 100)}%`,
                      background: safety.distractionDuration > 5 ? '#ff4757' : '#00d4ff',
                    }} />
                </div>
              </div>
            </div>
          </div>

          {/* 安全日志 */}
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <Shield size={16} style={{ color: '#a78bfa' }} />
              <h3 className="text-sm font-semibold">安全日志</h3>
              <span className="ml-auto text-xs" style={{ color: 'var(--color-text-secondary)' }}>最近 {safety.alerts.length} 条</span>
            </div>
            <div className="space-y-2 overflow-y-auto" style={{ height: 120 }}>
              {safety.alerts.map((log, i) => (
                <div key={i} className="flex items-start gap-2 text-xs animate-fade-in">
                  <span className="flex-shrink-0" style={{ color: 'var(--color-text-secondary)' }}>{log.time}</span>
                  <span className="status-dot mt-1 flex-shrink-0" style={{
                    background: alertColors[log.type],
                    boxShadow: `0 0 4px ${alertColors[log.type]}`,
                  }} />
                  <span style={{ color: alertColors[log.type] }}>{log.message}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
