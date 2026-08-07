/**
 * 主题色常量：与 index.css @theme 中的 CSS 变量保持一一对应。
 * 在 JS 逻辑（Canvas 绘制、动态 boxShadow、情绪颜色映射等）需要颜色值时，
 * 优先从这里取，避免在代码里散落硬编码十六进制色值。
 *
 * 静态样式仍应使用 CSS 变量 var(--color-xxx)，以便暗色主题覆盖。
 * 此文件仅用于 JS 运行时取色场景。
 */
export const COLORS = {
  primary: '#4f8cff',
  primaryDark: '#3a6fd8',
  accent: '#34d399',
  // 数据可视化用调色板
  cyan: '#00d4ff',
  neon: '#00ff88',
  amber: '#ffa502',
  red: '#ff4757',
  purple: '#a78bfa',
  pink: '#f472b6',
  sky: '#38bdf8',
};

/**
 * 告警等级 → 颜色映射，安全监控、驾驶安全等多处复用。
 */
export const ALERT_COLORS = {
  normal: COLORS.neon,
  warning: COLORS.amber,
  danger: COLORS.red,
};

/**
 * 疲劳评分 → 描述与颜色。
 */
export function getFatigueDescriptor(score) {
  if (score >= 80) return { text: '状态良好', color: COLORS.neon };
  if (score >= 60) return { text: '轻度疲劳', color: COLORS.amber };
  if (score >= 40) return { text: '中度疲劳', color: COLORS.red };
  return { text: '严重疲劳', color: COLORS.red };
}

/**
 * 告警等级文案。
 */
export const ALERT_LABELS = {
  normal: '正常',
  warning: '预警',
  danger: '危险',
};
