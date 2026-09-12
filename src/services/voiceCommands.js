// 语音命令集中管理模块
// 统一 RightPanel.jsx 和 VoiceAssistant.jsx 的命令匹配逻辑
import { api } from './api';

// 音色名称映射（语音识别可能的输出 → role index）
const ROLE_NAME_MAP = {
  // 女声
  '少女': 0, '活泼少女': 0, '晓伊': 0, '活泼': 0,
  '甜美': 1, '甜美少女': 1, '小梦': 1,
  '温柔': 2, '温柔姐姐': 2, '晓晓': 2, '姐姐': 2,
  '女声': 2, '女': 2, '女生': 2,
  // 男声
  '阳光': 3, '阳光少年': 3, '云希': 3, '少年': 3,
  '热血': 4, '热血青年': 4, '云健': 4, '青年': 4,
  '专业': 5, '专业播报': 5, '云扬': 5, '播报': 5,
  '男声': 5, '男': 5, '男生': 5,
  // 方言
  '东北': 6, '东北话': 6, '晓北': 6,
  '陕西': 7, '陕西话': 7, '晓妮': 7,
};

// 天气关键词匹配
const WEATHER_KEYWORDS = ['天气', '气温', '温度', '多少度', '冷不冷', '热不热', '下雨', '下雪', '雾霾'];

export function isWeatherCommand(text) {
  const lower = text.toLowerCase();
  return WEATHER_KEYWORDS.some(k => lower.includes(k));
}

// 异步天气查询：匹配天气关键词 → 调用天气 API → 返回格式化文本
export async function handleWeatherCommand(text, location) {
  if (!isWeatherCommand(text)) return null;
  const lat = location?.latitude || 39.9042;
  const lon = location?.longitude || 116.4074;
  const city = location?.city || '北京';
  try {
    const weather = await api.weather(lat, lon);
    if (!weather || !weather.now) return null;
    const { now, forecast } = weather;
    let reply = `${city}今天${now.condition}，气温${now.temperature}度，体感${now.feelsLike}度。`;
    if (now.windDir) reply += `${now.windDir}风${now.windSpeed}公里每小时。`;
    if (now.humidity) reply += `湿度${now.humidity}%。`;
    if (forecast && forecast.length > 0) {
      const today = forecast[0];
      reply += `今天最低${today.tempMin}度，最高${today.tempMax}度。`;
    }
    return reply;
  } catch (_) {
    return null;
  }
}

// 本地命令识别（返回回复文本或 null）
// setVoiceSettings: 音色切换回调（可选）
export function localCommandMatch(text, setVoiceSettings) {
  const lower = text.toLowerCase();

  // ===== 音色切换命令 =====
  if (lower.includes('切换') || lower.includes('换个') || lower.includes('换成') || lower.includes('用')) {
    // 检查是否包含音色关键词
    for (const [name, roleIndex] of Object.entries(ROLE_NAME_MAP)) {
      if (lower.includes(name)) {
        if (setVoiceSettings) {
          setVoiceSettings({ selectedRole: roleIndex });
        }
        const roleNames = ['晓伊・活泼少女', '小梦・甜美少女', '晓晓・温柔姐姐', '云希・阳光少年',
          '云健・热血青年', '云扬・专业播报', '晓北・东北话', '晓妮・陕西话'];
        return `已切换到${roleNames[roleIndex]}。`;
      }
    }
    // 通用切换：循环到下一个
    if (lower.includes('换个声音') || lower.includes('切换声音') || lower.includes('换个音色')) {
      if (setVoiceSettings) {
        setVoiceSettings(prev => ({
          selectedRole: (prev.selectedRole + 1) % 8
        }));
      }
      return '已切换到下一个音色。';
    }
  }

  // 直接音色名称（不带"切换"）
  for (const [name, roleIndex] of Object.entries(ROLE_NAME_MAP)) {
    if (lower === name || lower === `${name}的声音` || lower === `用${name}`) {
      if (setVoiceSettings) {
        setVoiceSettings({ selectedRole: roleIndex });
      }
      const roleNames = ['晓伊・活泼少女', '小梦・甜美少女', '晓晓・温柔姐姐', '云希・阳光少年',
        '云健・热血青年', '云扬・专业播报', '晓北・东北话', '晓妮・陕西话'];
      return `已切换到${roleNames[roleIndex]}。`;
    }
  }

  // ===== 车控命令 =====
  if (lower.includes('开窗') || lower.includes('打开窗')) {
    if (lower.includes('全部') || lower.includes('所有')) return '好的，已为您打开全部车窗。';
    if (lower.includes('主驾') || lower.includes('驾驶')) return '好的，已为您打开驾驶员侧车窗。';
    return '好的，已为您打开驾驶员侧车窗。';
  }
  if (lower.includes('关窗') || lower.includes('关闭窗')) return '好的，已为您关闭全部车窗。';
  if (lower.includes('温度') || lower.includes('空调')) {
    const tempMatch = text.match(/(\d+)度/);
    if (tempMatch) return `已将空调温度设置为${tempMatch[1]}度。`;
    if (lower.includes('冷') || lower.includes('降温')) return '已调低空调温度，开启制冷模式。';
    if (lower.includes('热') || lower.includes('升温')) return '已调高空调温度至制热模式。';
    if (lower.includes('关闭') || lower.includes('关掉')) return '空调已关闭。';
    return '已为您调整空调温度至22度。';
  }
  if (lower.includes('风速') || lower.includes('风量')) {
    if (lower.includes('大') || lower.includes('强')) return '风量已调至高档。';
    if (lower.includes('小') || lower.includes('弱')) return '风量已调至低档。';
    return '风量已调至中档。';
  }
  if (lower.includes('接听')) return '已为您接通来电。';
  if (lower.includes('挂断') || lower.includes('拒接')) return '通话已结束。';

  return null;
}
