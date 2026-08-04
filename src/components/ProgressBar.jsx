export default function ProgressBar({ value, max = 100, label, color = '#00d4ff', height = 6, showValue = true }) {
  const percent = Math.min((value / max) * 100, 100);

  return (
    <div className="w-full">
      {(label || showValue) && (
        <div className="flex justify-between items-center mb-1.5">
          {label && <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{label}</span>}
          {showValue && <span className="text-xs font-medium" style={{ color }}>{Math.round(percent)}%</span>}
        </div>
      )}
      <div className="w-full rounded-full overflow-hidden" style={{ height, background: 'rgba(255,255,255,0.05)' }}>
        <div
          className="h-full rounded-full transition-all duration-300 ease-out"
          style={{
            width: `${percent}%`,
            background: `linear-gradient(90deg, ${color}80, ${color})`,
            boxShadow: `0 0 10px ${color}60`,
          }}
        />
      </div>
    </div>
  );
}
