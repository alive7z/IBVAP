import time
from pathlib import Path

import numpy as np

from config import (
    BASE_DIR,
    TRACKER,
    YOLO_CONFIDENCE,
    YOLO_DEVICE,
    YOLO_IOU,
    YOLO_MODEL,
)
from detectors.classes import (
    ALLOWED_CLASS_IDS,
    VEHICLE_SUBTYPES,
    classify_object,
    class_id_to_name,
    vehicle_subtype,
)
from utils.logger import get_logger

logger = get_logger("yolo_detector")


def _select_device(preference: str) -> str:
    if preference != "auto":
        return preference

    try:
        import torch
        if torch.cuda.is_available():
            return "cuda"
    except ImportError:
        pass

    try:
        import torch
        if torch.backends.mps.is_available():
            return "mps"
    except (ImportError, AttributeError):
        pass

    return "cpu"


class YOLODetector:
    """YOLO detector using Ultralytics. Loads model once, runs inference per frame."""

    def __init__(
        self,
        model_path: str = YOLO_MODEL,
        confidence: float = YOLO_CONFIDENCE,
        iou: float = YOLO_IOU,
        device: str = YOLO_DEVICE,
        tracker_config: str = TRACKER,
    ):
        self._model_path = model_path
        self._confidence = confidence
        self._iou = iou
        self._tracker_config = tracker_config
        self._device = _select_device(device)
        self._model = None
        self._loaded = False
        self._load_errors = 0

    def load(self) -> bool:
        try:
            from ultralytics import YOLO

            resolved_path = self._resolve_model_path()
            self._model = YOLO(resolved_path)
            self._loaded = True
            logger.info(
                "YOLO model loaded: %s | device: %s | conf: %.2f | iou: %.2f",
                resolved_path,
                self._device,
                self._confidence,
                self._iou,
            )
            return True
        except Exception as e:
            self._load_errors += 1
            self._loaded = False
            logger.error("Failed to load YOLO model: %s", e)
            return False

    def _resolve_model_path(self) -> str:
        p = Path(self._model_path)
        if p.exists():
            return str(p)
        weights_path = BASE_DIR / "models" / "weights" / self._model_path
        if weights_path.exists():
            return str(weights_path)
        return self._model_path

    def detect(self, frame: np.ndarray) -> list[dict]:
        if not self._loaded or self._model is None:
            raise RuntimeError("YOLO model not loaded")

        try:
            results = self._model(
                frame,
                conf=self._confidence,
                iou=self._iou,
                device=self._device,
                verbose=False,
            )
        except Exception as e:
            raise RuntimeError(f"Inference failed: {e}")

        detections = []
        for result in results:
            if result.boxes is None:
                continue
            for box in result.boxes:
                cls_id = int(box.cls[0])
                if cls_id not in ALLOWED_CLASS_IDS:
                    continue

                conf = float(box.conf[0])
                x1, y1, x2, y2 = box.xyxy[0].tolist()

                h, w = frame.shape[:2]
                x1 = max(0.0, min(float(x1), float(w)))
                y1 = max(0.0, min(float(y1), float(h)))
                x2 = max(0.0, min(float(x2), float(w)))
                y2 = max(0.0, min(float(y2), float(h)))

                if x1 >= x2 or y1 >= y2:
                    continue

                class_name = class_id_to_name(cls_id) or "unknown"
                obj_type = classify_object(class_name)
                v_type = vehicle_subtype(class_name)

                det = {
                    "classId": cls_id,
                    "className": class_name,
                    "objectType": obj_type,
                    "confidence": round(conf, 4),
                    "bbox": {
                        "x1": round(x1, 1),
                        "y1": round(y1, 1),
                        "x2": round(x2, 1),
                        "y2": round(y2, 1),
                    },
                }
                if v_type:
                    det["vehicleType"] = v_type
                detections.append(det)

        return detections

    def detect_with_tracking(self, frame: np.ndarray) -> list[dict]:
        if not self._loaded or self._model is None:
            raise RuntimeError("YOLO model not loaded")

        try:
            results = self._model.track(
                frame,
                conf=self._confidence,
                iou=self._iou,
                device=self._device,
                tracker=self._tracker_config,
                persist=True,
                verbose=False,
            )
        except Exception as e:
            raise RuntimeError(f"Tracking inference failed: {e}")

        tracks = []
        for result in results:
            if result.boxes is None:
                continue
            for box in result.boxes:
                cls_id = int(box.cls[0])
                if cls_id not in ALLOWED_CLASS_IDS:
                    continue

                conf = float(box.conf[0])
                x1, y1, x2, y2 = box.xyxy[0].tolist()

                h, w = frame.shape[:2]
                x1 = max(0.0, min(float(x1), float(w)))
                y1 = max(0.0, min(float(y1), float(h)))
                x2 = max(0.0, min(float(x2), float(w)))
                y2 = max(0.0, min(float(y2), float(h)))

                if x1 >= x2 or y1 >= y2:
                    continue

                track_id = int(box.id[0]) if box.id is not None else None

                class_name = class_id_to_name(cls_id) or "unknown"
                obj_type = classify_object(class_name)
                v_type = vehicle_subtype(class_name)

                cx = (x1 + x2) / 2
                cy = (y1 + y2) / 2

                trk = {
                    "trackId": track_id,
                    "classId": cls_id,
                    "className": class_name,
                    "objectType": obj_type,
                    "confidence": round(conf, 4),
                    "bbox": {
                        "x1": round(x1, 1),
                        "y1": round(y1, 1),
                        "x2": round(x2, 1),
                        "y2": round(y2, 1),
                    },
                    "center": {
                        "x": round(cx, 1),
                        "y": round(cy, 1),
                    },
                }
                if v_type:
                    trk["vehicleType"] = v_type
                tracks.append(trk)

        return tracks

    def reset_tracking(self) -> None:
        """Clear Ultralytics/ByteTrack state at a stream-session boundary.

        Model weights remain loaded. Only the predictor's ephemeral tracker
        state and numeric ID counter are reset so no association crosses an
        RTSP reconnect.
        """
        predictor = getattr(self._model, "predictor", None) if self._model else None
        for tracker in (getattr(predictor, "trackers", None) or []):
            reset = getattr(tracker, "reset", None)
            if callable(reset):
                reset()
        logger.info("YOLO tracker state reset for new stream session")

    @property
    def is_loaded(self) -> bool:
        return self._loaded

    @property
    def device(self) -> str:
        return self._device

    @property
    def model_name(self) -> str:
        return self._model_path

    def get_info(self) -> dict:
        return {
            "loaded": self._loaded,
            "name": self._model_path,
            "device": self._device,
            "confidence": self._confidence,
            "iou": self._iou,
            "tracker": self._tracker_config if self._loaded else None,
            "loadErrors": self._load_errors,
        }
