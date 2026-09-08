import numpy as np
from detectors.classes import ObjectType


# A stub detector that returns controllable detections/tracks, so unit tests
# never need to load real YOLO weights.
class StubDetector:
    def __init__(self, detections=None, tracks=None, device="cpu", loaded=True):
        self._detections = detections if detections is not None else []
        self._tracks = tracks if tracks is not None else []
        self._device = device
        self._loaded = loaded

    def load(self):
        return self._loaded

    def detect(self, frame):
        if not self._loaded:
            raise RuntimeError("model not loaded")
        return self._detections

    def detect_with_tracking(self, frame):
        if not self._loaded:
            raise RuntimeError("model not loaded")
        return self._tracks

    @property
    def is_loaded(self):
        return self._loaded

    @property
    def device(self):
        return self._device

    @property
    def model_name(self):
        return "stub.pt"

    def get_info(self):
        return {
            "loaded": self._loaded,
            "name": self.model_name,
            "device": self._device,
            "confidence": 0.5,
            "iou": 0.5,
            "tracker": "bytetrack.yaml",
            "loadErrors": 0,
        }


PERSON_DET = {
    "classId": 0,
    "className": "person",
    "objectType": "PERSON",
    "confidence": 0.91,
    "bbox": {"x1": 100.0, "y1": 80.0, "x2": 200.0, "y2": 300.0},
}

CAR_DET = {
    "classId": 2,
    "className": "car",
    "objectType": "VEHICLE",
    "vehicleType": "CAR",
    "confidence": 0.85,
    "bbox": {"x1": 50.0, "y1": 60.0, "x2": 180.0, "y2": 120.0},
}

PERSON_TRACK = {
    "trackId": 7,
    "className": "person",
    "objectType": "PERSON",
    "confidence": 0.90,
    "bbox": {"x1": 100.0, "y1": 80.0, "x2": 200.0, "y2": 300.0},
    "center": {"x": 150.0, "y": 190.0},
}

CAR_TRACK = {
    "trackId": 12,
    "className": "car",
    "objectType": "VEHICLE",
    "vehicleType": "CAR",
    "confidence": 0.85,
    "bbox": {"x1": 50.0, "y1": 60.0, "x2": 180.0, "y2": 120.0},
    "center": {"x": 115.0, "y": 90.0},
}
