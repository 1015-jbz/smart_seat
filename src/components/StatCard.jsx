export default function StatCard({ icon: Icon, title, value, unit, subtitle, color = '#00d4ff', onClick }) {
  return (
    <div
      className="glass-card p-4 cursor-pointer hover:scale-[1.02] transition-transform"
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: `${color}15`, border: `1px solid ${color}30` }}
        >
          {Icon && <Icon size={20} style={{ color }} />}
        </div>
        <span className="status-dot online" />
      </div>
      <div className="text-xs mb-1" style={{ color: 'var(--color-text-secondary)' }}>{title}</div>
      <div className="flex items-baseline gap-1">
        <span className="text-xl font-bold" style={{ color }}>{value}</span>
        {unit && <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{unit}</span>}
      </div>
      {subtitle && (
        <div className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>{subtitle}</div>
      )}
    </div>
  );
}
