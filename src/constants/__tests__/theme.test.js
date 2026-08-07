import { describe, it, expect } from 'vitest';
import {
  COLORS,
  ALERT_COLORS,
  ALERT_LABELS,
  getFatigueDescriptor,
} from '../theme';

describe('COLORS', () => {
  it('包含全部数据可视化调色板键', () => {
    for (const key of ['primary', 'accent', 'cyan', 'neon', 'amber', 'red', 'purple', 'pink', 'sky']) {
      expect(COLORS[key]).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});

describe('ALERT_COLORS / ALERT_LABELS', () => {
  it('三档告警等级一一对应', () => {
    expect(Object.keys(ALERT_COLORS).sort()).toEqual(['danger', 'normal', 'warning']);
    expect(Object.keys(ALERT_LABELS).sort()).toEqual(['danger', 'normal', 'warning']);
  });

  it('正常态使用霓虹绿，危险态使用红色', () => {
    expect(ALERT_COLORS.normal).toBe(COLORS.neon);
    expect(ALERT_COLORS.danger).toBe(COLORS.red);
  });
});

describe('getFatigueDescriptor', () => {
  it('≥80 状态良好', () => {
    expect(getFatigueDescriptor(95).text).toBe('状态良好');
    expect(getFatigueDescriptor(80).text).toBe('状态良好');
  });

  it('60-79 轻度疲劳', () => {
    expect(getFatigueDescriptor(70).text).toBe('轻度疲劳');
    expect(getFatigueDescriptor(60).text).toBe('轻度疲劳');
  });

  it('40-59 中度疲劳', () => {
    expect(getFatigueDescriptor(50).text).toBe('中度疲劳');
    expect(getFatigueDescriptor(40).text).toBe('中度疲劳');
  });

  it('<40 严重疲劳', () => {
    expect(getFatigueDescriptor(30).text).toBe('严重疲劳');
    expect(getFatigueDescriptor(0).text).toBe('严重疲劳');
  });

  it('每个档位都返回有效颜色', () => {
    [95, 70, 50, 30].forEach((s) => {
      const d = getFatigueDescriptor(s);
      expect(d.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    });
  });
});
