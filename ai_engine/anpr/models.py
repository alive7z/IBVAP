"""ANPR (Phase 12) data models.

Plate detection and OCR are OBSERVATIONAL ONLY. A plate observation never
implies ownership, legality, or any security meaning on its own. No vehicle
owner / registration / blacklist data is ever derived here.
"""

from dataclasses import dataclass, field


@dataclass
class PlateBBox:
    """A plate bounding box in pixel coords within the associated vehicle bbox."""
    x1: float = 0.0
    y1: float = 0.0
    x2: float = 0.0
    y2: float = 0.0

    def to_dict(self) -> dict:
        return {"x1": self.x1, "y1": self.y1, "x2": self.x2, "y2": self.y2}


@dataclass
class PlateDetection:
    """A single plate-region detection from the plate detector."""
    bbox: PlateBBox
    confidence: float = 0.0


@dataclass
class OcrRead:
    """One OCR read of a plate crop (raw + normalized text + honest confidence)."""
    raw_text: str | None
    normalized_text: str | None
    ocr_confidence: float = 0.0


@dataclass
class PlateCandidate:
    """A candidate read accumulated for a vehicle track (multi-frame consensus)."""
    raw_text: str
    normalized_text: str
    ocr_confidence: float
    plate_detection_confidence: float
    bbox: PlateBBox


@dataclass
class ConfirmedPlate:
    """The consensus-confirmed plate for a vehicle track."""
    plate_text: str
    raw_text: str
    ocr_confidence: float
    plate_detection_confidence: float
    bbox: PlateBBox


@dataclass
class PlateObservation:
    """A confirmed ANPR observation ready to be delivered to Node via the AI client.

    DELIBERATELY contains NO owner/blacklist/registration information.
    """
    observation_id: str
    camera_code: str
    vehicle_track_id: int
    plate_text: str
    raw_text: str
    ocr_confidence: float
    plate_detection_confidence: float
    occurred_at: str
    source_timestamp_ms: int
    bbox: PlateBBox
    vehicle_type: str | None = None

    def to_payload(self) -> dict:
        return {
            "observationId": self.observation_id,
            "cameraCode": self.camera_code,
            "vehicleTrackId": self.vehicle_track_id,
            "plateText": self.plate_text,
            "rawText": self.raw_text,
            "ocrConfidence": round(self.ocr_confidence, 4),
            "plateDetectionConfidence": round(self.plate_detection_confidence, 4),
            "occurredAt": self.occurred_at,
            "sourceTimestampMs": int(self.source_timestamp_ms),
            "plateBBox": self.bbox.to_dict(),
            "vehicleType": self.vehicle_type,
        }

    def to_observation(self) -> dict:
        """Alias used by the node client when batching delivery."""
        return self.to_payload()


@dataclass
class VehiclePlateState:
    """Bounded per-vehicle ANPR state. Cleaned on track expiry (no leaks)."""
    vehicle_track_id: int
    last_seen_at: float = 0.0
    candidates: list = field(default_factory=list)
    confirmed: ConfirmedPlate | None = None
    emitted: bool = False
