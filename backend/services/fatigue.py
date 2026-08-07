"""疲劳评分算法

移植自前端 VehicleStore.jsx 的疲劳计算逻辑，并归一化为分段函数。
评分越高代表越清醒；越低代表越疲劳。

分段：
  0-30   严重疲劳
  31-60  中度疲劳
  61-90  轻微疲劳
  91-100 正常
"""
from typing import Dict


def _level_from_score(score: int) -> str:
    """根据分数映射等级。"""
    if score <= 30:
        return "严重"
    if score <= 60:
        return "中度"
    if score <= 90:
        return "轻微"
    return "正常"


def _advice_from_score(score: int, level: str) -> str:
    """根据分数和等级给出建议。"""
    if level == "正常":
        return "状态良好，可继续驾驶。"
    if level == "轻微":
        return "已出现轻微疲劳迹象，建议开窗通风、适当休息。"
    if level == "中度":
        return "疲劳程度较高，建议尽快寻找服务区休息15分钟以上。"
    return "严重疲劳！请立即安全停车休息，切勿继续驾驶。"


def calculate_fatigue_score(
    driving_minutes: float,
    is_night: bool,
    continuous_minutes: float,
    break_count: int,
) -> Dict:
    """计算疲劳评分。

    参数：
      driving_minutes:    本次累计驾驶时长（分钟）
      is_night:           是否为夜间驾驶（22:00-06:00）
      continuous_minutes: 连续未休息驾驶时长（分钟）
      break_count:        已休息次数

    返回：{score: 0-100, level: '正常'|'轻微'|'中度'|'严重', advice: str}
    """
    minutes = max(0.0, float(driving_minutes))
    continuous = max(0.0, float(continuous_minutes))

    # ===== 1. 驾驶时长分段评分（线性递减）=====
    if minutes < 1:
        time_score = 95  # 刚启动状态良好
    elif minutes <= 30:
        # 0-30 分钟：95 → 85
        time_score = 95 - (minutes / 30) * 10
    elif minutes <= 60:
        # 30-60 分钟：85 → 70
        time_score = 85 - ((minutes - 30) / 30) * 15
    elif minutes <= 120:
        # 60-120 分钟：70 → 50
        time_score = 70 - ((minutes - 60) / 60) * 20
    else:
        # 120 分钟以上：50 → 25（最低）
        time_score = max(25, 50 - ((minutes - 120) / 60) * 25)

    # ===== 2. 连续驾驶惩罚 =====
    # 连续驾驶超过 90 分钟开始显著扣分
    if continuous > 120:
        time_score -= min(20, (continuous - 120) / 6)
    elif continuous > 90:
        time_score -= 5

    # ===== 3. 夜间驾驶惩罚 =====
    if is_night:
        time_score -= 8

    # ===== 4. 休息次数奖励（每次休息恢复少量分数）=====
    bonus = min(10, break_count * 3)
    time_score += bonus

    score = max(0, min(100, int(round(time_score))))
    level = _level_from_score(score)
    advice = _advice_from_score(score, level)

    return {"score": score, "level": level, "advice": advice}


def is_night_time(hour: int) -> bool:
    """判断是否为夜间驾驶时段（22:00-06:00）。"""
    return hour >= 22 or hour < 6
