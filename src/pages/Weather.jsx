import { CloudSun, Sun, Cloud, CloudRain, Droplets, Wind, Gauge, Eye, Thermometer, MapPin, RefreshCw, Loader2, AlertTriangle, ChevronDown, Navigation, Wifi, CheckCircle2, Search, X } from 'lucide-react';
import { useVehicle, CITY_COORDS } from '../context/VehicleStore';
import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../services/api';

const iconMap = {
  sun: Sun,
  cloud: Cloud,
  'cloud-rain': CloudRain,
};

// 定位来源文本 + 精度描述
function renderLocationText(loc) {
  if (!loc.located) return loc.denied ? '定位权限被拒绝，可手动搜索城市' : '定位失败，可在下方搜索城市';

  const prefix = {
    gps: '📍 GPS 定位',
    amap_ip: '🌐 网络定位',
    ip: '🌐 网络定位',
    manual: '🏙️ 已选择',
    default: '🏙️ 默认城市',
  }[loc.source] || '📍 定位';

  let detail = loc.city;
  if (loc.district) detail = `${loc.city} · ${loc.district}`;
  if (loc.address) detail = loc.address;

  return `${prefix}：${detail}`;
}

export default function Weather() {
  const { weather, location, refreshLocation, setCity, setCityBySearch } = useVehicle();

  // 城市搜索状态
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const searchTimerRef = useRef(null);
  const searchContainerRef = useRef(null);

  // 防抖搜索
  const performSearch = useCallback(async (keyword) => {
    if (!keyword || keyword.trim().length < 2) {
      setSearchResults([]);
      setSearchError(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    setSearchError(null);
    try {
      const data = await api.searchCity(keyword.trim());
      if (data) {
        setSearchResults(data.results || []);
        setSearchError(data.error || null);
      } else {
        setSearchResults([]);
        setSearchError('搜索失败，请稍后重试');
      }
    } catch {
      setSearchResults([]);
      setSearchError('搜索失败，请稍后重试');
    } finally {
      setSearching(false);
    }
  }, []);

  const handleSearchInput = useCallback((value) => {
    setSearchQuery(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => performSearch(value), 350);
  }, [performSearch]);

  const handleSelectResult = useCallback((result) => {
    setCityBySearch(result);
    setSearchQuery('');
    setSearchResults([]);
    setSearchFocused(false);
    setSearchError(null);
  }, [setCityBySearch]);

  const handleSelectPresetCity = useCallback((cityName) => {
    setCity(cityName);
    setSearchQuery('');
    setSearchResults([]);
    setSearchFocused(false);
  }, [setCity]);

  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setSearchResults([]);
    setSearchError(null);
  }, []);

  // 点击搜索区域外部时关闭下拉
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  // 下拉是否展开：输入框聚焦时展开，搜索2字以上显示API结果，否则显示预设城市
  const showDropdown = searchFocused;
  const hasSearchText = searchQuery.trim().length >= 2;

  const details = [
    { icon: Droplets, label: '湿度', value: `${weather.humidity}%`, color: '#00d4ff' },
    { icon: Wind, label: '风速', value: `${weather.windSpeed} km/h`, color: '#00ff88' },
    { icon: Gauge, label: '气压', value: `${weather.pressure} hPa`, color: '#a78bfa' },
    { icon: Eye, label: '能见度', value: `${weather.visibility} km`, color: '#38bdf8' },
    { icon: Thermometer, label: '紫外线', value: `${weather.uvIndex} 级`, color: '#ffa502' },
  ];

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-1 section-header flex items-center gap-2" style={{ color: 'var(--color-text-main)' }}>
            天气信息
            {weather.real && (
              <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-normal" style={{ background: 'rgba(0,255,136,0.1)', color: '#00ff88', border: '1px solid rgba(0,255,136,0.25)' }}>
                <CheckCircle2 size={10} /> 真实数据
              </span>
            )}
          </h1>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {location.loading ? '正在定位...' : renderLocationText(location)}
          </p>
        </div>
        <button onClick={refreshLocation} disabled={location.loading}
          className="flex items-center gap-2 px-5 py-2.5 rounded-full transition-all hover:scale-105"
          style={{
            background: location.loading ? 'rgba(0,212,255,0.1)' : 'rgba(0,212,255,0.15)',
            border: '1px solid rgba(0,212,255,0.4)',
            color: '#00d4ff',
            boxShadow: '0 0 12px rgba(0,212,255,0.15)',
          }}>
          {location.loading ? <Loader2 size={16} className="animate-spin" /> : <Navigation size={16} />}
          <span className="text-sm font-semibold">{location.loading ? 'GPS 定位中...' : 'GPS 定位'}</span>
        </button>
      </div>

      <div className="grid grid-cols-3 gap-5">
        {/* Main Weather Card */}
        <div className="col-span-2 glass-card p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-10"
            style={{ background: 'radial-gradient(circle, #00d4ff, transparent)' }} />
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-3">
              <CloudSun size={20} style={{ color: '#38bdf8' }} />
              <span className="text-sm font-semibold">今日天气</span>
              {/* 当前城市显示 */}
              <div className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium"
                style={{
                  background: location.located ? 'rgba(0,212,255,0.15)' : 'rgba(255,165,2,0.15)',
                  color: location.located ? '#00d4ff' : '#ffa502',
                  border: `1px solid ${location.located ? 'rgba(0,212,255,0.3)' : 'rgba(255,165,2,0.3)'}`,
                }}>
                <MapPin size={11} />
                {location.city}{location.district ? ` · ${location.district}` : ''}
              </div>
            </div>

            {/* 搜索栏：始终可见 */}
            <div className="mb-4" ref={searchContainerRef}>
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearchInput(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  placeholder="🔍 搜索城市/区县手动定位，如：石家庄、长安区..."
                  className="w-full pl-9 pr-8 py-2.5 rounded-lg text-sm transition-all focus:outline-none"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: `1px solid ${searchFocused ? 'rgba(0,212,255,0.5)' : 'rgba(0,212,255,0.25)'}`,
                    color: 'var(--color-text-main)',
                    boxShadow: searchFocused ? '0 0 12px rgba(0,212,255,0.15)' : 'none',
                  }}
                />
                <Search size={14} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#00d4ff', pointerEvents: 'none' }} />
                {searchQuery && (
                  <button onClick={clearSearch}
                    style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)' }}>
                    <X size={14} />
                  </button>
                )}
                {/* 搜索结果 / 预设城市下拉 */}
                {showDropdown && (
                  <div className="absolute top-full left-0 right-0 mt-1 rounded-lg overflow-hidden z-50 max-h-72 overflow-y-auto"
                    style={{ background: 'rgba(15,23,42,0.98)', border: '1px solid rgba(0,212,255,0.3)', backdropFilter: 'blur(10px)' }}>
                    {/* 搜索中 */}
                    {searching && (
                      <div className="flex items-center justify-center gap-2 py-3 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                        <Loader2 size={12} className="animate-spin" /> 搜索中...
                      </div>
                    )}
                    {/* 搜索错误 */}
                    {!searching && hasSearchText && searchError && (
                      <div className="py-2 px-3 text-xs text-center" style={{ color: '#ffa502' }}>
                        {searchError}
                      </div>
                    )}
                    {/* 搜索结果（API） */}
                    {!searching && hasSearchText && !searchError && searchResults.length === 0 && (
                      <div className="py-2 px-3 text-xs text-center" style={{ color: 'var(--color-text-secondary)' }}>
                        未找到匹配的城市
                      </div>
                    )}
                    {!searching && hasSearchText && !searchError && searchResults.map((r, i) => (
                      <button
                        key={i}
                        onClick={() => handleSelectResult(r)}
                        className="w-full text-left px-3 py-2.5 transition-all hover:bg-white/5 flex items-center gap-2"
                        style={{ borderBottom: i < searchResults.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}
                      >
                        <MapPin size={12} style={{ color: '#00d4ff', flexShrink: 0 }} />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium" style={{ color: 'var(--color-text-main)' }}>
                            {r.city}{r.district ? ` · ${r.district}` : ''}
                          </div>
                          {r.address && (
                            <div className="text-xs truncate" style={{ color: 'var(--color-text-secondary)' }}>
                              {r.address}
                            </div>
                          )}
                        </div>
                        {r.province && (
                          <span className="text-xs flex-shrink-0" style={{ color: 'var(--color-text-secondary)' }}>
                            {r.province}
                          </span>
                        )}
                      </button>
                    ))}
                    {/* 预设城市列表（搜索框为空时显示） */}
                    {!searching && !hasSearchText && (
                      <>
                        <div className="px-3 py-2 text-xs font-medium" style={{ color: 'var(--color-text-secondary)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          热门城市
                        </div>
                        {CITY_COORDS.map((c, i) => (
                          <button
                            key={c.name}
                            onClick={() => handleSelectPresetCity(c.name)}
                            className="w-full text-left px-3 py-2 transition-all hover:bg-white/5 flex items-center gap-2"
                            style={{
                              borderBottom: i < CITY_COORDS.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                              background: location.city === c.name ? 'rgba(0,212,255,0.08)' : 'transparent',
                            }}
                          >
                            <MapPin size={11} style={{ color: location.city === c.name ? '#00d4ff' : 'var(--color-text-secondary)', flexShrink: 0 }} />
                            <span className="text-xs" style={{ color: location.city === c.name ? '#00d4ff' : 'var(--color-text-main)', fontWeight: location.city === c.name ? 600 : 400 }}>
                              {c.name}
                            </span>
                            {location.city === c.name && (
                              <CheckCircle2 size={11} style={{ color: '#00d4ff', marginLeft: 'auto' }} />
                            )}
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* GPS 定位失败提示 */}
            {!location.loading && !location.located && location.error && (
              <div className="mb-4 p-3 rounded-xl flex items-start gap-2 animate-fade-in"
                style={{ background: 'rgba(255,165,2,0.08)', border: '1px solid rgba(255,165,2,0.25)' }}>
                <AlertTriangle size={15} style={{ color: '#ffa502', flexShrink: 0, marginTop: 1 }} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium" style={{ color: '#ffa502' }}>
                    {location.denied ? 'GPS 权限被拒绝' : 'GPS 定位失败'}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                    {location.error} — 可在上方搜索框手动选择城市
                  </div>
                </div>
                <button onClick={refreshLocation}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all hover:scale-105"
                  style={{ background: 'rgba(255,165,2,0.15)', color: '#ffa502', border: '1px solid rgba(255,165,2,0.3)' }}>
                  <Navigation size={11} /> 重试
                </button>
              </div>
            )}
            <div className="flex items-center gap-8">
              <div>
                <div className="text-7xl font-bold gradient-text">{weather.temperature}°</div>
                <div className="text-lg mt-1" style={{ color: 'var(--color-text-primary)' }}>{weather.condition}</div>
              </div>
              <div className="relative">
                <Sun size={100} style={{ color: '#ffa502', opacity: 0.8, filter: 'drop-shadow(0 0 20px rgba(255,165,2,0.4))' }} />
              </div>
            </div>
            <div className="grid grid-cols-5 gap-3 mt-6">
              {details.map(d => {
                const Icon = d.icon;
                return (
                  <div key={d.label} className="text-center p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
                    <Icon size={18} className="mx-auto mb-1.5" style={{ color: d.color }} />
                    <div className="text-xs mb-0.5" style={{ color: 'var(--color-text-secondary)' }}>{d.label}</div>
                    <div className="text-sm font-semibold" style={{ color: d.color }}>{d.value}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Side Info */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-4">出行建议</h3>
          <div className="space-y-3">
            <div className="p-3 rounded-xl" style={{ background: 'rgba(0,255,136,0.05)', border: '1px solid rgba(0,255,136,0.2)' }}>
              <div className="text-xs font-medium text-[var(--color-accent)] mb-1">驾驶条件：良好</div>
              <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                天气晴朗，能见度高，适合驾驶出行。
              </div>
            </div>
            <div className="p-3 rounded-xl" style={{ background: 'rgba(255,165,2,0.05)', border: '1px solid rgba(255,165,2,0.2)' }}>
              <div className="text-xs font-medium text-[var(--color-warning)] mb-1">紫外线：中等偏强</div>
              <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                建议开启遮阳板，佩戴太阳镜。
              </div>
            </div>
            <div className="p-3 rounded-xl" style={{ background: 'rgba(0,212,255,0.05)', border: '1px solid rgba(0,212,255,0.2)' }}>
              <div className="text-xs font-medium text-[var(--color-primary)] mb-1">车内温度建议</div>
              <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                室外温度较高，建议空调设定 22-24℃。
              </div>
            </div>
          </div>
        </div>

        {/* Forecast */}
        <div className="col-span-3 glass-card p-5">
          <h3 className="text-sm font-semibold mb-4">未来天气预报</h3>
          <div className="grid grid-cols-5 gap-4">
            {weather.forecast.map((day, i) => {
              const Icon = iconMap[day.icon] || CloudSun;
              return (
                <div
                  key={day.day}
                  className="text-center p-4 rounded-xl transition-all duration-300 hover:scale-105 animate-slide-in"
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid var(--color-border-glow)',
                    animationDelay: `${i * 0.1}s`,
                  }}
                >
                  <div className="text-sm font-medium mb-2">{day.day}</div>
                  <Icon size={32} className="mx-auto mb-2" style={{ color: day.icon === 'sun' ? '#ffa502' : '#38bdf8' }} />
                  <div className="text-xs mb-1" style={{ color: 'var(--color-text-secondary)' }}>{day.condition}</div>
                  <div className="text-lg font-bold text-[var(--color-primary)]">{day.temp}°</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
