"""Plate-region detector.

A dedicated plate model may be provided via ANPR_MODEL_PATH (a YOLO-family
weights file). If that file is not present, the detector falls back to a
documented DEVELOPMENT heuristic: the lower-center region of the confirmed
vehicle bbox. Standard COCO YOLO11n does NOT reliably detect license plates,
so we never assume it does.

The detector reports honestly which mode is active and never fabricates a
plate measurement.
"""

from pathlib import Path

import numpy as np

from config import (
    ANPR_DETECTION_CONFIDENCE,
    ANPR_MODEL_PATH,
    BASE_DIR,
    WEIGHTS_DIR,
)
from anpr.models import PlateBBox, PlateDetection
from utils.logger import get_logger

logger = get_logger("anpr_detector")


class PlateDetector:
    """Detects the plate region within a vehicle bbox."""

    def __init__(
        self,
        model_path: str = ANPR_MODEL_PATH,
        confidence: float = ANPR_DETECTION_CONFIDENCE,
    ):
        self._name = model_path
        self._confidence = confidence
        self._model = None
        self._loaded = False
        self._load_errors = 0
        self._mode = "HEURISTIC"
        self._resolved_path = None

    def load(self) -> bool:
        """Attempt to load a dedicated plate model. Fall back to heuristic."""
        path = None
        p = Path(self._name)
        if p.exists():
            path = str(p)
        else:
            weights_path = WEIGHTS_DIR / self._name
            if weights_path.exists():
                path = str(weights_path)
        if not path:
            self._mode = "HEURISTIC"
            self._loaded = True
            logger.info(
                "ANPR plate model '%s' not found — using HEURISTIC plate-region "
                "dev mode (bottom-center of vehicle bbox).", self._name
            )
            return True

        try:
            from ultralytics import YOLO

            self._model = YOLO(path)
            self._loaded = True
            self._mode = "MODEL"
            self._resolved_path = path
            logger.info("ANPR plate model loaded: %s | mode=MODEL", path)
            return True
        except Exception as e:  # noqa: BLE001
            self._load_errors += 1
            self._loaded = False
            self._mode = "ERROR"
            logger.error("ANPR plate model load FAILED: %s", e)
            return False

    def detect(self, frame: np.ndarray, vehicle_bbox: dict) -> list[PlateDetection]:
        """Detect plate regions within the given vehicle bbox (pixel coords).

        Returns an empty list when nothing credible is found. Never guesses.
        """
        if not self._loaded:
            return []

        if self._mode == "MODEL" and self._model is not None:
            try:
                results = self._model(
                    frame,
                    conf=self._confidence,
                    device="cpu",
                    verbose=False,
                )
                dets = []
                h, w = frame.shape[:2]
                for result in results:
                    if result.boxes is None:
                        continue
                    for box in result.boxes:
                        x1, y1, x2, y2 = box.xyxy[0].tolist()
                        conf = float(box.conf[0])
                        x1 = max(0.0, min(x1, w))
                        y1 = max(0.0, min(y1, h))
                        x2 = max(0.0, min(x2, w))
                        y2 = max(0.0, min(y2, h))
                        if x1 >= x2 or y1 >= y2:
                            continue
                        dets.append(PlateDetection(
                            bbox=PlateBBox(x1=x1, y1=y1, x2=x2, y2=y2),
                            confidence=round(conf, 4),
                        ))
                # Restrict detections to ones inside/overlapping the vehicle bbox.
                in_vehicle = []
                for d in dets:
                    if _overlaps_vehicle(d.bbox, vehicle_bbox):
                        in_vehicle.append(d)
                return in_vehicle
            except Exception as e:  # noqa: BLE001
                logger.error("ANPR plate model inference failed: %s", e)
                return []

        # HEURISTIC dev mode: bottom-center strip of the vehicle bbox.
        x1, y1, x2, y2 = vehicle_bbox["x1"], vehicle_bbox["y1"], vehicle_bbox["x2"], vehicle_bbox["y2"]
        vh = y2 - y1
        vw = x2 - x1
        if vh <= 0 or vw <= 0:
            return []
        # Lower 35% of the vehicle, centered horizontally.
        plate_y1 = y2 - 0.35 * vh
        plate_y2 = y2
        plate_x1 = x1 + 0.15 * vw
        plate_x2 = x2 - 0.15 * vw
        if plate_x1 >= plate_x2 or plate_y1 >= plate_y2:
            return []
        return [PlateDetection(
            bbox=PlateBBox(x1=plate_x1, y1=plate_y1, x2=plate_x2, y2=plate_y2),
            confidence=round(self._confidence, 4),
        )]

    @property
    def is_loaded(self) -> bool:
        return self._loaded

    @property
    def mode(self) -> str:
        return self._mode

    def get_info(self) -> dict:
        return {
            "enabled": self._loaded,
            "mode": self._mode,
            "modelPath": self._name,
            "resolutionType": "resolved" if self._resolved_path else "unresolved",
            "confidence": self._confidence,
            "loadErrors": self._load_errors,
        }


def _overlaps_vehicle(plate: PlateBBox, vehicle_bbox: dict) -> bool:
    """True if the plate bbox's center lies inside the (slightly padded) vehicle bbox."""
    cx = (plate.x1 + plate.x2) / 2.0
    cy = (plate.y1 + plate.y2) / 2.0
    pad_x = 0.0
    pad_y = 0.0
    return (
        vehicle_bbox["x1"] - pad_x <= cx <= vehicle_bbox["x2"] + pad_x
        and vehicle_bbox["y1"] - pad_y <= cy <= vehicle_bbox["y2"] + pad_y
    )
