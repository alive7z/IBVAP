"""Face detection (Phase 12) data models.

FACE DETECTION ONLY — NO recognition, NO embeddings, NO identity matching.
A face observation carries bounding box + confidence associated with a person
track, and nothing identifying about the individual.
"""

from dataclasses import dataclass, field


@dataclass
class FaceBBox:
    x1: float = 0.0
    y1: float = 0.0
    x2: float = 0.0
    y2: float = 0.0

    def to_dict(self) -> dict:
        return {"x1": self.x1, "y1": self.y1, "x2": self.x2, "y2": self.y2}


@dataclass
class FaceDetection:
    bbox: FaceBBox
    confidence: float = 0.0


@dataclass
class ConfirmedFace:
    confidence: float
    bbox: FaceBBox


@dataclass
class FaceObservation:
    """A confirmed FACE_DETECTED observation.

    DELIBERATELY excludes personName / identityId / matchScore / criminalStatus
    / wantedStatus.
    """
    observation_id: str
    camera_code: str
    person_track_id: int
    face_detection_confidence: float
    occurred_at: str
    source_timestamp_ms: int
    bbox: FaceBBox

    def to_payload(self) -> dict:
        return {
            "observationId": self.observation_id,
            "cameraCode": self.camera_code,
            "personTrackId": self.person_track_id,
            "faceDetectionConfidence": round(self.face_detection_confidence, 4),
            "occurredAt": self.occurred_at,
            "sourceTimestampMs": int(self.source_timestamp_ms),
            "faceBBox": self.bbox.to_dict(),
        }

    def to_observation(self) -> dict:
        return self.to_payload()


@dataclass
class PersonFaceState:
    person_track_id: int
    last_seen_at: float = 0.0
    observations: list = field(default_factory=list)
    best_confidence: float = 0.0
    best_bbox: FaceBBox | None = None
    confirmed: ConfirmedFace | None = None
    emitted: bool = False
