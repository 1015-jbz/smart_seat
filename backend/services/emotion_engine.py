"""
表情识别引擎 — 基于 ONNX EfficientNet-B2 + OpenCV YuNet / MediaPipe

照搬 smart_cockpit 的识别方案：
  人脸检测: OpenCV FaceDetectorYN (YuNet, 主) / MediaPipe (备选)
  表情分类: ONNX EfficientNet-B2 (enet_b2_7, 7 类)
  输入尺寸: 260×260 (EfficientNet-B2)

7 类情绪: Anger, Disgust, Fear, Happiness, Neutral, Sadness, Surprise

线程安全：全局单例，初始化后可多线程并发调用 predict()
"""
import os
import time
import threading
import logging
from pathlib import Path
from typing import Tuple, Optional, Dict

import cv2
import numpy as np

logger = logging.getLogger(__name__)

# ======================================================================
# 标签映射（ONNX 输出 → 中文 → emoji）
# ======================================================================
IDX_TO_CLASS_EN = {
    0: "Anger", 1: "Disgust", 2: "Fear", 3: "Happiness",
    4: "Neutral", 5: "Sadness", 6: "Surprise",
}

EMOTION_ZH_MAP = {
    "Anger":     "愤怒",
    "Disgust":   "厌恶",
    "Fear":      "恐惧",
    "Happiness": "开心",
    "Neutral":   "平静",
    "Sadness":   "悲伤",
    "Surprise":  "惊讶",
}

EMOTION_EMOJI_MAP = {
    "愤怒": "😠", "厌恶": "😖", "恐惧": "😨",
    "开心": "😊", "平静": "😌", "悲伤": "😢", "惊讶": "😲",
}

# 颜色（对齐前端）
EMOTION_COLOR_MAP = {
    "愤怒": "#ff4757", "厌恶": "#a78bfa", "恐惧": "#f472b6",
    "开心": "#00ff88", "平静": "#00d4ff", "悲伤": "#a78bfa", "惊讶": "#ffa502",
}

# ======================================================================
# 全局单例（延迟初始化）
# ======================================================================
_ort_session = None
_face_detector_yn = None       # OpenCV FaceDetectorYN (YuNet, 主)
_face_detector_mp = None       # MediaPipe FaceDetector (备选)
_yunet_input_size = None       # YuNet 输入尺寸 (动态计算)
_model_lock = threading.Lock()
_initialized = False
_HAS_MEDIAPIPE = False

# 模型路径
_MODEL_DIR = Path(__file__).resolve().parent.parent / "models"
_ONNX_PATH = _MODEL_DIR / "enet_b2_7.onnx"
_YUNET_PATH = _MODEL_DIR / "face_detection_yunet.onnx"

# ONNX 输入尺寸 (EfficientNet-B2 = 260)
_IMG_SIZE = 260

# 预处理统计量（ImageNet）
_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
_STD  = np.array([0.229, 0.224, 0.225], dtype=np.float32)


def _load_face_detector():
    """加载人脸检测器（OpenCV YuNet 主，MediaPipe 备选）"""
    global _face_detector_yn, _face_detector_mp, _HAS_MEDIAPIPE

    # --- 主：OpenCV FaceDetectorYN (YuNet)，替代已移除的 CascadeClassifier ---
    if _YUNET_PATH.exists():
        try:
            _face_detector_yn = cv2.FaceDetectorYN_create(
                str(_YUNET_PATH),
                config="",
                input_size=(320, 320),
                score_threshold=0.6,
                nms_threshold=0.3,
                top_k=500,
            )
            logger.info("人脸检测: OpenCV YuNet (FaceDetectorYN) 就绪")
        except Exception as e:
            logger.warning(f"YuNet 加载失败: {e}")
            _face_detector_yn = None
    else:
        logger.warning(f"YuNet 模型不存在: {_YUNET_PATH}")
        _face_detector_yn = None

    # --- 备选：MediaPipe FaceDetector ---
    try:
        import mediapipe as mp
        mp_face_detection = mp.solutions.face_detection
        _face_detector_mp = mp_face_detection.FaceDetection(
            model_selection=0,  # 0=短距离（2m内），1=长距离（5m内）
            min_detection_confidence=0.5,
        )
        _HAS_MEDIAPIPE = True
        logger.info("人脸检测: MediaPipe FaceDetector 备选就绪")
    except Exception as e:
        logger.debug(f"MediaPipe 不可用: {e}")
        _face_detector_mp = None


def initialize() -> bool:
    """
    初始化表情识别引擎（线程安全，幂等）。
    返回 True 表示 ONNX 模型加载成功。
    """
    global _ort_session, _initialized

    if _initialized:
        return _ort_session is not None

    with _model_lock:
        if _initialized:                      # 双重检查
            return _ort_session is not None

        # 1) 加载 ONNX 模型
        if _ONNX_PATH.exists():
            try:
                import onnxruntime as ort
                _ort_session = ort.InferenceSession(
                    str(_ONNX_PATH),
                    providers=['CPUExecutionProvider'],
                )
                logger.info(f"ONNX 表情模型已加载: {_ONNX_PATH}")
            except Exception as e:
                logger.error(f"ONNX 模型加载失败: {e}")
                _ort_session = None
        else:
            logger.warning(f"ONNX 模型不存在: {_ONNX_PATH}")
            _ort_session = None

        # 2) 加载人脸检测器
        _load_face_detector()

        _initialized = True
        return _ort_session is not None


# ======================================================================
# 图像预处理 & 推理
# ======================================================================

def preprocess(face_img: np.ndarray) -> np.ndarray:
    """
    ONNX 预处理：resize → normalize (ImageNet stats) → HWC→CHW → batch dim
    """
    x = cv2.resize(face_img, (_IMG_SIZE, _IMG_SIZE)).astype(np.float32) / 255.0
    x = (x - _MEAN) / _STD
    x = x.transpose(2, 0, 1)           # HWC → CHW
    return x[np.newaxis, ...]           # 加 batch 维


def predict(face_img: np.ndarray) -> Tuple[str, str, float, Dict[str, float]]:
    """
    对单张人脸图片进行表情分类。

    参数:
        face_img: BGR 人脸裁剪区域 (numpy array, H×W×3)

    返回:
        (emotion_en, emotion_zh, confidence, all_scores)
        all_scores: {"开心": 0.85, "平静": 0.05, ...}
    """
    global _ort_session

    if _ort_session is None:
        # 未初始化 → 尝试初始化
        if not initialize():
            return ("Neutral", "平静", 0.0, {"平静": 1.0})

    try:
        ort_inputs = {"input": preprocess(face_img)}
        scores = _ort_session.run(None, ort_inputs)[0][0]   # shape: (7,)

        pred_idx = int(np.argmax(scores))

        # softmax
        e_x = np.exp(scores - np.max(scores))
        probs = e_x / e_x.sum()

        emotion_en = IDX_TO_CLASS_EN.get(pred_idx, "Neutral")
        emotion_zh = EMOTION_ZH_MAP.get(emotion_en, "平静")
        confidence = float(probs[pred_idx])

        # 全部分数
        all_scores = {}
        for i, (en, zh) in [(i, (IDX_TO_CLASS_EN.get(i, "Neutral"), EMOTION_ZH_MAP.get(IDX_TO_CLASS_EN.get(i, "Neutral"), "平静"))) for i in range(7)]:
            all_scores[zh] = float(probs[i])

        return (emotion_en, emotion_zh, confidence, all_scores)

    except Exception as e:
        logger.error(f"表情推理失败: {e}")
        return ("Neutral", "平静", 0.0, {"平静": 1.0})


# ======================================================================
# 人脸检测
# ======================================================================

def detect_face(frame: np.ndarray) -> Optional[Tuple[int, int, int, int]]:
    """
    在帧中检测人脸，返回最大人脸框 (x, y, w, h) 或 None。

    策略：OpenCV YuNet（主）→ MediaPipe（备选）→ 无
    """
    h, w = frame.shape[:2]

    # --- 主检测器：OpenCV FaceDetectorYN (YuNet) ---
    if _face_detector_yn is not None:
        try:
            # YuNet 需要固定输入尺寸，每次设置以适配当前帧
            _face_detector_yn.setInputSize((w, h))
            _, faces = _face_detector_yn.detect(frame)
            if faces is not None and len(faces) > 0:
                # faces: (N, 15) — [x, y, w, h, ...confidence...]
                # 取置信度最高的脸（索引 14 是 landmark 置信度，索引 4-13 是 5 个关键点）
                # 实际格式: [x, y, w, h, right_eye_x, right_eye_y, left_eye_x, left_eye_y,
                #             nose_x, nose_y, right_mouth_x, right_mouth_y, left_mouth_x, left_mouth_y, confidence]
                best_idx = np.argmax(faces[:, -1])  # 最后一列是置信度
                best = faces[best_idx]
                x, y, fw, fh = int(best[0]), int(best[1]), int(best[2]), int(best[3])
                # 边界检查 & 扩展边距
                x = max(0, x - int(fw * 0.1))
                y = max(0, y - int(fh * 0.15))
                fw = min(w - x, int(fw * 1.2))
                fh = min(h - y, int(fh * 1.3))
                return (x, y, fw, fh)
        except Exception as e:
            logger.debug(f"YuNet 人脸检测失败: {e}")

    # --- 备选检测器：MediaPipe FaceDetector ---
    if _face_detector_mp is not None:
        try:
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = _face_detector_mp.process(rgb)
            if results.detections:
                best = max(results.detections, key=lambda d: d.score[0])
                bbox = best.location_data.relative_bounding_box
                x = int(bbox.xmin * w)
                y = int(bbox.ymin * h)
                fw = int(bbox.width * w)
                fh = int(bbox.height * h)
                x = max(0, x - int(fw * 0.05))
                y = max(0, y - int(fh * 0.1))
                fw = min(w - x, int(fw * 1.1))
                fh = min(h - y, int(fh * 1.2))
                return (x, y, fw, fh)
        except Exception as e:
            logger.debug(f"MediaPipe 人脸检测失败: {e}")

    return None


# ======================================================================
# 综合检测（人脸检测 + 表情分类）
# ======================================================================

def detect_emotion(frame: np.ndarray) -> dict:
    """
    综合表情检测：在帧中找到人脸 → 裁剪 → ONNX 推理。

    参数:
        frame: BGR 图像 (numpy array, H×W×3)，可以是摄像头帧或任意图片

    返回:
        {
            "emotion_en": "Happiness",
            "emotion_zh": "开心",
            "emoji": "😊",
            "color": "#00ff88",
            "confidence": 0.92,
            "face_box": [x, y, w, h] or null,
            "all_scores": {"开心": 0.92, "平静": 0.03, ...},
            "elapsed_ms": 45.2,
        }
    """
    t0 = time.time()

    face_box = detect_face(frame)

    if face_box is None:
        # 没检测到人脸 → 返回占位结果
        return {
            "emotion_en": "Neutral",
            "emotion_zh": "平静",
            "emoji": "😌",
            "color": "#00d4ff",
            "confidence": 0.0,
            "face_box": None,
            "all_scores": {},
            "elapsed_ms": (time.time() - t0) * 1000,
            "face_detected": False,
        }

    x, y, fw, fh = face_box
    face_crop = frame[y:y+fh, x:x+fw]

    if face_crop.size == 0:
        return {
            "emotion_en": "Neutral",
            "emotion_zh": "平静",
            "emoji": "😌",
            "color": "#00d4ff",
            "confidence": 0.0,
            "face_box": list(face_box),
            "all_scores": {},
            "elapsed_ms": (time.time() - t0) * 1000,
            "face_detected": True,
        }

    emotion_en, emotion_zh, confidence, all_scores = predict(face_crop)

    return {
        "emotion_en": emotion_en,
        "emotion_zh": emotion_zh,
        "emoji": EMOTION_EMOJI_MAP.get(emotion_zh, "😌"),
        "color": EMOTION_COLOR_MAP.get(emotion_zh, "#00d4ff"),
        "confidence": confidence,
        "face_box": list(face_box),
        "all_scores": all_scores,
        "elapsed_ms": (time.time() - t0) * 1000,
        "face_detected": True,
    }


# ======================================================================
# 仅分类（前端已做好人脸检测，直接传人脸裁剪图）
# ======================================================================

def classify_face_crop(face_bgr: np.ndarray) -> dict:
    """
    对已裁剪的人脸区域直接做 ONNX 表情分类（跳过人脸检测）。

    参数:
        face_bgr: 人脸 BGR 图像 (H×W×3)，可以是任意尺寸

    返回:
        {"emotion_en", "emotion_zh", "emoji", "color", "confidence", "all_scores", "elapsed_ms"}
    """
    t0 = time.time()
    emotion_en, emotion_zh, confidence, all_scores = predict(face_bgr)

    return {
        "emotion_en": emotion_en,
        "emotion_zh": emotion_zh,
        "emoji": EMOTION_EMOJI_MAP.get(emotion_zh, "😌"),
        "color": EMOTION_COLOR_MAP.get(emotion_zh, "#00d4ff"),
        "confidence": confidence,
        "all_scores": all_scores,
        "elapsed_ms": (time.time() - t0) * 1000,
    }
