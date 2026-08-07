import { useState, useEffect, useRef, useCallback } from 'react';
import { Shield, AlertTriangle, Eye, Activity, Brain, Camera, Video, RotateCcw, CameraOff, Timer, Volume2, VolumeX, Database } from 'lucide-react';
import GaugeChart from '../components/GaugeChart';
import { useVehicle } from '../context/VehicleStore';
import { api } from '../services/api';

// 相机服务器地址（支持 VITE_CAMERA_BASE 环境变量）
const CAMERA_SERVER = import.meta.env.VITE_CAMERA_BASE || 'http://localhost:7861';

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
  const { safety, getDrivingDuration, vehicle, recordFatigueEvent } = useVehicle();
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [drivingTime, setDrivingTime] = useState(0);

  const videoRef = useRef(null);
  const audioCtxRef = useRef(null);
  const alarmTimerRef = useRef(null);
  const prevAlertLevelRef = useRef('normal');
  const [alarmEnabled, setAlarmEnabled] = useState(true);
  const greetingPlayedRef = useRef(false);

  // 从相机后端 /api/state 拉取的实时安全数据（替代模拟数据）
  const [cameraSafety, setCameraSafety] = useState(null);

  // 后端驾驶会话 ID（开始驾驶时创建，结束驾驶时关闭）
  const sessionIdRef = useRef(null);
  // 后端驾驶统计（加载失败为 null，UI 静默降级）
  const [drivingStats, setDrivingStats] = useState(null);
  // 疲劳事件记录节流：上次记录时间，避免同一告警状态频繁上报
  const lastFatigueEventRef = useRef(0);

  const alertColors = { normal: '#00ff88', warning: '#ffa502', danger: '#ff4757' };
  const alertLabels = { normal: '正常', warning: '预警', danger: '危险' };

  // 启动摄像头（使用后端 MJPEG 流，避免与 camera_server.py 冲突）
  const startCamera = useCallback(async () => {
    try {
      setCameraError(null);
      setCameraActive(true);

      // 检查后端相机服务是否在线
      try {
        const res = await fetch(`${CAMERA_SERVER}/api/health`, { signal: AbortSignal.timeout(3000) });
        if (!res.ok) throw new Error('health check failed');
      } catch {
        setCameraError('后端相机服务未启动 (localhost:7861)');
        setCameraActive(false);
        return;
      }

      // 摄像头启动后自动问候（仅首次）
      if (!greetingPlayedRef.current) {
        const now = new Date();
        const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
        const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 星期${weekDays[now.getDay()]}`;
        const hour = now.getHours();
        let greet = hour < 6 ? '凌晨好' : hour < 12 ? '上午好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好';
        const greeting = `${greet}！今天是${dateStr}。当前天气晴朗，气温28度。欢迎您驾驶，祝您一路平安。`;
        if (window.speechSynthesis) {
          const utter = new SpeechSynthesisUtterance(greeting);
          utter.lang = 'zh-CN';
          utter.rate = 1;
          const voices = window.speechSynthesis.getVoices();
          const zhVoice = voices.find(v => v.lang.includes('zh'));
          if (zhVoice) utter.voice = zhVoice;
          window.speechSynthesis.speak(utter);
        }
        greetingPlayedRef.current = true;
      }
    } catch (err) {
      console.error('摄像头启动失败:', err);
      setCameraError('摄像头访问失败');
      setCameraActive(false);
    }
  }, []);

  // 停止摄像头
  const stopCamera = useCallback(() => {
    setCameraActive(false);
  }, []);

  // 摄像头随驾驶状态自动开关：驾驶开始自动打开，驾驶结束自动关闭
  // 同时管理后端驾驶会话：开始时 POST /driving/sessions，结束时 PUT /sessions/{id}/end
  useEffect(() => {
    if (vehicle.isDriving) {
      startCamera();
      // 创建后端驾驶会话（失败静默降级，不影响前端驾驶功能）
      if (!sessionIdRef.current) {
        api.createDrivingSession({ distance_km: 0, max_speed: 0, avg_speed: 0 })
          .then((res) => {
            if (res && res.id) {
              sessionIdRef.current = res.id;
              console.info('[safety] 已创建驾驶会话 #' + res.id);
            }
          })
          .catch(() => { /* 静默降级 */ });
      }
    } else {
      stopCamera();
      // 结束后端驾驶会话（失败静默降级）
      if (sessionIdRef.current) {
        const sid = sessionIdRef.current;
        sessionIdRef.current = null;
        api.endDrivingSession(sid)
          .then(() => {
            console.info('[safety] 已结束驾驶会话 #' + sid);
            // 会话结束后刷新驾驶统计
            return api.drivingStats();
          })
          .then((stats) => { if (stats) setDrivingStats(stats); })
          .catch(() => { /* 静默降级 */ });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicle.isDriving]);

  // 挂载时加载后端驾驶统计（失败静默降级）
  useEffect(() => {
    api.drivingStats()
      .then((stats) => { if (stats) setDrivingStats(stats); })
      .catch(() => { /* 静默 */ });
  }, []);

  // 轮询相机后端 /api/state 获取实时安全检测数据
  useEffect(() => {
    if (!cameraActive) return;
    let active = true;
    const poll = async () => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(`${CAMERA_SERVER}/api/state`, { signal: controller.signal });
        clearTimeout(timer);
        if (!res.ok || !active) return;
        const data = await res.json();
        if (data.safety) setCameraSafety(data.safety);
      } catch (_) { /* 静默降级 */ }
    };
    poll();
    const interval = setInterval(poll, 500);
    return () => { active = false; clearInterval(interval); };
  }, [cameraActive]);

  // 合并实时相机数据与 VehicleStore 模拟数据（相机优先）
  // 归一化告警等级: camera(正常/警告/高危/危险) ↔ UI(正常/预警/危险)
  const _levelMap = { normal: 'normal', warning: 'warning', high: 'danger', critical: 'danger' };
  const realSafety = {
    fatigueScore: cameraSafety?.fatigue_score ?? safety.fatigueScore,
    alertLevel: _levelMap[cameraSafety?.alert_level] ?? safety.alertLevel,
    eyeClosureRate: cameraSafety?.perclos ?? safety.eyeClosureRate,
    yawnsPerMin: cameraSafety?.yawn_count ?? safety.yawnsPerMin,
    gazeDirection: cameraSafety?.gaze === 'forward' ? '前方' : cameraSafety?.gaze === 'down' ? '下方' : cameraSafety?.gaze === 'left' ? '左偏' : cameraSafety?.gaze === 'right' ? '右偏' : safety.gazeDirection,
    distractionDuration: cameraSafety?.distraction_dur ?? safety.distractionDuration,
    heartRate: safety.heartRate,  // 心率仅 VehicleStore 提供
    alerts: safety.alerts,
    eyeClosed: cameraSafety?.eye_closed ?? false,
  };

  // 实时相机语音提醒：分心/闭眼超过阈值
  const lastCameraSpeakRef = useRef(0);
  useEffect(() => {
    if (!cameraSafety || !alarmEnabled) return;
    const now = Date.now();
    if (now - lastCameraSpeakRef.current < 10000) return; // 10s 间隔
    const { distraction_dur, eye_closed, alert_message } = cameraSafety;
    if (alert_message && alert_message.length > 0) {
      // 疲劳告警消息优先
      if (window.speechSynthesis) {
        const utter = new SpeechSynthesisUtterance(alert_message);
        utter.lang = 'zh-CN'; utter.rate = 1.1;
        window.speechSynthesis.speak(utter);
        lastCameraSpeakRef.current = now;
      }
    } else if (distraction_dur > 3.0) {
      if (window.speechSynthesis) {
        const utter = new SpeechSynthesisUtterance('请注意前方路况，不要分心驾驶。');
        utter.lang = 'zh-CN'; utter.rate = 1.1;
        window.speechSynthesis.speak(utter);
        lastCameraSpeakRef.current = now;
      }
    } else if (eye_closed) {
      // 闭眼超过阈值时提醒（由后端 PERCLOS 判断）
      if (window.speechSynthesis) {
        const utter = new SpeechSynthesisUtterance('请保持注意力集中，注意行车安全。');
        utter.lang = 'zh-CN'; utter.rate = 1.1;
        window.speechSynthesis.speak(utter);
        lastCameraSpeakRef.current = now;
      }
    }
  }, [cameraSafety, alarmEnabled]);

  // 疲劳警报声（Web Audio API 生成）
  const playAlarm = useCallback(() => {
    if (!alarmEnabled) return;
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      // 三声急促蜂鸣
      const times = [0, 0.25, 0.5];
      times.forEach(delay => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.3, ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + delay + 0.15);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + 0.15);
      });
    } catch (e) { console.warn('警报播放失败:', e); }
  }, [alarmEnabled]);

  // 疲劳告警 + 语音提醒 + 后端疲劳事件记录
  useEffect(() => {
    const level = realSafety.alertLevel;
    if (level === 'danger' && alarmEnabled) {
      playAlarm();
      // 语音提醒（每10秒一次，避免频繁）
      if (!alarmTimerRef.current) {
        if (window.speechSynthesis) {
          const utter = new SpeechSynthesisUtterance('警告！您已处于疲劳状态，请注意安全，建议立即休息。');
          utter.lang = 'zh-CN';
          utter.rate = 1.1;
          window.speechSynthesis.speak(utter);
        }
        alarmTimerRef.current = setTimeout(() => { alarmTimerRef.current = null; }, 10000);
      }
    } else if (level === 'warning' && alarmEnabled) {
      // 预警时只语音提醒，不播放警报声
      if (prevAlertLevelRef.current === 'normal' && window.speechSynthesis) {
        const utter = new SpeechSynthesisUtterance('您有些疲劳了，请注意休息。');
        utter.lang = 'zh-CN';
        window.speechSynthesis.speak(utter);
      }
    }

    // 记录疲劳事件到后端 POST /api/v1/safety/fatigue/event
    // 仅在 warning/danger 等级且距上次记录超过 30s 时上报，避免频繁刷库
    if (level === 'warning' || level === 'danger') {
      const now = Date.now();
      if (now - lastFatigueEventRef.current > 30000) {
        lastFatigueEventRef.current = now;
        // 后端 level 字段使用中文：轻微/中度/严重
        const backendLevel = level === 'warning' ? '轻微' : '严重';
        recordFatigueEvent({
          score: realSafety.fatigueScore,
          level: backendLevel,
          durationSeconds: 60, // 估算持续 60s
          actionTaken: level === 'danger' ? '语音+警报提醒' : '语音提醒',
          sessionId: sessionIdRef.current,
        });
      }
    }

    prevAlertLevelRef.current = level;
  }, [realSafety.alertLevel, realSafety.fatigueScore, alarmEnabled, playAlarm, recordFatigueEvent]);

  // 组件卸载清理：关闭摄像头/音频，并尝试结束后端驾驶会话
  useEffect(() => {
    return () => {
      if (audioCtxRef.current) audioCtxRef.current.close();
      if (alarmTimerRef.current) clearTimeout(alarmTimerRef.current);
      // 卸载时若仍有未结束的驾驶会话，尝试关闭（fire-and-forget）
      if (sessionIdRef.current) {
        const sid = sessionIdRef.current;
        sessionIdRef.current = null;
        api.endDrivingSession(sid).catch(() => { /* 静默 */ });
      }
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
    if (score < 25) return { text: '状态良好', color: '#00ff88' };
    if (score < 45) return { text: '轻度疲劳', color: '#ffa502' };
    if (score < 70) return { text: '中度疲劳', color: '#ff6348' };
    return { text: '严重疲劳', color: '#ff4757' };
  };

  const fatigueDesc = getFatigueDesc(realSafety.fatigueScore);

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
          {drivingStats && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.15)' }} title="后端驾驶统计">
              <Database size={12} style={{ color: '#00ff88' }} />
              <span className="text-xs font-mono" style={{ color: '#00ff88' }}>
                {drivingStats.total_sessions} 次 · {drivingStats.total_distance_km} km
              </span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className={`status-dot ${cameraActive ? 'online' : 'offline'}`} />
            <span className="text-xs font-medium" style={{ color: cameraActive ? '#00ff88' : 'var(--color-text-secondary)' }}>
              {cameraActive ? '监控中' : '未连接'}
            </span>
          </div>
          <button onClick={() => setAlarmEnabled(!alarmEnabled)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors"
            style={{
              background: alarmEnabled ? 'rgba(255,71,87,0.1)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${alarmEnabled ? 'rgba(255,71,87,0.3)' : 'var(--color-border)'}`,
            }}
            title={alarmEnabled ? '关闭疲劳警报' : '开启疲劳警报'}>
            {alarmEnabled ? <Volume2 size={13} style={{ color: '#ff4757' }} /> : <VolumeX size={13} style={{ color: 'var(--color-text-secondary)' }} />}
            <span className="text-xs font-medium" style={{ color: alarmEnabled ? '#ff4757' : 'var(--color-text-secondary)' }}>
              {alarmEnabled ? '警报开' : '警报关'}
            </span>
          </button>
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
            {/* MJPEG 视频流（复用 camera_server，不单独占用摄像头）*/}
            {cameraActive && (
              <img
                ref={videoRef}
                src={`${CAMERA_SERVER}/video_feed?mode=safety`}
                alt="Driver Monitor"
                className="absolute inset-0 w-full h-full"
                style={{ objectFit: 'cover' }}
                onError={() => { setCameraError('无法连接视频流'); setCameraActive(false); }}
              />
            )}

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
                ) : vehicle.isDriving ? (
                  <>
                    <Video size={40} style={{ color: '#00d4ff', opacity: 0.4 }} />
                    <div className="text-xs" style={{ color: '#00d4ff', opacity: 0.6 }}>
                      正在启动摄像头...
                    </div>
                  </>
                ) : (
                  <>
                    <CameraOff size={40} style={{ color: 'var(--color-text-secondary)', opacity: 0.3 }} />
                    <div className="text-xs" style={{ color: 'var(--color-text-secondary)', opacity: 0.5 }}>
                      已停车 · 开始驾驶后摄像头自动开启
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
                    corner.borders.forEach(b => { style[b] = `2px solid ${alertColors[realSafety.alertLevel]}`; });
                    return <div key={i} className={`absolute ${corner.pos} w-5 h-5`} style={style} />;
                  })}
                  <div className="absolute inset-0" style={{
                    boxShadow: `0 0 15px ${alertColors[realSafety.alertLevel]}40, inset 0 0 15px ${alertColors[realSafety.alertLevel]}10`,
                  }} />
                  {/* 标签 */}
                  <div className="absolute -top-7 left-0 flex items-center gap-1.5 px-2 py-1 rounded-md"
                    style={{ background: `${alertColors[realSafety.alertLevel]}E6`, backdropFilter: 'blur(4px)' }}>
                    <span className="text-xs font-bold" style={{ color: '#0a0e1a' }}>
                      {fatigueDesc.text} · {realSafety.fatigueScore}分
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

          {/* 摄像头状态提示（随驾驶状态自动开关）*/}
          <div className="flex items-center gap-3 mt-4">
            {vehicle.isDriving ? (
              cameraActive ? (
                <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium"
                  style={{ background: 'rgba(0,255,136,0.1)', color: '#00ff88', border: '1px solid rgba(0,255,136,0.25)' }}>
                  <Camera size={14} />
                  监控中 · 摄像头已随驾驶自动开启
                </div>
              ) : cameraError ? (
                <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium"
                  style={{ background: 'rgba(255,71,87,0.1)', color: '#ff4757', border: '1px solid rgba(255,71,87,0.25)' }}>
                  <CameraOff size={14} />
                  {cameraError} · 请允许摄像头权限
                </div>
              ) : (
                <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium"
                  style={{ background: 'rgba(0,212,255,0.1)', color: '#00d4ff', border: '1px solid rgba(0,212,255,0.25)' }}>
                  <Camera size={14} />
                  正在启动摄像头...
                </div>
              )
            ) : (
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium"
                style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
                <CameraOff size={14} />
                已停车 · 摄像头已关闭，开始驾驶后自动开启
              </div>
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
                <GaugeChart value={realSafety.fatigueScore} max={100} size={150} color="#a78bfa" warning={25} danger={45} />
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
                <AlertTriangle size={16} style={{ color: alertColors[realSafety.alertLevel] }} />
                <h3 className="text-sm font-semibold">告警等级</h3>
              </div>
              <div className="w-20 h-20 rounded-full flex items-center justify-center"
                style={{
                  background: `${alertColors[realSafety.alertLevel]}15`,
                  border: `3px solid ${alertColors[realSafety.alertLevel]}`,
                  boxShadow: `0 0 20px ${alertColors[realSafety.alertLevel]}30`,
                }}>
                <span className="text-lg font-bold" style={{ color: alertColors[realSafety.alertLevel] }}>
                  {alertLabels[realSafety.alertLevel]}
                </span>
              </div>
              <div className="mt-3 flex gap-2">
                {['normal', 'warning', 'danger'].map(level => (
                  <span key={level} className="status-dot" style={{
                    background: alertColors[level],
                    boxShadow: realSafety.alertLevel === level ? `0 0 8px ${alertColors[level]}` : 'none',
                    opacity: realSafety.alertLevel === level ? 1 : 0.3,
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
                <GaugeChart value={realSafety.heartRate} max={150} size={150} color="#ff4757" warning={100} danger={120} unit="BPM" />
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
                  style={{ color: realSafety.eyeClosureRate > 0.2 ? '#ff4757' : '#00d4ff' }}>
                  {(realSafety.eyeClosureRate * 100).toFixed(1)}<span className="text-sm">%</span>
                </div>
                <div className="mt-2 w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <div className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.min(100, realSafety.eyeClosureRate * 100 / 0.8 * 100)}%`,
                      background: realSafety.eyeClosureRate > 0.2 ? 'linear-gradient(90deg, #ff6348, #ff4757)' : 'linear-gradient(90deg, #00d4ff80, #00d4ff)',
                    }} />
                </div>
              </div>
              {/* 哈欠次数 */}
              <div className="text-center p-3 rounded-xl" style={{ background: 'rgba(0,255,136,0.04)', border: '1px solid rgba(0,255,136,0.1)' }}>
                <div className="text-xs mb-2" style={{ color: 'var(--color-text-secondary)' }}>哈欠/分钟</div>
                <div className="text-2xl font-bold font-mono tabular-nums transition-all duration-200"
                  style={{ color: realSafety.yawnsPerMin >= 3 ? '#ff4757' : realSafety.yawnsPerMin >= 1 ? '#ffa502' : '#00ff88' }}>
                  {realSafety.yawnsPerMin}<span className="text-sm">次</span>
                </div>
                <div className="mt-2 flex justify-center gap-0.5">
                  {[0,1,2,3,4].map(i => (
                    <div key={i} className="w-2 h-4 rounded-sm transition-all duration-300"
                      style={{
                        background: i < realSafety.yawnsPerMin ? '#ffa502' : 'rgba(255,255,255,0.06)',
                        boxShadow: i < realSafety.yawnsPerMin ? '0 0 4px rgba(255,165,2,0.4)' : 'none',
                      }} />
                  ))}
                </div>
              </div>
              {/* 视线方向 */}
              <div className="text-center p-3 rounded-xl" style={{ background: realSafety.gazeDirection === '前方' ? 'rgba(0,255,136,0.04)' : 'rgba(255,165,2,0.06)', border: `1px solid ${realSafety.gazeDirection === '前方' ? 'rgba(0,255,136,0.1)' : 'rgba(255,165,2,0.15)'}` }}>
                <div className="text-xs mb-2" style={{ color: 'var(--color-text-secondary)' }}>视线方向</div>
                <div className="text-lg font-bold transition-all duration-200"
                  style={{ color: realSafety.gazeDirection === '前方' ? '#00ff88' : '#ffa502' }}>
                  {realSafety.gazeDirection}
                </div>
                <div className="mt-2 text-xs" style={{ color: realSafety.gazeDirection === '前方' ? '#00ff88' : '#ffa502' }}>
                  {realSafety.gazeDirection === '前方' ? '✓ 正常' : '⚠ 偏移'}
                </div>
              </div>
              {/* 分心时长 */}
              <div className="text-center p-3 rounded-xl" style={{ background: 'rgba(0,212,255,0.04)', border: '1px solid rgba(0,212,255,0.1)' }}>
                <div className="text-xs mb-2" style={{ color: 'var(--color-text-secondary)' }}>分心时长</div>
                <div className="text-2xl font-bold font-mono tabular-nums transition-all duration-200"
                  style={{ color: realSafety.distractionDuration > 5 ? '#ff4757' : realSafety.distractionDuration > 2 ? '#ffa502' : '#00d4ff' }}>
                  {realSafety.distractionDuration}<span className="text-sm">s</span>
                </div>
                <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <div className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.min(100, realSafety.distractionDuration / 12 * 100)}%`,
                      background: realSafety.distractionDuration > 5 ? '#ff4757' : '#00d4ff',
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
              <span className="ml-auto text-xs" style={{ color: 'var(--color-text-secondary)' }}>最近 {realSafety.alerts.length} 条</span>
            </div>
            <div className="space-y-2 overflow-y-auto" style={{ height: 120 }}>
              {realSafety.alerts.map((log, i) => (
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
