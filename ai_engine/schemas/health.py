from pydantic import BaseModel


class VideoSourceHealth(BaseModel):
    configured: bool = False
    status: str = "NOT_CONFIGURED"
    sourceType: str | None = None
    fps: float | None = None
    resolution: str | None = None
    framesRead: int = 0
    framesSampled: int = 0
    framesProcessed: int = 0
    framesDropped: int = 0
    readErrors: int = 0
    lastFrameTimestamp: str | None = None
    processingFps: float | None = None
    averageLatencyMs: float | None = None
    errorMessage: str | None = None


class ModelHealth(BaseModel):
    loaded: bool = False
    name: str = ""
    device: str = "cpu"
    loadErrors: int = 0


class TrackingHealth(BaseModel):
    enabled: bool = False
    tracker: str = "bytetrack.yaml"


class ContextHealth(BaseModel):
    enabled: bool = False
    status: str = "NOT_CONFIGURED"
    zonesLoaded: int = 0
    fencesLoaded: int = 0


class RiskHealth(BaseModel):
    enabled: bool = False
    status: str = "NOT_CONFIGURED"
    rulesLoaded: int = 0
    rulesEnabled: int = 0


class AnprHealth(BaseModel):
    enabled: bool = False
    detectorLoaded: bool = False
    detectorMode: str = "UNKNOWN"
    ocrLoaded: bool = False
    ocrEngine: str = "easyocr"
    ocrStatus: str = "NOT_LOADED"
    status: str = "UNAVAILABLE"


class FaceDetectionHealth(BaseModel):
    enabled: bool = False
    modelLoaded: bool = False
    status: str = "UNAVAILABLE"
    recognition: bool = False


class HealthResponse(BaseModel):
    success: bool = True
    service: str = "IBVAP-AI"
    status: str = "healthy"
    uptime: float = 0.0
    model: ModelHealth = ModelHealth()
    tracking: TrackingHealth = TrackingHealth()
    context: ContextHealth = ContextHealth()
    risk: RiskHealth = RiskHealth()
    anpr: AnprHealth = AnprHealth()
    faceDetection: FaceDetectionHealth = FaceDetectionHealth()
    cameraCode: str = ""
    videoSource: dict | None = None
    stream: dict | None = None
