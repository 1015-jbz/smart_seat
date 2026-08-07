"""硬件数据模拟器

模拟车辆 OBD 数据与驾驶行为事件，生成有趋势的合理动态数据（不是纯随机）。

提供：
  - get_current_state()           获取最新车辆状态
  - start_simulation() / stop_simulation()  控制模拟开关
  - get_driving_behavior_events() 获取最近一次刷新生成的驾驶行为事件
"""
import random
import threading
import time
from datetime import datetime
from typing import Dict, List, Optional


class _TrendWalker:
    """带趋势的随机游走：值在 [lo, hi] 内变化，方向偶尔反转，避免突变。"""

    def __init__(self, init: float, lo: float, hi: float, max_step: float, reverse_p: float = 0.1):
        self.value = float(init)
        self.lo = float(lo)
        self.hi = float(hi)
        self.max_step = float(max_step)
        self.direction = 1.0
        self.reverse_p = float(reverse_p)

    def step(self) -> float:
        # 偶尔反转趋势，避免长时间单调
        if random.random() < self.reverse_p:
            self.direction *= -1.0
        delta = self.direction * random.uniform(0, self.max_step)
        self.value += delta
        # 触边反弹
        if self.value > self.hi:
            self.value = self.hi
            self.direction = -1.0
        if self.value < self.lo:
            self.value = self.lo
            self.direction = 1.0
        return round(self.value, 2)


class HardwareSimulator:
    """车辆硬件数据模拟器（单例）。"""

    def __init__(self):
        self._lock = threading.Lock()
        self._running = False
        self._thread: Optional[threading.Thread] = None

        # 车辆状态初始化（与前端 mockData 对齐）
        self.speed = _TrendWalker(init=72, lo=0, hi=120, max_step=4)
        self.rpm = _TrendWalker(init=2800, lo=800, hi=6000, max_step=150)
        self.fuel = 68.0            # 油量只降不升
        self.temperature = _TrendWalker(init=88, lo=80, hi=105, max_step=1)
        self.tire_fl = _TrendWalker(init=2.4, lo=2.0, hi=2.5, max_step=0.02)
        self.tire_fr = _TrendWalker(init=2.5, lo=2.0, hi=2.5, max_step=0.02)
        self.tire_rl = _TrendWalker(init=2.3, lo=2.0, hi=2.5, max_step=0.02)
        self.tire_rr = _TrendWalker(init=2.4, lo=2.0, hi=2.5, max_step=0.02)

        # 行为事件缓冲
        self._behavior_events: List[Dict] = []
        self._last_tick = time.time()

    # ---------- 状态生成 ----------
    def _tick(self):
        """推进一帧模拟（不依赖循环，由调用方决定频率）。"""
        now = time.time()
        dt = max(0.1, now - self._last_tick)
        self._last_tick = now

        speed = self.speed.step()
        # 转速与速度有相关性：速度高则转速偏高
        target_rpm = 800 + speed * 35 + random.uniform(-150, 150)
        # 让 rpm walker 缓慢逼近 target_rpm
        self.rpm.value += (target_rpm - self.rpm.value) * 0.3
        self.rpm.value = max(800, min(6000, self.rpm.value))
        rpm = round(self.rpm.value, 0)

        # 油量随速度缓慢下降
        fuel_drop = (speed / 120) * 0.02 * (dt / 1.0)
        self.fuel = max(0.0, round(self.fuel - fuel_drop, 2))

        temp = self.temperature.step()
        tire_fl = self.tire_fl.step()
        tire_fr = self.tire_fr.step()
        tire_rl = self.tire_rl.step()
        tire_rr = self.tire_rr.step()

        self._current = {
            "timestamp": datetime.utcnow().isoformat(),
            "speed": speed,
            "rpm": int(rpm),
            "fuel": self.fuel,
            "temperature": temp,
            "tire_pressure_fl": tire_fl,
            "tire_pressure_fr": tire_fr,
            "tire_pressure_rl": tire_rl,
            "tire_pressure_rr": tire_rr,
        }

        # 随机生成驾驶行为事件（概率较低）
        self._maybe_gen_behavior_events(speed)

    def _maybe_gen_behavior_events(self, speed: float):
        """根据当前速度概率性生成急加速/急刹车/急转弯事件。"""
        events: List[Dict] = []
        if speed < 10:
            return
        r = random.random()
        if r < 0.03:
            events.append({
                "type": "hard_acceleration",
                "message": "急加速",
                "timestamp": datetime.utcnow().isoformat(),
                "speed": speed,
            })
        elif r < 0.06:
            events.append({
                "type": "hard_braking",
                "message": "急刹车",
                "timestamp": datetime.utcnow().isoformat(),
                "speed": speed,
            })
        elif r < 0.08:
            events.append({
                "type": "sharp_turn",
                "message": "急转弯",
                "timestamp": datetime.utcnow().isoformat(),
                "speed": speed,
            })
        if events:
            with self._lock:
                self._behavior_events.extend(events)
                # 只保留最近 50 条
                self._behavior_events = self._behavior_events[-50:]

    # ---------- 对外接口 ----------
    def get_current_state(self) -> Dict:
        """获取当前车辆状态（每次调用推进一帧）。"""
        self._tick()
        return dict(self._current)

    def get_driving_behavior_events(self, limit: int = 20) -> List[Dict]:
        """获取最近的驾驶行为事件。"""
        with self._lock:
            return list(self._behavior_events[-limit:])

    def clear_behavior_events(self):
        with self._lock:
            self._behavior_events.clear()

    # ---------- 模拟循环（独立线程，供 WebSocket 推送使用）----------
    def _loop(self):
        while self._running:
            self._tick()
            time.sleep(1.0)

    def start_simulation(self):
        """启动后台模拟线程（每秒推进一帧）。"""
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def stop_simulation(self):
        """停止后台模拟线程。"""
        self._running = False
        if self._thread:
            self._thread.join(timeout=2)
            self._thread = None


# 全局单例
simulator = HardwareSimulator()
# 进程启动时即开启后台模拟，保证 get_current_state 永远有数据
simulator.start_simulation()
