import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Smile, Gauge, Settings, MessageCircle,
  Shield, CloudSun, Cpu, Moon, Sun, Type, ChevronDown
} from 'lucide-react';
import { modules } from '../data/mockData';
import { useTheme } from '../context/ThemeContext';

const iconMap = {
  LayoutDashboard, Smile, Gauge, Settings, MessageCircle, Shield, CloudSun
};

export default function Layout() {
  const location = useLocation();
  const { theme, toggleTheme, fonts, fontId, setFontId } = useTheme();
  const [showFontMenu, setShowFontMenu] = useState(false);

  return (
    <div className="app-bg flex flex-col h-full w-full overflow-hidden">
      {/* 顶部导航栏 */}
      <header className="relative flex items-center justify-between px-6 py-3" style={{ zIndex: 10 }}>
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, #4f8cff, #34d399)',
              boxShadow: '0 2px 8px rgba(79, 140, 255, 0.25)',
            }}>
            <Cpu size={16} color="#fff" strokeWidth={2.5} />
          </div>
          <span className="text-sm font-bold" style={{ color: 'var(--color-text-main)' }}>
            智能座舱
          </span>
        </div>

        {/* 导航标签 */}
        <nav className="flex items-center gap-1">
          {modules.map((mod) => {
            const isActive = location.pathname === mod.path || (mod.path === '/' && location.pathname === '');
            return (
              <NavLink
                key={mod.id}
                to={mod.path}
                end={mod.path === '/'}
                className={`top-nav-item ${isActive ? 'active' : ''}`}
              >
                {mod.name}
              </NavLink>
            );
          })}
        </nav>

        {/* 右侧控制区 */}
        <div className="flex items-center gap-3">
          {/* 字体切换 */}
          <div className="relative">
            <button
              onClick={() => setShowFontMenu(!showFontMenu)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors"
              style={{
                background: 'rgba(0,0,0,0.04)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-sub)',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.07)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.04)'}
            >
              <Type size={13} />
              <span className="text-xs font-medium">字体</span>
              <ChevronDown size={11} />
            </button>
            {showFontMenu && (
              <>
                {/* 遮罩层 - 放在header内确保不盖住菜单 */}
                <div className="fixed inset-0" style={{ zIndex: 99 }} onClick={() => setShowFontMenu(false)} />
                <div className="absolute right-0 top-full mt-2 rounded-xl py-1 min-w-[140px]"
                  style={{
                    background: 'var(--color-card-solid)',
                    border: '1px solid var(--color-border)',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                    zIndex: 100,
                  }}>
                  {fonts.map((font) => (
                    <button
                      key={font.id}
                      onClick={() => { setFontId(font.id); setShowFontMenu(false); }}
                      className="w-full text-left px-4 py-2 text-sm transition-colors"
                      style={{
                        color: fontId === font.id ? 'var(--color-primary)' : 'var(--color-text-main)',
                        background: fontId === font.id ? 'rgba(79, 140, 255, 0.06)' : 'transparent',
                        fontFamily: font.family,
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.04)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = fontId === font.id ? 'rgba(79, 140, 255, 0.06)' : 'transparent'}
                    >
                      {font.name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* 主题切换 */}
          <button
            onClick={toggleTheme}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
            style={{
              background: 'rgba(0,0,0,0.04)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-sub)',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.07)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.04)'}
            title={theme === 'light' ? '切换暗色主题' : '切换亮色主题'}
          >
            {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
          </button>

          {/* 在线状态 */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
            style={{ background: 'rgba(52, 211, 153, 0.08)', border: '1px solid rgba(52, 211, 153, 0.15)' }}>
            <span className="status-dot online" />
            <span className="text-xs font-medium" style={{ color: '#059669' }}>在线</span>
          </div>
        </div>
      </header>

      {/* 主内容区 */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden relative" style={{ zIndex: 1, padding: '0 40px 32px' }}>
        <Outlet />
      </main>
    </div>
  );
}
