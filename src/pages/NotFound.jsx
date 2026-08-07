import { useNavigate } from 'react-router-dom';
import { Home, Compass } from 'lucide-react';
import { modules } from '../data/mockData';

/**
 * 404 兜底页：展示可用模块入口，引导用户回到有效路由。
 */
export default function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="animate-fade-in flex flex-col items-center" style={{ minHeight: 'calc(100vh - 120px)', justifyContent: 'center' }}>
      <div className="text-center animate-slide-up">
        <div className="font-light tracking-tight" style={{
          fontSize: 'clamp(80px, 14vw, 140px)',
          lineHeight: 1,
          background: 'linear-gradient(135deg, var(--color-primary), var(--color-accent))',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}>
          404
        </div>
        <p className="text-base mt-2" style={{ color: 'var(--color-text-sub)' }}>
          页面未找到 · 您访问的路径不存在
        </p>
      </div>

      <div className="mt-10 w-full max-w-2xl animate-slide-up" style={{ animationDelay: '0.15s' }}>
        <div className="text-xs mb-3 text-center" style={{ color: 'var(--color-text-muted)' }}>
          您可以前往以下模块
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {modules.map((mod) => (
            <button
              key={mod.id}
              onClick={() => navigate(mod.path)}
              className="px-4 py-2 rounded-full text-sm transition-all hover:scale-105"
              style={{
                background: 'rgba(79,140,255,0.06)',
                border: '1px solid rgba(79,140,255,0.2)',
                color: 'var(--color-text-main)',
              }}
            >
              {mod.name}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={() => navigate('/')}
        className="mt-8 flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium transition-all"
        style={{
          background: 'linear-gradient(135deg, var(--color-primary), var(--color-accent))',
          color: '#fff',
          boxShadow: '0 4px 12px rgba(79,140,255,0.3)',
        }}
      >
        <Home size={15} /> 返回首页
      </button>

      <div className="mt-10 flex items-center gap-1.5 text-xs" style={{ color: 'var(--color-text-muted)' }}>
        <Compass size={12} />
        智能座舱车载助手
      </div>
    </div>
  );
}
