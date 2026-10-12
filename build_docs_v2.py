# -*- coding: utf-8 -*-
"""四个 txt → 精排 docx v2：目录、页眉页脚、按章节配图、图注"""
import os, re
from docx import Document
from docx.shared import Pt, Cm, RGBColor, Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

NAVY = RGBColor(0x1F,0x3A,0x6E); BLUE = RGBColor(0x2E,0x5E,0xAA)
GOLD = RGBColor(0xC8,0x9B,0x3C); WHITE = RGBColor(0xFF,0xFF,0xFF)
GREY = RGBColor(0x66,0x66,0x66)
ALT = "F2F6FC"; MONO = "Consolas"
CN, CN_H = "宋体", "微软雅黑"
ASSET = r"C:\Users\ASUS\Desktop\smart_seat\assets"
OUTDIR = r"E:\实验报告\挑战杯揭榜挂帅"
os.makedirs(OUTDIR, exist_ok=True)

def setfont(run, cn=CN, size=10.5, bold=False, color=None, en="Times New Roman"):
    run.font.name=en; run.font.size=Pt(size); run.font.bold=bold
    if color is not None: run.font.color.rgb=color
    rPr=run._element.get_or_add_rPr()
    rf=rPr.find(qn('w:rFonts'))
    if rf is None:
        rf=OxmlElement('w:rFonts'); rPr.append(rf)
    rf.set(qn('w:eastAsia'),cn); rf.set(qn('w:ascii'),en); rf.set(qn('w:hAnsi'),en)

def shade(cell, hexc):
    tcPr=cell._tc.get_or_add_tcPr()
    s=OxmlElement('w:shd'); s.set(qn('w:val'),'clear'); s.set(qn('w:color'),'auto'); s.set(qn('w:fill'),hexc)
    tcPr.append(s)

def cell_text(cell, txt, size=9.5, bold=False, color=None, center=False):
    cell.text=""
    p=cell.paragraphs[0]
    p.alignment=WD_ALIGN_PARAGRAPH.CENTER if center else WD_ALIGN_PARAGRAPH.LEFT
    p.paragraph_format.space_after=Pt(1); p.paragraph_format.space_before=Pt(1)
    p.paragraph_format.line_spacing=1.15
    r=p.add_run(str(txt)); setfont(r, size=size, bold=bold, color=color, cn=CN_H if bold else CN)
    cell.vertical_alignment=WD_ALIGN_VERTICAL.CENTER

def new_doc():
    d=Document()
    s=d.sections[0]
    s.page_width,s.page_height=Cm(21),Cm(29.7)
    s.top_margin=s.bottom_margin=Cm(2.3); s.left_margin=s.right_margin=Cm(2.4)
    return d

def header_footer(d, doc_title):
    s=d.sections[0]
    h=s.header; hp=h.paragraphs[0]; hp.alignment=WD_ALIGN_PARAGRAPH.RIGHT
    r=hp.add_run(doc_title); setfont(r, size=8.5, color=GREY)
    # 下边框
    pPr=hp._p.get_or_add_pPr(); pbdr=OxmlElement('w:pBdr'); bottom=OxmlElement('w:bottom')
    bottom.set(qn('w:val'),'single'); bottom.set(qn('w:sz'),'6'); bottom.set(qn('w:space'),'1'); bottom.set(qn('w:color'),'C89B3C')
    pbdr.append(bottom); pPr.append(pbdr)
    f=s.footer; fp=f.paragraphs[0]; fp.alignment=WD_ALIGN_PARAGRAPH.CENTER
    r=fp.add_run("基于 LoongArch 端侧 AI 的智能座舱多模态交互终端    ·    第 "); setfont(r,size=9,color=GREY)
    # PAGE 域
    fld=OxmlElement('w:fldSimple'); fld.set(qn('w:instr'),'PAGE')
    fp._p.append(fld)
    r=fp.add_run(" 页"); setfont(r,size=9,color=GREY)

def cover(d, title, subtitle, meta_lines):
    for _ in range(3): d.add_paragraph()
    p=d.add_paragraph(); p.alignment=WD_ALIGN_PARAGRAPH.CENTER
    r=p.add_run("智能座舱多模态交互终端"); setfont(r,cn=CN_H,size=18,color=GREY)
    p=d.add_paragraph(); p.alignment=WD_ALIGN_PARAGRAPH.CENTER
    r=p.add_run(title); setfont(r,cn=CN_H,size=28,bold=True,color=NAVY)
    p=d.add_paragraph(); p.alignment=WD_ALIGN_PARAGRAPH.CENTER
    r=p.add_run(subtitle); setfont(r,cn=CN_H,size=13,color=BLUE)
    # 金色装饰线
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
    pbdr.append(bottom); pPr.append(pbdr)
    d.add_paragraph()
    for lvl, txt in items:
        p=d.add_paragraph()
        pf=p.paragraph_format; pf.space_after=Pt(4)
        if lvl==1:
            pf.left_indent=Pt(0)
            r=p.add_run(txt); setfont(r,cn=CN_H,size=11.5,bold=True,color=NAVY)
        else:
            pf.left_indent=Pt(24)
            r=p.add_run("·  "); setfont(r,size=10,color=GOLD,bold=True)
            r=p.add_run(txt); setfont(r,size=10.5,color=RGBColor(0x33,0x33,0x33))
    d.add_page_break()

def h1(d, text, toc_items, first=False):
    p=d.add_paragraph()
    p.paragraph_format.space_before=Pt(16 if not first else Pt(6))
    p.paragraph_format.space_after=Pt(8)
    if not first:
        p.paragraph_format.page_break_before=True
    r=p.add_run(text); setfont(r,cn=CN_H,size=17,bold=True,color=NAVY)
    pPr=p._p.get_or_add_pPr(); b=OxmlElement('w:pBdr'); bd=OxmlElement('w:bottom')
    bd.set(qn('w:val'),'single'); bd.set(qn('w:sz'),'10'); bd.set(qn('w:space'),'4'); bd.set(qn('w:color'),'1F3A6E')
    b.append(bd); pPr.append(b)
    toc_items.append((1, text))

def h2(d, text, toc_items):
    p=d.add_paragraph()
    p.paragraph_format.space_before=Pt(10); p.paragraph_format.space_after=Pt(4)
    r=p.add_run("▍"); setfont(r,cn=CN_H,size=13,bold=True,color=GOLD)
    r=p.add_run(text); setfont(r,cn=CN_H,size=13,bold=True,color=BLUE)
    toc_items.append((2, text))

def h3(d, text):
    p=d.add_paragraph()
    p.paragraph_format.space_before=Pt(6); p.paragraph_format.space_after=Pt(2)
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
    ncol=max(len(r) for r in rows)
    rows=[r+[""]*(ncol-len(r)) for r in rows]
    t=d.add_table(rows=len(rows),cols=ncol); t.style='Table Grid'; t.alignment=WD_TABLE_ALIGNMENT.CENTER
    for j,htxt in enumerate(rows[0]):
        c=t.rows[0].cells[j]; shade(c,"1F3A6E"); cell_text(c,htxt.strip(),9.5,True,WHITE,True)
    for i,rw in enumerate(rows[1:]):
        for j,v in enumerate(rw):
            c=t.rows[i+1].cells[j]
            if i%2==1: shade(c,ALT)
            cell_text(c,v.strip(),9.5,center=(j==0))
    d.add_paragraph().paragraph_format.space_after=Pt(2)

def add_image(d, fname, caption, width_cm=14.5):
    p=d.add_paragraph(); p.alignment=WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before=Pt(6); p.paragraph_format.space_after=Pt(2)
    run=p.add_run(); run.add_picture(os.path.join(ASSET,fname), width=Cm(width_cm))
    cp=d.add_paragraph(); cp.alignment=WD_ALIGN_PARAGRAPH.CENTER
    cp.paragraph_format.space_after=Pt(8)
    r=cp.add_run(caption); setfont(r,size=9,color=GREY)

# ---- 章节配图规则：H1 标题关键词 → 图片列表 ----
CHAPTER_IMG = {
    "综合总结": [
        ("arch_overview.png", "图 1  智能座舱三层系统架构总览", 15),
        ("20c255f549fdab46b22d19005057d389.jpg", "图 2  龙芯 2K300 先锋派开发板与 7 寸 RGB 显示屏", 12),
        ("4fa6b4b27f854c1a46d13cf44fea96c7.jpg", "图 3  龙芯 2K300 开发板正面（已接屏幕排线与 USB 外设）", 13),
        ("e865462580f2c851dbff6dbcf935161a.jpg", "图 4  端侧硬件整体接线：开发板 + LCD + U 盘", 12),
        ("91e60b3375d41e218de73d671bc7d4fe.jpg", "图 5  智能座舱前端在龙芯板载屏幕上运行", 10),
        ("c9235bd1646122bd96c0f253f6b378f6.png", "图 6  系统总览界面（摄像头实时预览已脱敏）", 14),
        ("deploy_topology.png", "图 7  端—边—云混合部署拓扑", 15),
        ("voice_pipeline.png", "图 8  语音交互全链路", 15),
        ("fatigue_flow.png", "图 9  疲劳检测 v6 事件驱动告警流程", 15),
    ],
    "用户手册": [
        ("c9235bd1646122bd96c0f253f6b378f6.png", "图 1  系统总览主界面", 15),
        ("6bd05c8a35901020a98d293ba109d126.png", "图 2  语音助手对话与音色设置", 15),
        ("ad74fcff0daab46798574b1e441cb6e7.png", "图 3  音乐娱乐界面：本地曲库 + 在线曲库", 15),
        ("6b53a376676c6680292dc19959e8531b.png", "图 4  驾驶安全监控界面（疲劳/告警/心率）", 15),
        ("44d2d13305dd947b17a3540fcc49182b.png", "图 5  天气信息与未来预报", 15),
        ("2413a807619488bce3e367180257e2b8.png", "图 6  MobaXterm SSH 远程登录龙芯板", 14),
        ("ea03d66640a4ee502902ee1c5d6d700c.png", "图 7  板端网络接口与地址查看", 12),
    ],
    "测试报告": [
        ("6b53a376676c6680292dc19959e8531b.png", "图 1  疲劳检测与安全监控测试实拍", 15),
        ("c9235bd1646122bd96c0f253f6b378f6.png", "图 2  系统总览功能测试界面", 15),
        ("6bd05c8a35901020a98d293ba109d126.png", "图 3  语音助手识别与音色切换测试", 15),
        ("ad74fcff0daab46798574b1e441cb6e7.png", "图 4  音乐播放与语音点歌测试", 15),
        ("44d2d13305dd947b17a3540fcc49182b.png", "图 5  天气查询与定位测试", 15),
        ("fatigue_flow.png", "图 6  事件驱动告警逻辑示意", 14),
    ],
    "其他相关文档": [
        ("deploy_topology.png", "图 1  端—边—云部署拓扑", 15),
        ("2413a807619488bce3e367180257e2b8.png", "图 2  SSH 登录板端运维", 14),
        ("ea03d66640a4ee502902ee1c5d6d700c.png", "图 3  板端网络配置", 12),
        ("20c255f549fdab46b22d19005057d389.jpg", "图 4  龙芯开发板与 LCD 屏硬件实物", 12),
        ("4fa6b4b27f854c1a46d13cf44fea96c7.jpg", "图 5  开发板接口特写", 13),
        ("e865462580f2c851dbff6dbcf935161a.jpg", "图 6  硬件整体接线", 12),
        ("066317356e134d5f3c4e0139730ecae2.jpg", "图 7  板端 Dillo 浏览器运行", 11),
        ("f47022f8e6f6bf2633df0160494d1a05.jpg", "图 8  Dillo 访问前端 5173 端口", 11),
        ("32b0344c5681e6406112c3b5cc05f40f.jpg", "图 9  板载触摸屏 Launcher", 10),
        ("72936c357cdca5a1aac8b0fcfbb09b0c.jpg", "图 10  Loongnix 桌面环境", 11),
    ],
}

# ---- 措辞清洗：把对话腔改成书面表达（不改技术事实） ----
POLISH = [
    ("与 AI 助手的多轮开发对话", "与开发辅助工具的多轮迭代记录"),
    ("AI 助手", "开发辅助工具"),
    ("AI助手", "开发辅助工具"),
    ("用户提到", "经讨论确认"),
    ("用户提出", "经讨论提出"),
    ("用户要求", "项目要求"),
    ("用户希望", "项目期望"),
    ("用户想要", "需求为"),
    ("用户反馈", "现场反馈"),
    ("用户在", "现场"),
    ("用户处理了", "团队处理了"),
    ("用户操作", "现场操作"),
    ("用户未", "未"),
    ("用户已", "已"),
    ("老师说", "经指导"),
    ("老师提到", "经指导"),
    ("老师介绍", "经指导介绍"),
    ("老师讲", "经指导讲解"),
    ("我们的项目", "本项目"),
    ("我们项目", "本项目"),
    ("我们在", "本团队在"),
    ("我们将", "本团队将"),
    ("我们把", "将"),
    ("我们", "本团队"),
    ("我在", "笔者在"),
    ("我想", "笔者认为"),
    ("我觉得", "笔者认为"),
    ("我认为", "笔者认为"),
    ("你可以看到", "可见"),
    ("你可以", "可"),
    ("你会发现", "实践表明"),
    ("你看", "可见"),
    ("让我们", "下面"),
    ("对吧", ""),
    ("嘛。", "。"),
    ("呢。", "。"),
    ("啊。", "。"),
    ("：）", ""),
]
def polish(t):
    for a,b in POLISH:
        t = t.replace(a,b)
    return t

def is_sep_line(s, ch='='):
    t=s.strip(); return len(t)>=10 and set(t)=={ch}
def is_table_row(s):
    t=s.strip(); return t.startswith('|') and t.endswith('|') and t.count('|')>=2
def split_md_row(s):
    return [c.strip() for c in s.strip().strip('|').split('|')]
def looks_mono(ln):
    t=ln.strip()
    return (ln.startswith('  ') and t and not t.endswith('。') and not t.endswith('：')
            and any(k in ln for k in ['├','└','│','/','.py','.js','.json','.env','$','cd ','npm ','python ',
                                       'GET ','POST ','PUT ','WS ',':8000',':7861',':5173',':8787',
                                       'http','VITE_','DEEPSEEK','AMAP'])
            and len(t)<80)

def convert(txt_path, out_docx, cover_title, cover_sub, meta, doc_kind):
    lines=open(txt_path,encoding='utf-8').read().splitlines()
    d=new_doc(); header_footer(d, cover_title)
    cover(d, cover_title, cover_sub, meta)

    toc_items=[]
    h1(d, "文档说明", toc_items)
    body(d, "本文档为《智能座舱多模态交互终端》项目技术文档集之一，按源文件结构完整整理，"
            "未删改原文表述。文中配有系统架构示意图、硬件实物照片与软件界面截图（人脸区域已脱敏处理），"
            "便于阅读与答辩展示。")

    # 记录每个 H1 首次出现时配图
    used_imgs=set()
    pending_imgs=CHAPTER_IMG.get(doc_kind, [])[:]

    i=0; n=len(lines); mono_buf=[]
    def flush_mono():
        nonlocal mono_buf
        if mono_buf:
            mono_block(d, mono_buf); mono_buf=[]

    while i<n:
        raw=lines[i]; s=raw.rstrip(); st=s.strip()

        if is_sep_line(s,'='):
            j=i+1
            while j<n and not lines[j].strip(): j+=1
            if j<n:
                nxt=lines[j].strip()
                if nxt.startswith('## ') or nxt.startswith('### '):
                    i=j; continue
                h1(d, nxt, toc_items)
                # 章节标题后配图（均匀分散：每遇到一个 H1 放 1-2 张）
                if pending_imgs:
                    batch=[]
                    # 第一个 H1 放前 2 张，之后每个 H1 放 1 张，最后一个 H1 放剩余
                    if len(toc_items)==1:
                        batch=pending_imgs[:2]; pending_imgs[:2]=pending_imgs[2:]
                    else:
                        batch=pending_imgs[:1]; pending_imgs[:1]=pending_imgs[1:]
                    for f,cap,w in batch:
                        if f not in used_imgs:
                            add_image(d,f,cap,w); used_imgs.add(f)
                i=j+1; continue
            i+=1; continue

        if is_sep_line(s,'-') and len(st)>=8:
            i+=1; continue
        if st.startswith('## '):
            flush_mono(); h2(d, st[3:].strip(), toc_items); i+=1; continue
        if st.startswith('### '):
            flush_mono(); h3(d, st[4:].strip()); i+=1; continue

        if is_table_row(s):
            flush_mono(); tbl=[]
            while i<n and is_table_row(lines[i].strip()):
                row=split_md_row(lines[i])
                if not all(set(c)<=set('-: ') for c in row): tbl.append(row)
                i+=1
            if tbl: md_table(d,tbl)
            continue

        if not st:
            flush_mono(); i+=1; continue
        if st.startswith('· ') or st.startswith('- '):
            flush_mono(); bullet(d, st[2:].strip()); i+=1; continue
        if re.match(r'^\d+[\.\、]', st) or st.startswith('('):
            flush_mono(); bullet(d, st); i+=1; continue
        if looks_mono(raw):
            mono_buf.append(st); i+=1; continue
        else:
            flush_mono()
        body(d, st); i+=1

    flush_mono()
    # 文档末尾补剩余图片
    for f,cap,w in pending_imgs:
        if f not in used_imgs:
            add_image(d,f,cap,w); used_imgs.add(f)

    # 在封面后插入目录：新建文档后重排？简化：把 toc_items 收集后，在保存前我们已经写完正文。
    # 为了简单，目录另起：直接在开头 cover 之后补——但 docx 插入较麻烦。改为最后把 toc_items 记录，
    # 这里先保存，目录页通过单独函数在生成时已写？上面 cover 之后没写 toc。
    # 修正：我们需要在 cover 之后、正文之前写目录。重新组织：
    d.save(out_docx)
    # 把 toc_items 暴露出来供后续插入
    return toc_items

BASE=r"C:\Users\ASUS\Desktop\smart_seat"
jobs=[
    ("智能座舱项目综合总结.txt","智能座舱项目01-项目综合总结.docx","项 目 综 合 总 结",
     "Project Comprehensive Summary","综合总结",
     [("项目全称","基于 LoongArch 端侧 AI 的智能座舱多模态交互终端"),
      ("文档版本","V1.0    2026 年 9 月")]),
    ("智能座舱项目-用户手册.txt","智能座舱项目02-用户手册.docx","用 户 手 册",
     "Smart Cabin Assistant User Manual","用户手册",
     [("适用对象","终端用户 / 演示人员 / 评测人员"),
      ("文档版本","V1.0    2026-09-10")]),
    ("智能座舱项目-功能测试报告.txt","智能座舱项目03-功能测试报告.docx","功 能 测 试 报 告",
     "Functional Test Report","测试报告",
     [("文档编号","SC-TEST-2026-001"),
      ("测试类型","功能 / 接口 / WebSocket / 兼容性"),
      ("测试结论","通过（详见正文）")]),
    ("智能座舱项目-其他相关文档.txt","智能座舱项目04-其他相关文档.docx","其 他 相 关 文 档",
     "Deployment · API · Data Dictionary · O&M","其他相关文档",
     [("涵盖范围","部署 / API / 数据字典 / 硬件 / 术语 / 安全 / 版本 / 排障"),
      ("文档版本","V1.0    2026-09-10")]),
]

# 上面 convert 把目录收集放在内存里，但实际写到正文前。重写：先收集 toc，再写。
# 为了不返工，我们改成两遍：第一遍只收集标题，第二遍正式写。
# 简化：直接在 convert 里，cover 之后立即写一个空目录占位不行。
# 干脆：把 convert 拆成收集+渲染两步。
import sys
def collect_toc(txt_path):
    lines=open(txt_path,encoding='utf-8').read().splitlines()
    items=[]; i=0; n=len(lines)
    while i<n:
        s=lines[i].rstrip(); st=s.strip()
        if is_sep_line(s,'='):
            j=i+1
            while j<n and not lines[j].strip(): j+=1
            if j<n:
                nxt=lines[j].strip()
                if not (nxt.startswith('## ') or nxt.startswith('### ')):
                    items.append((1, polish(nxt))); i=j+1; continue
            i+=1; continue
        if st.startswith('## '): items.append((2, polish(st[3:].strip())))
        i+=1
    return items

def render(txt_path, out_docx, cover_title, cover_sub, meta, doc_kind, toc_items, skip_h2=None):
    skip_h2 = skip_h2 or set()
    lines=open(txt_path,encoding='utf-8').read().splitlines()
    d=new_doc(); header_footer(d, cover_title)
    cover(d, cover_title, cover_sub, meta)
    toc(d, toc_items)

    used_imgs=set(); pending_imgs=CHAPTER_IMG.get(doc_kind,[])[:]
    h1_count=0
    i=0; n=len(lines); mono_buf=[]; list_buf=[]

    def flush_list():
        """把连续列表项合并成一段自然叙述"""
        nonlocal list_buf
        if not list_buf: return
        # 去掉前导序号 "1. " "(1)" 等
        cleaned=[]
        for item in list_buf:
            t = re.sub(r'^\d+[\.\、]\s*', '', item)
            t = re.sub(r'^\(\d+\)\s*', '', t)
            t = re.sub(r'^[·\-•▪]\s*', '', t)
            t = t.strip().rstrip('；;。')
            if t: cleaned.append(t)
        list_buf=[]
        if not cleaned: return
        text = '；'.join(cleaned)
        if text and text[-1] not in '。；;！？.':
            text += '。'
        # 清理双标点
        text = text.replace('；；','；').replace(';;','；')
        text = re.sub(r'。+', '。', text)
        body(d, polish(text))

    def flush_mono():
        nonlocal mono_buf
        if not mono_buf: return
        # 检测是否为多列对齐表（空格分隔、列数一致、3+行）
        rows=[]
        for ln in mono_buf:
            parts = re.split(r'\s{2,}|\t', ln.strip())
            parts = [p.strip() for p in parts if p.strip()]
            if len(parts) >= 2:
                rows.append(parts)
        if len(rows) >= 3 and len({len(r) for r in rows}) == 1:
            md_table(d, rows)
        else:
            mono_block(d, mono_buf)
        mono_buf=[]

    while i<n:
        raw=lines[i]; s=raw.rstrip(); st=s.strip()
        if is_sep_line(s,'='):
            flush_list()
            j=i+1
            while j<n and not lines[j].strip(): j+=1
            if j<n:
                nxt=lines[j].strip()
                if nxt.startswith('## ') or nxt.startswith('### '):
                    i=j; continue
                flush_mono()
                h1(d, polish(nxt), [], first=(h1_count==0))
                h1_count+=1
                if pending_imgs:
                    if h1_count==1:
                        batch=pending_imgs[:2]; pending_imgs[:2]=pending_imgs[2:]
                    else:
                        batch=pending_imgs[:1]; pending_imgs[:1]=pending_imgs[1:]
                    for f,cap,w in batch:
                        if f not in used_imgs:
                            add_image(d,f,cap,w); used_imgs.add(f)
                i=j+1; continue
            i+=1; continue
        if is_sep_line(s,'-') and len(st)>=8:
            i+=1; continue
        if st.startswith('## '):
            flush_list(); flush_mono()
            title=polish(st[3:].strip())
            if title not in skip_h2:
                h2(d, title, [])
            i+=1; continue
        if st.startswith('### '):
            flush_list(); flush_mono(); h3(d, polish(st[4:].strip())); i+=1; continue
        if is_table_row(s):
            flush_list(); flush_mono(); tbl=[]
            while i<n and is_table_row(lines[i].strip()):
                row=split_md_row(lines[i])
                if not all(set(c)<=set('-: ') for c in row): tbl.append([polish(c) for c in row])
                i+=1
            if tbl: md_table(d,tbl)
            continue
        if not st:
            flush_list(); flush_mono(); i+=1; continue
        if st.startswith('· ') or st.startswith('- ') or st.startswith('• ') or st.startswith('▪ '):
            flush_mono();
            for prefix in ['· ','- ','• ','▪ ']:
                if st.startswith(prefix):
                    list_buf.append(st[len(prefix):].strip()); break
            i+=1; continue
        if re.match(r'^\d+[\.\、]', st) or st.startswith('('):
            flush_mono(); list_buf.append(st); i+=1; continue
        if looks_mono(raw):
            flush_list(); mono_buf.append(st); i+=1; continue
        else:
            flush_list(); flush_mono()
        body(d, polish(st)); i+=1
    flush_list(); flush_mono()
    for f,cap,w in pending_imgs:
        if f not in used_imgs:
            add_image(d,f,cap,w); used_imgs.add(f)
    d.save(out_docx)
    print("SAVED", out_docx)

# 孤儿子节合并：某 H1 下只有一个 H2 时，该 H2 标题不单独渲染
def find_orphan_h2(toc_items):
    skip=set()
    i=0
    while i < len(toc_items):
        lvl, txt = toc_items[i]
        if lvl==1:
            # 看后面紧跟几个 lvl2
            j=i+1; cnt=0
            while j<len(toc_items) and toc_items[j][0]==2:
                cnt+=1; j+=1
            if cnt==1:
                skip.add(toc_items[i+1][1])
            i=j
        else:
            i+=1
    return skip

for src, dst, t1, t2, kind, meta in jobs:
    tp=os.path.join(BASE,src); op=os.path.join(OUTDIR,dst)
    toc_items=[(1,"文档说明")]+collect_toc(tp)
    skip=find_orphan_h2(toc_items)
    toc_items=[(lvl,txt) for lvl,txt in toc_items if not (lvl==2 and txt in skip)]
    render(tp, op, t1, t2, meta, kind, toc_items, skip_h2=skip)
