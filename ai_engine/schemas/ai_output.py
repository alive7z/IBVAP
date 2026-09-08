from pydantic import BaseModel


class Bbox(BaseModel):
    x1: float = 0.0
    y1: float = 0.0
    x2: float = 0.0
    y2: float = 0.0


class Center(BaseModel):
    x: float = 0.0
    y: float = 0.0


class ReferencePoint(BaseModel):
    x: float = 0.0
    y: float = 0.0


class Detection(BaseModel):
    classId: int = 0
    className: str = ""
    objectType: str = ""
    vehicleType: str | None = None
    confidence: float = 0.0
    bbox: Bbox = Bbox()


class Track(BaseModel):
    trackId: int | None = None
    className: str = ""
    objectType: str = ""
    vehicleType: str | None = None
    confidence: float = 0.0
    bbox: Bbox = Bbox()
    center: Center = Center()
    referencePoint: ReferencePoint = ReferencePoint()
    state: str = ""
    seenCount: int = 0
    historyLength: int = 0


class ProcessingInfo(BaseModel):
    status: str = "processed"
    latencyMs: float = 0.0


class SourceInfo(BaseModel):
    cameraCode: str = "UNKNOWN"
    sourceType: str = "VIDEO_FILE"


class FrameInfo(BaseModel):
    frameId: str = ""
    frameIndex: int = 0
    timestamp: str = ""
    sourceTimestampMs: int = 0


class ContextEvent(BaseModel):
    type: str = ""
    trackId: int = 0
    objectType: str = ""
    occurredAt: str = ""
    sourceTimestampMs: int = 0
    metadata: dict = {}
    referencePoint: ReferencePoint = ReferencePoint()


class RiskOutput(BaseModel):
    trackId: int = 0
    objectType: str = "PERSON"
    score: float = 0.0
    severity: str = "INFO"
    reasons: list[dict] = []
    evidence: list[dict] = []
    occurredAt: str = ""
    sourceTimestampMs: int = 0


class AIOutput(BaseModel):
    schemaVersion: int = 1
    source: SourceInfo = SourceInfo()
    frame: FrameInfo = FrameInfo()
    detections: list[Detection] = []
    tracks: list[Track] = []
    context: list[ContextEvent] = []
    risk: list[RiskOutput] = []
    processing: ProcessingInfo = ProcessingInfo()
