"""
智能座舱相机+表情识别+安全监控 — 完整管线

架构:
  采集线程: 摄像头 → 画标注 → JPEG → MJPEG 流
  识别线程: 取出帧 → MediaPipe 人脸关键点 → ONNX 表情识别 + 安全检测 → 更新缓存

端点:
  GET  /video_feed    MJPEG 视频流（带人脸框+表情+安全标注）
  GET  /api/state     当前状态（表情 + 安全）
  GET  /api/health    健康检查

用法:
  python camera_server.py
  浏览器访问 http://localhost:7861/video_feed 查看视频流
"""
import sys
import os
import time
import math
import threading
import logging
from pathlib import Path

_BASE_DIR = Path(__file__).resolve().parent

import numpy as np

logging.basicConfig(level=logging.INFO, format='%(levelname)s | %(message)s')
logger = logging.getLogger("camera_server")

# ============================================================
# OpenCV — 摄像头 + 级联检测器
# ============================================================
HAS_CV2 = False
_face_cascade = None
_smile_cascade = None
_lefteye_cascade = None
_righteye_cascade = None
_ort_session = None
_ort_labels = None
_ort_input_size = 260

try:
    import cv2
    HAS_CV2 = True
    logger.info(f"OpenCV {cv2.__version__} 已加载")

    # 级联检测器 (用于表情识别的 smile/eye 辅助)
    try:
        import shutil as _shutil
        _cv2_dir = os.path.dirname(cv2.__file__)
        _src_data_dir = os.path.join(_cv2_dir, 'data')
        _dst_dir = os.path.join(os.environ.get('SystemDrive', 'C:') + os.sep, 'cv_cascades')
        os.makedirs(_dst_dir, exist_ok=True)
        _cascades_map = {
            '_face_cascade':    'haarcascade_frontalface_default.xml',
            '_smile_cascade':   'haarcascade_smile.xml',
            '_lefteye_cascade': 'haarcascade_lefteye_2splits.xml',
            '_righteye_cascade':'haarcascade_righteye_2splits.xml',
        }
        for var_name, xml_name in _cascades_map.items():
            src = os.path.join(_src_data_dir, xml_name)
            dst = os.path.join(_dst_dir, xml_name)
            if os.path.exists(src):
                try:
                    _shutil.copyfile(src, dst)
                except Exception:
                    pass
                clf = cv2.CascadeClassifier(dst)
                if not clf.empty():
                    globals()[var_name] = clf
        if _face_cascade is not None and not _face_cascade.empty():
            logger.info(f"OpenCV 级联检测器就绪 (从 {_dst_dir} 加载)")
        else:
            _face_cascade = None
    except Exception as e:
        logger.warning(f"级联检测器不可用: {e}")

    # ONNX 深度学习表情识别模型
    _model_path = _BASE_DIR / "models" / "enet_b2_7.onnx"
    if _model_path.exists():
        try:
            import onnxruntime as _ort
            _ort_session = _ort.InferenceSession(str(_model_path), providers=['CPUExecutionProvider'])
            _ort_labels = {0: 'angry', 1: 'disgusted', 2: 'fearful', 3: 'happy', 4: 'neutral', 5: 'sad', 6: 'surprised'}
            logger.info(f"ONNX 表情模型已加载: enet_b2_7 (260x260, 7类)")
        except Exception as e:
            logger.warning(f"ONNX 模型加载失败: {e}")
    else:
        logger.info("ONNX 模型未找到，使用启发式表情识别")
except ImportError:
    HAS_CV2 = False
    logger.warning("OpenCV 未安装")

# ============================================================
# MediaPipe 人脸关键点 (468点)
# ============================================================
HAS_MEDIAPIPE = False
_mp_face_landmarker = None

try:
    import mediapipe as mp
    from mediapipe.tasks.python import vision
    from mediapipe.tasks.python.vision import FaceLandmarker, FaceLandmarkerOptions, RunningMode
    from mediapipe.tasks.python import BaseOptions

    _landmarker_path = _BASE_DIR / "models" / "face_landmarker.task"
    if _landmarker_path.exists():
        _options = FaceLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=str(_landmarker_path)),
            running_mode=RunningMode.VIDEO,
            num_faces=1,
            min_face_detection_confidence=0.5,
            min_tracking_confidence=0.5,
            output_face_blendshapes=False,
        )
        _mp_face_landmarker = FaceLandmarker.create_from_options(_options)
        HAS_MEDIAPIPE = True
        logger.info(f"MediaPipe FaceLandmarker 就绪 (Tasks API)")
    else:
        logger.info("face_landmarker.task 未找到")
except ImportError:
    logger.info("MediaPipe 未安装")
except Exception as e:
    logger.warning(f"MediaPipe 初始化失败: {e}")

# ============================================================
# 共享状态（线程安全）
# ============================================================
# 7类表情（纯表情识别，无疲劳）
EMOTION_COLORS = {
    "happy": (0, 255, 128), "sad": (255, 128, 64), "angry": (0, 0, 255),
    "surprised": (0, 255, 255), "fearful": (128, 0, 128),
    "neutral": (180, 180, 180), "disgusted": (0, 128, 64),
}
EMOTION_ZH = {
    "happy": "开心", "sad": "悲伤", "angry": "愤怒",
    "surprised": "惊讶", "fearful": "恐惧", "neutral": "平静",
    "disgusted": "厌恶",
}

_latest_frame = None          # 最新帧 (JPEG bytes)
_latest_frame_safety = None   # 安全模式帧 (复用 _latest_frame)
_latest_emotion = "neutral"
_latest_confidence = 0.0
_latest_frame_id = 0           # 帧ID，video_feed 据此跳过重复帧
_lock = threading.Lock()

_cache_lock = threading.Lock()
_cached_emotion = "neutral"
_cached_conf = 0.0
_cached_box = None            # (x, y, fw, fh)
_cached_landmarks = None      # MediaPipe landmarks

_pending_lock = threading.Lock()
_pending_frame = None

# ===== 疲劳检测 v6：事件驱动（哈欠→轻度，闭眼→中/重度）=====
# 评分仅作参考值，告警等级由检测到的事件直接决定

_cached_safety = {
    "perclos": 0.0, "yawn_count": 0, "gaze": "forward",
    "fatigue_score": 0.0, "alert_level": "normal", "eye_closed": False,
    "blink_rate": 0.0, "avg_blink_dur": 0.0,
    "head_drop": False, "raw_score": 0.0,
}
_safety_lock = threading.Lock()

# --- 检测阈值 ---
_EAR_THRESHOLD = 0.20              # 眼睛闭合 EAR 阈值
_MAR_YAWN_THRESHOLD = 0.6          # 哈欠 MAR 阈值

# --- 事件→告警映射 ---
_EYE_CLOSED_WARNING_DUR = 2.0      # 持续闭眼 >2s → high（中度疲劳）
_EYE_CLOSED_CRITICAL_DUR = 4.0     # 持续闭眼 >4s → critical（重度疲劳）

# --- 告警冷却 ---
_ALERT_HOLD_TIME = 3.0             # 告警最少保持时间（前端轮询是1.2s，3s足够读到）
_YAWN_COOLDOWN = 30.0              # 两次哈欠告警最短间隔
_EYE_COOLDOWN = 15.0               # 两次闭眼告警最短间隔

_was_eye_closed = False
_eye_close_start_ts = 0.0
_was_yawning = False
_last_yawn_alert_ts = 0.0
_last_eye_alert_ts = 0.0
_alert_start_ts = 0.0
_alert_cause = None                 # "yawn" | "eye" | None — 当前告警原因
_driving_minutes = 0.0

# ============================================================
# ONNX 表情识别
# ============================================================
def _onnx_predict_emotion(face_rgb):
    if _ort_session is None:
        return "neutral", 0.0
    img = cv2.resize(face_rgb, (_ort_input_size, _ort_input_size)) / 255.0
    img[..., 0] = (img[..., 0] - 0.485) / 0.229
    img[..., 1] = (img[..., 1] - 0.456) / 0.224
    img[..., 2] = (img[..., 2] - 0.406) / 0.225
    x = img.transpose(2, 0, 1).astype('float32')[np.newaxis, ...]
    scores = _ort_session.run(None, {'input': x})[0][0]
    e_x = np.exp(scores - np.max(scores))
    probs = e_x / e_x.sum()
    pred = int(np.argmax(probs))
    return _ort_labels[pred], float(probs[pred])

def _extract_face_features(face_img_rgb):
    """提取面部特征向量（级联检测器特征）"""
    gray = cv2.cvtColor(face_img_rgb, cv2.COLOR_RGB2GRAY)
    h, w = gray.shape
    mouth_roi = gray[2*h//3:, w//6:5*w//6]
    _, mt = cv2.threshold(mouth_roi, 70, 255, cv2.THRESH_BINARY_INV)
    dark_ratio = float(np.sum(mt == 255) / max(mt.size, 1))
    mouth_contrast = float(mouth_roi.std())
    left = gray[2*h//3:, :w//3]
    right = gray[2*h//3:, 2*w//3:]
    mouth_asym = abs(float(left.std()) - float(right.std()))
    glabella = gray[h//8:3*h//8, w//3:2*w//3]
    sobel_x = cv2.Sobel(glabella, cv2.CV_64F, 1, 0, ksize=3)
    sobel_y = cv2.Sobel(glabella, cv2.CV_64F, 0, 1, ksize=3)
    vertical = np.abs(sobel_x) - np.abs(sobel_y) * 0.5
    brow = float(np.sum(vertical > 40) / max(vertical.size, 1))
    eye_area = 0.0
    if _lefteye_cascade is not None and _righteye_cascade is not None:
        try:
            upper_face = gray[:h//2, :]
            le = _lefteye_cascade.detectMultiScale(upper_face, 1.1, 3, minSize=(15, 10))
            re = _righteye_cascade.detectMultiScale(upper_face, 1.1, 3, minSize=(15, 10))
            if len(le) > 0 and len(re) > 0:
                le_area = max(e[2]*e[3] for e in le)
                re_area = max(e[2]*e[3] for e in re)
                eye_area = float((le_area + re_area) / 2) / (w * h)
        except Exception:
            eye_area = 0.0
    fmean = float(gray.mean())
    fstd = float(gray.std())
    return dark_ratio, mouth_asym, mouth_contrast, brow, fmean, fstd, eye_area

# 基线校准
_baseline = None
_baseline_count = 0
_BASELINE_FRAMES = 60

def detect_emotion_from_landmarks(face_img_rgb, frame_w, frame_h):
    """基于个人基线的启发式表情识别（ONNX 优先）"""
    global _baseline, _baseline_count

    # ONNX 优先
    if _ort_session is not None:
        raw_emotion, raw_conf = _onnx_predict_emotion(face_img_rgb)
        return raw_emotion, raw_conf

    dark, asym, mcon, brow, fmean, fstd, eye_area = _extract_face_features(face_img_rgb)

    if _baseline_count < _BASELINE_FRAMES:
        if _baseline is None:
            _baseline = (dark, asym, mcon, brow, fmean, fstd, eye_area)
        else:
            w = _baseline_count / (_baseline_count + 1)
            _baseline = tuple(_baseline[i] * w + v * (1-w) for i, v in enumerate((dark, asym, mcon, brow, fmean, fstd, eye_area)))
        _baseline_count += 1
        if _baseline_count == _BASELINE_FRAMES:
            logger.info(f"启发式基线建立完成 ({_BASELINE_FRAMES}帧)")
        return "neutral", 0.5

    bdark, basym, bmcon, bbrow, bmean, bstd, beye = _baseline
    dark_delta = dark - bdark
    asym_delta = asym - basym
    brow_delta = brow - bbrow
    eye_delta = eye_area - beye
    fmean_delta = fmean - bmean

    h, w = face_img_rgb.shape[:2]
    eyes_wide = eye_delta > 0.002
    eyes_narrow = eye_delta < -0.001
    mouth_open = dark_delta > 0.008
    mouth_slight = dark_delta > 0.003
    brow_furrowed = brow_delta > 0.008
    face_dark = fmean_delta < -8

    if _smile_cascade is not None:
        try:
            gray_lower = cv2.cvtColor(face_img_rgb[h//2:, :], cv2.COLOR_RGB2GRAY)
            for sf, mn in [(1.3, 15), (1.5, 10), (1.8, 8)]:
                smiles = _smile_cascade.detectMultiScale(gray_lower, sf, mn, minSize=(20, 15), maxSize=(w//2, h//3))
                if len(smiles) > 0:
                    return "happy", 0.8
        except Exception:
            pass

    if mouth_open and eyes_wide and not brow_furrowed:
        return "surprised", min(0.9, 0.4 + dark_delta * 30 + eye_delta * 40)
    if eyes_wide and mouth_slight and not mouth_open:
        return "fearful", min(0.75, 0.3 + eye_delta * 50)
    if brow_furrowed and not eyes_wide and not mouth_open:
        return "angry", min(0.8, 0.3 + brow_delta * 15)
    if face_dark and eyes_narrow and not mouth_open:
        return "sad", min(0.7, 0.3 + abs(fmean_delta) * 0.02)
    return "neutral", 0.5


# ============================================================
# MediaPipe 表情识别 (468关键点)
# ============================================================
def _detect_emotion_mediapipe(face_img_rgb, face_landmarks):
    """基于 MediaPipe 468 关键点的表情识别（7类）"""
    h, w = face_img_rgb.shape[:2]

    def pt(idx):
        return np.array([face_landmarks[idx].x * w, face_landmarks[idx].y * h])

    lip_top = pt(13)
    lip_bottom = pt(14)
    lip_left = pt(61)
    lip_right = pt(291)
    mouth_open = np.linalg.norm(lip_top - lip_bottom)
    mouth_width = np.linalg.norm(lip_left - lip_right)
    mar = mouth_open / (mouth_width + 1e-6)
    lip_center_y = (lip_left[1] + lip_right[1]) / 2
    mouth_mid_y = (lip_top[1] + lip_bottom[1]) / 2
    corner_up = mouth_mid_y - lip_center_y

    brow_left_in = pt(55)
    brow_right_in = pt(285)
    eye_left_top = pt(159)
    eye_right_top = pt(386)
    brow_height = ((brow_left_in[1] + brow_right_in[1]) / 2 -
                   (eye_left_top[1] + eye_right_top[1]) / 2)
    brow_height_norm = brow_height / h

    if mar > 0.55 and brow_height_norm > 0.03:
        return "surprised", min(0.9, mar * 1.2)
    if mar > 0.45:
        return "surprised", min(0.85, mar * 1.0)
    if corner_up > 3.0 and mar > 0.1:
        return "happy", min(0.85, 0.4 + corner_up * 0.05)
    if brow_height_norm < 0.005 and mar < 0.15 and corner_up < 0:
        return "angry", min(0.8, 0.5 - brow_height_norm * 10)
    if corner_up < -2.0 and mar < 0.2:
        return "sad", min(0.75, 0.4 + abs(corner_up) * 0.04)
    if brow_height_norm > 0.04 and mar < 0.2:
        return "fearful", 0.55
    return "neutral", 0.6


# ============================================================
# 安全监控 (疲劳/哈欠/分心 — 纯检测，不覆写表情)
# ============================================================
def _compute_ear(landmarks, w, h):
    """眼部长宽比 Eye Aspect Ratio — 判断眼睛闭合"""
    def pt(idx):
        lm = landmarks[idx]
        return np.array([lm.x * w, lm.y * h])
    def _ear(i1, i2, i3, i4):
        eye = [pt(i1), pt(i2), pt(i3), pt(i4)]
        v = np.linalg.norm(eye[2] - eye[3])
        d = np.linalg.norm(eye[0] - eye[1])
        return float(v / d) if d > 1e-6 else 0.0
    return (_ear(33, 133, 159, 145) + _ear(362, 263, 387, 373)) / 2

def _compute_mar(landmarks, w, h):
    """嘴部长宽比 Mouth Aspect Ratio — 判断哈欠"""
    def pt(idx):
        lm = landmarks[idx]
        return np.array([lm.x * w, lm.y * h])
    top = pt(13); bottom = pt(14); left = pt(61); right = pt(291)
    width = np.linalg.norm(left - right)
    if width < 1e-6: return 0.0
    return float(np.linalg.norm(top - bottom) / width)

def _detect_gaze(landmarks, w, h):
    """视线方向检测 — 三态分类
    返回 (gaze_label, is_fatigue_gaze)
      is_fatigue_gaze=False → 正常驾驶视线（forward/dashboard/left_mirror/right_mirror/rearview）
      is_fatigue_gaze=True  → 疲劳相关视线（down/left/right/up）
    """
    nose = landmarks[1]
    chin = landmarks[152]
    nose_x = nose.x * w; nose_y = nose.y * h; chin_y = chin.y * h
    # 头部俯仰角判断：低头（下巴-鼻子距离过短）
    head_down = (chin_y - nose_y) / h < 0.35
    nose_offset = (nose_x - w/2) / w
    if head_down:
        return "down", True
    # 大幅偏头 → 看窗外（疲劳相关）
    if nose_offset > 0.32:
        return "right", True
    if nose_offset < -0.32:
        return "left", True
    # 小幅偏头 → 看后视镜（正常驾驶）
    if 0.12 < nose_offset <= 0.32:
        return "right_mirror", False
    if -0.32 <= nose_offset < -0.12:
        return "left_mirror", False
    # 微低头看仪表盘（正常驾驶）— 用鼻子 Y 坐标辅助判断
    if nose_y / h > 0.52:
        return "dashboard", False
    return "forward", False

def _run_safety_check(landmarks, w, h, driving_minutes=0.0):
    """v6 事件驱动疲劳检测：哈欠→轻度提醒，闭眼→中/重度告警。
    评分仅作参考值，告警由检测到的事件直接决定，不经过任何评分管线。"""
    global _was_eye_closed, _eye_close_start_ts, _was_yawning
    global _last_yawn_alert_ts, _last_eye_alert_ts, _alert_start_ts, _alert_cause

    now = time.time()

    # ===== 1. 眼睛闭合检测 =====
    ear = _compute_ear(landmarks, w, h)
    is_eye_closed = ear < _EAR_THRESHOLD

    if is_eye_closed and not _was_eye_closed:
        _eye_close_start_ts = now
    elif not is_eye_closed:
        _eye_close_start_ts = 0.0
    _was_eye_closed = is_eye_closed

    closure_dur = (now - _eye_close_start_ts) if _eye_close_start_ts > 0 else 0.0

    # ===== 2. 哈欠检测 =====
    mar = _compute_mar(landmarks, w, h)
    is_yawning = mar > _MAR_YAWN_THRESHOLD

    # ===== 3. 事件判定告警等级 =====
    new_alert = None  # 本轮检测到的新事件类型

    # 闭眼等级：按持续时间分层
    if closure_dur >= _EYE_CLOSED_CRITICAL_DUR:
        new_alert = "critical"
    elif closure_dur >= _EYE_CLOSED_WARNING_DUR:
        new_alert = "high"
    # 哈欠：从无到有的瞬间触发
    elif is_yawning and not _was_yawning:
        if now - _last_yawn_alert_ts >= _YAWN_COOLDOWN:
            new_alert = "warning"
    _was_yawning = is_yawning

    # ===== 4. 告警状态机 =====
    alert_level = _cached_safety.get("alert_level", "normal")

    if new_alert:
        # 闭眼事件的冷却检查
        if new_alert in ("high", "critical"):
            if now - _last_eye_alert_ts >= _EYE_COOLDOWN:
                alert_level = new_alert
                _alert_start_ts = now
                _alert_cause = "eye"
                _last_eye_alert_ts = now
        elif new_alert == "warning":
            alert_level = new_alert
            _alert_start_ts = now
            _alert_cause = "yawn"
            _last_yawn_alert_ts = now
    elif _alert_cause:
        # 没有新事件 → 检查当前告警是否应该解除
        if _alert_cause == "eye" and closure_dur < _EYE_CLOSED_WARNING_DUR:
            # 眼睛已睁开 + 超过最短保持时间 → 解除
            if now - _alert_start_ts >= _ALERT_HOLD_TIME:
                alert_level = "normal"
                _alert_cause = None
        elif _alert_cause == "yawn" and now - _alert_start_ts >= _ALERT_HOLD_TIME:
            alert_level = "normal"
            _alert_cause = None

    # ===== 5. 参考评分（仅展示用）=====
    fatigue_score = min(100.0, closure_dur * 25.0)  # 4s闭眼=100分

    # ===== 6. 视线（展示用）=====
    gaze, _ = _detect_gaze(landmarks, w, h)

    # ===== 7. 更新缓存 =====
    with _safety_lock:
        old_level = _cached_safety.get("alert_level", "normal")
        if alert_level != old_level:
            if alert_level != "normal":
                _cached_safety["alert_message"] = {
                    "warning": "您打哈欠了，请注意休息。",
                    "high": "检测到长时间闭眼，请集中注意力！",
                    "critical": "危险！请立即停车休息！",
                }.get(alert_level, "")
            else:
                _cached_safety["alert_message"] = ""

        _cached_safety.update({
            "perclos": round(closure_dur / 60.0, 3),
            "yawn_count": 1 if is_yawning else 0,
            "gaze": gaze,
            "eye_closed": is_eye_closed,
            "fatigue_score": round(fatigue_score, 1),
            "alert_level": alert_level,
            "blink_rate": 0,
            "avg_blink_dur": 0.0,
            "head_drop": False,
            "raw_score": round(fatigue_score, 1),
            "distraction_dur": 0.0,
            "is_fatigue_gaze": False,
            "driving_minutes": driving_minutes,
        })


# ============================================================
# 后台线程
# ============================================================
_video_cap = None
_video_running = False

_DETECT_EVERY_N = 3  # 每 N 帧做一次检测（表情 + 安全）

def _detector_loop():
    """识别线程：异步表情检测"""
    global _cached_emotion, _cached_conf, _cached_box, _cached_landmarks, _pending_frame
    import mediapipe as mp

    _no_face_count = 0  # 连续无人脸帧计数

    while _video_running:
        with _pending_lock:
            frame = _pending_frame
            _pending_frame = None
        if frame is None:
            time.sleep(0.01)
            continue

        h, w = frame.shape[:2]

        try:
            if HAS_MEDIAPIPE and _mp_face_landmarker is not None:
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
                ts = int(time.time() * 1000)
                result = _mp_face_landmarker.detect_for_video(mp_img, ts)

                face_detected = False
                if result and result.face_landmarks:
                    lm = result.face_landmarks[0]
                    xs = [p.x * w for p in lm]
                    ys = [p.y * h for p in lm]
                    face_w = int(max(xs) - min(xs))
                    face_h = int(max(ys) - min(ys))
                    # 过滤太小的误检人脸（至少 60x80 像素）
                    if face_w >= 60 and face_h >= 80:
                        face_detected = True
                        new_box = (int(min(xs)) - 10, int(min(ys)) - 10,
                                   face_w + 20, face_h + 20)
                        new_box = (max(0, new_box[0]), max(0, new_box[1]),
                                   min(w - new_box[0], new_box[2]), min(h - new_box[1], new_box[3]))
                        with _cache_lock:
                            _cached_landmarks = lm
                            _cached_box = new_box

                        # 安全检测（疲劳/哈欠/分心）— 传入驾驶时长参与评分
                        _run_safety_check(lm, w, h, driving_minutes=_driving_minutes)

                        # 表情识别
                        new_emo, new_conf = None, 0.0
                        with _cache_lock:
                            box = _cached_box
                        if box is not None:
                            x, y, fw, fh = box
                            face_crop = frame[max(0,y):min(h,y+fh), max(0,x):min(w,x+fw)]
                            if face_crop.size > 0:
                                new_emo, new_conf = detect_emotion_from_landmarks(
                                    cv2.cvtColor(face_crop, cv2.COLOR_BGR2RGB), fw, fh)
                        if new_emo is None:
                            new_emo, new_conf = _detect_emotion_mediapipe(rgb, lm)
                        if new_emo is not None:
                            with _cache_lock:
                                _cached_emotion = new_emo
                                _cached_conf = new_conf

                # 无人脸（或人脸太小）→ 连续 N 帧后重置
                if face_detected:
                    _no_face_count = 0
                else:
                    _no_face_count += 1
                    if _no_face_count >= 8:
                        with _safety_lock:
                            _cached_safety.update({
                                "perclos": 0.0, "yawn_count": 0, "gaze": "forward",
                                "distraction_dur": 0.0, "eye_closed": False,
                                "fatigue_score": 0.0, "alert_level": "normal",
                                "alert_message": "",
                                "blink_rate": 0.0, "avg_blink_dur": 0.0,
                                "head_drop": False, "raw_score": 0.0,
                                "is_fatigue_gaze": False,
                            })
                            _cached_safety["_prev_level"] = "normal"
                        global _was_eye_closed, _eye_close_start_ts, _was_yawning, _alert_cause
                        _was_eye_closed = False
                        _eye_close_start_ts = 0.0
                        _was_yawning = False
                        _alert_cause = None
            else:
                # Haar Cascade 降级路径
                if _face_cascade is not None:
                    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                    gray = cv2.equalizeHist(gray)
                    faces = _face_cascade.detectMultiScale(gray, 1.1, 5, minSize=(48, 48))
                    if len(faces) > 0:
                        x, y, fw, fh = max(faces, key=lambda f: f[2]*f[3])
                        face_img = frame[y:y+fh, x:x+fw]
                        new_emo, new_conf = detect_emotion_from_landmarks(
                            cv2.cvtColor(face_img, cv2.COLOR_BGR2RGB), fw, fh)
                        with _cache_lock:
                            _cached_emotion = new_emo
                            _cached_conf = new_conf
                            _cached_box = (x, y, fw, fh)
        except Exception as e:
            logger.warning(f"识别线程异常: {e}")


def _gen_placeholder_frame(msg="摄像头未连接"):
    """生成占位帧，避免前端完全黑屏"""
    global _latest_frame, _latest_frame_safety, _latest_frame_id
    img = np.zeros((360, 480, 3), dtype=np.uint8)
    # 深蓝背景
    img[:] = (30, 30, 50)
    cv2.putText(img, msg, (80, 170), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (100, 100, 200), 2)
    cv2.putText(img, "Camera Offline", (120, 210), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (80, 80, 120), 1)
    _, jpeg = cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 70])
    jpeg_bytes = jpeg.tobytes()
    with _lock:
        _latest_frame = jpeg_bytes
        _latest_frame_safety = jpeg_bytes
        _latest_frame_id += 1
    logger.info(f"已生成占位帧: {msg}")


def _open_camera():
    """尝试打开摄像头，返回可用的 cap 对象"""
    backends = [
        ("MSMF", cv2.CAP_MSMF),
        ("DirectShow", cv2.CAP_DSHOW),
        ("默认", None),
    ]
    for backend_name, backend_flag in backends:
        try:
            if backend_flag is not None:
                cap = cv2.VideoCapture(0, backend_flag)
            else:
                cap = cv2.VideoCapture(0)
            if cap.isOpened():
                time.sleep(0.5)  # 给摄像头更多预热时间
                bright_ok = False
                for i in range(10):
                    ret, test_frame = cap.read()
                    if ret and test_frame is not None and test_frame.size > 0:
                        mean_val = test_frame.mean()
                        logger.info(f"  {backend_name} 帧{i+1}: 亮度={mean_val:.1f}")
                        if mean_val > 15:
                            bright_ok = True
                            break
                    time.sleep(0.1)
                if bright_ok:
                    logger.info(f"摄像头已连接 (后端: {backend_name})")
                    return cap
                else:
                    logger.warning(f"{backend_name} 后端可打开但帧过暗，尝试下一个后端...")
                    cap.release()
            else:
                logger.warning(f"{backend_name} 后端无法打开摄像头")
        except Exception as e:
            logger.warning(f"{backend_name} 后端异常: {e}")
    return None


def _capture_loop():
    """采集线程：持续捕获摄像头 → 画标注 → 出 JPEG"""
    global _video_cap, _video_running, _latest_frame, _latest_emotion, _latest_confidence, _pending_frame, _latest_frame_id

    logger.info("正在连接摄像头...")
    cap = _open_camera()

    if cap is None or not cap.isOpened():
        logger.error("所有后端均无法获取有效摄像头画面")
        _video_running = False
        _gen_placeholder_frame("摄像头未连接")
        return

    # 记住初始分辨率（亮度检查通过的分辨率）
    orig_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    orig_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    logger.info(f"摄像头默认分辨率: {orig_w}x{orig_h}")

    # 尝试降低分辨率以提升性能，但验证不会导致黑屏
    target_w, target_h = 480, 360
    if orig_w > target_w:
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, target_w)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, target_h)
        time.sleep(0.2)
        # 验证：降低分辨率后帧是否仍然有效
        ret, test = cap.read()
        if not ret or test is None or test.mean() < 15:
            logger.warning(f"降低分辨率到 {target_w}x{target_h} 后帧无效，恢复默认分辨率")
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, orig_w)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, orig_h)
            time.sleep(0.2)
        else:
            logger.info(f"分辨率已调整为 {target_w}x{target_h}")

    cap.set(cv2.CAP_PROP_FPS, 20)
    final_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    final_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    logger.info(f"摄像头最终分辨率: {final_w}x{final_h}")

    _video_cap = cap
    _video_running = True

    _frame_counter = 0
    _fail_count = 0       # 连续失败计数
    _MAX_FAILS = 30       # 连续失败超过此值则重连

    # 启动识别线程
    _detector_thread = threading.Thread(target=_detector_loop, daemon=True)
    _detector_thread.start()
    logger.info("异步识别线程已启动")

    while _video_running:
        ret, frame = cap.read()
        if not ret or frame is None:
            _fail_count += 1
            if _fail_count >= _MAX_FAILS:
                logger.warning(f"连续 {_fail_count} 帧读取失败，尝试重连摄像头...")
                cap.release()
                time.sleep(1)
                cap = _open_camera()
                if cap is None or not cap.isOpened():
                    logger.error("重连失败，生成占位帧")
                    _gen_placeholder_frame("摄像头重连失败")
                    _video_running = False
                    return
                _video_cap = cap
                _fail_count = 0
                logger.info("摄像头重连成功")
            else:
                time.sleep(0.05)
            continue

        # 检查帧是否全黑
        if frame.mean() < 5:
            _fail_count += 1
            if _fail_count >= _MAX_FAILS:
                logger.warning(f"连续 {_fail_count} 帧全黑，尝试重连摄像头...")
                cap.release()
                time.sleep(1)
                cap = _open_camera()
                if cap is None or not cap.isOpened():
                    logger.error("重连失败，生成占位帧")
                    _gen_placeholder_frame("摄像头画面全黑")
                    _video_running = False
                    return
                _video_cap = cap
                _fail_count = 0
                logger.info("摄像头重连成功")
            else:
                time.sleep(0.05)
            continue

        _fail_count = 0
        frame = cv2.flip(frame, 1)
        h, w = frame.shape[:2]
        _frame_counter += 1

        # 每 N 帧提交一次检测任务
        if _frame_counter % _DETECT_EVERY_N == 0:
            with _pending_lock:
                _pending_frame = frame.copy()

        # 画标注 — 读取 _detector_loop 写入的全局 _cached_*
        with _cache_lock:
            box = _cached_box
            emo = _cached_emotion
            cnf = _cached_conf

        # 读取安全监控数据
        with _safety_lock:
            safety = dict(_cached_safety)

        # --- 安全标注（两个模式都展示）---
        def _draw_safety_overlay(img):
            alert_level = safety.get('alert_level', 'normal')
            alert_color_map = {
                'normal': (0, 255, 128), 'warning': (0, 165, 255),
                'high': (0, 128, 255), 'critical': (0, 0, 255),
            }
            s_color = alert_color_map.get(alert_level, (180, 180, 180))
            s_font = cv2.FONT_HERSHEY_SIMPLEX
            s_scale = 0.4; s_thick = 1
            h_img, w_img = img.shape[:2]
            lines = [
                f"Fatigue: {safety.get('fatigue_score', 0):.0f}  {alert_level}",
                f"PERCLOS: {safety.get('perclos', 0):.2f}  Gaze: {safety.get('gaze', 'fwd')}",
                f"Yawns: {safety.get('yawn_count', 0)}  Dist: {safety.get('distraction_dur', 0):.1f}s",
            ]
            for i, line in enumerate(lines):
                (tw2, th2), _ = cv2.getTextSize(line, s_font, s_scale, s_thick)
                cv2.rectangle(img, (w_img - tw2 - 12, 4 + i * 15),
                              (w_img - 2, 4 + (i + 1) * 15 + 1), (0, 0, 0), -1)
                cv2.putText(img, line, (w_img - tw2 - 8, 15 + i * 15),
                            s_font, s_scale, s_color, s_thick)

        # 安全模式帧：仅安全标注 + 人脸框（无表情标签）
        safety_frame = frame.copy()
        if box is not None:
            x, y, fw, fh = box
            cv2.rectangle(safety_frame, (x, y), (x+fw, y+fh), (0, 255, 128), 2)
        else:
            cv2.putText(safety_frame, "Camera OK - 等待人脸",
                        (8, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 1)
        _draw_safety_overlay(safety_frame)

        # 表情模式帧：人脸框 + 表情标签 + 安全标注
        # 优化：复用 safety_frame 作为基础，避免额外复制
        emotion_frame = safety_frame.copy()
        if box is not None:
            x, y, fw, fh = box
            color = EMOTION_COLORS.get(emo, (180, 180, 180))
            label = f"{EMOTION_ZH.get(emo, emo)} ({cnf:.0%})"
            cv2.rectangle(emotion_frame, (x, y), (x+fw, y+fh), color, 2)
            font = cv2.FONT_HERSHEY_SIMPLEX
            scale = 0.7; thick = 2
            (tw, th), _ = cv2.getTextSize(label, font, scale, thick)
            cv2.rectangle(emotion_frame, (x-2, y-th-12), (x+tw+8, y+3), color, -1)
            text_color = (0, 0, 0) if sum(color) > 400 else (255, 255, 255)
            cv2.putText(emotion_frame, label, (x+3, y-3), font, scale, text_color, thick)
        else:
            cv2.putText(emotion_frame, "Camera OK - 等待人脸",
                        (8, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 1)
        _draw_safety_overlay(emotion_frame)

        # 性能优化：只编码一次 JPEG（之前编码两次，浪费 5-10ms/帧）
        _, jpeg = cv2.imencode('.jpg', emotion_frame, [cv2.IMWRITE_JPEG_QUALITY, 60])
        jpeg_bytes = jpeg.tobytes()
        with _lock:
            _latest_frame = jpeg_bytes
            _latest_frame_safety = jpeg_bytes  # 复用同一帧
            _latest_emotion = _cached_emotion
            _latest_confidence = _cached_conf
            _latest_frame_id += 1

    cap.release()
    logger.info("摄像头已释放")


# ============================================================
# Flask 应用
# ============================================================
from flask import Flask, Response, request, jsonify

flask_app = Flask(__name__)

# CORS — 允许前端跨域访问
@flask_app.after_request
def _add_cors(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = '*'
    response.headers['Access-Control-Allow-Methods'] = '*'
    return response

_thread_started = False


def start_camera():
    global _thread_started
    if _thread_started:
        return
    _thread_started = True
    threading.Thread(target=_capture_loop, daemon=True).start()
    logger.info("相机采集线程已启动")


@flask_app.route('/video_feed')
def video_feed():
    """MJPEG 视频流
    ?mode=emotion (默认) — 人脸框 + 表情标签 + 安全标注
    ?mode=safety — 仅人脸框 + 安全标注（无表情标签）
    """
    mode = request.args.get('mode', 'emotion')
    start_camera()
    def generate():
        last_id = -1
        while True:
            with _lock:
                fid = _latest_frame_id
                frame = _latest_frame_safety if mode == 'safety' else _latest_frame
            if frame is None:
                time.sleep(0.02)
                continue
            if fid == last_id:
                time.sleep(0.01)  # 帧未更新，短等待后重试
                continue
            last_id = fid
            yield (b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')
    return Response(generate(), mimetype='multipart/x-mixed-replace; boundary=frame')


@flask_app.route('/api/state')
def api_state():
    """当前状态：表情 + 安全监控数据"""
    with _lock:
        emo = _latest_emotion
        conf = _latest_confidence
    with _safety_lock:
        safety = dict(_cached_safety)
        # 清理内部字段，不暴露给前端
        safety.pop('_prev_level', None)
    return jsonify({
        'emotion': emo,
        'emotion_zh': EMOTION_ZH.get(emo, '未知'),
        'confidence': round(conf, 2),
        'safety': {
            'perclos': round(safety.get('perclos', 0), 3),
            'yawn_count': safety.get('yawn_count', 0),
            'gaze': safety.get('gaze', 'forward'),
            'distraction_dur': round(safety.get('distraction_dur', 0), 1),
            'eye_closed': safety.get('eye_closed', False),
            'fatigue_score': round(safety.get('fatigue_score', 0), 1),
            'alert_level': safety.get('alert_level', 'normal'),
            'alert_message': safety.get('alert_message', ''),
        },
    })


@flask_app.route('/api/health')
def api_health():
    return jsonify({'status': 'ok', 'cv2': HAS_CV2, 'mediapipe': HAS_MEDIAPIPE, 'onnx': _ort_session is not None})


@flask_app.route('/api/v1/safety/driving_minutes', methods=['POST'])
def api_set_driving_minutes():
    """前端推送当前驾驶时长（分钟），后端参与疲劳评分（v2 权重 10%）
    Body: {"driving_minutes": 135.5}
    """
    global _driving_minutes
    try:
        data = request.get_json(silent=True) or {}
        val = float(data.get('driving_minutes', 0))
        if val < 0: val = 0
        _driving_minutes = val
        return jsonify({'status': 'ok', 'driving_minutes': _driving_minutes})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 400


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=7861)
    parser.add_argument('--host', default='0.0.0.0')
    args = parser.parse_args()

    logger.info(f"相机+表情识别服务启动: http://{args.host}:{args.port}")
    logger.info(f"  视频流: http://localhost:{args.port}/video_feed")
    logger.info(f"  状态:   http://localhost:{args.port}/api/state")
    start_camera()
    flask_app.run(host=args.host, port=args.port, debug=False, threaded=True)
