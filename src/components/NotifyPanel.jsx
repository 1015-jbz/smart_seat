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
    <div className="glass-card flex flex-col overflow-hidden flex-shrink-0" style={{ maxHeight: 200 }}>
      <div className="flex items-center gap-1 px-3 pt-3">
        <Mic size={16} />
        <span className="text-sm font-medium">通知面板</span>
      </div>
      <div className="overflow-y-auto flex-1 p-2 space-y-2">
        {activeTab === 'voice' ? (
          voiceMessages.length > 0 ? (
            voiceMessages.map((msg, i) => (
              <div key={i} className="bg-white/5 rounded p-2 text-xs">{msg.text}</div>
            ))
          ) : (
            <div className="text-gray-400 text-xs text-center py-4">暂无语音消息</div>
          )
        ) : (
          alertMessages.length > 0 ? (
            alertMessages.map((msg, i) => (
              <div key={i} className="bg-red-50 border border-red-200 rounded p-2 text-xs text-red-700">{msg.text}</div>
            ))
          ) : (
            <div className="text-gray-400 text-xs text-center py-4">暂无告警消息</div>
          )
        )}
      </div>
      <button onClick={clearMessages} className="p-2 hover:bg-black/5 transition-colors">
        <Trash2 size={14} />
      </button>
    </div>
  );
}
