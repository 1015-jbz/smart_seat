import { describe, it, expect } from 'vitest';
import {
  emotionData,
  vehicleData,
  safetyData,
  weatherData,
  cabinData,
  modules,
} from '../mockData';

describe('modules 路由配置', () => {
  it('每个模块都包含 id/name/path/icon', () => {
    modules.forEach((m) => {
      expect(m).toHaveProperty('id');
      expect(m).toHaveProperty('name');
      expect(m).toHaveProperty('path');
      expect(m).toHaveProperty('icon');
      expect(typeof m.path).toBe('string');
      expect(m.path.startsWith('/')).toBe(true);
    });
  });

  it('首页路径为 /', () => {
    expect(modules.some((m) => m.path === '/')).toBe(true);
  });

  it('路径唯一', () => {
    const paths = modules.map((m) => m.path);
    expect(new Set(paths).size).toBe(paths.length);
  });
});

describe('vehicleData 初始值', () => {
  it('字段类型与范围合法', () => {
    expect(typeof vehicleData.speed).toBe('number');
    expect(vehicleData.speed).toBeGreaterThanOrEqual(0);
    expect(vehicleData.tirePressure).toHaveLength(4);
    vehicleData.tirePressure.forEach((p) => {
      expect(p).toBeGreaterThan(0);
      expect(p).toBeLessThan(10);
    });
    expect(vehicleData.fuel).toBeGreaterThanOrEqual(0);
    expect(vehicleData.fuel).toBeLessThanOrEqual(100);
    expect(vehicleData.battery).toBeGreaterThanOrEqual(0);
    expect(vehicleData.battery).toBeLessThanOrEqual(100);
  });
});

describe('safetyData 初始值', () => {
  it('告警等级合法', () => {
    expect(['normal', 'warning', 'danger']).toContain(safetyData.alertLevel);
    expect(safetyData.fatigueScore).toBeGreaterThanOrEqual(0);
    expect(safetyData.fatigueScore).toBeLessThanOrEqual(100);
  });

  it('alerts 是数组', () => {
    expect(Array.isArray(safetyData.alerts)).toBe(true);
  });
});

describe('weatherData 初始值', () => {
  it('基础字段存在', () => {
    expect(typeof weatherData.city).toBe('string');
    expect(typeof weatherData.temperature).toBe('number');
    expect(Array.isArray(weatherData.forecast)).toBe(true);
    expect(weatherData.forecast.length).toBeGreaterThan(0);
  });

  it('预报每天包含 day/temp/condition/icon', () => {
    weatherData.forecast.forEach((f) => {
      expect(f).toHaveProperty('day');
      expect(f).toHaveProperty('temp');
      expect(f).toHaveProperty('condition');
      expect(f).toHaveProperty('icon');
    });
  });
});

describe('emotionData / cabinData', () => {
  it('情绪置信度在 [0,1]', () => {
    expect(emotionData.confidence).toBeGreaterThanOrEqual(0);
    expect(emotionData.confidence).toBeLessThanOrEqual(1);
  });

  it('cabin 车窗数组长度为 4', () => {
    expect(cabinData.windows).toHaveLength(4);
  });
});
