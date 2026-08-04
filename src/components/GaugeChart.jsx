export default function GaugeChart({ value, max = 100, size = 160, label, unit, color = '#00d4ff', warning, danger }) {
  const radius = (size - 20) / 2;
  const circumference = 2 * Math.PI * radius;
  const percent = Math.min(value / max, 1);
  const strokeDasharray = circumference;
  const strokeDashoffset = circumference * (1 - percent * 0.75);
  const rotation = -225;

  let strokeColor = color;
  if (danger && value >= danger) strokeColor = '#ff4757';
  else if (warning && value >= warning) strokeColor = '#ffa502';

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} className="transform" style={{ transform: `rotate(${rotation}deg)` }}>
        {/* Background arc */}
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.05)"
          strokeWidth="10"
          strokeDasharray={`${circumference * 0.75} ${circumference * 0.25}`}
          strokeLinecap="round"
        />
        {/* Value arc */}
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth="10"
          strokeDasharray={strokeDasharray}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          style={{
            transition: 'stroke-dashoffset 0.8s ease',
            filter: `drop-shadow(0 0 6px ${strokeColor}80)`,
          }}
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center" style={{ width: size, height: size }}>
        <span className="text-2xl font-bold" style={{ color: strokeColor }}>{value}</span>
        {unit && <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{unit}</span>}
      </div>
      {label && <span className="text-xs mt-2" style={{ color: 'var(--color-text-secondary)' }}>{label}</span>}
    </div>
  );
}
