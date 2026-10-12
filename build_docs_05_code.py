# -*- coding: utf-8 -*-
"""生成《05-核心代码与算法实现》docx —— 沿用 build_docs_v2.py 的排版风格"""
import os
from docx import Document
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

NAVY = RGBColor(0x1F,0x3A,0x6E); BLUE = RGBColor(0x2E,0x5E,0xAA)
GOLD = RGBColor(0xC8,0x9B,0x3C); WHITE = RGBColor(0xFF,0xFF,0xFF)
GREY = RGBColor(0x66,0x66,0x66)
ALT = "F2F6FC"; MONO = "Consolas"
CN, CN_H = "宋体", "微软雅黑"
OUT = r"C:\Users\ASUS\Desktop\05-核心代码与算法实现.docx"

def setfont(run, cn=CN, size=10.5, bold=False, color=None, en="Times New Roman"):
    run.font.name=en; run.font.size=Pt(size); run.font.bold=bold
    if color is not None: run.font.color.rgb=color
    rPr=run._element.get_or_add_rPr(); rf=rPr.find(qn('w:rFonts'))
    if rf is None:
        rf=OxmlElement('w:rFonts'); rPr.append(rf)
    rf.set(qn('w:eastAsia'),cn); rf.set(qn('w:ascii'),en); rf.set(qn('w:hAnsi'),en)

def shade(cell, hexc):
    tcPr=cell._tc.get_or_add_tcPr(); s=OxmlElement('w:shd')
    s.set(qn('w:val'),'clear'); s.set(qn('w:color'),'auto'); s.set(qn('w:fill'),hexc); tcPr.append(s)

def cell_text(cell, txt, size=9.5, bold=False, color=None, center=False):
    cell.text=""; p=cell.paragraphs[0]
    p.alignment=WD_ALIGN_PARAGRAPH.CENTER if center else WD_ALIGN_PARAGRAPH.LEFT
    p.paragraph_format.space_after=Pt(1); p.paragraph_format.space_before=Pt(1)
    p.paragraph_format.line_spacing=1.15
    r=p.add_run(str(txt)); setfont(r, size=size, bold=bold, color=color, cn=CN_H if bold else CN)
    cell.vertical_alignment=WD_ALIGN_VERTICAL.CENTER

def new_doc():
    d=Document(); s=d.sections[0]
    s.page_width,s.page_height=Cm(21),Cm(29.7)
    s.top_margin=s.bottom_margin=Cm(2.3); s.left_margin=s.right_margin=Cm(2.4)
    return d

def header_footer(d, doc_title):
    s=d.sections[0]; h=s.header; hp=h.paragraphs[0]; hp.alignment=WD_ALIGN_PARAGRAPH.RIGHT
    r=hp.add_run(doc_title); setfont(r, size=8.5, color=GREY)
    pPr=hp._p.get_or_add_pPr(); pbdr=OxmlElement('w:pBdr'); bottom=OxmlElement('w:bottom')
    bottom.set(qn('w:val'),'single'); bottom.set(qn('w:sz'),'6'); bottom.set(qn('w:space'),'1'); bottom.set(qn('w:color'),'C89B3C')
    pbdr.append(bottom); pPr.append(pbdr)
    f=s.footer; fp=f.paragraphs[0]; fp.alignment=WD_ALIGN_PARAGRAPH.CENTER
    r=fp.add_run("基于 LoongArch 端侧 AI 的智能座舱多模态交互终端    ·    第 "); setfont(r,size=9,color=GREY)
    fld=OxmlElement('w:fldSimple'); fld.set(qn('w:instr'),'PAGE'); fp._p.append(fld)
    r=fp.add_run(" 页"); setfont(r,size=9,color=GREY)

def cover(d, title, subtitle, meta_lines):
    for _ in range(3): d.add_paragraph()
    p=d.add_paragraph(); p.alignment=WD_ALIGN_PARAGRAPH.CENTER
    r=p.add_run("智能座舱多模态交互终端"); setfont(r,cn=CN_H,size=18,color=GREY)
    p=d.add_paragraph(); p.alignment=WD_ALIGN_PARAGRAPH.CENTER
    r=p.add_run(title); setfont(r,cn=CN_H,size=28,bold=True,color=NAVY)
    p=d.add_paragraph(); p.alignment=WD_ALIGN_PARAGRAPH.CENTER
    r=p.add_run(subtitle); setfont(r,cn=CN_H,size=13,color=BLUE)
    p=d.add_paragraph(); p.alignment=WD_ALIGN_PARAGRAPH.CENTER
    r=p.add_run("—— ❖ ——"); setfont(r,size=12,color=GOLD)
    for _ in range(2): d.add_paragraph()
    t=d.add_table(rows=len(meta_lines),cols=2); t.alignment=WD_TABLE_ALIGNMENT.CENTER
    for i,(k,v) in enumerate(meta_lines):
        c0,c1=t.rows[i].cells; shade(c0,"1F3A6E")
        cell_text(c0,k,11,True,WHITE,True); cell_text(c1,v,11)
        c0.width=Cm(4); c1.width=Cm(11)
    d.add_page_break()

def toc(d, items):
    p=d.add_paragraph(); p.alignment=WD_ALIGN_PARAGRAPH.CENTER
    r=p.add_run("目    录"); setfont(r,cn=CN_H,size=20,bold=True,color=NAVY)
    pPr=p._p.get_or_add_pPr(); pbdr=OxmlElement('w:pBdr'); bottom=OxmlElement('w:bottom')
    bottom.set(qn('w:val'),'single'); bottom.set(qn('w:sz'),'12'); bottom.set(qn('w:space'),'4'); bottom.set(qn('w:color'),'C89B3C')
    pbdr.append(bottom); pPr.append(pbdr); d.add_paragraph()
    for lvl, txt in items:
        p=d.add_paragraph(); pf=p.paragraph_format; pf.space_after=Pt(4)
        if lvl==1:
            pf.left_indent=Pt(0); r=p.add_run(txt); setfont(r,cn=CN_H,size=11.5,bold=True,color=NAVY)
        else:
            pf.left_indent=Pt(24); r=p.add_run("·  "); setfont(r,size=10,color=GOLD,bold=True)
            r=p.add_run(txt); setfont(r,size=10.5,color=RGBColor(0x33,0x33,0x33))
    d.add_page_break()

def h1(d, text, toc_items, first=False):
    p=d.add_paragraph(); p.paragraph_format.space_before=Pt(16 if not first else Pt(6))
    p.paragraph_format.space_after=Pt(8)
    if not first: p.paragraph_format.page_break_before=True
    r=p.add_run(text); setfont(r,cn=CN_H,size=17,bold=True,color=NAVY)
    pPr=p._p.get_or_add_pPr(); b=OxmlElement('w:pBdr'); bd=OxmlElement('w:bottom')
    bd.set(qn('w:val'),'single'); bd.set(qn('w:sz'),'10'); bd.set(qn('w:space'),'4'); bd.set(qn('w:color'),'1F3A6E')
    b.append(bd); pPr.append(b); toc_items.append((1, text))

def h2(d, text, toc_items=None):
    p=d.add_paragraph(); p.paragraph_format.space_before=Pt(10); p.paragraph_format.space_after=Pt(4)
    r=p.add_run("▍"); setfont(r,cn=CN_H,size=13,bold=True,color=GOLD)
    r=p.add_run(text); setfont(r,cn=CN_H,size=13,bold=True,color=BLUE)
    if toc_items is not None: toc_items.append((2, text))

def h3(d, text):
    p=d.add_paragraph(); p.paragraph_format.space_before=Pt(6); p.paragraph_format.space_after=Pt(2)
    r=p.add_run(text); setfont(r,cn=CN_H,size=11,bold=True,color=NAVY)

def body(d, text, indent=True, size=10.5):
    p=d.add_paragraph(); pf=p.paragraph_format
    pf.space_after=Pt(3); pf.line_spacing=1.4
    if indent: pf.first_line_indent=Pt(size*2)
    r=p.add_run(text); setfont(r,size=size)

def bullet(d, text, size=10.5):
    p=d.add_paragraph(); pf=p.paragraph_format
    pf.left_indent=Pt(20); pf.space_after=Pt(2); pf.line_spacing=1.35
    r=p.add_run("• "); setfont(r,size=size,bold=True,color=BLUE)
    r=p.add_run(text); setfont(r,size=size)

def mono_block(d, lines):
    for ln in lines:
        p=d.add_paragraph(); pf=p.paragraph_format
        pf.left_indent=Pt(14); pf.space_after=Pt(0); pf.line_spacing=1.15
        r=p.add_run(ln if ln else " "); setfont(r,size=9,en=MONO,cn=CN)
        pPr=p._p.get_or_add_pPr(); shd=OxmlElement('w:shd')
        shd.set(qn('w:val'),'clear'); shd.set(qn('w:fill'),'F4F5F7'); pPr.append(shd)

def md_table(d, rows):
    ncol=max(len(r) for r in rows); rows=[r+[""]*(ncol-len(r)) for r in rows]
    t=d.add_table(rows=len(rows),cols=ncol); t.style='Table Grid'; t.alignment=WD_TABLE_ALIGNMENT.CENTER
    for j,htxt in enumerate(rows[0]):
        c=t.rows[0].cells[j]; shade(c,"1F3A6E"); cell_text(c,htxt.strip(),9.5,True,WHITE,True)
    for i,rw in enumerate(rows[1:]):
        for j,v in enumerate(rw):
            c=t.rows[i+1].cells[j]
            if i%2==1: shade(c,ALT)
            cell_text(c,v.strip(),9.5,center=(j==0))
    d.add_paragraph().paragraph_format.space_after=Pt(2)

def code_caption(d, text):
    p=d.add_paragraph(); pf=p.paragraph_format; pf.space_before=Pt(4); pf.space_after=Pt(2)
    r=p.add_run(text); setfont(r,size=9,color=GREY)

# ============================== 正文 ==============================
d=new_doc(); header_footer(d, "05 核心代码与算法实现")
cover(d, "核心代码与算法实现", "智能座舱多模态交互终端 · 技术文档集之五",
      [("文档类型","核心技术补充文档（配合 01–04 使用）"),
       ("代码来源","backend/ 与 src/ 实际工程代码"),
       ("目标平台","Windows x86-64 / 龙芯 LoongArch64（UOS）"),
       ("整理日期","2026 年 9 月")])
toc_items=[]
toc(d, toc_items)

h1(d, "文档说明", toc_items, first=True)
body(d, "本文档是《智能座舱多模态交互终端》技术文档集的第五册，用于补充前四份文档中未展开的核心代码与算法细节。"
        "全部代码均摘自项目工程源码（backend/ 与 src/），仅做与主题无关的删减，保留原始实现与注释风格，"
        "便于在答辩、评审与后续维护中直接引用。")
md_table(d, [
    ["章节","对应源码文件","技术要点"],
    ["疲劳检测 v6","backend/camera_server.py","事件驱动告警状态机、EAR/MAR 阈值、冷却与保持"],
    ["表情识别","backend/services/emotion_engine.py","YuNet 人脸检测 + ONNX EfficientNet-B2 推理"],
    ["语音时序","src/context/VoiceStore.jsx","逐句串行播放、优先级抢占、音色热切换"],
    ["TTS 多引擎","backend/tts_server.py","口语化预处理、情绪切音、熔断降级"],
    ["车辆数据推送","backend/routers/vehicle.py","WebSocket 每秒推送、模拟器数据模型"],
    ["端侧适配","start.sh / setup.sh","龙芯依赖安装、服务编排与优雅退出"],
])

# ---------- 1 ----------
h1(d, "一、疲劳检测 v6：事件驱动告警算法", toc_items)
body(d, "早期版本采用“综合评分 + 阈值判定”的管线，存在两个问题：一是疲劳分数由多项指标加权，"
        "临界值附近容易反复跳变；二是告警只能反映“当前分数”，无法表达“刚刚发生了什么”。"
        "v6 版本改为事件驱动：由哈欠、持续闭眼两类可解释事件直接决定告警等级，评分仅作展示参考，"
        "从根本上消除了评分抖动，也让告警文案能与驾驶行为一一对应。")

h2(d, "1.1 判定规则与阈值", toc_items)
md_table(d, [
    ["事件","判据","持续/触发条件","告警等级","告警文案"],
    ["哈欠","嘴部长宽比 MAR > 0.70","由“未哈欠”变为“哈欠”的瞬间","warning 轻度","您打哈欠了，请注意休息。"],
    ["持续闭眼","眼睛纵横比 EAR < 0.16","持续 ≥ 4 s","high 中度","检测到长时间闭眼，请集中注意力！"],
    ["持续闭眼","眼睛纵横比 EAR < 0.16","持续 ≥ 7 s","critical 重度","危险！请立即停车休息！"],
])
bullet(d, "冷却机制：哈欠告警 60 s 内不重复；闭眼告警 25 s 内不重复，避免连续刷屏。")
bullet(d, "保持机制：任一告警至少保持 5 s，且仅在事件消失（睁眼/哈欠结束）后解除。")
bullet(d, "告警原因互斥：内部以 _alert_cause 记录当前告警来自“哈欠”还是“闭眼”，避免两类事件互相覆盖。")

h2(d, "1.2 阈值与状态变量定义", toc_items)
code_caption(d, "代码 1-1  backend/camera_server.py（阈值与状态变量）")
mono_block(d, [
 "# --- 检测阈值 ---",
 "_EAR_THRESHOLD = 0.16              # 眼睛闭合 EAR 阈值",
 "_MAR_YAWN_THRESHOLD = 0.70         # 哈欠 MAR 阈值",
 "",
 "# --- 事件→告警映射 ---",
 "_EYE_CLOSED_WARNING_DUR = 4.0      # 持续闭眼 >4s → high（中度疲劳）",
 "_EYE_CLOSED_CRITICAL_DUR = 7.0     # 持续闭眼 >7s → critical（重度疲劳）",
 "",
 "# --- 告警冷却 ---",
 "_ALERT_HOLD_TIME = 5.0             # 告警最少保持时间",
 "_YAWN_COOLDOWN = 60.0              # 两次哈欠告警最短间隔",
 "_EYE_COOLDOWN = 25.0               # 两次闭眼告警最短间隔",
 "",
 "_was_eye_closed = False",
 "_eye_close_start_ts = 0.0",
 "_was_yawning = False",
 "_alert_cause = None                # \"yawn\" | \"eye\" | None — 当前告警原因",
])

h2(d, "1.3 事件驱动状态机实现", toc_items)
code_caption(d, "代码 1-2  backend/camera_server.py::_run_safety_check（核心逻辑）")
mono_block(d, [
 "def _run_safety_check(landmarks, w, h, driving_minutes=0.0):",
 "    \"\"\"v6 事件驱动疲劳检测：哈欠→轻度提醒，闭眼→中/重度告警。",
 "    评分仅作参考值，告警由检测到的事件直接决定，不经过任何评分管线。\"\"\"",
 "    now = time.time()",
 "",
 "    # ===== 1. 眼睛闭合检测 =====",
 "    ear = _compute_ear(landmarks, w, h)",
 "    is_eye_closed = ear < _EAR_THRESHOLD",
 "    if is_eye_closed and not _was_eye_closed:",
 "        _eye_close_start_ts = now",
 "    elif not is_eye_closed:",
 "        _eye_close_start_ts = 0.0",
 "    _was_eye_closed = is_eye_closed",
 "    closure_dur = (now - _eye_close_start_ts) if _eye_close_start_ts > 0 else 0.0",
 "",
 "    # ===== 2. 哈欠检测 =====",
 "    mar = _compute_mar(landmarks, w, h)",
 "    is_yawning = mar > _MAR_YAWN_THRESHOLD",
 "",
 "    # ===== 3. 事件判定告警等级 =====",
 "    new_alert = None",
 "    if closure_dur >= _EYE_CLOSED_CRITICAL_DUR:",
 "        new_alert = \"critical\"",
 "    elif closure_dur >= _EYE_CLOSED_WARNING_DUR:",
 "        new_alert = \"high\"",
 "    elif is_yawning and not _was_yawning:",
 "        if now - _last_yawn_alert_ts >= _YAWN_COOLDOWN:",
 "            new_alert = \"warning\"",
 "    _was_yawning = is_yawning",
 "",
 "    # ===== 4. 告警状态机（冷却 + 保持 + 解除）=====",
 "    alert_level = _cached_safety.get(\"alert_level\", \"normal\")",
 "    if new_alert:",
 "        if new_alert in (\"high\", \"critical\"):",
 "            if now - _last_eye_alert_ts >= _EYE_COOLDOWN:",
 "                alert_level = new_alert; _alert_cause = \"eye\"",
 "                _last_eye_alert_ts = now; _alert_start_ts = now",
 "        elif new_alert == \"warning\":",
 "            alert_level = new_alert; _alert_cause = \"yawn\"",
 "            _last_yawn_alert_ts = now; _alert_start_ts = now",
 "    elif _alert_cause:",
 "        if _alert_cause == \"eye\" and closure_dur < _EYE_CLOSED_WARNING_DUR:",
 "            if now - _alert_start_ts >= _ALERT_HOLD_TIME:",
 "                alert_level = \"normal\"; _alert_cause = None",
 "        elif _alert_cause == \"yawn\" and now - _alert_start_ts >= _ALERT_HOLD_TIME:",
 "            alert_level = \"normal\"; _alert_cause = None",
 "",
 "    # ===== 5. 参考评分（仅展示用）=====",
 "    fatigue_score = min(100.0, closure_dur * 25.0)   # 4s 闭眼 = 100 分",
])
body(d, "工程价值：告警由事件直接触发，驾驶行为与提示文案严格对应；评分退化为展示量，"
        "不再参与判定，因而调参目标明确（仅需调整 EAR/MAR 与时长阈值），现场调试成本显著降低。")

# ---------- 2 ----------
h1(d, "二、表情识别：YuNet 人脸检测 + ONNX 推理管线", toc_items)
body(d, "表情识别负责把摄像头画面转成“开心 / 平静 / 悲伤 / 愤怒 / 厌恶 / 恐惧 / 惊讶”七类情绪，"
        "并驱动界面展示与 TTS 情绪切音。整条链路完全在端侧完成：OpenCV YuNet 负责人脸检测，"
        "EfficientNet-B2（ONNX Runtime，CPU 推理）负责表情分类，不依赖任何云端接口。")

h2(d, "2.1 推理管线", toc_items)
bullet(d, "人脸检测：FaceDetectorYN（YuNet）为主，MediaPipe FaceDetector 为备选，取置信度最高的人脸。")
bullet(d, "关键点复用：YuNet 直接输出 5 个关键点，安全监控直接复用同一组关键点计算 EAR/MAR，避免二次推理。")
bullet(d, "预处理：resize 至 260×260 → 归一化（ImageNet 均值方差）→ HWC 转 CHW → 增加 batch 维。")
bullet(d, "分类输出：7 维 logits 经 softmax 得到各类概率，取 argmax 作为结果并返回置信度与全部分数。")

code_caption(d, "代码 2-1  backend/services/emotion_engine.py（预处理与推理）")
mono_block(d, [
 "def preprocess(face_img: np.ndarray) -> np.ndarray:",
 "    \"\"\"ONNX 预处理：resize → normalize (ImageNet stats) → HWC→CHW → batch dim\"\"\"",
 "    x = cv2.resize(face_img, (_IMG_SIZE, _IMG_SIZE)).astype(np.float32) / 255.0",
 "    x = (x - _MEAN) / _STD",
 "    x = x.transpose(2, 0, 1)           # HWC → CHW",
 "    return x[np.newaxis, ...]          # 加 batch 维",
 "",
 "def predict(face_img: np.ndarray):",
 "    ort_inputs = {\"input\": preprocess(face_img)}",
 "    scores = _ort_session.run(None, ort_inputs)[0][0]   # shape: (7,)",
 "    pred_idx = int(np.argmax(scores))",
 "    e_x = np.exp(scores - np.max(scores))               # 数值稳定 softmax",
 "    probs = e_x / e_x.sum()",
 "    emotion_en = IDX_TO_CLASS_EN.get(pred_idx, \"Neutral\")",
 "    emotion_zh = EMOTION_ZH_MAP.get(emotion_en, \"平静\")",
 "    confidence = float(probs[pred_idx])",
 "    return (emotion_en, emotion_zh, confidence, all_scores)",
])

code_caption(d, "代码 2-2  backend/services/emotion_engine.py（YuNet 人脸检测与边距扩展）")
mono_block(d, [
 "_face_detector_yn = cv2.FaceDetectorYN_create(",
 "    str(_YUNET_PATH), config=\"\", input_size=(320, 320),",
 "    score_threshold=0.6, nms_threshold=0.3, top_k=500,",
 ")",
 "",
 "def detect_face(frame):",
 "    h, w = frame.shape[:2]",
 "    _face_detector_yn.setInputSize((w, h))        # YuNet 需固定输入尺寸",
 "    _, faces = _face_detector_yn.detect(frame)",
 "    best_idx = np.argmax(faces[:, -1])            # 末列为置信度，取最高",
 "    best = faces[best_idx]",
 "    x, y, fw, fh = int(best[0]), int(best[1]), int(best[2]), int(best[3])",
 "    x = max(0, x - int(fw * 0.1));  y = max(0, y - int(fh * 0.15))",
 "    fw = min(w - x, int(fw * 1.2)); fh = min(h - y, int(fh * 1.3))",
 "    return (x, y, fw, fh)",
])
body(d, "设计要点：人脸框做 10% 横向、15% 纵向的边距扩展后再裁剪送入分类网络，"
        "使眉眼与嘴部完整落入输入区域，实测可明显提升“哈欠/惊讶”等张嘴表情的区分度。")

# ---------- 3 ----------
h1(d, "三、语音交互：统一时序播放与多音色 TTS", toc_items)
body(d, "语音播报在多来源告警（疲劳提醒、路况提示、对话回复）并存时，最容易出现“抢话、叠音、串音”。"
        "工程上采用两级设计：前端用优先级队列保证“同一时刻只有一个声音”，后端用多引擎 + 熔断保证“永远出得了声”。")

h2(d, "3.1 优先级与抢占规则", toc_items)
md_table(d, [
    ["优先级","典型内容","行为"],
    ["critical（4）","严重疲劳告警","可打断任何正在播放的内容，立即播报"],
    ["alert（3）","中/轻度告警","高于对话回复，队列内优先"],
    ["greeting（2）","唤醒回应、问候语","低于告警，高于普通对话"],
    ["normal（1）","聊天回复、车控反馈","默认等级，不抢占，排队等待"],
])
bullet(d, "同级去重：相同文本 30 s 内不重复播报；同级告警 30 s 内冷却。")
bullet(d, "逐句合成与播放：长文本按句切分，逐句播放；播放前重新读取音色设置，因此切换音色立即生效。")

code_caption(d, "代码 3-1  src/context/VoiceStore.jsx（优先级抢占与串行入口）")
mono_block(d, [
 "const PRIORITY_RANK = { critical: 4, alert: 3, greeting: 2, normal: 1 };",
 "",
 "const speak = useCallback((text, priority = 'normal') => {",
 "  return new Promise((resolve) => {",
 "    const newRank = PRIORITY_RANK[priority] ?? 0;",
 "    const curRank = curPriorityRef.current ? (PRIORITY_RANK[curPriorityRef.current] ?? 0) : 0;",
 "",
 "    // 高优先级打断当前播放（critical 可打断一切，安全优先）",
 "    if (newRank > curRank && currentAudioRef.current) {",
 "      try { currentAudioRef.current.pause(); } catch (e) {}",
 "      currentAudioRef.current = null;",
 "      if (window.speechSynthesis && !ttsOnlineRef.current) {",
 "        try { window.speechSynthesis.cancel(); } catch (e) {}",
 "      }",
 "    }",
 "",
 "    const sentences = splitIntoSentences(text);",
 "    if (sentences.length === 0) { resolve(); return; }",
 "",
 "    // 优先级不够且正在播 → 轮询等待，不抢占",
 "    if (newRank <= curRank && isSpeakingRef.current) {",
 "      let retries = 0;",
 "      const tryStart = () => {",
 "        if (!isSpeakingRef.current || retries >= 20) {",
 "          curPriorityRef.current = priority;",
 "          playSentencesRef.current?.(sentences, priority, resolve);",
 "        } else { retries++; setTimeout(tryStart, 300); }",
 "      };",
 "      setTimeout(tryStart, 300);",
 "      return;",
 "    }",
 "    curPriorityRef.current = priority;",
 "    playSentencesRef.current?.(sentences, priority, resolve);",
 "  });",
 "}, []);",
])

h2(d, "3.2 后端 TTS：口语化预处理与多引擎降级", toc_items)
body(d, "后端 TTS 服务（7862 端口）承担三件事：把书面语转成口语、按情绪调整音色参数、在引擎不可用时自动降级。"
        "文本预处理采用“长匹配优先”的替换表，避免短词误伤长词；多引擎按 Edge TTS → WinRT → pyttsx3 顺序尝试，"
        "并配合熔断器与内存缓存，使重复文案零成本复用。")

code_caption(d, "代码 3-2  backend/tts_server.py（口语化预处理，节选）")
mono_block(d, [
 "FORMAL_TO_CASUAL = [",
 "    # 长匹配优先（避免短匹配吃掉长匹配的子串）",
 "    (r'智能座舱为您服务', '路上注意安全'),",
 "    (r'祝您一路平安', '一路顺风'),",
 "    (r'请说您的需求', '说吧'),",
 "    (r'已为您', '帮你'),",
 "    (r'已调低', '调低了'),",
 "    (r'已关闭', '关了'),",
 "]",
 "",
 "def _preprocess_tts_text(text):",
 "    \"\"\"合成前对文本做处理，让语音更像真人说话\"\"\"",
 "    for pattern, replacement in FORMAL_TO_CASUAL:",
 "        text = re.sub(pattern, replacement, text)",
 "    text = re.sub(r'[！!]{2,}', '！', text)",
 "    text = re.sub(r'[？?]{2,}', '？', text)",
 "    text = re.sub(r'[。…]{2,}', '。', text)",
 "    return text",
])

code_caption(d, "代码 3-3  backend/tts_server.py::_do_tts（多引擎降级链，节选）")
mono_block(d, [
 "def _do_tts(text, role, emotion, offsets=None):",
 "    \"\"\"多引擎 TTS：Edge TTS → WinRT → pyttsx3（带缓存）\"\"\"",
 "    ckey = _cache_key(text, role, emotion, offsets)",
 "    cached = _cache_get(ckey)",
 "    if cached:                                   # 内存缓存命中，直接返回",
 "        audio, mime, engine = cached",
 "        return audio, mime, engine + \"-cached\"",
 "",
 "    processed_text = _preprocess_tts_text(text)  # ① 口语化预处理",
 "",
 "    # ② Edge TTS（优先，带熔断器）",
 "    if _edge_tts_ready():",
 "        try:",
 "            audio, mime = _run_edge_with_timeout(processed_text, role, emotion, offsets, 15.0)",
 "            if audio:",
 "                _edge_tts_record_success()",
 "                _cache_put(ckey, (audio, mime, \"edge-tts\"))",
 "                return audio, mime, \"edge-tts\"",
 "        except asyncio.TimeoutError:",
 "            _edge_tts_record_failure()           # 连续失败达阈值 → 熔断 300s",
 "",
 "    # ③ WinRT（离线兜底）→ ④ pyttsx3（最终兜底）",
 "    ...",
 "    return b\"\", \"audio/wav\", \"none\"",
])
md_table(d, [
    ["引擎","特性","触发条件"],
    ["pregen（预生成）","启动即响应，零延迟","命中 voice_cache 预生成文件"],
    ["Edge-TTS","神经网络音色，8 种角色","默认优先，连续失败 10 次熔断 300 s"],
    ["WinRT","系统本地语音，离线可用","Edge 不可用或超时（15 s）"],
    ["pyttsx3","基础合成，最终兜底","以上引擎全部失败"],
    ["browser","浏览器内置语音","后端 7862 整体不可用（前端自动降级）"],
])

# ---------- 4 ----------
h1(d, "四、车辆数据实时推送：WebSocket + 硬件模拟器", toc_items)
body(d, "车辆仪表需要每秒级的连续数据。若由前端轮询，既增加请求开销，也难以保证时间轴一致性。"
        "工程上由后端硬件模拟器生成车辆状态，通过 WebSocket 每秒主动推送；前端断线后自动重连，"
        "重连耗尽则回落本地模拟，保证界面永远有数据可显示。")

code_caption(d, "代码 4-1  backend/routers/vehicle.py（WebSocket 每秒推送）")
mono_block(d, [
 "@router.websocket(\"/ws/vehicle\")",
 "async def vehicle_websocket(websocket: WebSocket):",
 "    \"\"\"每秒推送一次模拟车辆数据。\"\"\"",
 "    await websocket.accept()",
 "    try:",
 "        simulator.start_simulation()          # 确保模拟器后台线程在跑",
 "        while True:",
 "            state = simulator.get_current_state()",
 "            payload = {",
 "                \"timestamp\": state.get(\"timestamp\"),",
 "                \"speed\": state.get(\"speed\", 0),",
 "                \"rpm\": state.get(\"rpm\", 0),",
 "                \"fuel\": state.get(\"fuel\", 100),",
 "                \"temperature\": state.get(\"temperature\", 90),",
 "                \"tire_pressure\": [state.get(\"tire_pressure_fl\", 2.4),",
 "                                   state.get(\"tire_pressure_fr\", 2.4),",
 "                                   state.get(\"tire_pressure_rl\", 2.4),",
 "                                   state.get(\"tire_pressure_rr\", 2.4)],",
 "            }",
 "            await websocket.send_text(json.dumps(payload, ensure_ascii=False))",
 "            await asyncio.sleep(WS_PUSH_INTERVAL)",
 "    except WebSocketDisconnect:",
 "        return",                              # 客户端正常断开：静默处理",
])
bullet(d, "前端策略：连接成功即停用本地 mock 定时器，避免双数据源冲突；断开后 3 s 重连，最多 5 次。")
bullet(d, "降级策略：重连耗尽后自动切回前端本地模拟数据，界面不中断（保证演示稳定性）。")

# ---------- 5 ----------
h1(d, "五、端侧部署：龙芯 LoongArch 适配要点", toc_items)
body(d, "项目需在龙芯平台（先 2K300 开发板，后 3A6000 笔记本 / UOS）离线运行，因此在安装与启动脚本上"
        "做了针对性处理：Python 版本探测与自动安装、LoongArch 专属 PyPI 镜像、依赖裁剪、端口占用清理与优雅退出。")

code_caption(d, "代码 5-1  setup.sh（Python 3.10+ 探测与镜像源）")
mono_block(d, [
 "LOONG64_PYPI=\"https://mirrors.loong64.com/pypi/simple\"",
 "TSINGHUA_PYPI=\"https://pypi.tuna.tsinghua.edu.cn/simple\"",
 "",
 "# 按优先级找 Python 3.10+",
 "for cmd in python3.11 python3.10 python3; do",
 "    if command -v \"$cmd\" &>/dev/null; then",
 "        if \"$cmd\" -c \"import sys; exit(0 if sys.version_info >= (3,10) else 1)\"; then",
 "            PYTHON_CMD=\"$cmd\"; break",
 "        fi",
 "    fi",
 "done",
])

code_caption(d, "代码 5-2  start.sh（等待就绪与退出清理）")
mono_block(d, [
 "wait_for() {",
 "    local url=$1 name=$2 max=${3:-30} i=0",
 "    while [ $i -lt $max ]; do",
 "        curl -sf \"$url\" >/dev/null 2>&1 && { info \"$name 就绪 ✓\"; return 0; }",
 "        sleep 1; i=$((i+1))",
 "    done",
 "    warn \"$name 启动超时\"; return 1",
 "}",
 "",
 "cleanup() {",
 "    info \"停止所有服务...\"",
 "    for pidfile in \"${PID_DIR}\"/*.pid; do",
 "        [ -f \"$pidfile\" ] || continue",
 "        pid=$(cat \"$pidfile\"); kill \"$pid\" 2>/dev/null || true; rm -f \"$pidfile\"",
 "    done",
 "    for port in ${BACKEND_PORT} ${CAMERA_PORT} ${TTS_PORT} ${FRONTEND_PORT}; do",
 "        pids=$(lsof -ti:${port} 2>/dev/null || true)",
 "        [ -n \"$pids\" ] && kill $pids 2>/dev/null || true",
 "    done",
 "    exit 0",
 "}",
 "trap cleanup SIGINT SIGTERM EXIT",
])
bullet(d, "启动顺序串行化：按 后端 API → 摄像头/情绪 → TTS → 前端 顺序拉起，每一步 wait_for 就绪后再进入下一步。")
bullet(d, "进程治理：PID 文件 + 端口双保险清理，避免异常退出后端口被占导致“服务起不来”。")

# ---------- 6 ----------
h1(d, "六、建议补充进现有文档的内容", toc_items)
bullet(d, "性能与资源实测专节：龙芯 3A6000 上各服务的启动耗时、CPU/内存占用、端到端语音延迟（唤醒→识别→回复→出声）实测表。")
bullet(d, "降级策略专章：把 TTS 五级降级、ASR 本地/备用引擎、定位与天气多级兜底整理为一张“故障—降级—用户可见影响”对照表。")
bullet(d, "安全与隐私说明：人脸与语音数据本地处理、不出端、界面脱敏，符合车规数据合规要求的说明段落。")
bullet(d, "产品价值量化：疲劳事件识别率、告警响应时间、误报率等指标，与“减少疲劳驾驶风险”的价值论述。")
bullet(d, "踩坑与解决记录：龙芯平台常见问题（依赖编译、onnxruntime 版本、字体缺失、老式浏览器 Dillo 兼容）与解决办法。")
bullet(d, "运维增强建议：systemd 服务化、日志轮转、健康检查与自动重启、API 鉴权与限流。")

# ---------- 7 ----------
h1(d, "七、本轮协作中的代码改动清单", toc_items)
body(d, "下列改动发生在本项目的一个工作副本（桌面 smart_seat 目录的孪生副本）中，用于解决“语音时序”与“唤醒失效”"
        "两类现场问题，可作为后续合并与版本管理的参考。")
md_table(d, [
    ["文件","改动内容","目的"],
    ["src/context/VoiceStore.jsx","逐句顺序播放、去掉并发预取与 8 秒抢跑、播放链可中断、仅在真正出声时占用播报状态","消除“前半句正常、后半句加速变调/叠音”现象"],
    ["src/components/RightPanel.jsx","唤醒改接本地 VAD+ASR 控制器；新增“听到:「…」”诊断行、麦克风重试与试麦入口","解决喊“小龙”无响应且无法定位的问题"],
    ["src/lib/voiceController.js","新增 onHeard 识别反馈回调，保留唤醒/等待指令状态机","让识别结果可视化，便于现场排查"],
    ["src/lib/wakeDetector.js","VAD 阈值 0.012→0.008、句尾静音 900→700 ms","提高远距离/小声说话的唤醒检出率"],
    ["backend/tts_server.py","合成加全局串行锁；默认引擎切回本地 VITS；口语化/情绪映射保留","避免并发合成竞争，保持既有音色"],
    ["backend/services/local_voice.py","长文本切段合成（≤26 字/段，段间 150 ms 静音）","避免长句后半段音质劣化，并降低单次延迟"],
    ["backend/main.py","关闭 uvicorn 热重载；启动预热识别模型","防止开发期反复重启打断识别请求、消除首次识别冷启动"],
    ["start.bat","脚本改为纯 ASCII + CRLF 行尾；改为轮询前端就绪后再打开浏览器","修复中文乱码与“网页打不开”问题"],
])
body(d, "需要说明的是：上述改动与现有四份文档并不冲突。若要合并进主仓库，建议先在 Windows 环境回归"
        "“语音链路 + 疲劳告警 + 音乐点歌”三项用例，再按提交粒度拆分（时序修复、唤醒修复、脚本修复、文档更新）进行提交。")

d.save(OUT)
print("SAVED:", OUT, os.path.getsize(OUT), "bytes")
