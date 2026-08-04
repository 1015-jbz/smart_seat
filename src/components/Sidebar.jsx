import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Smile, Gauge, Settings, MessageCircle,
  Shield, CloudSun, Cpu, Wifi, ChevronLeft, ChevronRight, Activity
} from 'lucide-react';
import { modules } from '../data/mockData';

const iconMap = {
  LayoutDashboard, Smile, Gauge, Settings, MessageCircle, Shield, CloudSun
};

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  return (
    <aside
      className="h-full flex flex-col relative"
      style={{
        width: collapsed ? 68 : 210,
        background: 'var(--color-bg-sidebar)',
        borderRight: '1px solid rgba(0, 180, 255, 0.08)',
        transition: 'width 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      {/* 侧边栏内部光效 */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'linear-gradient(180deg, rgba(0, 180, 255, 0.02) 0%, transparent 30%, transparent 70%, rgba(0, 255, 136, 0.015) 100%)',
      }} />

      {/* Logo 区域 */}
      <div className="relative flex items-center gap-3 px-4 py-5" style={{ borderBottom: '1px solid rgba(0, 180, 255, 0.08)' }}>
        <div className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center relative overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, #00d4ff, #00ff88)',
            boxShadow: '0 4px 16px rgba(0, 200, 255, 0.25), inset 0 1px 0 rgba(255,255,255,0.15)',
          }}>
          <Cpu size={18} color="#060a14" strokeWidth={2.5} />
          {/* Logo 光泽 */}
          <div className="absolute inset-0 opacity-30" style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.3) 0%, transparent 50%)',
          }} />
        </div>
        {!collapsed && (
          <div className="animate-fade-in overflow-hidden">
            <div className="text-sm font-bold whitespace-nowrap" style={{
              background: 'linear-gradient(135deg, #00d4ff, #00ff88)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>智能座舱</div>
            <div className="text-[10px] tracking-wider" style={{ color: 'var(--color-text-secondary)', letterSpacing: '0.08em' }}>
              LOONGARCH AI
            </div>
          </div>
        )}
      </div>

      {/* 折叠按钮 */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-16 w-6 h-6 rounded-full flex items-center justify-center z-10 transition-all hover:scale-110"
        style={{
          background: 'rgba(12, 18, 35, 0.9)',
          border: '1px solid rgba(0, 180, 255, 0.2)',
          color: 'var(--color-text-secondary)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>

      {/* 导航 */}
      <nav className="flex-1 py-3 px-2.5 overflow-y-auto relative">
        <div className="text-[10px] uppercase tracking-widest px-3 mb-2" style={{ color: 'rgba(122, 139, 168, 0.5)' }}>
          {!collapsed && '功能模块'}
        </div>
        {modules.map((mod) => {
          const Icon = iconMap[mod.icon];
          const isActive = location.pathname === mod.path || (mod.path === '/' && location.pathname === '');
          return (
            <NavLink
              key={mod.id}
              to={mod.path}
              end={mod.path === '/'}
              className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl mb-0.5 transition-all duration-300 group ${
                isActive
                  ? 'nav-active-bar'
                  : ''
              }`}
              style={{
                background: isActive ? 'rgba(0, 180, 255, 0.08)' : 'transparent',
                color: isActive ? '#00d4ff' : 'var(--color-text-secondary)',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'rgba(0, 180, 255, 0.04)';
                  e.currentTarget.style.color = 'var(--color-text-primary)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--color-text-secondary)';
                }
              }}
            >
              <div className={`flex-shrink-0 transition-all duration-300 ${isActive ? 'drop-shadow-[0_0_8px_rgba(0,200,255,0.5)]' : 'group-hover:translate-x-0.5'}`}>
                {Icon && <Icon size={18} strokeWidth={isActive ? 2.2 : 1.8} />}
              </div>
              {!collapsed && (
                <span className={`text-[13px] whitespace-nowrap transition-all duration-300 animate-fade-in ${isActive ? 'font-semibold' : 'font-medium'}`}>
                  {mod.name}
                </span>
              )}
              {isActive && !collapsed && (
                <div className="ml-auto flex items-center gap-1.5">
                  <div className="w-1 h-1 rounded-full bg-[var(--color-primary)]" style={{
                    boxShadow: '0 0 6px var(--color-primary)',
                    animation: 'pulse-glow 2s ease-in-out infinite',
                  }} />
                </div>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* 底部系统状态 */}
      <div className="relative px-3 py-4" style={{ borderTop: '1px solid rgba(0, 180, 255, 0.08)' }}>
        {!collapsed ? (
          <div className="animate-fade-in">
            <div className="flex items-center gap-2 mb-2.5">
              <span className="status-dot online" />
              <span className="text-xs font-medium" style={{ color: 'var(--color-accent)' }}>系统在线</span>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Wifi size={11} style={{ color: 'var(--color-accent)', opacity: 0.7 }} />
                <span className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>端侧 AI 就绪</span>
              </div>
              <div className="flex items-center gap-2">
                <Activity size={11} style={{ color: 'var(--color-primary)', opacity: 0.7 }} />
                <span className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>LoongArch 64</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex justify-center">
            <span className="status-dot online" />
          </div>
        )}
      </div>
    </aside>
  );
}
