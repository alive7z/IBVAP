"""Face detector using OpenCV FaceDetectorYN (YuNet).

DETECTION-ONLY detector. It produces face bounding boxes and a detection
confidence score (from the model). It performs NO recognition, NO embeddings,
NO landmark identity analysis, and NO identity matching — we deliberately do NOT
use OpenCV's FaceRecognizerSF.

OpenCV 5 removed the legacy Haar `cv2.CascadeClassifier`, so YuNet
(`cv2.FaceDetectorYN`) is the supported detector. The .onnx model is resolved
from FACE_MODEL_PATH / WEIGHTS_DIR. The detector loads lazily and degrades to
UNAVAILABLE on failure without crashing the pipeline.
"""

import time

import numpy as np

from config import (
    FACE_DETECTION_CONFIDENCE,
    FACE_MIN_SIZE,
    FACE_MODEL_PATH,
    WEIGHTS_DIR,
)
from faces.models import FaceBBox, FaceDetection
from utils.logger import get_logger

logger = get_logger("face_detector")


class FaceDetector:
    def __init__(
        self,
        model_path: str = FACE_MODEL_PATH,
        confidence: float = FACE_DETECTION_CONFIDENCE,
        min_size: int = FACE_MIN_SIZE,
    ):
        self._name = model_path
        self._confidence = confidence
        self._min_size = max(1, int(min_size))
        self._detector = None
        self._loaded = False
        self._load_errors = 0
        self._resolved_path = None
        self._status = "NOT_LOADED"

    def _resolve_path(self):
        from pathlib import Path

        p = Path(self._name)
        if p.exists():
            return str(p)
        weights_path = WEIGHTS_DIR / self._name
        if weights_path.exists():
            return str(weights_path)
        return None

    def load(self) -> bool:
        path = self._resolve_path()
        if not path:
            self._load_errors += 1
            self._status = "ERROR"
            self._loaded = False
            logger.error(
                "Face model '%s' not found (looked in %s). Face detection UNAVAILABLE.",
                self._name, WEIGHTS_DIR,
            )
            return False
        try:
            import cv2

            # Input size is updated per-frame; initial value is a placeholder.
            detector = cv2.FaceDetectorYN_create(
                path, "", (320, 320), score_threshold=self._confidence
            )
            detector.setScoreThreshold(self._confidence)
            self._detector = detector
            self._resolved_path = path
            self._loaded = True
            self._status = "READY"
            logger.info("Face detector loaded (YuNet FaceDetectorYN, DETECTION ONLY) status=READY path=%s", path)
            return True
        except Exception as e:  # noqa: BLE001
            self._load_errors += 1
            self._loaded = False
            self._status = "ERROR"
            logger.error("Face detector load failed: %s", e)
            return False

    def detect(self, frame: np.ndarray, person_bbox: dict, latency_ms: list | None = None) -> list[FaceDetection]:
        """Detect faces within the given person bbox (pixel coords).

        Detection is restricted to the person region for clean association.
        Returns an empty list when nothing credible is found. Only the bounding
        box and score are used — landmark coordinates are ignored.
        """
        if not self._loaded or self._detector is None:
            return []
        h, w = frame.shape[:2]
        x1 = max(0, int(person_bbox["x1"]))
        y1 = max(0, int(person_bbox["y1"]))
        x2 = min(w, int(person_bbox["x2"]))
        y2 = min(h, int(person_bbox["y2"]))
        if x2 <= x1 or y2 <= y1:
            return []
        person_crop = frame[y1:y2, x1:x2]
        if person_crop.size == 0:
            return []

        if person_crop.shape[1] < self._min_size or person_crop.shape[0] < self._min_size:
            return []

        start = time.time()
        try:
            import cv2

            ch, cw = person_crop.shape[:2]
            self._detector.setInputSize((cw, ch))
            _, faces = self._detector.detect(person_crop)
        except Exception as e:  # noqa: BLE001
            logger.error("Face detect error: %s", e)
            return []
        finally:
            if latency_ms is not None:
                latency_ms.append(round((time.time() - start) * 1000, 2))

        if faces is None:
            return []

        dets = []
        for row in faces:
            fx, fy, fw, fh = float(row[0]), float(row[1]), float(row[2]), float(row[3])
            score = float(row[-1])
            if fw < self._min_size or fh < self._min_size:
                continue
            confidence = round(min(1.0, max(0.0, score)), 4)
            if confidence < self._confidence:
                continue
            dets.append(FaceDetection(
                bbox=FaceBBox(x1=x1 + fx, y1=y1 + fy, x2=x1 + fx + fw, y2=y1 + fy + fh),
                confidence=confidence,
            ))
        return dets

    @property
    def is_loaded(self) -> bool:
        return self._loaded

    @property
    def status(self) -> str:
        return self._status

    def get_info(self) -> dict:
        return {
            "loaded": self._loaded,
            "status": self._status,
            "model": "face_detection_yunet (OpenCV FaceDetectorYN)",
            "modelPath": self._name,
            "resolutionType": "resolved" if self._resolved_path else "unresolved",
            "confidence": self._confidence,
            "recognition": False,
            "loadErrors": self._load_errors,
        }
