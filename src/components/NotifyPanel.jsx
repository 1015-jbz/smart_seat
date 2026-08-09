import { useState } from 'react';
import { useVoice } from '../context/VoiceStore';
import { useVehicle } from '../context/VehicleStore';
import { Mic, AlertTriangle, MessageCircle } from 'lucide-react';

export default function NotifyPanel() {
  const { messages, clearMessages } = useVoice();
  const { safety } = useVehicle();
  const [activeTab, setActiveTab] = useState('voice');

  const voiceMessages = messages.filter(m => m.source !== 'alert' && m.source !== 'system');
  const alertMessages = messages.filter(m => m.source === 'alert' || m.source === 'system');

  return (
    <div className="glass-card flex flex-col overflow-hidden" style={{ flex: 1 }}>
      <div className="flex items-center gap-1 px-3 pt-3">
        <button
          className="flex-1 py-2 text-xs font-medium rounded-lg transition-all"
          onClick={() => setActiveTab('voice')}
          style={{
            background: activeTab === 'voice' ? 'rgba(0,212,255,0.15)' : 'transparent',
            color: activeTab === 'voice' ? '#00d4ff' : 'var(--color-text-secondary)',
            border: activeTab === 'voice' ? '1px solid rgba(0,212,255,0.3)' : '1px solid transparent',
          }}
        >
          <span className="flex items-center justify-center gap-1">
            <Mic size={12} /> 语音记录
          </span>
        </button>
        <button
          className="flex-1 py-2 text-xs font-medium rounded-lg transition-all"
          onClick={() => setActiveTab('alert')}
          style={{
            background: activeTab === 'alert' ? 'rgba(255,71,87,0.15)' : 'transparent',
            color: activeTab === 'alert' ? '#ff4757' : 'var(--color-text-secondary)',
            border: activeTab === 'alert' ? '1px solid rgba(255,71,87,0.3)' : '1px solid transparent',
          }}
        >
          <span className="flex items-center justify-center gap-1">
            <AlertTriangle size={12} /> 疲劳提醒
          </span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {activeTab === 'voice' ? (
          voiceMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8" style={{ color: 'var(--color-text-muted)' }}>
              <MessageCircle size={24} style={{ opacity: 0.4 }} />
              <span className="text-xs mt-2">暂无语音记录</span>
            </div>
          ) : (
            voiceMessages.slice(-20).map((msg, i) => (
              <div key={i} className="flex gap-2 text-xs animate-slide-in">
                <div
                  className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center"
                  style={{
                    background: msg.role === 'user' ? 'rgba(0,212,255,0.15)' : 'rgba(244,114,182,0.15)',
                  }}
                >
                  {msg.role === 'user' ? (
                    <Mic size={10} style={{ color: '#00d4ff' }} />
                  ) : (
                    <MessageCircle size={10} style={{ color: '#f472b6' }} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="truncate" style={{ color: 'var(--color-text-main)' }}>
                    {msg.text}
                  </div>
                  <div className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                    {msg.role === 'user' ? '用户' : '小龙'} · {msg.time}
                  </div>
                </div>
              </div>
            ))
          )
        ) : (
          <div>
            <div
              className="p-3 rounded-xl mb-3"
              style={{
                background:
                  safety.alertLevel === 'normal'
                    ? 'rgba(52,211,153,0.08)'
                    : 'rgba(255,71,87,0.08)',
                border: `1px solid ${
                  safety.alertLevel === 'normal' ? 'rgba(52,211,153,0.2)' : 'rgba(255,71,87,0.2)'
                }`,
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium" style={{ color: 'var(--color-text-main)' }}>
                  当前状态
                </span>
                <span
                  className="text-xs font-bold"
                  style={{
                    color:
                      safety.alertLevel === 'normal'
                        ? '#34d399'
                        : safety.alertLevel === 'warning'
                        ? '#ffa502'
                        : '#ff4757',
                  }}
                >
                  {safety.alertLevel === 'normal' ? '正常' : safety.alertLevel === 'warning' ? '注意' : '危险'}
                </span>
              </div>
              <div className="text-xs mt-1" style={{ color: 'var(--color-text-sub)' }}>
                疲劳评分: {safety.fatigueScore} · 心率: {safety.heartRate}
              </div>
            </div>

            {alertMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6" style={{ color: 'var(--color-text-muted)' }}>
                <AlertTriangle size={20} style={{ opacity: 0.4 }} />
                <span className="text-xs mt-2">暂无疲劳提醒</span>
              </div>
            ) : (
              alertMessages.slice(-10).map((msg, i) => (
                <div key={i} className="flex gap-2 text-xs mb-2">
                  <AlertTriangle size={12} style={{ color: '#ffa502', flexShrink: 0, marginTop: 2 }} />
                  <div className="flex-1 min-w-0">
                    <div style={{ color: 'var(--color-text-main)' }}>{msg.text}</div>
                    <div className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                      {msg.time}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <div className="px-3 py-2" style={{ borderTop: '1px solid var(--color-border)' }}>
        <button
          onClick={clearMessages}
          className="w-full py-1.5 rounded-lg text-xs transition-all"
          style={{
            background: 'rgba(255,71,87,0.08)',
            border: '1px solid rgba(255,71,87,0.15)',
            color: 'var(--color-text-secondary)',
          }}
        >
          清空记录
        </button>
      </div>
    </div>
  );
}
