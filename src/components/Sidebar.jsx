import { useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Smile, Gauge, Settings, MessageCircle, Shield, CloudSun,
} from 'lucide-react';
import { modules } from '../data/mockData';

const iconMap = {
  LayoutDashboard, Smile, Gauge, Settings, MessageCircle, Shield, CloudSun,
};

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <nav
      className="flex flex-col items-center py-3 gap-2 flex-shrink-0"
      style={{ width: 72, borderRight: '1px solid var(--color-border)' }}
    >
      {modules.map((mod) => {
        const Icon = iconMap[mod.icon] || LayoutDashboard;
        const isActive = location.pathname === mod.path || (mod.path === '/' && location.pathname === '');
        return (
          <button
            key={mod.id}
            onClick={() => navigate(mod.path)}
            className="sidebar-item"
            data-active={isActive}
            title={mod.name}
          >
            <Icon size={20} strokeWidth={2} />
            <span className="sidebar-label">{mod.name}</span>
          </button>
        );
      })}
    </nav>
  );
}
