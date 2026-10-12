# -*- coding: utf-8 -*-
"""画 4 张架构示意图，深蓝商务风"""
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch
import os

plt.rcParams['font.sans-serif'] = ['Microsoft YaHei']
plt.rcParams['axes.unicode_minus'] = False

NAVY = '#1F3A6E'
BLUE = '#2E5EAA'
LBLUE = '#DCE6F5'
GOLD = '#C89B3C'
GREY = '#666666'
OUT = r'C:\Users\ASUS\Desktop\smart_seat\assets'

def box(ax, x, y, w, h, text, fc=LBLUE, ec=NAVY, fs=11, bold=False, tc='#222222'):
    p = FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.02,rounding_size=0.08",
                       fc=fc, ec=ec, lw=1.5)
    ax.add_patch(p)
    ax.text(x+w/2, y+h/2, text, ha='center', va='center',
            fontsize=fs, color=tc, weight='bold' if bold else 'normal')

def arrow(ax, x1, y1, x2, y2, color=NAVY, label=None, lx=0, ly=0):
    a = FancyArrowPatch((x1,y1),(x2,y2), arrowstyle='-|>', mutation_scale=14,
                        color=color, lw=1.6)
    ax.add_patch(a)
    if label:
        ax.text((x1+x2)/2+lx, (y1+y2)/2+ly, label, ha='center', fontsize=9, color=color)

# ---------- 图1：三层系统架构 ----------
fig, ax = plt.subplots(figsize=(10, 5.6), dpi=160)
ax.set_xlim(0,10); ax.set_ylim(0,6); ax.axis('off')

box(ax, 0.3, 4.6, 9.4, 1.1, '', fc='#F2F6FC', ec=BLUE)
ax.text(0.5, 5.45, '浏览器端  React 19 + Vite  (端口 5173)', fontsize=11, color=NAVY, weight='bold')
for i,(t) in enumerate(['仪表盘','疲劳监控','表情识别','语音助手','音乐娱乐','天气座舱']):
    box(ax, 0.5+i*1.55, 4.75, 1.4, 0.5, t, fc='white', ec=BLUE, fs=9)

box(ax, 0.3, 2.6, 4.5, 1.5, '', fc='#FFF7E6', ec=GOLD)
ax.text(2.55, 3.85, 'FastAPI 后端  端口 8000', fontsize=10.5, color=NAVY, weight='bold', ha='center')
ax.text(2.55, 3.45, '对话 / 天气 / 音乐 / 语音合成\nSQLite · WebSocket 推送', fontsize=9, ha='center', color='#333')

box(ax, 5.2, 2.6, 4.5, 1.5, '', fc='#FFF7E6', ec=GOLD)
ax.text(7.45, 3.85, 'Flask 摄像头服务  端口 7861', fontsize=10.5, color=NAVY, weight='bold', ha='center')
ax.text(7.45, 3.45, 'MediaPipe 468 关键点\nONNX EfficientNet-B2 表情', fontsize=9, ha='center', color='#333')

box(ax, 0.3, 0.4, 9.4, 1.5, '', fc='#EAF3EA', ec='#3F8F4F')
ax.text(5.0, 1.65, '龙芯 2K0300 / 2K300 先锋派（LoongArch 端侧）', fontsize=10.5, color='#2F6F3F', weight='bold', ha='center')
for i,t in enumerate(['USB 摄像头','USB 麦克风 / 扬声器','BH1750 光照 I2C','7" RGB LCD 屏','板端 board_client.py']):
    box(ax, 0.5+i*1.85, 0.6, 1.7, 0.55, t, fc='white', ec='#3F8F4F', fs=8.5)

arrow(ax, 5.0, 4.6, 3.5, 4.15, label='HTTP / WebSocket')
arrow(ax, 5.0, 2.6, 5.0, 1.95, label='WiFi 热点 192.168.43.x')
arrow(ax, 7.45, 2.6, 7.45, 1.95)
ax.set_title("")
plt.tight_layout(); plt.savefig(f'{OUT}/arch_overview.png', bbox_inches='tight', facecolor='white'); plt.close()

# ---------- 图2：语音处理链路 ----------
fig, ax = plt.subplots(figsize=(10, 3.6), dpi=160)
ax.set_xlim(0,10); ax.set_ylim(0,3.4); ax.axis('off')
steps = [
    ('麦克风\narecord / 浏览器', 0.2, LBLUE),
    ('ASR 识别\nWhisper :8787', 2.0, LBLUE),
    ('NLU 意图\n+ DeepSeek LLM', 3.8, '#FFF7E6'),
    ('TTS 合成\n8 音色 :7862', 5.6, '#FFF7E6'),
    ('扬声器\naplay / Audio', 7.4, '#EAF3EA'),
]
for t,x,c in steps:
    box(ax, x, 1.2, 1.6, 1.1, t, fc=c, ec=NAVY, fs=9.5, bold=True)
for i in range(len(steps)-1):
    arrow(ax, steps[i][1]+1.6, 1.75, steps[i+1][1], 1.75)
ax.text(5.0, 0.55, '唤醒词「小龙」 → 识别 → 大模型推理 → 情绪联动音色 → 播报',
        ha='center', fontsize=10, color=GREY)
ax.set_title('图 2  语音交互全链路', fontsize=13, color=NAVY, weight='bold')
plt.tight_layout(); plt.savefig(f'{OUT}/voice_pipeline.png', bbox_inches='tight', facecolor='white'); plt.close()

# ---------- 图3：疲劳检测事件驱动 ----------
fig, ax = plt.subplots(figsize=(10, 4.6), dpi=160)
ax.set_xlim(0,10); ax.set_ylim(0,5); ax.axis('off')
box(ax, 0.3, 3.6, 2.2, 0.9, 'MediaPipe\n468 关键点', fc=LBLUE, ec=NAVY, fs=10, bold=True)
box(ax, 3.0, 3.6, 2.2, 0.9, 'EAR / MAR\n实时计算', fc=LBLUE, ec=NAVY, fs=10, bold=True)
arrow(ax, 2.5, 4.05, 3.0, 4.05)
box(ax, 6.0, 3.9, 3.7, 0.6, '哈欠 MAR>0.6 持续 ≥1.5s', fc='#FFF2CC', ec=GOLD, fs=9.5)
box(ax, 6.0, 3.1, 3.7, 0.6, '闭眼 > 2s  /  > 4s 分层', fc='#FFF2CC', ec=GOLD, fs=9.5)
arrow(ax, 5.2, 4.05, 6.0, 4.2)
arrow(ax, 5.2, 4.05, 6.0, 3.4)

box(ax, 0.3, 1.6, 2.6, 0.7, 'warning 轻度', fc='#FFE9B0', ec=GOLD, fs=9.5)
box(ax, 3.2, 1.6, 2.6, 0.7, 'high 中度', fc='#FFCC99', ec='#D2691E', fs=9.5)
box(ax, 6.1, 1.6, 3.6, 0.7, 'critical 重度', fc='#F4B7B7', ec='#C0392B', fs=9.5)
arrow(ax, 7.8, 3.1, 4.5, 2.3, color=GOLD)
box(ax, 2.5, 0.3, 5, 0.7, '语音播报 + 蜂鸣告警（事件驱动，评分仅作展示）', fc='#EAF3EA', ec='#3F8F4F', fs=10, bold=True)
arrow(ax, 1.6, 1.6, 4.5, 1.0, color='#C0392B')
arrow(ax, 4.5, 1.6, 4.8, 1.0, color='#D2691E')
arrow(ax, 7.9, 1.6, 5.5, 1.0, color='#C0392B')
ax.set_title('图 3  疲劳检测 v6 事件驱动告警流程', fontsize=13, color=NAVY, weight='bold')
plt.tight_layout(); plt.savefig(f'{OUT}/fatigue_flow.png', bbox_inches='tight', facecolor='white'); plt.close()

# ---------- 图4：部署拓扑 ----------
fig, ax = plt.subplots(figsize=(9, 4.6), dpi=160)
ax.set_xlim(0,9); ax.set_ylim(0,5); ax.axis('off')
box(ax, 0.4, 3.4, 3.6, 1.2,
    '龙芯 2K0300 先锋派  (板端)\n摄像头 / 麦克风 / 扬声器 / LCD\nboard_client.py 纯 stdlib',
    fc=LBLUE, ec=NAVY, fs=9.5, bold=True)
box(ax, 5.0, 3.4, 3.6, 1.2,
    '笔记本 x86  (服务端)\nFastAPI:8000  Flask:7861\nWhisper:8787  TTS:7862',
    fc='#FFF7E6', ec=GOLD, fs=9.5, bold=True)
box(ax, 2.7, 1.2, 3.6, 1.0, 'WiFi 热点  192.168.43.x\nHTTP / MJPEG / WebSocket',
    fc='#EAF3EA', ec='#3F8F4F', fs=9.5, bold=True)
arrow(ax, 2.2, 3.4, 4.0, 2.2, label='采集上报')
arrow(ax, 6.8, 3.4, 5.0, 2.2, label='指令/流')
ax.set_title('图 4  端—边—云混合部署拓扑', fontsize=13, color=NAVY, weight='bold')
plt.tight_layout(); plt.savefig(f'{OUT}/deploy_topology.png', bbox_inches='tight', facecolor='white'); plt.close()

print('diagrams done')
