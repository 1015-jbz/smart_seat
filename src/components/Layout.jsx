import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Smile, Gauge, Settings, MessageCircle,
  Shield, CloudSun, Cpu, Moon, Sun, Type, ChevronDown, User, Check, X
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
  const [username, setUsername] = useState(() => localStorage.getItem('carAssistantUsername') || '车主');
  const [showEditName, setShowEditName] = useState(false);
  const [editNameValue, setEditNameValue] = useState(username);

  useEffect(() => {
    localStorage.setItem('carAssistantUsername', username);
  }, [username]);

  const handleSaveName = () => {
    const trimmed = editNameValue.trim();
    if (trimmed) {
      setUsername(trimmed);
      setShowEditName(false);
    }
  };

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

          {/* 用户名 */}
          <button onClick={() => { setEditNameValue(username); setShowEditName(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors"
            style={{
              background: 'rgba(79,140,255,0.08)',
              border: '1px solid rgba(79,140,255,0.2)',
              color: 'var(--color-text-main)',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(79,140,255,0.15)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(79,140,255,0.08)'}
            title="点击修改用户名">
            <User size={13} style={{ color: '#4f8cff' }} />
            <span className="text-xs font-medium">{username}</span>
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
        <Outlet context={{ username }} />
      </main>

      {/* 用户名编辑弹窗 */}
      {showEditName && (
        <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 200 }}>
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setShowEditName(false)} />
          <div className="relative rounded-2xl p-6 w-80 animate-fade-in"
            style={{
              background: 'var(--color-card-solid)',
              border: '1px solid var(--color-border)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold" style={{ color: 'var(--color-text-main)' }}>修改用户名</h3>
              <button onClick={() => setShowEditName(false)}
                className="w-6 h-6 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.05)' }}>
                <X size={14} style={{ color: 'var(--color-text-secondary)' }} />
              </button>
            </div>
            <input type="text" value={editNameValue}
              onChange={(e) => setEditNameValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
              placeholder="请输入用户名"
              maxLength={10}
              autoFocus
              className="w-full px-4 py-2.5 rounded-xl text-sm outline-none mb-4"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-primary)',
              }} />
            <button onClick={handleSaveName}
              className="w-full py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm font-medium transition-all"
              style={{
                background: 'linear-gradient(135deg, #4f8cff, #34d399)',
                color: '#fff',
                boxShadow: '0 4px 12px rgba(79,140,255,0.3)',
              }}>
              <Check size={14} /> 保存
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
