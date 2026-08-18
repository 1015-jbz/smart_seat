import { useState } from 'react';
import { Send, Mic, Loader2 } from 'lucide-react';
import { useVoice } from '../context/VoiceStore';
import { useVehicle } from '../context/VehicleStore';
import { api } from '../services/api';

const nowHHMM = () => {
  const now = new Date();
  return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
};

export default function MiniChat() {
  const { pushMessage } = useVoice();
  const { location } = useVehicle();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    if (!text.trim() || loading) return;
    const userText = text.trim();
    setText('');
    pushMessage('user', userText, 'text');
    setLoading(true);
    try {
      const res = await api.chat(userText, { city: location.city });
      const reply = res?.reply || '诶，AI暂时用不了，等下再试试。';
      pushMessage('assistant', reply, 'tts');
    } catch {
      pushMessage('assistant', '诶，AI暂时用不了，等下再试试。', 'tts');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 glass-card"
      style={{ borderTop: '1px solid var(--color-border)' }}
    >
      <button
        className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all"
        style={{
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid var(--color-border)',
          color: 'var(--color-text-secondary)',
        }}
        title="语音输入"
      >
        <Mic size={14} />
      </button>
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="输入消息..."
        className="flex-1 px-3 py-1.5 rounded-lg text-xs outline-none transition-all"
        style={{
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid var(--color-border)',
          color: 'var(--color-text-primary)',
        }}
      />
      <button
        onClick={handleSend}
        disabled={loading}
        className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all"
        style={{
          background: loading
            ? 'rgba(255,255,255,0.1)'
            : 'linear-gradient(135deg, var(--color-primary), var(--color-accent))',
          color: loading ? 'var(--color-text-muted)' : '#0a0e1a',
        }}
        title="发送"
      >
        {loading ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
      </button>
    </div>
  );
}
