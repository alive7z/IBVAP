import time

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from config import AI_CAMERA_CODE, AI_SERVICE_NAME, ANPR_ENABLED, CONTEXT_ENABLED, FACE_DETECTION_ENABLED, PREVIEW_ENABLED, RISK_ENABLED, TRACKER, VIDEO_SOURCE, YOLO_DEVICE, YOLO_MODEL
from schemas.health import AnprHealth, FaceDetectionHealth, HealthResponse, VideoSourceHealth
from streaming.preview import iter_mjpeg
from streaming.stream_health import StreamHealth, StreamStatus

router = APIRouter()

_global_health: StreamHealth | None = None
_global_model_info: dict = {"loaded": False, "name": YOLO_MODEL, "device": YOLO_DEVICE, "loadErrors": 0}
_global_tracking_info: dict = {"enabled": False, "tracker": TRACKER}
_global_context_info: dict = {"enabled": CONTEXT_ENABLED, "status": "NOT_CONFIGURED", "zonesLoaded": 0, "fencesLoaded": 0}
_global_risk_info: dict = {"enabled": RISK_ENABLED, "status": "NOT_CONFIGURED", "rulesLoaded": 0, "rulesEnabled": 0}
_global_anpr_info: dict = {
    "enabled": ANPR_ENABLED, "detectorLoaded": False, "detectorMode": "UNKNOWN",
    "ocrLoaded": False, "ocrEngine": "easyocr", "ocrStatus": "NOT_LOADED", "status": "UNAVAILABLE",
}
_global_face_info: dict = {
    "enabled": FACE_DETECTION_ENABLED, "modelLoaded": False, "status": "UNAVAILABLE", "recognition": False,
}
_global_preview_store = None
_global_source_info: dict = {}


def set_stream_health(health: StreamHealth) -> None:
    global _global_health
    _global_health = health


def set_preview_store(store) -> None:
    """Register the active camera's latest-frame store for /internal/preview."""
    global _global_preview_store
    _global_preview_store = store


def set_live_source_info(info: dict) -> None:
    """Publish live source info (cameraCode/sourceType/protocol/status/session)."""
    global _global_source_info
    _global_source_info = info or {}

def set_model_info(info: dict) -> None:
    global _global_model_info
    _global_model_info = info


def set_tracking_info(info: dict) -> None:
    global _global_tracking_info
    _global_tracking_info = info


def set_context_info(info: dict) -> None:
    global _global_context_info
    _global_context_info = info


def set_risk_info(info: dict) -> None:
    global _global_risk_info
    _global_risk_info = info


def set_anpr_info(info: dict) -> None:
    global _global_anpr_info
    _global_anpr_info = info


def set_face_info(info: dict) -> None:
    global _global_face_info
    _global_face_info = info


_start_time = time.time()


@router.get("/health", response_model=HealthResponse)
async def health():
    video_configured = bool(VIDEO_SOURCE)
    status = "ONLINE" if video_configured else "NOT_CONFIGURED"

    if _global_health:
        report = _global_health.get_report()
        if report.get("status"):
            status = report["status"]
    else:
        report = {}

    # Keep stream synchronized with the same live StreamHealth report used by
    # videoSource. Transport metadata may refresh less often, but status and
    # frame counters must not contradict the current reader state.
    stream = dict(_global_source_info)
    stream["cameraCode"] = stream.get("cameraCode") or AI_CAMERA_CODE
    stream["status"] = status
    stream["sourceType"] = stream.get("sourceType") or report.get("sourceType")
    stream["streamSessionId"] = stream.get("streamSessionId") or report.get("streamSessionId")
    stream["reconnectAttempts"] = report.get(
        "reconnectAttempts", stream.get("reconnectAttempts", 0)
    )
    stream["lastFrameAt"] = report.get("lastFrameTimestamp") or stream.get("lastFrameAt")
    stream["framesRead"] = report.get("framesReceived", 0)
    stream["framesProcessed"] = report.get("framesProcessed", 0)

    return HealthResponse(
        success=True,
        service=AI_SERVICE_NAME,
        status="healthy",
        uptime=round(time.time() - _start_time, 1),
        model=dict(_global_model_info),
        tracking=dict(_global_tracking_info),
        context=dict(_global_context_info),
        risk=dict(_global_risk_info),
        anpr=AnprHealth(**dict(_global_anpr_info)),
        faceDetection=FaceDetectionHealth(**dict(_global_face_info)),
        cameraCode=AI_CAMERA_CODE,
        videoSource=VideoSourceHealth(
            configured=bool(VIDEO_SOURCE) or bool(report.get("configured")),
            status=status,
            sourceType=report.get("sourceType"),
            fps=report.get("fps"),
            framesRead=report.get("framesReceived", 0),
            framesSampled=report.get("framesSampled", 0),
            framesProcessed=report.get("framesProcessed", 0),
            framesDropped=report.get("framesDropped", 0),
            readErrors=report.get("readErrors", 0),
            lastFrameTimestamp=report.get("lastFrameTimestamp"),
            processingFps=report.get("processingFps"),
            averageLatencyMs=report.get("averageLatencyMs"),
            errorMessage=report.get("errorMessage"),
        ).model_dump(),
        stream=stream,
    )


@router.get("/internal/preview/{camera_code}")
async def preview_mjpeg(camera_code: str):
    """Internal MJPEG preview endpoint (NOT a public frontend API).

    Serves a browser-compatible multipart/x-mixed-replace stream from the active
    camera's latest-frame store. Raw RTSP is never sent to a browser. This is
    bound to local/internal access; the Node backend gateway fronts it for
    authenticated public consumption.
    """
    if not PREVIEW_ENABLED:
        raise HTTPException(status_code=404, detail="Preview disabled")
    active_camera_code = _global_source_info.get("cameraCode") or AI_CAMERA_CODE
    if camera_code != active_camera_code:
        raise HTTPException(status_code=404, detail="Camera preview source not active")
    store = _global_preview_store
    if store is None:
        raise HTTPException(status_code=404, detail="No active preview source")
    # Honest-stream guard: never mint an MJPEG stream with zero frames while the
    # source is not live (CONNECTING/RECONNECTING/OFFLINE). The Node gateway
    # turns this into a prompt 502 instead of an endless silent hang.
    report = _global_health.get_report() if _global_health else {}
    if report.get("status") != StreamStatus.ONLINE:
        raise HTTPException(
            status_code=409,
            detail="Stream not live (status=%s)" % (report.get("status") or "unknown"),
        )
    return StreamingResponse(
        iter_mjpeg(store),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={
            "Cache-Control": "no-cache",
            "X-Preview-Camera": camera_code,
        },
    )
