# -*- coding: utf-8 -*-
"""智能座舱项目技术文档集 生成脚本"""
import docx
from docx import Document
from docx.shared import Pt, Cm, RGBColor, Emu
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml.ns import qn, nsmap
from docx.oxml import OxmlElement

# ---------- 配色 ----------
NAVY   = RGBColor(0x1F, 0x3A, 0x6E)   # 主深蓝
BLUE   = RGBColor(0x2E, 0x5E, 0xAA)   # 标题蓝
LIGHT  = "DCE6F5"                      # 表头浅蓝底
ALT    = "F2F6FC"                      # 隔行浅蓝
GOLD   = RGBColor(0xC8, 0x9B, 0x3C)
GREY   = RGBColor(0x59, 0x59, 0x59)
WHITE  = RGBColor(0xFF, 0xFF, 0xFF)

CN_BODY = "宋体"
CN_HEAD = "微软雅黑"

doc = Document()

# 页面设置 A4
sec = doc.sections[0]
sec.page_width, sec.page_height = Cm(21.0), Cm(29.7)
sec.top_margin = sec.bottom_margin = Cm(2.4)
sec.left_margin = sec.right_margin = Cm(2.6)

# ---------- 工具函数 ----------
def set_run_font(run, name_cn=CN_BODY, size=10.5, bold=False, color=None, name_en="Times New Roman"):
    run.font.name = name_en
    run.font.size = Pt(size)
    run.font.bold = bold
    if color is not None:
        run.font.color.rgb = color
    rPr = run._element.get_or_add_rPr()
    rFonts = rPr.find(qn('w:rFonts'))
    if rFonts is None:
        rFonts = OxmlElement('w:rFonts')
        rPr.append(rFonts)
    rFonts.set(qn('w:eastAsia'), name_cn)
    rFonts.set(qn('w:ascii'), name_en)
    rFonts.set(qn('w:hAnsi'), name_en)

def para(text="", size=10.5, bold=False, color=None, align=None, indent_chars=2,
         space_before=0, space_after=4, line=1.5, font_cn=CN_BODY):
    p = doc.add_paragraph()
    pf = p.paragraph_format
    pf.space_before = Pt(space_before)
    pf.space_after = Pt(space_after)
    pf.line_spacing = line
    if align is not None:
        p.alignment = align
    if indent_chars:
        pf.first_line_indent = Pt(size * indent_chars)
    if text:
        r = p.add_run(text)
        set_run_font(r, name_cn=font_cn, size=size, bold=bold, color=color)
    return p

def h1(text):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(18)
    p.paragraph_format.space_after = Pt(10)
    p.paragraph_format.page_break_before = True
    r = p.add_run(text)
    set_run_font(r, name_cn=CN_HEAD, size=18, bold=True, color=NAVY)
    # 下划装饰线
    pPr = p._p.get_or_add_pPr()
    pbdr = OxmlElement('w:pBdr')
    bottom = OxmlElement('w:bottom')
    bottom.set(qn('w:val'), 'single'); bottom.set(qn('w:sz'), '12')
    bottom.set(qn('w:space'), '4'); bottom.set(qn('w:color'), '1F3A6E')
    pbdr.append(bottom); pPr.append(pbdr)
    return p

def h2(text):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(12)
    p.paragraph_format.space_after = Pt(6)
    r = p.add_run("▍")
    set_run_font(r, name_cn=CN_HEAD, size=13.5, bold=True, color=GOLD)
    r2 = p.add_run(text)
    set_run_font(r2, name_cn=CN_HEAD, size=13.5, bold=True, color=BLUE)
    return p

def h3(text):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(8)
    p.paragraph_format.space_after = Pt(3)
    r = p.add_run(text)
    set_run_font(r, name_cn=CN_HEAD, size=11.5, bold=True, color=NAVY)
    return p

def bullet(text, size=10.5):
    p = doc.add_paragraph()
    pf = p.paragraph_format
    pf.left_indent = Pt(24); pf.space_after = Pt(2); pf.line_spacing = 1.4
    r = p.add_run("• ")
    set_run_font(r, size=size, bold=True, color=BLUE)
    r2 = p.add_run(text)
    set_run_font(r2, size=size)
    return p

def shade_cell(cell, hexcolor):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear'); shd.set(qn('w:color'), 'auto'); shd.set(qn('w:fill'), hexcolor)
    tcPr.append(shd)

def set_cell_text(cell, text, size=9.5, bold=False, color=None, align=WD_ALIGN_PARAGRAPH.LEFT, font_cn=CN_BODY):
    cell.text = ""
    p = cell.paragraphs[0]
    p.alignment = align
    p.paragraph_format.space_after = Pt(1); p.paragraph_format.space_before = Pt(1)
    p.paragraph_format.line_spacing = 1.2
    r = p.add_run(str(text))
    set_run_font(r, name_cn=font_cn, size=size, bold=bold, color=color)
    cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER

def make_table(headers, rows, widths=None, caption=None, fontsize=9.5):
    if caption:
        cp = doc.add_paragraph()
        cp.paragraph_format.space_before = Pt(8); cp.paragraph_format.space_after = Pt(3)
        r = cp.add_run(caption)
        set_run_font(r, name_cn=CN_HEAD, size=10.5, bold=True, color=NAVY)
    t = doc.add_table(rows=1 + len(rows), cols=len(headers))
    t.style = 'Table Grid'
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    # 表头
    for j, htxt in enumerate(headers):
        c = t.rows[0].cells[j]
        shade_cell(c, "1F3A6E")
        set_cell_text(c, htxt, size=fontsize, bold=True, color=WHITE,
                      align=WD_ALIGN_PARAGRAPH.CENTER, font_cn=CN_HEAD)
    # 数据行
    for i, row in enumerate(rows):
        for j, val in enumerate(row):
            c = t.rows[i + 1].cells[j]
            if i % 2 == 1:
                shade_cell(c, ALT)
            set_cell_text(c, val, size=fontsize,
                          align=WD_ALIGN_PARAGRAPH.CENTER if j == 0 else WD_ALIGN_PARAGRAPH.LEFT)
    if widths:
        for j, w in enumerate(widths):
            for row in t.rows:
                row.cells[j].width = Cm(w)
    doc.add_paragraph().paragraph_format.space_after = Pt(2)
    return t

def spacer(pt=6):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(pt)

# ========== 封面 ==========
for _ in range(3):
    spacer(12)
p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = p.add_run("基于 LoongArch 端侧 AI 的")
set_run_font(r, name_cn=CN_HEAD, size=20, bold=True, color=GREY)
p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = p.add_run("智能座舱多模态交互终端")
set_run_font(r, name_cn=CN_HEAD, size=30, bold=True, color=NAVY)
p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = p.add_run("—— 技 术 文 档 集 ——")
set_run_font(r, name_cn=CN_HEAD, size=16, bold=False, color=BLUE)
for _ in range(2): spacer(10)

# 封面信息条
info = doc.add_table(rows=len(info_data), cols=2)
info.alignment = WD_TABLE_ALIGNMENT.CENTER
info_data = [
    ("项目名称", "智能座舱多模态交互终端（代号“小龙”）"),
    ("文档版本", "V1.0    2026 年 9 月"),
]
for i, (k, v) in enumerate(info_data):
    c0, c1 = info.rows[i].cells
    shade_cell(c0, "1F3A6E")
    set_cell_text(c0, k, size=11, bold=True, color=WHITE, align=WD_ALIGN_PARAGRAPH.CENTER, font_cn=CN_HEAD)
    set_cell_text(c1, v, size=11, align=WD_ALIGN_PARAGRAPH.CENTER)
    c0.width = Cm(4); c1.width = Cm(11)
for _ in range(3): spacer(10)
p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = p.add_run("端侧智能  ·  多模态交互  ·  安全驾驶  ·  国产自主平台")
set_run_font(r, name_cn=CN_HEAD, size=11, color=GOLD)

# ========== 目录页 ==========
doc.add_page_break()
p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = p.add_run("目    录")
set_run_font(r, name_cn=CN_HEAD, size=20, bold=True, color=NAVY)
spacer(8)
# TOC 用静态目录（避免 Word 域兼容性问题）
toc_items = [
    ("第一编  项目综合总结", "03"),
    ("    1.1 项目背景与定位", ""),
    ("    1.2 量化目标", ""),
    ("    1.3 两代产品演进", ""),
    ("    1.4 功能模块总览", ""),
    ("    1.5 系统技术架构", ""),
    ("    1.6 疲劳检测算法演进", ""),
    ("    1.7 硬件采购与落地", ""),
    ("    1.8 风险与应对", ""),
    ("第二编  用户手册", "06"),
    ("    2.1 产品简介", ""),
    ("    2.2 系统要求", ""),
    ("    2.3 服务端口", ""),
    ("    2.4 界面模块导航", ""),
    ("    2.5 常用语音指令", ""),
    ("    2.6 常见问题 FAQ", ""),
    ("第三编  功能测试报告", "09"),
    ("    3.1 测试概述", ""),
    ("    3.2 模块用例汇总", ""),
    ("    3.3 典型用例", ""),
    ("    3.4 缺陷统计与结论", ""),
    ("第四编  其他技术文档", "11"),
    ("    4.1 API 接口一览", ""),
    ("    4.2 数据字典", ""),
    ("    4.3 表情与疲劳枚举", ""),
    ("    4.4 术语表", ""),
    ("    4.5 版本变更记录", ""),
    ("    4.6 安全与运维", ""),
    ("结语", "13"),
]
for title, _pg in toc_items:
    p = doc.add_paragraph()
    pf = p.paragraph_format
    pf.space_after = Pt(3); pf.line_spacing = 1.4
    is_chapter = title.startswith(("第", "结语"))
    r = p.add_run(title)
    set_run_font(r, name_cn=CN_HEAD, size=11.5 if is_chapter else 10.5,
                 bold=is_chapter, color=NAVY if is_chapter else None)


# =====================================================================
# 第一编  项目综合总结
# =====================================================================
h1("第一编  项目综合总结")

h2("1.1 项目背景与定位")
para("随着智能网联汽车快速发展，智能座舱已成为汽车“新四化”（电动化、智能化、网联化、共享化）"
     "战略的核心载体。当前主流方案高度依赖云端 AI 服务，普遍存在网络依赖性强、隐私风险高、"
     "响应延迟不可控三大痛点。本项目基于龙芯 LoongArch 架构的端侧 AI 计算能力，构建"
     "“全离线、低延迟、高隐私”的多模态交互终端，将语音交互、视觉感知、大模型推理尽可能"
     "部署在车规级龙芯终端上。")
para("产品定位为面向驾驶员的多模态智能座舱交互终端，集“安全守护 + 情感陪伴 + 语音秘书 + "
     "座舱控制”于一体，提供四大核心角色：")
bullet("安全驾驶守护 —— 疲劳 / 分心实时检测与分级告警；")
bullet("情感陪伴助手 —— 表情识别与个性化情感响应；")
bullet("智能语音秘书 —— 唤醒词交互、语音点歌、天气 / 导航查询；")
bullet("座舱控制中枢 —— 自然语言车控（空调 / 车窗 / 座椅 / 灯光）。")

h2("1.2 量化目标")
make_table(
    ["目标维度", "指标要求", "说明"],
    [
        ["语音唤醒率", "≥ 95%", "车载噪声环境"],
        ["语音识别准确率", "≥ 93%", "端侧 ASR"],
        ["疲劳检测准确率", "≥ 90%", "多模态融合"],
        ["意图识别准确率", "≥ 88%", "本地 NLU"],
        ["语音响应延迟", "≤ 500ms", "端到端"],
        ["危险预警延迟", "≤ 200ms", "安全告警"],
        ["大模型推理速度", "≥ 15 tokens/s", "量化后目标"],
    ],
    widths=[4.5, 4.5, 7.0],
    caption="表 1-1  项目量化指标目标值"
)
para("注：以上为设计目标值；当前原型在 x86 上运行，端侧指标将在龙芯硬件上实测达标。",
     size=9, color=GREY, indent_chars=0)

h2("1.3 两代产品演进")
make_table(
    ["代际", "项目代号", "技术形态", "特点与局限"],
    [
        ["第一代", "smart_cockpit / 小航", "Python 单体（Gradio + Flask MJPEG）", "快速验证功能；单文件 6 万字节级，前后端耦合"],
        ["第二代", "smart_seat / 小龙", "React 19 + FastAPI + Flask 三层架构", "模块化可扩展，面向龙芯板卡部署与赛事展示"],
    ],
    widths=[2.0, 3.8, 5.2, 5.0],
    caption="表 1-2  从原型到工程化的演进关系"
)
para("两代共享技术底座：ONNX EfficientNet-B2 表情模型、PERCLOS / 哈欠疲劳检测、DeepSeek 对话、"
     "TTS 语音合成；smart_seat 进一步引入 MediaPipe FaceLandmarker（468 关键点）、SQLite 持久化、"
     "WebSocket 车辆数据推送、Whisper ASR 服务。")

h2("1.4 功能模块总览")
make_table(
    ["模块", "技术路径", "说明"],
    [
        ["仪表盘", "WebSocket 实时推送", "车速 / 转速 / 油量 / 胎压 / 水温"],
        ["疲劳检测", "MediaPipe 468 点 → EAR/MAR", "事件驱动分级告警 v6"],
        ["表情识别", "ONNX B2 + MediaPipe 规则", "7 类情绪双引擎"],
        ["语音助手", "Whisper ASR + DeepSeek", "唤醒词“小龙”+ 多轮对话"],
        ["天气", "Open-Meteo + 高德 IP", "手动选城、localStorage 记忆"],
        ["安全驾驶", "分心 / 哈欠 / 视线检测", "事件记录与上报"],
        ["音乐娱乐", "本地曲库 + Jamendo 在线", "语音点歌、全局播放器"],
        ["座舱控制", "自然语言车控", "空调 / 车窗 / 座椅 / 氛围灯"],
    ],
    widths=[2.6, 5.4, 8.0],
    caption="表 1-3  smart_seat 功能模块一览"
)

h2("1.5 系统技术架构")
para("smart_seat 采用前后端分离三层架构，浏览器端分别对接四个后端进程：")
bullet("前端（React 19 + Vite，:5173）→ FastAPI 业务后端（:8000）→ SQLite / DeepSeek / 天气 / 音乐；")
bullet("Flask 摄像头服务（:7861）：视频流 + MediaPipe 关键点 + ONNX 表情 + Haar 降级；")
bullet("Whisper ASR 服务（:8787）：本地语音转文字；")
bullet("WebSocket（:8000/ws/vehicle）：每秒推送车辆状态。")
make_table(
    ["层级", "技术选型"],
    [
        ["前端", "React 19 + Vite + TailwindCSS 4"],
        ["后端", "FastAPI + SQLAlchemy + SQLite"],
        ["视觉", "MediaPipe FaceLandmarker / ONNX EfficientNet-B2 / Haar Cascade"],
        ["语音", "Whisper ASR + Edge TTS / WinRT / pyttsx3 三级降级"],
        ["大模型", "DeepSeek API（多轮记忆 + 情绪感知）"],
        ["实时通道", "WebSocket 车辆数据每秒推送"],
    ],
    widths=[3.0, 13.0],
    caption="表 1-4  技术栈"
)

h2("1.6 疲劳检测算法演进")
para("检测输入为 MediaPipe 提取的 468 个人脸关键点，通过眼纵横比 EAR 与嘴纵横比 MAR 判定状态。"
     "v6 版本废弃评分驱动，改为事件驱动告警，评分仅作参考展示。")
make_table(
    ["事件 / 参数", "阈值", "告警等级", "语音提示"],
    [
        ["哈欠（MAR）", "MAR > 0.6，持续 ≥1.5s", "warning 轻度", "请集中注意力，认真驾驶"],
        ["持续闭眼", "> 2 秒", "high 中度", "您有些疲劳了，请注意休息"],
        ["持续闭眼", "> 4 秒", "critical 重度", "危险！请立即停车休息"],
        ["EAR 阈值", "0.20", "—", "判定闭眼"],
        ["告警保持 / 哈欠冷却 / 闭眼冷却", "3s / 30s / 15s", "—", "防抖与频控"],
    ],
    widths=[3.6, 4.4, 3.2, 4.8],
    caption="表 1-5  事件驱动疲劳告警规则（v6）"
)

h2("1.7 硬件采购与落地")
make_table(
    ["类别", "关键件", "预算"],
    [
        ["核心平台", "龙芯 2K0300 / 2K300 先锋派（512MB）", "约 330 元"],
        ["视觉", "罗技 C270 USB 摄像头", "约 120 元"],
        ["音频", "USB 麦克风 + USB 小音箱", "约 80 元"],
        ["效果加分", "WS2812B 灯带 + 杜邦线", "约 20 元"],
        ["显示（选）", "7 寸 HDMI 电容触摸屏", "约 180 元"],
        ["网络（选）", "USB WiFi 网卡 RTL8188", "约 20 元"],
    ],
    widths=[3.0, 8.5, 4.5],
    caption="表 1-6  硬件采购清单（总预算约 550~900 元）"
)
para("已完成 Loongnix base 系统安装、WiFi / SSH 连接、swap 分区与 xorg 环境部署；当前最大工程"
     "约束为 2K300 缺少 LSX SIMD 指令，现代浏览器报 illegal instruction，React 前端需通过"
     "“板端采集 + 笔记本显示”的端云协同方式落地。")

h2("1.8 风险与应对")
make_table(
    ["风险", "应对策略"],
    [
        ["龙芯缺 LSX，浏览器无法运行", "板子做采集终端、本机显示 / 源码编译 netsurf"],
        ["端侧算力不足", "INT4 量化 + 模型级联（轻量初筛 → 大模型精判）"],
        ["LoongArch 无预编译包", "源码编译 + 龙芯官方源 + 容器化"],
        ["IP 定位不准", "手动选城 + localStorage 记忆"],
        ["车载噪声干扰 ASR", "麦克风阵列 + 频域降噪 + 车载声学模型微调"],
    ],
    widths=[6.0, 10.0],
    caption="表 1-7  主要技术风险与应对"
)

# =====================================================================
# 第二编  用户手册
# =====================================================================
h1("第二编  用 户 手 册")

h2("2.1 产品简介")
para("智能座舱助手把疲劳检测、表情识别、语音对话、车辆仪表集成在同一界面，让驾驶员通过"
     "“看、说、点”三种方式与车辆自然交互。启动后浏览器访问 http://localhost:5173 即可进入。")
make_table(
    ["核心能力", "说明"],
    [
        ["实时车辆仪表", "车速、转速、油量、胎压、水温实时刷新"],
        ["疲劳检测", "摄像头识别哈欠 / 闭眼，事件驱动语音告警"],
        ["表情识别", "7 类情绪：开心 / 悲伤 / 愤怒 / 惊讶 / 恐惧 / 厌恶 / 平静"],
        ["语音助手", "说“小龙”唤醒，对话、控车、点歌、查天气"],
        ["座舱控制", "空调、车窗、座椅加热、氛围灯、驾驶模式"],
        ["音乐娱乐", "本地曲库 + 在线曲库，语音点歌"],
        ["天气查询", "实时天气 + 7 天预报，支持 30+ 城市"],
    ],
    widths=[3.5, 12.5],
    caption="表 2-1  核心能力一览"
)

h2("2.2 系统要求")
make_table(
    ["类别", "最低要求", "说明"],
    [
        ["处理器", "x86_64 或 LoongArch64", "LoongArch 走降级路径"],
        ["内存", "512MB（龙芯目标）", "开发机建议 4GB+"],
        ["摄像头", "USB / 内置", "疲劳表情识别必需，无则模拟"],
        ["麦克风 / 扬声器", "内置或外接", "语音交互必需"],
        ["Python", "3.10+", "后端与摄像头服务"],
        ["Node.js", "18+", "前端构建与运行"],
        ["浏览器", "Chrome / Edge", "需支持 Web Speech API"],
    ],
    widths=[3.2, 5.8, 7.0],
    caption="表 2-2  软硬件要求"
)

h2("2.3 服务端口")
make_table(
    ["服务", "端口", "技术栈"],
    [
        ["前端 Vite", "5173", "React 19 + TailwindCSS 4"],
        ["后端 FastAPI", "8000", "FastAPI + SQLAlchemy + SQLite"],
        ["摄像头 Flask", "7861", "Flask + OpenCV + MediaPipe + ONNX"],
        ["语音合成 TTS", "8787", "Edge TTS / WinRT / pyttsx3"],
    ],
    widths=[4.0, 2.5, 9.5],
    caption="表 2-3  服务端口速查"
)
para("开发模式启动：终端一 cd backend && python main.py；终端二 python camera_server.py；"
     "终端三 npm run dev。龙芯平台使用一键脚本 ./setup.sh 与 ./start.sh 即可。")

h2("2.4 界面模块导航")
make_table(
    ["序号", "模块", "路由", "功能"],
    [
        ["1", "系统总览", "/", "时钟 + 快捷状态 + 最近对话"],
        ["2", "表情识别", "/emotion", "表情识别与统计"],
        ["3", "车辆仪表", "/vehicle", "车速 / 转速 / 油量 / 胎压"],
        ["4", "座舱控制", "/cabin", "空调 / 车窗 / 座椅 / 氛围灯"],
        ["5", "语音助手", "/voice", "语音对话 + 音色设置"],
        ["6", "音乐娱乐", "/music", "本地 / 在线曲库播放"],
        ["7", "安全监控", "/safety", "疲劳 / 哈欠 / 分心检测"],
        ["8", "天气信息", "/weather", "实时天气 + 预报"],
    ],
    widths=[1.5, 3.0, 2.6, 8.9],
    caption="表 2-4  左侧导航八个模块"
)

h2("2.5 常用语音指令")
make_table(
    ["指令示例", "动作"],
    [
        ["“小龙”", "全局唤醒"],
        ["“打开全部车窗” / “关窗”", "车窗控制"],
        ["“温度调到24度” / “降温”", "空调控制"],
        ["“风量大” / “风量小”", "风量调节"],
        ["“播放流行音乐” / “来一首轻音乐”", "语音点歌"],
        ["“暂停” / “下一首”", "播放器控制"],
        ["“导航到北京站” / “明天天气”", "导航与天气"],
        ["“接听” / “挂断”", "通话控制"],
    ],
    widths=[7.5, 8.5],
    caption="表 2-5  语音指令速查"
)
para("音色系统提供 8 种声线：晓伊（活泼少女）、小梦（甜美）、晓晓（温柔）、云希（阳光少年）、"
     "云健（热血青年）、云扬（专业播报）、晓北（东北话）、晓妮（陕西话），支持语速 / 音调 / "
     "音量三滑块微调，并可根据摄像头表情自动叠加情绪音色。")

h2("2.6 常见问题 FAQ")
make_table(
    ["问题", "原因与处理"],
    [
        ["打开白屏", "dist 未构建，运行 npm run dev 或 start 脚本自动补构建"],
        ["检测不到人脸", "确认 7861 摄像头服务已启动、浏览器已授权摄像头"],
        ["语音无反应", "检查麦克风授权、联网，使用 Chrome / Edge"],
        ["疲劳分高但不播报", "系统为事件驱动，仅哈欠 / 闭眼触发播报，属预期设计"],
        ["AI 提示未配置 Key", "编辑 backend/.env 填入 DEEPSEEK_API_KEY 后重启"],
        ["龙芯板报 illegal instruction", "2K300 缺 LSX 指令，改用轻量浏览器或精简构建"],
    ],
    widths=[4.5, 11.5],
    caption="表 2-6  常见问题速查"
)

# =====================================================================
# 第三编  功能测试报告
# =====================================================================
h1("第三编  功 能 测 试 报 告")

h2("3.1 测试概述")
para("本次测试覆盖 8 个功能模块、后端 REST 接口、WebSocket 实时推送、疲劳检测算法专项及异常"
     "降级场景，共执行用例 40 余项，全部通过（PASS），无致命 / 严重 / 一般缺陷。")
make_table(
    ["项目", "配置"],
    [
        ["操作系统", "Windows 11（开发测试）"],
        ["前端", "React 19 + Vite，端口 5173"],
        ["后端", "FastAPI + Uvicorn，端口 8000"],
        ["摄像头服务", "Flask + OpenCV + MediaPipe + ONNX，端口 7861"],
        ["数据库", "SQLite（backend/data/）"],
        ["AI 服务", "DeepSeek API"],
        ["目标硬件", "龙芯 2K300 先锋派（512MB，Loongnix）"],
    ],
    widths=[4.0, 12.0],
    caption="表 3-1  测试环境"
)

h2("3.2 模块用例汇总")
make_table(
    ["编号", "模块", "路由", "测试重点", "结论"],
    [
        ["M01", "系统总览", "/", "时钟、状态卡、最近对话", "PASS"],
        ["M02", "车辆仪表", "/vehicle", "实时刷新、断连降级", "PASS"],
        ["M03", "座舱控制", "/cabin", "空调 / 车窗 / 氛围灯 / 驾驶模式", "PASS"],
        ["M04", "表情识别", "/emotion", "人脸检测、七类表情、历史统计", "PASS"],
        ["M05", "语音助手", "/voice", "唤醒、ASR、AI 对话、8 音色", "PASS"],
        ["M06", "音乐娱乐", "/music", "本地 / 在线曲库、语音点歌", "PASS"],
        ["M07", "安全监控", "/safety", "事件驱动疲劳告警、分心检测", "PASS"],
        ["M08", "天气信息", "/weather", "实时天气、7 天预报、城市切换", "PASS"],
    ],
    widths=[1.5, 2.5, 2.2, 6.8, 2.0],
    caption="表 3-2  八大模块测试结论"
)

h2("3.3 典型用例")
make_table(
    ["用例", "操作", "预期", "结论"],
    [
        ["M05-01", "任意页说“小龙”", "播报“我在”并进入聆听态", "PASS"],
        ["M05-04", "开放式问题", "返回 DeepSeek 回复，未配 Key 时降级引导", "PASS"],
        ["M07-02", "持续哈欠 MAR>0.6", "触发 warning 并语音播报", "PASS"],
        ["M07-03", "闭眼 2s / 4s", "分别触发 high / critical", "PASS"],
        ["FT-05", "仅评分达阈值不做动作", "不触发语音（★关键回归项★）", "PASS"],
        ["API-10", "触发异常路径", "返回统一错误，不泄露堆栈", "PASS"],
        ["WS-02", "保持 WebSocket 连接", "约每秒推送一次车辆数据", "PASS"],
    ],
    widths=[1.8, 4.6, 6.6, 2.0],
    caption="表 3-3  关键功能用例抽样"
)

h2("3.4 缺陷统计与结论")
make_table(
    ["严重级别", "数量", "说明"],
    [
        ["致命 Blocker", "0", "无阻断性缺陷"],
        ["严重 Major", "0", "无核心功能缺失"],
        ["一般 Minor", "0", "无影响使用的缺陷"],
        ["建议 Suggestion", "若干", "LoongArch 降级精度、无摄像头模拟数据等"],
    ],
    widths=[3.5, 2.5, 10.0],
    caption="表 3-4  缺陷统计"
)
para("测试结论：系统车辆仪表、座舱控制、音乐娱乐、天气查询等交互功能完整可用；疲劳检测采用"
     "事件驱动告警，评分仅作参考；表情识别双引擎稳定输出 7 类情绪；语音助手全链路可用并支持"
     "8 音色与情绪切音；后端接口健壮，具备全局异常兜底、分页钳制与跨域配置；LoongArch 平台"
     "具备自动降级兼容能力。系统功能完善，达到可演示、可交付状态。")

# =====================================================================
# 第四编  其他相关文档
# =====================================================================
h1("第四编  其他技术文档")

h2("4.1 API 接口一览")
make_table(
    ["分类", "接口", "说明"],
    [
        ["健康检查", "GET /api/health", "返回 {status: ok}"],
        ["车辆", "GET/POST /api/v1/vehicle/state", "车辆状态读写"],
        ["车辆", "GET /api/v1/vehicle/history", "历史分页倒序"],
        ["车辆", "WS /ws/vehicle", "每秒推送车辆数据"],
        ["安全", "GET /api/v1/safety/fatigue", "疲劳评分与等级"],
        ["安全", "POST /api/v1/safety/fatigue/event", "记录疲劳事件"],
        ["安全", "GET /api/v1/safety/stats", "驾驶时长与等级分布"],
        ["表情", "POST /api/v1/emotion/detect", "base64 图片表情识别"],
        ["表情", "GET /api/v1/emotion/stats?days=7", "情绪占比与趋势"],
        ["对话", "POST /api/v1/chat", "DeepSeek 或本地兜底"],
        ["天气", "GET /api/v1/weather?lat=&lon=", "实时 + 7 天预报"],
        ["定位", "GET /api/v1/location", "IP 定位三级 fallback"],
        ["音乐", "GET /api/v1/music/library", "本地曲库"],
        ["音乐", "GET /api/v1/music/online/search", "Jamendo 在线搜索"],
        ["音乐", "GET /api/v1/music/stream/{id}", "流式播放（支持 Range）"],
    ],
    widths=[2.2, 7.3, 6.5],
    caption="表 4-1  主要 REST / WebSocket 接口"
)

h2("4.2 数据字典")
make_table(
    ["数据对象", "关键字段", "说明"],
    [
        ["车辆状态 VehicleState", "speed/rpm/fuel/temperature/tire_pressure[4]", "WebSocket 每秒推送"],
        ["疲劳事件 FatigueEvent", "score/level/duration/action_taken/timestamp", "事件驱动告警记录"],
        ["情绪记录 EmotionRecord", "emotion/confidence/source/timestamp", "SQLite 持久化"],
        ["驾驶会话 DrivingSession", "start/end/distance/max_speed/events_count", "结束时自动结算"],
    ],
    widths=[4.6, 6.4, 5.0],
    caption="表 4-2  核心数据对象"
)

h2("4.3 表情与疲劳枚举")
make_table(
    ["英文", "中文", "表情", "主题色"],
    [
        ["happy", "开心", "笑脸", "#fbbf24"],
        ["sad", "悲伤", "哭脸", "#60a5fa"],
        ["angry", "愤怒", "怒脸", "#f87171"],
        ["surprised", "惊讶", "惊讶脸", "#a78bfa"],
        ["fearful", "恐惧", "惊恐脸", "#34d399"],
        ["disgusted", "厌恶", "嫌弃脸", "#94a3b8"],
        ["neutral", "平静", "平静脸", "#34d399"],
        ["fatigue", "疲劳", "困倦脸", "#fb923c"],
    ],
    widths=[3.2, 2.5, 3.0, 3.0],
    caption="表 4-3  八类表情枚举"
)
make_table(
    ["等级", "中文", "触发条件", "语音告警"],
    [
        ["normal", "正常", "状态良好", "无"],
        ["warning", "轻度", "哈欠 / MAR>0.6", "有"],
        ["high", "中度", "持续闭眼 >2s", "有"],
        ["critical", "重度", "持续闭眼 >4s", "循环告警"],
    ],
    widths=[2.5, 2.5, 5.5, 5.5],
    caption="表 4-4  疲劳等级枚举"
)

h2("4.4 术语表")
make_table(
    ["术语", "全称 / 解释"],
    [
        ["EAR", "Eye Aspect Ratio，眼睛纵横比，判定闭眼"],
        ["MAR", "Mouth Aspect Ratio，嘴部纵横比，判定哈欠"],
        ["PERCLOS", "眼睑闭合时间占比，疲劳评分参考"],
        ["EWMA", "指数加权滑动平均，告警分数平滑"],
        ["ASR / TTS", "自动语音识别 / 语音合成"],
        ["MediaPipe", "Google 人脸关键点框架（468 点）"],
        ["ONNX", "Open Neural Network Exchange，模型交换格式"],
        ["LoongArch", "龙芯自主指令集架构"],
        ["Loongnix", "龙芯官方 Linux 发行版（Debian 衍生）"],
        ["Jamendo / CC", "CC 授权在线曲库 / 知识共享许可"],
    ],
    widths=[3.5, 12.5],
    caption="表 4-5  术语对照"
)

h2("4.5 版本变更记录")
make_table(
    ["版本", "主要变更"],
    [
        ["v1.0", "smart_seat 智能座舱系统初版发布"],
        ["v1.4", "LoongArch 平台适配（降级 Haar Cascade）"],
        ["v1.5", "疲劳检测 v6 事件驱动告警"],
        ["v1.6", "高德 IP 定位 + localStorage 记忆城市"],
        ["v1.7", "GPS + 高德逆地理编码 + 城市搜索"],
        ["v1.8", "音乐娱乐模块（本地 + 在线 + 语音点歌）"],
        ["v1.9", "8 音色 TTS（角色 / 情绪 / 手动三层叠加）"],
        ["v2.0", "setup 构建 dist，start 缺省时自动补构建"],
    ],
    widths=[2.5, 13.5],
    caption="表 4-6  重要版本记录"
)

h2("4.6 安全与运维")
bullet("隐私：摄像头画面仅在本地处理，AI 对话仅上传文本，数据库不存原始视频；")
bullet("密钥：DeepSeek API Key 走 .env 环境变量，不入库；")
bullet("降级：摄像头 / 模型 / 定位 / 天气均有多级 fallback；")
bullet("生产建议：systemd 守护进程、Nginx 统一入口、SQLite 定期冷备；")
bullet("故障排查：白屏查 dist、无画面查 7861、无语音查麦克风与 TTS、龙芯 illegal instruction 查 LSX。")

# 结语
h1("结    语")
para("本项目在软件功能上已基本闭环：多模态交互、安全检测、娱乐、车控、天气、定位一应俱全；"
     "算法层面明确了“事件驱动告警、评分仅作参考”的正确设计；工程上完成了从 Python 单体原型到"
     "React + FastAPI 三层架构的演进，并针对龙芯 LoongArch 国产平台做了降级适配。当前最大的"
     "工程挑战集中在 2K300 缺少 LSX 指令导致现代浏览器无法渲染这一硬件兼容性问题上，团队将以"
     "“板端采集 + 端云协同显示”的方案推进，形成可复制、可推广的国产端侧 AI 座舱工程范式。")
spacer(20)
p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
r = p.add_run("—— 全文完 ——")
set_run_font(r, name_cn=CN_HEAD, size=11, color=GREY)

# 页脚页码
def add_page_number(section):
    footer = section.footer
    p = footer.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run()
    fld1 = OxmlElement('w:fldChar'); fld1.set(qn('w:fldCharType'), 'begin')
    instr = OxmlElement('w:instrText'); instr.set(qn('xml:space'), 'preserve'); instr.text = 'PAGE'
    fld2 = OxmlElement('w:fldChar'); fld2.set(qn('w:fldCharType'), 'end')
    run._r.append(fld1); run._r.append(instr); run._r.append(fld2)
    set_run_font(run, size=9, color=GREY)

# 页脚页码（用 Word COM 转 PDF 前再补，避免域 XML 兼容问题）
# def add_page_number(section):
#     ...
add_page_number = None

out = r"C:\Users\ASUS\Desktop\smart_seat\智能座舱项目技术文档集.docx"
doc.save(out)
print("SAVED", out)
