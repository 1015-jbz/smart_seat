import { useState, useEffect } from 'react';
import { useVehicle } from '../context/VehicleStore';
import { Camera, CameraOff } from 'lucide-react';

const CAMERA_FEED_URL = 'http://localhost:7861/video_feed';

export default function CameraFeed() {
  const { safety } = useVehicle();
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setOnline(true);
    img.onerror = () => setOnline(false);
    img.src = CAMERA_FEED_URL;
  }, []);

  const isFatigueAlert = safety.alertLevel !== 'normal';

  return (
    <div className="glass-card overflow-hidden" style={{ flex: '0 0 240px' }}>
      <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <div className="flex items-center gap-1.5">
          {online ? (
            <Camera size={14} style={{ color: '#34d399' }} />
          ) : (
            <CameraOff size={14} style={{ color: '#ff4757' }} />
          )}
          <span className="text-xs font-medium" style={{ color: 'var(--color-text-main)' }}>
            摄像头
          </span>
        </div>
        <span
          className="text-xs"
          style={{
            color: online ? '#34d399' : '#ff4757',
          }}
        >
          {online ? '在线' : '离线'}
        </span>
      </div>

      <div className="relative w-full h-[calc(100%-68px)] bg-black">
        {online ? (
          <img
            src={CAMERA_FEED_URL}
            alt="camera"
            className="w-full h-full object-cover"
            style={{ display: 'block' }}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full" style={{ color: 'var(--color-text-muted)' }}>
            <CameraOff size={32} style={{ opacity: 0.5 }} />
            <span className="text-xs mt-2">摄像头未连接</span>
          </div>
        )}

        {online && (
          <div
            className="absolute bottom-0 left-0 right-0 px-3 py-2 flex items-center justify-between"
            style={{
              background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)',
            }}
          >
            <div className="flex items-center gap-2">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{
                  background: isFatigueAlert ? '#ff4757' : '#34d399',
                }}
              />
              <span className="text-xs" style={{ color: '#fff' }}>
                疲劳: {safety.fatigueScore}
              </span>
            </div>
            <span
              className="text-xs font-medium"
              style={{
                color: isFatigueAlert ? '#ff4757' : '#34d399',
              }}
            >
              {isFatigueAlert ? '需注意' : '正常'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
