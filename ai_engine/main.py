#!/usr/bin/env python3
"""IBVAP AI Engine — Phase 10 entry point.

Usage:
    python main.py                                      # Start FastAPI AI service only
    python main.py --video path/to.mp4                  # Run MP4 pipeline + API service
    python main.py --video path/to.mp4 --save-output outputs/demo.mp4
    python main.py --video path/to.mp4 --preview
"""
import argparse
import asyncio
import json
import os
import signal
import threading
import time
import uuid
from pathlib import Path

# Camera libraries can echo full source URLs (including embedded credentials)
# on connection errors. Configure their native loggers before importing cv2;
# application-level logs below report only the camera code and safe status.
os.environ.setdefault("OPENCV_LOG_LEVEL", "SILENT")
os.environ.setdefault("OPENCV_FFMPEG_LOGLEVEL", "-8")

import cv2
import numpy as np
import uvicorn

from api.routes import (
    set_anpr_info,
    set_context_info,
    set_face_info,
    set_live_source_info,
    set_model_info,
    set_preview_store,
    set_risk_info,
    set_stream_health,
    set_tracking_info,
)
from anpr.manager import AnprManager
from config import (
    AI_CAMERA_CODE,
    AI_HOST,
    AI_PORT,
    AI_SERVICE_NAME,
    ANPR_ENABLED,
    CONTEXT_CONFIG_REFRESH_SECONDS,
    CONTEXT_ENABLED,
    EVIDENCE_ENABLED,
    FACE_DETECTION_ENABLED,
    FRAME_BUFFER_SIZE,
    FRAME_HEIGHT,
    FRAME_SAMPLE_FPS,
    FRAME_WIDTH,
    OUTPUTS_DIR,
    PIPELINE_TRACE_ENABLED,
    PIPELINE_TRACE_INTERVAL_SECONDS,
    REDIS_ENABLED,
    RISK_ENABLED,
    SOURCE_CONFIG_REFRESH_SECONDS,
    STREAM_CONNECT_TIMEOUT_SECONDS,
    STREAM_HEARTBEAT_SECONDS,
    STREAM_MAX_CONSECUTIVE_READ_FAILURES,
    STREAM_NO_FRAME_TOLERANCE_SECONDS,
    STREAM_RECONNECT_BASE_SECONDS,
    STREAM_RECONNECT_MAX_SECONDS,
    STREAM_READ_TIMEOUT_SECONDS,
    STREAM_STALE_SECONDS,
    TRACKER,
    VIDEO_SOURCE,
    YOLO_DEVICE,
    YOLO_MODEL,
)
from evidence.manager import EvidenceManager
from faces.manager import FaceManager
from integrations.node_client import NodeClient, redact_stream_url
from integrations.redis_runtime import RedisRuntimeClient
from preprocessing.orientation import (
    normalize_rotation_degrees,
    rotate_context_config,
    rotate_image_clockwise,
)
from risk.engine import RiskEngine
from streaming.file_reader import FileVideoReader
from streaming.frame_buffer import FrameBuffer
from streaming.frame_sampler import FrameSampler
from streaming.preview import LatestFrameStore
from streaming.reconnect import (
    ReconnectController,
    new_stream_session_id,
    should_rebuild_after_no_frame,
)
from streaming.source_factory import build_source_config, create_video_source
from streaming.stream_health import StreamHealth, StreamStatus
from streaming.video_source import SourceType
from utils.logger import get_logger
from utils.time import elapsed_ms, utc_iso
from workers.inference_worker import InferenceWorker

logger = get_logger("main")

_shutdown_event = threading.Event()


def _handle_signal(signum, frame):
    logger.info("Signal %s received — shutting down", signum)
    _shutdown_event.set()


signal.signal(signal.SIGINT, _handle_signal)
signal.signal(signal.SIGTERM, _handle_signal)


def _deserialize_output(output) -> dict:
    try:
        return output.model_dump()
    except Exception:
        return output


def _annotate_frame(worker, annotated, tracks, output, width, height,
                    anpr_obs=None, face_obs=None):
    """Development-only overlay: zones, fences, bboxes, reference points,
    trajectory, and context labels (+ Phase 12 plate/face bboxes)."""
    engine = worker.context_engine

    def _px(p):
        return int(p["x"] * width), int(p["y"] * height)

    # Zone polygons.
    for z in engine.zone_overlays():
        pts = [_px(pt) for pt in z["coordinates"]]
        if len(pts) < 3:
            continue
        color = (0, 0, 255) if z["zoneType"] == "RESTRICTED" else (255, 0, 0)
        pts_np = [list(p) for p in pts]
        pts_np = np.array(pts_np, np.int32).reshape((-1, 1, 2))
        cv2.polylines(annotated, [pts_np], True, color, 2)
        cv2.putText(annotated, z["zoneCode"], pts[0], cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)

    # Virtual fences (lines).
    for f in engine.fence_overlays():
        a = _px(f["a"])
        b = _px(f["b"])
        cv2.line(annotated, a, b, (0, 255, 255), 2)
        cv2.putText(annotated, f["zoneCode"], a, cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)

    # Tracks: bbox, reference point, trajectory.
    for t in tracks:
        x1, y1, x2, y2 = int(t.bbox.x1), int(t.bbox.y1), int(t.bbox.x2), int(t.bbox.y2)
        color = (0, 255, 0) if t.state == "CONFIRMED" else (0, 165, 255)
        cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
        label = f"{t.objectType} | ID {t.trackId}"
        if t.vehicleType:
            label = f"{t.objectType} | {t.vehicleType} | ID {t.trackId}"
        cv2.putText(annotated, label, (x1, max(y1 - 8, 10)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1)
        # Reference point (bottom-center).
        rx = (x1 + x2) // 2
        ry = y2
        cv2.circle(annotated, (rx, ry), 4, (0, 0, 255), -1)

    # Trajectory history polyline for each confirmed track (tracker pixel history).
    for cm in output.tracks:
        if not cm.historyLength:
            continue
        entry = worker._track_manager.get_track(cm.trackId)
        if not entry or not entry.history:
            continue
        pts = [(int(p["x"]), int(p["y"])) for p in entry.history]
        if len(pts) >= 2:
            cv2.polylines(annotated, [np.array(pts, np.int32).reshape((-1, 1, 2))], False, (255, 0, 255), 1)

    # Context event labels for this frame.
    y_offset = 20
    for c in output.context:
        text = f"{c.type} | TID {c.trackId}"
        cv2.putText(annotated, text, (10, y_offset), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 200, 255), 2)
        y_offset += 20

    # Phase 10: risk score/severity overlay per track.
    risk_y_offset = y_offset + 10
    for r in output.risk:
        color = {
            "INFO": (200, 200, 200), "LOW": (0, 200, 0),
            "MEDIUM": (0, 165, 255), "HIGH": (0, 0, 255),
            "CRITICAL": (0, 0, 200),
        }.get(r.severity, (200, 200, 200))
        text = f"Risk: {r.score:.0f} ({r.severity}) | TID {r.trackId}"
        cv2.putText(annotated, text, (10, risk_y_offset), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
        risk_y_offset += 20

    # Phase 12: confirmed plate bbox (green) and face bbox (cyan) overlays.
    for obs in (anpr_obs or []):
        b = obs.bbox
        x1, y1 = int(b.x1), int(b.y1)
        x2, y2 = int(b.x2), int(b.y2)
        cv2.rectangle(annotated, (x1, y1), (x2, y2), (0, 255, 0), 2)
        cv2.putText(annotated, f"PLATE {obs.plate_text}", (x1, max(y1 - 8, 10)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)
    for obs in (face_obs or []):
        b = obs.bbox
        x1, y1 = int(b.x1), int(b.y1)
        x2, y2 = int(b.x2), int(b.y2)
        cv2.rectangle(annotated, (x1, y1), (x2, y2), (255, 255, 0), 2)
        cv2.putText(annotated, "FACE", (x1, max(y1 - 8, 10)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 0), 1)


def run_video_pipeline(
    video_path: str,
    debug_preview: bool = False,
    save_output: str | None = None,
) -> dict:
    """Run local MP4 video through the Phase 9 pipeline and return metrics."""
    health = StreamHealth()
    set_stream_health(health)
    health.set_status(StreamStatus.CONNECTING)

    reader = FileVideoReader(video_path)
    buffer = FrameBuffer(maxsize=FRAME_BUFFER_SIZE)
    worker = InferenceWorker(source_id="VIDEO_FILE", camera_code=AI_CAMERA_CODE)
    model_ok = worker.initialize()

    set_model_info(worker.get_stats()["detectorInfo"])
    set_tracking_info({"enabled": model_ok, "tracker": TRACKER})

    if not model_ok:
        health.set_status(StreamStatus.ERROR, "Model load failed")
        logger.error("Pipeline aborted — cannot load YOLO model")
        reader.close()
        return {"modelLoaded": False}

    node_client = NodeClient()
    evidence_manager = EvidenceManager(enabled=EVIDENCE_ENABLED)

    # Phase 12: ANPR + face-detection managers. Detection-only; failures degrade
    # to UNAVAILABLE without stopping the main pipeline.
    anpr_manager = AnprManager(enabled=ANPR_ENABLED)
    face_manager = FaceManager(enabled=FACE_DETECTION_ENABLED)
    anpr_ok = anpr_manager.initialize()
    face_ok = face_manager.initialize()
    anpr_stats = anpr_manager.get_stats()
    set_anpr_info({
        "enabled": ANPR_ENABLED,
        "detectorLoaded": anpr_manager.ready(),
        "detectorMode": anpr_stats.get("detectorMode"),
        "ocrLoaded": anpr_stats.get("ocrLoaded"),
        "ocrEngine": "easyocr",
        "ocrStatus": anpr_stats.get("ocrStatus"),
        "status": anpr_stats.get("status"),
    })
    set_face_info({
        "enabled": FACE_DETECTION_ENABLED,
        "modelLoaded": face_manager.ready(),
        "status": "READY" if face_ok else "ERROR" if FACE_DETECTION_ENABLED else "DISABLED",
        "recognition": False,
    })
    if not anpr_ok or not face_ok:
        logger.warning("Phase 12 init: anpr_ok=%s face_ok=%s (degraded, not fatal)",
                       anpr_ok, face_ok)

    pipeline_start = time.time()
    metrics = {
        "sourceFps": 0.0,
        "sampleFps": FRAME_SAMPLE_FPS,
        "framesRead": 0,
        "framesSampled": 0,
        "framesSkippedBySampler": 0,
        "framesDroppedByBuffer": 0,
        "framesProcessed": 0,
        "detectionsTotal": 0,
        "personsDetected": 0,
        "vehiclesDetected": 0,
        "tracksCreated": 0,
        "confirmedTracks": 0,
        "contextStatus": "NOT_CONFIGURED",
        "contextZonesLoaded": 0,
        "contextFencesLoaded": 0,
        "contextObservationsGenerated": 0,
        "contextObservationsDelivered": 0,
        "contextDuplicateSuppressed": 0,
        "contextProcessingLatencyMs": 0.0,
        "riskStatus": "NOT_CONFIGURED",
        "riskRulesLoaded": 0,
        "riskRulesEnabled": 0,
        "riskObservationsGenerated": 0,
        "riskObservationsDelivered": 0,
        "riskDuplicateSuppressed": 0,
        "riskProcessingLatencyMs": 0.0,
        "nodeDeliveriesSuccess": 0,
        "nodeDeliveriesFailed": 0,
        "contextDeliveriesSuccess": 0,
        "contextDeliveriesFailed": 0,
        "riskDeliveriesSuccess": 0,
        "riskDeliveriesFailed": 0,
        "anprEnabled": ANPR_ENABLED,
        "anprStatus": "DISABLED",
        "anprPlateDetections": 0,
        "anprOcrAttempts": 0,
        "anprOcrSuccesses": 0,
        "anprOcrFailures": 0,
        "anprObservationsGenerated": 0,
        "anprObservationsDelivered": 0,
        "anprDeliveriesSuccess": 0,
        "anprDeliveriesFailed": 0,
        "anprAveragePlateDetectLatencyMs": 0.0,
        "anprAverageOcrLatencyMs": 0.0,
        "faceEnabled": FACE_DETECTION_ENABLED,
        "faceStatus": "DISABLED",
        "facePersonsEvaluated": 0,
        "faceDetections": 0,
        "faceObservationsGenerated": 0,
        "faceObservationsDelivered": 0,
        "faceDeliveriesSuccess": 0,
        "faceDeliveriesFailed": 0,
        "faceAverageDetectionLatencyMs": 0.0,
        "faceEvidenceCaptured": 0,
        "faceEvidenceDelivered": 0,
        "faceEvidenceFailed": 0,
        "evidenceEnabled": EVIDENCE_ENABLED,
        "evidenceCaptured": 0,
        "evidenceDelivered": 0,
        "evidenceFailed": 0,
        "averageInferenceLatencyMs": 0.0,
        "averageProcessingLatencyMs": 0.0,
        "totalProcessingTimeMs": 0.0,
        "outputs": [],
    }

    # Fetch camera context configuration (zones/fences) from Node. Python never
    # queries MySQL directly. If unavailable, detection/tracking still run and
    # context degrades to CONFIG_UNAVAILABLE.
    context_status = "DISABLED"
    if CONTEXT_ENABLED:
        config_result = asyncio.run(node_client.fetch_context_config(AI_CAMERA_CODE))
        if config_result.get("ok"):
            worker.context_engine.set_config(config_result["config"])
            context_status = worker.context_engine.config_status
            logger.info("Context config loaded for %s — status=%s",
                        AI_CAMERA_CODE, context_status)
        else:
            worker.context_engine.mark_config_unavailable()
            context_status = "CONFIG_UNAVAILABLE"
            logger.error("Context config unavailable from Node: %s", config_result.get("error"))
    set_context_info({
        "enabled": CONTEXT_ENABLED,
        "status": context_status,
        "zonesLoaded": worker.context_engine.zones_loaded(),
        "fencesLoaded": worker.context_engine.fences_loaded(),
    })

    # Phase 10: fetch risk configuration (risk rules + severity thresholds) from Node.
    risk_status = "DISABLED"
    if RISK_ENABLED:
        risk_config_result = asyncio.run(node_client.fetch_risk_config(AI_CAMERA_CODE))
        if risk_config_result.get("ok"):
            cfg = risk_config_result["config"]
            worker.risk_engine.set_config(
                rules=cfg.get("rules", []),
                severity_thresholds=cfg.get("severityThresholds"),
                camera_code=AI_CAMERA_CODE,
            )
            risk_status = worker.risk_engine.config_status
            logger.info("Risk config loaded for %s — status=%s, rules=%d",
                        AI_CAMERA_CODE, risk_status, worker.risk_engine.rules_loaded())
        else:
            worker.risk_engine.mark_config_unavailable()
            risk_status = "CONFIG_UNAVAILABLE"
            logger.error("Risk config unavailable from Node: %s", risk_config_result.get("error"))
    set_risk_info({
        "enabled": RISK_ENABLED,
        "status": risk_status,
        "rulesLoaded": worker.risk_engine.rules_loaded(),
        "rulesEnabled": worker.risk_engine.rules_enabled(),
    })

    video_writer = None
    if save_output:
        OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
        save_path = Path(save_output)
        save_path.parent.mkdir(parents=True, exist_ok=True)
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        video_writer = cv2.VideoWriter(str(save_path), fourcc, FRAME_SAMPLE_FPS, (FRAME_WIDTH, FRAME_HEIGHT))

    source_fps = 0.0

    try:
        reader.open()
        source_fps = reader.get_metadata()["fps"]
        meta = reader.get_metadata()
        health.set_source_info("VIDEO_FILE", source_fps)

        sampler = FrameSampler(
            source_fps=source_fps,
            target_fps=FRAME_SAMPLE_FPS,
            source_id="LOCAL_TEST",
            index_based=True,
        )

        health.set_status(StreamStatus.ONLINE)
        logger.info("Pipeline started — source: %s | res %dx%d | sample %d fps",
                    video_path, meta["width"], meta["height"], FRAME_SAMPLE_FPS)

        preview_active = False
        if debug_preview or save_output:
            preview_active = True
            if debug_preview:
                try:
                    cv2.namedWindow("IBVAP AI Pipeline", cv2.WINDOW_NORMAL)
                except Exception:
                    preview_active = False
                    logger.warning("Preview unavailable — running headless")

        inference_latencies = []
        processing_latencies = []
        all_anpr_obs = []
        all_face_obs = []

        while reader.is_open() and not _shutdown_event.is_set():
            ret, raw_frame = reader.read()
            if not ret or raw_frame is None:
                health.set_status(StreamStatus.EOF)
                logger.info("EOF reached")
                break

            metrics["framesRead"] += 1
            health.record_frame_received()

            frame = sampler.process_frame(raw_frame)
            if frame is None:
                metrics["framesSkippedBySampler"] += 1
                health.record_frame_dropped()
                continue

            metrics["framesSampled"] += 1
            buffer.push(frame)
            buffered_frame = buffer.pop()
            if buffered_frame is None:
                metrics["framesDroppedByBuffer"] += 1
                continue

            inf_start = time.time()
            output = worker.process_frame(buffered_frame)
            inf_latency = elapsed_ms(inf_start)

            inference_latencies.append(inf_latency)
            processing_latencies.append(output.processing.latencyMs)
            metrics["framesProcessed"] += 1
            health.record_frame_processed(output.processing.latencyMs)

            detectors = output.tracks
            detections = output.detections
            metrics["detectionsTotal"] += len(detections)
            metrics["personsDetected"] += sum(1 for d in detections if d.objectType == "PERSON")
            metrics["vehiclesDetected"] += sum(1 for d in detections if d.objectType == "VEHICLE")

            metrics["outputs"].append(_deserialize_output(output))

            # Primary detection events remain one-shot; secondary detectors
            # receive every currently visible confirmed track for consensus.
            current_confirmed = worker.get_current_confirmed_tracks()

            # Phase 12: drive ANPR + face detection from confirmed tracks.
            frame_anpr_obs = []
            frame_face_obs = []
            confirmed_vehicles = {
                t["trackId"]: t["bbox"]
                for t in current_confirmed if t["objectType"] == "VEHICLE"
            }
            confirmed_vehicle_types = {
                t["trackId"]: t.get("vehicleType")
                for t in current_confirmed if t["objectType"] == "VEHICLE"
            }
            confirmed_persons = {
                t["trackId"]: t["bbox"]
                for t in current_confirmed if t["objectType"] == "PERSON"
            }
            observed_at = utc_iso()
            observed_src_ms = int(buffered_frame.source_timestamp_ms or 0)

            if confirmed_vehicles:
                frame_anpr_obs = anpr_manager.process_frame(
                    buffered_frame.image, confirmed_vehicles, observed_at, observed_src_ms,
                    vehicle_types=confirmed_vehicle_types,
                )
                for obs in frame_anpr_obs:
                    obs.camera_code = AI_CAMERA_CODE
                all_anpr_obs.extend(frame_anpr_obs)

            if confirmed_persons:
                frame_face_obs = face_manager.process_frame(
                    buffered_frame.image, confirmed_persons, observed_at, observed_src_ms
                )
                for obs in frame_face_obs:
                    obs.camera_code = AI_CAMERA_CODE
                all_face_obs.extend(frame_face_obs)

            # Annotate frame (needed for preview, output, or evidence capture).
            need_annotate = preview_active or video_writer or evidence_manager.enabled
            annotated = buffered_frame.image.copy()
            if need_annotate:
                _annotate_frame(worker, annotated, detectors, output, FRAME_WIDTH, FRAME_HEIGHT,
                                anpr_obs=frame_anpr_obs, face_obs=frame_face_obs)

                # Record the annotated frame into the evidence ring buffer so a
                # snapshot / clip can be assembled when Node requests evidence.
                evidence_manager.record_frame(
                    annotated,
                    buffered_frame.captured_at,
                    buffered_frame.source_timestamp_ms,
                    buffered_frame.frame_index,
                )

                if video_writer:
                    video_writer.write(annotated)
                if debug_preview and preview_active:
                    cv2.imshow("IBVAP AI Pipeline", annotated)
                    if cv2.waitKey(1) & 0xFF == ord("q"):
                        logger.info("Preview terminated by user")
                        break

            if metrics["framesProcessed"] % 50 == 0:
                logger.info("Processed %d frames (%.1f ms)", metrics["framesProcessed"], inf_latency)

    except FileNotFoundError as e:
        health.set_status(StreamStatus.ERROR, str(e))
        logger.error("File not found: %s", e)
    except Exception as e:
        health.set_status(StreamStatus.ERROR, str(e))
        logger.error("Unexpected error: %s", e)
    finally:
        reader.close()
        buffer.clear()
        if video_writer:
            video_writer.release()
        if debug_preview and preview_active:
            try:
                cv2.destroyAllWindows()
            except Exception:
                pass

    return _finalize_and_emit(
        metrics, worker, node_client, evidence_manager, anpr_manager, face_manager,
        all_anpr_obs, all_face_obs, inference_latencies, context_status, risk_status,
        pipeline_start, reader, buffer, sampler, health, source_fps,
    )


def run_live_pipeline(
    camera_code: str,
    debug_preview: bool = False,
    save_output: str | None = None,
) -> dict:
    """Run a live camera source (RTSP / HTTP / MJPEG / mobile) through the SAME
    Phase 9-12 pipeline, reconnecting with bounded backoff and publishing runtime
    state to Redis. VIDEO_FILE mode is unaffected; this path only activates when
    a camera is configured with a live source type.

    Detection/tracking/context/risk/ANPR/face logic is unchanged; Node remains
    the sole alert authority. On reconnect, per-session state (track/context/risk
    and ANPR/face confirmation) is reset so prior objects are not carried across
    a disconnected session. Redis failure degrades silently and never corrupts
    MySQL.
    """
    health = StreamHealth()
    set_stream_health(health)
    health.set_status(StreamStatus.CONNECTING)

    node_client = NodeClient()
    src_result = asyncio.run(node_client.fetch_source_config(camera_code))
    if not src_result.get("ok"):
        health.set_status(StreamStatus.ERROR, src_result.get("error", "source_config_unavailable"))
        logger.error("Cannot start live pipeline for %s: %s", camera_code, src_result.get("error"))
        return {"live": True, "started": False, "reason": "source_config_unavailable"}

    cfg = src_result["config"] or {}
    source_type = cfg.get("sourceType") or "HTTP"
    protocol = cfg.get("protocol")
    rotation_degrees = normalize_rotation_degrees(cfg.get("rotationDegrees"))
    stream_url = cfg.get("streamUrl")
    # Website-set per-camera target processing FPS (falls back to the global
    # FRAME_SAMPLE_FPS when unset). Bounded so a bad value can't saturate the
    # inference worker or starve the preview.
    target_fps = max(0.1, min(float(cfg.get("targetFps") or FRAME_SAMPLE_FPS), 60.0))

    if not cfg.get("enabled", True):
        health.set_status(StreamStatus.OFFLINE, "camera_disabled")
        logger.info("Camera %s disabled — not starting live pipeline", camera_code)
        return {"live": True, "started": False, "reason": "camera_disabled"}

    # Source factory maps sourceType -> FileVideoReader or LiveVideoSource; unknown
    # types are rejected safely (no half-configured reader).
    try:
        reader = create_video_source(build_source_config(
            camera_code=camera_code,
            source_type=source_type,
            protocol=protocol,
            stream_url=stream_url,
            rotation_degrees=rotation_degrees,
            connect_timeout_seconds=STREAM_CONNECT_TIMEOUT_SECONDS,
            read_timeout_seconds=STREAM_READ_TIMEOUT_SECONDS,
        ))
    except Exception as e:
        health.set_status(StreamStatus.ERROR, f"unsupported_source: {e}")
        logger.error("Unsupported live source for %s: %s", camera_code, e)
        return {"live": True, "started": False, "reason": "unsupported_source"}

    if not hasattr(reader, "is_open"):
        # Degenerate: file path routed to live loop — not supported here.
        health.set_status(StreamStatus.ERROR, "live_loop_requires_live_source")
        reader.close()
        return {"live": True, "started": False, "reason": "not_live_source"}

    buffer = FrameBuffer(maxsize=FRAME_BUFFER_SIZE)
    worker = InferenceWorker(source_id=source_type, camera_code=camera_code)
    model_ok = worker.initialize()
    set_model_info(worker.get_stats()["detectorInfo"])
    set_tracking_info({"enabled": model_ok, "tracker": TRACKER})
    if not model_ok:
        health.set_status(StreamStatus.ERROR, "Model load failed")
        logger.error("Live pipeline aborted — cannot load YOLO model")
        reader.close()
        return {"modelLoaded": False}

    evidence_manager = EvidenceManager(enabled=EVIDENCE_ENABLED)
    anpr_manager = AnprManager(enabled=ANPR_ENABLED)
    face_manager = FaceManager(enabled=FACE_DETECTION_ENABLED)
    anpr_ok = anpr_manager.initialize()
    face_ok = face_manager.initialize()
    anpr_stats = anpr_manager.get_stats()
    set_anpr_info({
        "enabled": ANPR_ENABLED,
        "detectorLoaded": anpr_manager.ready(),
        "detectorMode": anpr_stats.get("detectorMode"),
        "ocrLoaded": anpr_stats.get("ocrLoaded"),
        "ocrEngine": "easyocr",
        "ocrStatus": anpr_stats.get("ocrStatus"),
        "status": anpr_stats.get("status"),
    })
    set_face_info({
        "enabled": FACE_DETECTION_ENABLED,
        "modelLoaded": face_manager.ready(),
        "status": "READY" if face_ok else "ERROR" if FACE_DETECTION_ENABLED else "DISABLED",
        "recognition": False,
    })

    # Browser-compatible preview: only the latest annotated frame is retained.
    preview_store = LatestFrameStore()
    set_preview_store(preview_store)

    redis_client = RedisRuntimeClient(enabled=REDIS_ENABLED)
    reconnect = ReconnectController(max_delay_seconds=STREAM_RECONNECT_MAX_SECONDS)

    pipeline_start = time.time()
    metrics = {
        "sourceType": source_type,
        "rotationDegrees": rotation_degrees,
        "sourceFps": 0.0,
        "sampleFps": target_fps,
        "framesRead": 0,
        "framesSampled": 0,
        "framesSkippedBySampler": 0,
        "framesDroppedByBuffer": 0,
        "framesProcessed": 0,
        "detectionsTotal": 0,
        "personsDetected": 0,
        "vehiclesDetected": 0,
        "tracksCreated": 0,
        "confirmedTracks": 0,
        "contextStatus": "NOT_CONFIGURED",
        "contextZonesLoaded": 0,
        "contextFencesLoaded": 0,
        "contextObservationsGenerated": 0,
        "contextObservationsDelivered": 0,
        "contextDuplicateSuppressed": 0,
        "contextProcessingLatencyMs": 0.0,
        "riskStatus": "NOT_CONFIGURED",
        "riskRulesLoaded": 0,
        "riskRulesEnabled": 0,
        "riskObservationsGenerated": 0,
        "riskObservationsDelivered": 0,
        "riskDuplicateSuppressed": 0,
        "riskProcessingLatencyMs": 0.0,
        "nodeDeliveriesSuccess": 0,
        "nodeDeliveriesFailed": 0,
        "contextDeliveriesSuccess": 0,
        "contextDeliveriesFailed": 0,
        "riskDeliveriesSuccess": 0,
        "riskDeliveriesFailed": 0,
        "anprEnabled": ANPR_ENABLED,
        "anprStatus": "DISABLED",
        "anprPlateDetections": 0,
        "anprOcrAttempts": 0,
        "anprOcrSuccesses": 0,
        "anprOcrFailures": 0,
        "anprObservationsGenerated": 0,
        "anprObservationsDelivered": 0,
        "anprDeliveriesSuccess": 0,
        "anprDeliveriesFailed": 0,
        "anprAveragePlateDetectLatencyMs": 0.0,
        "anprAverageOcrLatencyMs": 0.0,
        "faceEnabled": FACE_DETECTION_ENABLED,
        "faceStatus": "DISABLED",
        "facePersonsEvaluated": 0,
        "faceDetections": 0,
        "faceObservationsGenerated": 0,
        "faceObservationsDelivered": 0,
        "faceDeliveriesSuccess": 0,
        "faceDeliveriesFailed": 0,
        "faceAverageDetectionLatencyMs": 0.0,
        "faceEvidenceCaptured": 0,
        "faceEvidenceDelivered": 0,
        "faceEvidenceFailed": 0,
        "evidenceEnabled": EVIDENCE_ENABLED,
        "evidenceCaptured": 0,
        "evidenceDelivered": 0,
        "evidenceFailed": 0,
        "averageInferenceLatencyMs": 0.0,
        "averageProcessingLatencyMs": 0.0,
        "totalProcessingTimeMs": 0.0,
        "outputs": [],
    }

    # Fetch camera context configuration (zones/fences) from Node.
    context_status = "DISABLED"
    if CONTEXT_ENABLED:
        config_result = asyncio.run(node_client.fetch_context_config(camera_code))
        if config_result.get("ok"):
            worker.context_engine.set_config(
                rotate_context_config(config_result["config"], rotation_degrees)
            )
            context_status = worker.context_engine.config_status
        else:
            worker.context_engine.mark_config_unavailable()
            context_status = "CONFIG_UNAVAILABLE"
            logger.error("Context config unavailable from Node: %s", config_result.get("error"))
    set_context_info({
        "enabled": CONTEXT_ENABLED,
        "status": context_status,
        "zonesLoaded": worker.context_engine.zones_loaded(),
        "fencesLoaded": worker.context_engine.fences_loaded(),
    })

    # Fetch risk configuration from Node.
    risk_status = "DISABLED"
    if RISK_ENABLED:
        risk_result = asyncio.run(node_client.fetch_risk_config(camera_code))
        if risk_result.get("ok"):
            rcfg = risk_result["config"]
            worker.risk_engine.set_config(
                rules=rcfg.get("rules", []),
                severity_thresholds=rcfg.get("severityThresholds"),
                camera_code=camera_code,
            )
            risk_status = worker.risk_engine.config_status
        else:
            worker.risk_engine.mark_config_unavailable()
            risk_status = "CONFIG_UNAVAILABLE"
            logger.error("Risk config unavailable from Node: %s", risk_result.get("error"))
    set_risk_info({
        "enabled": RISK_ENABLED,
        "status": risk_status,
        "rulesLoaded": worker.risk_engine.rules_loaded(),
        "rulesEnabled": worker.risk_engine.rules_enabled(),
    })

    video_writer = None
    if save_output:
        OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
        save_path = Path(save_output)
        save_path.parent.mkdir(parents=True, exist_ok=True)
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        video_writer = cv2.VideoWriter(str(save_path), fourcc, FRAME_SAMPLE_FPS, (FRAME_WIDTH, FRAME_HEIGHT))

    # Streaming dedup state (persisted across the live loop).
    seen_track_ids: set = set()
    seen_context_keys: set = set()
    seen_risk_keys: set = set()
    inference_latencies: list[float] = []
    last_heartbeat_at: float = 0.0
    last_published_session_id: str | None = None
    first_session_established = False
    # Source-config refresh + persistent sampler bookkeeping. The sampler lives
    # for a whole stream session (not per frame) so the time-based interval
    # actually throttles at target_fps; it is rebuilt only when the source FPS
    # is first known or when target_fps changes.
    last_config_refresh_at: float = 0.0
    last_context_config_refresh_at: float = time.time()
    sampler: FrameSampler | None = None
    sampler_source_fps: float = 0.0
    sampler_target_fps: float | None = None
    read_gap_active = False
    last_trace_at: float = 0.0

    source_info = {
        "cameraCode": camera_code,
        "sourceType": source_type,
        "protocol": protocol,
        "rotationDegrees": rotation_degrees,
        "status": "CONNECTING",
        "streamSessionId": None,
        "reconnectAttempts": 0,
        "lastFrameAt": None,
    }
    set_live_source_info(source_info)

    def _refresh_source_info():
        source_info.update({
            "cameraCode": camera_code,
            "sourceType": source_type,
            "protocol": protocol,
            "rotationDegrees": rotation_degrees,
            "status": health.get_report().get("status"),
            "streamSessionId": reconnect.session_id,
            "reconnectAttempts": reconnect.policy.attempts,
            "lastFrameAt": reader.last_read_at if hasattr(reader, "last_read_at") else None,
        })
        set_live_source_info(dict(source_info))

    def _reset_session():
        worker.reset_session()
        anpr_manager.reset()
        face_manager.reset()
        evidence_manager.clear()
        # Track IDs are session-local and may be reused after a reconnect.
        # Delivery deduplication must therefore reset with tracking/context/risk
        # state or valid observations from the new session are suppressed.
        _clear_live_session_dedup(
            seen_track_ids, seen_context_keys, seen_risk_keys
        )
        logger.info("Session reset for %s (stream reconnect)", camera_code)

    # Apply a (re-fetched) source config from Node. Website changes to the RTSP
    # URL / transport rebuild the reader (forced reconnect); rotation/target FPS
    # are applied without a reconnect. Returns False when the camera was disabled
    # so the loop can stop cleanly. The stream URL is always redacted in logs.
    def _apply_source_config(cfg_new):
        nonlocal source_type, protocol, rotation_degrees, stream_url, target_fps, reader

        if not cfg_new.get("enabled", True):
            logger.info("Camera %s disabled via website — stopping live pipeline", camera_code)
            health.set_status(StreamStatus.OFFLINE, "camera_disabled")
            try:
                reader.close()
            except Exception:
                pass
            return False

        next_source_type = cfg_new.get("sourceType") or "HTTP"
        next_protocol = cfg_new.get("protocol")
        next_rotation = normalize_rotation_degrees(cfg_new.get("rotationDegrees"))
        next_stream_url = cfg_new.get("streamUrl")
        next_target_fps = max(0.1, min(float(cfg_new.get("targetFps") or FRAME_SAMPLE_FPS), 60.0))

        transport_changed = (
            next_source_type != source_type
            or next_protocol != protocol
            or (next_stream_url or "") != (stream_url or "")
        )

        if transport_changed:
            logger.info(
                "Source config changed for %s via website: type=%s protocol=%s url=%s — reconnecting",
                camera_code, next_source_type, next_protocol, redact_stream_url(next_stream_url),
            )
            new_reader = None
            try:
                new_reader = create_video_source(build_source_config(
                    camera_code=camera_code,
                    source_type=next_source_type,
                    protocol=next_protocol,
                    stream_url=next_stream_url,
                    rotation_degrees=next_rotation,
                    connect_timeout_seconds=STREAM_CONNECT_TIMEOUT_SECONDS,
                    read_timeout_seconds=STREAM_READ_TIMEOUT_SECONDS,
                ))
            except Exception as e:
                logger.error("Cannot apply updated source for %s: %s", camera_code, e)
                # Keep the old reader; the next refresh will retry.
                return True
            old_reader = reader
            reader = new_reader
            try:
                old_reader.close()
            except Exception:
                pass

        source_type = next_source_type
        protocol = next_protocol
        rotation_degrees = next_rotation
        stream_url = next_stream_url
        target_fps = next_target_fps
        metrics["sampleFps"] = target_fps
        _refresh_source_info()
        return True

    def _apply_risk_config(rcfg_new):
        nonlocal risk_status
        worker.risk_engine.set_config(
            rules=rcfg_new.get("rules", []),
            severity_thresholds=rcfg_new.get("severityThresholds"),
            camera_code=camera_code,
        )
        risk_status = worker.risk_engine.config_status
        set_risk_info({
            "enabled": RISK_ENABLED,
            "status": risk_status,
            "rulesLoaded": worker.risk_engine.rules_loaded(),
            "rulesEnabled": worker.risk_engine.rules_enabled(),
        })

    # Re-apply camera context config (zones/fences) on the refresh cadence so
    # Admin zone edits reach the live pipeline without a manual restart. The
    # current rotation is applied so geometry stays aligned with the frame.
    def _apply_context_config(ccfg_new):
        nonlocal context_status
        worker.context_engine.set_config(
            rotate_context_config(ccfg_new, rotation_degrees)
        )
        context_status = worker.context_engine.config_status
        set_context_info({
            "enabled": CONTEXT_ENABLED,
            "status": context_status,
            "zonesLoaded": worker.context_engine.zones_loaded(),
            "fencesLoaded": worker.context_engine.fences_loaded(),
        })

    def _publish_heartbeat():
        nonlocal last_heartbeat_at, last_published_session_id
        report = health.get_report()
        session_changed = (
            last_published_session_id is not None
            and reconnect.session_id != last_published_session_id
        )
        heartbeat_payload = {
            "status": report.get("status"),
            "sourceType": source_type,
            "protocol": protocol,
            "streamSessionId": reconnect.session_id,
            "lastSessionId": reconnect.last_session_id,
            "sessionChanged": session_changed,
            "reconnectAttempts": reconnect.policy.attempts,
            "lastFrameTimestamp": report.get("lastFrameTimestamp"),
            "framesProcessed": metrics["framesProcessed"],
            "lastHeartbeatAt": utc_iso(),
        }
        ok = redis_client.publish_camera_status(camera_code, heartbeat_payload)
        if session_changed:
            logger.info("Stream session changed for %s — runtime status updated (redis=%s)",
                        camera_code, "ok" if ok else "degraded")
        last_published_session_id = reconnect.session_id
        last_heartbeat_at = time.time()

    try:
        while not _shutdown_event.is_set():
            # Pick up website source-config changes (RTSP URL, transport,
            # rotation, target FPS, enabled). A transport change rebuilds the
            # reader; the next pass below reconnects automatically.
            if time.time() - last_config_refresh_at >= SOURCE_CONFIG_REFRESH_SECONDS:
                last_config_refresh_at = time.time()
                refresh = asyncio.run(node_client.fetch_source_config(camera_code))
                if refresh.get("ok"):
                    if not _apply_source_config(refresh.get("config") or {}):
                        break
                else:
                    logger.warning(
                        "Source config refresh degraded for %s: %s",
                        camera_code, refresh.get("error"),
                    )

                # Refresh risk rules/thresholds on the same cadence so admin edits
                # (RiskRules UI) take effect on the live pipeline without a restart.
                risk_refresh = asyncio.run(node_client.fetch_risk_config(camera_code))
                if risk_refresh.get("ok"):
                    _apply_risk_config(risk_refresh.get("config") or {})
                else:
                    logger.warning(
                        "Risk config refresh degraded for %s: %s",
                        camera_code, risk_refresh.get("error"),
                    )

                # Refresh context config (zones/fences) on its own cadence so
                # Admin zone/fence edits reach the live engine without a restart.
                if time.time() - last_context_config_refresh_at >= CONTEXT_CONFIG_REFRESH_SECONDS:
                    last_context_config_refresh_at = time.time()
                    ctx_refresh = asyncio.run(node_client.fetch_context_config(camera_code))
                    if ctx_refresh.get("ok"):
                        _apply_context_config(ctx_refresh.get("config") or {})
                    else:
                        logger.warning(
                            "Context config refresh degraded for %s: %s",
                            camera_code, ctx_refresh.get("error"),
                        )

            if not reader.is_open():
                # Mint/reset a stream session only after a successful open.
                # Failed attempts retain exponential backoff state (1,2,4...).
                if reconnect.policy.attempts > 0:
                    health.set_status(StreamStatus.RECONNECTING)
                try:
                    reader.open()
                    session_id = reconnect.begin_session()
                    if reconnect.session_changed() and first_session_established:
                        _reset_session()
                    first_session_established = True
                    health.set_session(reconnect.session_id)
                    health.record_heartbeat()
                    health.set_status(StreamStatus.ONLINE)
                    health.set_reconnect_attempts(reconnect.policy.attempts)
                    health.set_source_info(
                        source_type,
                        reader.get_metadata().get("fps", 0.0) or 0.0,
                    )
                    logger.info("Live source connected: %s (session %s)", camera_code, reconnect.session_id)
                    read_gap_active = False
                except IOError as e:
                    delay = reconnect.on_failure()
                    health.set_status(StreamStatus.RECONNECTING, str(e))
                    health.set_reconnect_attempts(reconnect.policy.attempts)
                    _refresh_source_info()
                    _shutdown_event.wait(
                        min(max(delay, 0.05), STREAM_RECONNECT_MAX_SECONDS)
                    )
                    continue

            ret, raw_frame = reader.read()
            if not ret or raw_frame is None:
                read_gap_active = True
                read_failures = reader.consecutive_failures if hasattr(reader, "consecutive_failures") else 1
                health.record_read_error("no_frame")
                health.set_status(StreamStatus.DEGRADED, f"no_frame ({read_failures})")
                reader_meta = reader.get_metadata()
                time_since_last_frame = float(reader_meta.get("secondsSinceLastFrame") or 0.0)
                reader_alive = bool(reader_meta.get("captureIsOpened"))
                rebuild_reader = should_rebuild_after_no_frame(
                    read_failures,
                    STREAM_MAX_CONSECUTIVE_READ_FAILURES,
                    time_since_last_frame,
                    STREAM_NO_FRAME_TOLERANCE_SECONDS,
                )
                reconnect_reason = (
                    "no_frame_tolerance_exceeded" if rebuild_reader
                    else "temporary_frame_gap"
                )
                logger.warning(
                    "Live no_frame cameraCode=%s streamSessionId=%s timestamp=%s "
                    "lastSuccessfulFrameAt=%s timeSinceLastFrame=%.3fs framesRead=%d "
                    "framesProcessed=%d readErrors=%d consecutiveReadFailures=%d "
                    "readerState=%s rtspReaderAlive=%s readerMode=%s configChanged=false "
                    "readerRebuilt=%s reconnectReason=%s failureReason=%s",
                    camera_code,
                    reconnect.session_id,
                    utc_iso(),
                    reader_meta.get("lastReadAt"),
                    time_since_last_frame,
                    metrics["framesRead"],
                    metrics["framesProcessed"],
                    health.get_report().get("readErrors", 0),
                    read_failures,
                    "OPEN" if reader_meta.get("isOpen") else "CLOSED",
                    str(reader_alive).lower(),
                    reader_meta.get("readerMode", "synchronous"),
                    str(rebuild_reader).lower(),
                    reconnect_reason,
                    reader_meta.get("lastFailureReason"),
                )
                if rebuild_reader:
                    # Sustained read failures mean the source is truly gone. Only
                    # now do we close + reconnect, which mints a NEW stream session
                    # and resets per-track context/risk/ANPR/face state. A single
                    # dropped frame below the threshold must never do that.
                    logger.warning(
                        "Live source %s failing reads: reason=%s readErrors=%d framesRead=%d lastFrameAt=%s gap=%.3fs readerAge=%.1fs — reconnecting",
                        camera_code, reconnect_reason,
                        health.get_report().get("readErrors", 0), metrics["framesRead"],
                        reader.last_read_at if hasattr(reader, "last_read_at") else None,
                        time_since_last_frame,
                        time.time() - pipeline_start,
                    )
                    reader.close()
                    health.record_heartbeat()
                    _refresh_source_info()
                    delay = reconnect.on_failure()
                    _shutdown_event.wait(
                        min(max(delay, 0.05), STREAM_RECONNECT_MAX_SECONDS)
                    )
                else:
                    # Transient drop — keep the open session so short frame gaps
                    # do not wipe track/context/risk state mid-sequence.
                    logger.warning(
                        "Transient read failure for %s (%d of %d) — keeping stream session %s",
                        camera_code, read_failures, STREAM_MAX_CONSECUTIVE_READ_FAILURES,
                        reconnect.session_id,
                    )
                    _shutdown_event.wait(0.1)
                continue

            if read_gap_active:
                recovered_meta = reader.get_metadata()
                logger.info(
                    "Live frame gap recovered cameraCode=%s streamSessionId=%s "
                    "timestamp=%s lastSuccessfulFrameAt=%s framesRead=%d "
                    "framesProcessed=%d readerRebuilt=false",
                    camera_code,
                    reconnect.session_id,
                    utc_iso(),
                    recovered_meta.get("lastReadAt"),
                    metrics["framesRead"],
                    metrics["framesProcessed"],
                )
                health.set_status(StreamStatus.ONLINE)
                read_gap_active = False

            metrics["framesRead"] += 1
            health.record_frame_received()

            # Normalize camera orientation before sampling or inference. Every
            # downstream coordinate (detections, tracks, context, evidence,
            # annotations, and MJPEG) therefore uses the same landscape frame.
            raw_frame = rotate_image_clockwise(raw_frame, rotation_degrees)

            # Staleness: if frames stop arriving (hung camera), surface OFFLINE.
            if not first_session_established or (hasattr(reader, "is_stale") and reader.is_stale(STREAM_STALE_SECONDS)):
                health.record_heartbeat()

            # Persistent time-based sampler throttling at the website-set
            # target_fps. Constructed once per stream session and rebuilt only
            # when the source FPS is first known or target_fps changes — NOT per
            # frame (a per-frame rebuild reset the interval each time and sampled
            # every frame, defeating the configured rate).
            metadata_fps = reader.get_metadata().get("fps", 0.0) or 0.0
            if (
                sampler is None
                or sampler_target_fps != target_fps
                or (metadata_fps > 0 and sampler_source_fps != metadata_fps)
            ):
                sampler_source_fps = metadata_fps
                sampler_target_fps = target_fps
                sampler = FrameSampler(
                    source_fps=metadata_fps,
                    target_fps=target_fps,
                    source_id=source_type,
                    index_based=False,
                )
                metrics["sampleFps"] = target_fps
            frame = sampler.process_frame(raw_frame)
            if frame is None:
                metrics["framesSkippedBySampler"] += 1
                health.record_frame_dropped()
                continue

            metrics["framesSampled"] += 1
            buffer.push(frame)
            buffered_frame = buffer.pop()
            if buffered_frame is None:
                metrics["framesDroppedByBuffer"] += 1
                continue

            inf_start = time.time()
            output = worker.process_frame(buffered_frame, now=time.time())
            inf_latency = elapsed_ms(inf_start)
            inference_latencies.append(inf_latency)
            metrics["framesProcessed"] += 1
            health.record_frame_processed(output.processing.latencyMs)

            detections = output.detections
            metrics["detectionsTotal"] += len(detections)
            metrics["personsDetected"] += sum(1 for d in detections if d.objectType == "PERSON")
            metrics["vehiclesDetected"] += sum(1 for d in detections if d.objectType == "VEHICLE")
            output_dict = _deserialize_output(output)
            metrics["outputs"].append(output_dict)

            if (
                PIPELINE_TRACE_ENABLED
                and time.time() - last_trace_at >= PIPELINE_TRACE_INTERVAL_SECONDS
            ):
                last_trace_at = time.time()
                for trace in worker.trace_tracks(now=last_trace_at):
                    trace.update({
                        "timestamp": utc_iso(),
                        "cameraCode": camera_code,
                        "streamSessionId": reconnect.session_id,
                    })
                    logger.info("TRACK_TRACE %s", json.dumps(trace, separators=(",", ":")))

            # Phase 12: drive ANPR + face from confirmed tracks.
            # Primary detection events remain one-shot; secondary detectors
            # receive every currently visible confirmed track for consensus.
            current_confirmed = worker.get_current_confirmed_tracks()
            confirmed_vehicles = {
                t["trackId"]: t["bbox"]
                for t in current_confirmed if t["objectType"] == "VEHICLE"
            }
            confirmed_vehicle_types = {
                t["trackId"]: t.get("vehicleType")
                for t in current_confirmed if t["objectType"] == "VEHICLE"
            }
            confirmed_persons = {
                t["trackId"]: t["bbox"]
                for t in current_confirmed if t["objectType"] == "PERSON"
            }
            observed_at = utc_iso()
            observed_src_ms = int(buffered_frame.source_timestamp_ms or 0)
            frame_anpr_obs = []
            frame_face_obs = []
            if confirmed_vehicles:
                frame_anpr_obs = anpr_manager.process_frame(
                    buffered_frame.image, confirmed_vehicles, observed_at, observed_src_ms,
                    vehicle_types=confirmed_vehicle_types,
                )
                for obs in frame_anpr_obs:
                    obs.camera_code = camera_code
            if confirmed_persons:
                frame_face_obs = face_manager.process_frame(
                    buffered_frame.image, confirmed_persons, observed_at, observed_src_ms
                )
                for obs in frame_face_obs:
                    obs.camera_code = camera_code

            # Annotate only when needed (preview / video writer / evidence).
            need_annotate = preview_store is not None or video_writer or evidence_manager.enabled
            annotated = buffered_frame.image.copy()
            if need_annotate:
                _annotate_frame(worker, annotated, output.tracks, output, FRAME_WIDTH, FRAME_HEIGHT,
                                anpr_obs=frame_anpr_obs, face_obs=frame_face_obs)
                # Latest-frame preview + evidence ring buffer (bounded, never raw stream).
                if evidence_manager.enabled:
                    evidence_manager.record_frame(
                        annotated, buffered_frame.captured_at, buffered_frame.source_timestamp_ms,
                        buffered_frame.frame_index,
                    )
                if video_writer:
                    video_writer.write(annotated)
                preview_store.set(annotated)

            # Stream observations to Node immediately (Node is the alert authority).
            _emit_live_observations(
                metrics, node_client, evidence_manager, camera_code, output_dict,
                frame_anpr_obs, frame_face_obs,
                seen_track_ids, seen_context_keys, seen_risk_keys,
                buffered_frame.image if evidence_manager.enabled else None,
                reconnect.session_id,
            )

            # Periodic Redis heartbeat + browser-preview source info refresh.
            if (time.time() - last_heartbeat_at) >= STREAM_HEARTBEAT_SECONDS:
                _publish_heartbeat()
                _refresh_source_info()
    finally:
        reader.close()
        buffer.clear()
        if video_writer:
            video_writer.release()
        preview_store.clear()
        if debug_preview:
            try:
                cv2.destroyAllWindows()
            except Exception:
                pass
        redis_client.close()

    _publish_heartbeat()
    live_fps = reader.get_metadata().get("fps") or 0.0
    return _finalize_metrics_only(
        metrics, worker, health, buffer, sampler, node_client,
        anpr_manager, face_manager, pipeline_start, reader, live_fps,
        inference_latencies, context_status, risk_status,
    )


def _clear_live_session_dedup(
    seen_track_ids: set,
    seen_context_keys: set,
    seen_risk_keys: set,
) -> None:
    """Clear observation dedup keys whose track IDs belong to the old session."""
    seen_track_ids.clear()
    seen_context_keys.clear()
    seen_risk_keys.clear()


def _live_track_event_key(camera_code, stream_session_id, track) -> tuple:
    """Stable semantic identity for one live confirmed-track event."""
    event_type = (
        "PERSON_DETECTED" if track["objectType"] == "PERSON"
        else "VEHICLE_DETECTED"
    )
    return (camera_code, stream_session_id, track["trackId"], event_type)


def _emit_live_observations(
    metrics, node_client, evidence_manager, camera_code, out,
    frame_anpr_obs, frame_face_obs,
    seen_track_ids, seen_context_keys, seen_risk_keys,
    face_evidence_frame=None,
    stream_session_id=None,
) -> None:
    """Stream newly confirmed observations to Node per frame (live path)."""
    track_obs = []
    for t in out.get("tracks", []):
        if t.get("state") != "CONFIRMED" or t.get("seenCount") is None:
            continue
        event_type = "PERSON_DETECTED" if t["objectType"] == "PERSON" else "VEHICLE_DETECTED"
        dedup_key = _live_track_event_key(camera_code, stream_session_id, t)
        if dedup_key in seen_track_ids:
            logger.debug(
                "Live track transition timestamp=%s cameraCode=%s streamSessionId=%s "
                "trackId=%s state=%s confirmed=true personDetectedEmitted=false "
                "reset=false reason=duplicate_session_track",
                utc_iso(), camera_code, stream_session_id, t["trackId"], t.get("state"),
            )
            continue
        seen_track_ids.add(dedup_key)
        track_obs.append({
            "observationId": str(uuid.uuid4()),
            "trackId": t["trackId"],
            "eventType": event_type,
            "objectType": t["objectType"],
            "vehicleType": t.get("vehicleType"),
            "confidence": t.get("confidence", 0),
            "occurredAt": utc_iso(),
            "bbox": t["bbox"],
            "streamSessionId": stream_session_id,
        })
        logger.info(
            "Live track transition timestamp=%s cameraCode=%s streamSessionId=%s "
            "bbox=%s confidence=%s trackId=%s state=%s trackAgeFrames=%s "
            "lostFrames=0 confirmed=true personDetectedEmitted=true loiterDuration=0 "
            "riskStateExists=false riskScore=0 stateReset=false resetReason=none",
            utc_iso(), camera_code, stream_session_id, t.get("bbox"),
            t.get("confidence", 0), t["trackId"], t.get("state"),
            t.get("seenCount"),
        )
    metrics["confirmedTracks"] += len(track_obs)
    if track_obs and node_client.is_enabled:
        result = asyncio.run(node_client.send_observations(camera_code, track_obs))
        if result.get("sent"):
            metrics["nodeDeliveriesSuccess"] += len(track_obs)
        else:
            metrics["nodeDeliveriesFailed"] += 1

    context_obs = []
    for c in out.get("context", []):
        dedup = (c["type"], c["trackId"])
        meta = c.get("metadata", {})
        for k in ("zoneCode", "fenceCode"):
            if meta.get(k):
                dedup = (c["type"], c["trackId"], meta[k])
        if dedup in seen_context_keys:
            metrics["contextDuplicateSuppressed"] += 1
            continue
        seen_context_keys.add(dedup)
        context_obs.append({
            "observationId": str(uuid.uuid4()),
            "trackId": c["trackId"],
            "objectType": c.get("objectType"),
            "contextType": c["type"],
            "occurredAt": c["occurredAt"],
            "sourceTimestampMs": c.get("sourceTimestampMs", 0),
            "referencePoint": c["referencePoint"],
            "metadata": c["metadata"],
            "streamSessionId": stream_session_id,
        })
    metrics["contextObservationsGenerated"] += len(context_obs)
    if context_obs and node_client.is_enabled:
        ctx_result = asyncio.run(node_client.send_context_observations(camera_code, context_obs))
        if ctx_result.get("sent"):
            metrics["contextObservationsDelivered"] += len(context_obs)
            metrics["contextDeliveriesSuccess"] += 1
        else:
            metrics["contextDeliveriesFailed"] += 1

    risk_obs = []
    for r in out.get("risk", []):
        # RiskEngine is the authority for meaningful-change/cooldown emission.
        # A process-lifetime (track, severity, score) set would incorrectly
        # suppress the same tier in a later genuine loiter episode for a track
        # that remained continuously tracked.
        risk_obs.append({
            "observationId": str(uuid.uuid4()),
            "trackId": r["trackId"],
            "objectType": r.get("objectType", "PERSON"),
            "riskScore": r["score"],
            "riskSeverity": r["severity"],
            "reasons": r.get("reasons", []),
            "evidence": r.get("evidence", []),
            "occurredAt": r.get("occurredAt", utc_iso()),
            "sourceTimestampMs": r.get("sourceTimestampMs", 0),
            "streamSessionId": stream_session_id,
        })
        logger.info(
            "Live risk observation session=%s track=%s score=%s severity=%s reasons=%s",
            stream_session_id,
            r["trackId"],
            r["score"],
            r["severity"],
            [reason.get("code") for reason in r.get("reasons", [])],
        )
    metrics["riskObservationsGenerated"] += len(risk_obs)
    if risk_obs and node_client.is_enabled:
        risk_result = asyncio.run(node_client.send_risk_observations(camera_code, risk_obs))
        if risk_result.get("sent"):
            metrics["riskObservationsDelivered"] += len(risk_obs)
            metrics["riskDeliveriesSuccess"] += 1
            alert_actions = risk_result.get("alertActions", []) or []
            logger.info(
                "Node accepted %d live risk observation(s); alert actions=%s",
                len(risk_obs),
                [action.get("action") for action in alert_actions],
            )
            if alert_actions:
                risk_obs_by_id = {r["observationId"]: r for r in risk_obs}
                ev_result = asyncio.run(evidence_manager.handle_alert_actions(
                    alert_actions, risk_obs_by_id, node_client, camera_code
                ))
                metrics["evidenceCaptured"] = evidence_manager.get_stats()["captured"]
                metrics["evidenceDelivered"] = ev_result["delivered"]
                metrics["evidenceFailed"] = ev_result["failed"]
        else:
            metrics["riskDeliveriesFailed"] += 1

    if frame_anpr_obs:
        anpr_payloads = [o.to_payload() for o in frame_anpr_obs]
        for payload in anpr_payloads:
            payload["streamSessionId"] = stream_session_id
        metrics["anprObservationsGenerated"] += len(anpr_payloads)
        if node_client.is_enabled:
            anpr_result = asyncio.run(node_client.send_anpr_observations(camera_code, anpr_payloads))
            if anpr_result.get("sent"):
                metrics["anprObservationsDelivered"] += len(anpr_payloads)
                metrics["anprDeliveriesSuccess"] += 1
            else:
                metrics["anprDeliveriesFailed"] += 1

    if frame_face_obs:
        face_payloads = [o.to_payload() for o in frame_face_obs]
        for payload in face_payloads:
            payload["streamSessionId"] = stream_session_id
        metrics["faceObservationsGenerated"] += len(face_payloads)
        if node_client.is_enabled:
            face_result = asyncio.run(node_client.send_face_observations(camera_code, face_payloads))
            if face_result.get("sent"):
                metrics["faceObservationsDelivered"] += len(face_payloads)
                metrics["faceDeliveriesSuccess"] += 1
                # Attach a face-crop as event-anchored evidence to each newly
                # created FACE_DETECTED event (best-effort, never blocks).
                event_codes = face_result.get("eventCodes") or {}
                if event_codes and face_evidence_frame is not None:
                    obs_by_id = {str(o.observation_id): o for o in frame_face_obs}
                    face_evidence_delivered = 0
                    face_evidence_failed = 0
                    for observation_id, event_code in event_codes.items():
                        obs = obs_by_id.get(str(observation_id))
                        if not obs:
                            continue
                        item = evidence_manager.capture_face_evidence(
                            face_evidence_frame,
                            obs.bbox.to_dict(),
                            event_code,
                            obs.occurred_at,
                        )
                        if item is None:
                            face_evidence_failed += 1
                            continue
                        try:
                            ev_result = asyncio.run(node_client.send_evidence(camera_code, [item]))
                            if ev_result.get("sent"):
                                face_evidence_delivered += 1
                            else:
                                face_evidence_failed += 1
                                logger.warning("Face evidence delivery failed: %s", ev_result.get("error"))
                        except Exception as e:  # face evidence is best-effort
                            face_evidence_failed += 1
                            logger.warning("Face evidence delivery error: %s", e)
                    metrics["faceEvidenceDelivered"] = face_evidence_delivered
                    metrics["faceEvidenceFailed"] = face_evidence_failed
                metrics["faceEvidenceCaptured"] = evidence_manager.get_stats()["captured"]
            else:
                metrics["faceDeliveriesFailed"] += 1


def _finalize_and_emit(
    metrics, worker, node_client, evidence_manager, anpr_manager, face_manager,
    all_anpr_obs, all_face_obs, inference_latencies, context_status, risk_status,
    pipeline_start, reader, buffer, sampler, health, source_fps,
) -> dict:
    """Shared finalize: emit confirmed/context/risk/ANPR/face observations to
    Node, assemble metrics, print, return. Used by both file and live runners.
    """
    # ---- Emit confirmed-track observations to Node ----
    emitted_obs = []
    for out in metrics["outputs"]:
        for t in out.get("tracks", []):
            if t.get("state") == "CONFIRMED" and t.get("seenCount") is not None:
                obs = {
                    "observationId": str(uuid.uuid4()),
                    "trackId": t["trackId"],
                    "eventType": "PERSON_DETECTED" if t["objectType"] == "PERSON" else "VEHICLE_DETECTED",
                    "objectType": t["objectType"],
                    "vehicleType": t.get("vehicleType"),
                    "confidence": t.get("confidence", 0),
                    "occurredAt": utc_iso(),
                    "bbox": t["bbox"],
                }
                emitted_obs.append(obs)

    # dedupe by trackId — one observation per track
    seen_tracks = set()
    unique_obs = []
    for obs in emitted_obs:
        if obs["trackId"] not in seen_tracks:
            seen_tracks.add(obs["trackId"])
            unique_obs.append(obs)

    metrics["confirmedTracks"] = len(unique_obs)

    if node_client.is_enabled:
        result = asyncio.run(node_client.send_observations(AI_CAMERA_CODE, unique_obs))
        logger.info("Node delivery result: %s", result)
        if result.get("sent"):
            metrics["nodeDeliveriesSuccess"] = len(unique_obs)
        else:
            metrics["nodeDeliveriesFailed"] = 1
    else:
        logger.info("Node integration disabled — observations generated locally (%d)", len(unique_obs))

    # ---- Emit context-observation delivery to Node ----
    context_obs = []
    seen_context_keys = set()
    for out in metrics["outputs"]:
        for c in out.get("context", []):
            # Build a stable dedup key per event type + track so we never send
            # the same transition twice even if the engine emits again.
            dedup = (c["type"], c["trackId"])
            meta = c.get("metadata", {})
            for k in ("zoneCode", "fenceCode"):
                if meta.get(k):
                    dedup = (c["type"], c["trackId"], meta[k])
            if dedup in seen_context_keys:
                metrics["contextDuplicateSuppressed"] += 1
                continue
            seen_context_keys.add(dedup)
            obs_id = str(uuid.uuid4())
            context_obs.append({
                "observationId": obs_id,
                "trackId": c["trackId"],
                "objectType": c.get("objectType"),
                "contextType": c["type"],
                "occurredAt": c["occurredAt"],
                "sourceTimestampMs": c.get("sourceTimestampMs", 0),
                "referencePoint": c["referencePoint"],
                "metadata": c["metadata"],
            })
            meta = c.get("metadata", {})
            logger.info(
                "Context observation: obsId=%s trackId=%d type=%s zone=%s fence=%s occurredAt=%s srcMs=%d",
                obs_id[:8], c["trackId"], c["type"],
                meta.get("zoneCode", "-"), meta.get("fenceCode", "-"),
                c["occurredAt"], c.get("sourceTimestampMs", 0),
            )

    metrics["contextObservationsGenerated"] = len(context_obs)
    if context_obs:
        if node_client.is_enabled:
            ctx_result = asyncio.run(node_client.send_context_observations(AI_CAMERA_CODE, context_obs))
            logger.info("Node context delivery result: %s", ctx_result)
            if ctx_result.get("sent"):
                metrics["contextObservationsDelivered"] = len(context_obs)
                metrics["contextDeliveriesSuccess"] = 1
            else:
                metrics["contextDeliveriesFailed"] = 1
        else:
            logger.info("Node integration disabled — context observations generated locally (%d)", len(context_obs))

    # ---- Phase 10: Emit risk-observation delivery to Node ----
    risk_obs = []
    seen_risk_keys = set()
    for out in metrics["outputs"]:
        for r in out.get("risk", []):
            dedup = (r["trackId"], r["severity"], r["score"])
            if dedup in seen_risk_keys:
                metrics["riskDuplicateSuppressed"] += 1
                continue
            seen_risk_keys.add(dedup)
            obs_id = str(uuid.uuid4())
            risk_obs.append({
                "observationId": obs_id,
                "trackId": r["trackId"],
                "objectType": r.get("objectType", "PERSON"),
                "riskScore": r["score"],
                "riskSeverity": r["severity"],
                "reasons": r.get("reasons", []),
                "evidence": r.get("evidence", []),
                "occurredAt": r.get("occurredAt", utc_iso()),
                "sourceTimestampMs": r.get("sourceTimestampMs", 0),
            })
            logger.info(
                "Risk observation: obsId=%s trackId=%d score=%.1f severity=%s reasons=%s",
                obs_id[:8], r["trackId"], r["score"], r["severity"],
                [x.get("code") for x in r.get("reasons", [])],
            )

    metrics["riskObservationsGenerated"] = len(risk_obs)
    risk_obs_by_id = {r["observationId"]: r for r in risk_obs}
    if risk_obs:
        if node_client.is_enabled:
            risk_result = asyncio.run(node_client.send_risk_observations(AI_CAMERA_CODE, risk_obs))
            logger.info("Node risk delivery result: %s", risk_result)
            if risk_result.get("sent"):
                metrics["riskObservationsDelivered"] = len(risk_obs)
                metrics["riskDeliveriesSuccess"] = 1
                # Phase 11: capture + deliver evidence for any alert the Node side
                # created/escated. Evidence failure never cancels alerting.
                alert_actions = risk_result.get("alertActions", []) or []
                if alert_actions:
                    ev_result = asyncio.run(evidence_manager.handle_alert_actions(
                        alert_actions, risk_obs_by_id, node_client, AI_CAMERA_CODE
                    ))
                    metrics["evidenceCaptured"] = evidence_manager.get_stats()["captured"]
                    metrics["evidenceDelivered"] = ev_result["delivered"]
                    metrics["evidenceFailed"] = ev_result["failed"]
            else:
                metrics["riskDeliveriesFailed"] = 1
        else:
            logger.info("Node integration disabled — risk observations generated locally (%d)", len(risk_obs))
        if evidence_manager.enabled:
            metrics["evidenceCaptured"] = evidence_manager.get_stats()["captured"]

    # ---- Phase 12: Emit confirmed ANPR (plate) observations to Node ----
    anpr_obs_payloads = [o.to_payload() for o in all_anpr_obs]
    metrics["anprObservationsGenerated"] = len(anpr_obs_payloads)
    if anpr_obs_payloads:
        if node_client.is_enabled:
            anpr_result = asyncio.run(node_client.send_anpr_observations(AI_CAMERA_CODE, anpr_obs_payloads))
            logger.info("Node ANPR delivery result: %s", anpr_result)
            if anpr_result.get("sent"):
                metrics["anprObservationsDelivered"] = len(anpr_obs_payloads)
                metrics["anprDeliveriesSuccess"] = 1
            else:
                metrics["anprDeliveriesFailed"] = 1
        else:
            logger.info("Node integration disabled — ANPR observations generated locally (%d)", len(anpr_obs_payloads))

    # ---- Phase 12: Emit confirmed face-detection observations to Node ----
    face_obs_payloads = [o.to_payload() for o in all_face_obs]
    metrics["faceObservationsGenerated"] = len(face_obs_payloads)
    if face_obs_payloads:
        if node_client.is_enabled:
            face_result = asyncio.run(node_client.send_face_observations(AI_CAMERA_CODE, face_obs_payloads))
            logger.info("Node FACE delivery result: %s", face_result)
            if face_result.get("sent"):
                metrics["faceObservationsDelivered"] = len(face_obs_payloads)
                metrics["faceDeliveriesSuccess"] = 1
            else:
                metrics["faceDeliveriesFailed"] = 1
        else:
            logger.info("Node integration disabled — FACE observations generated locally (%d)", len(face_obs_payloads))

    return _finalize_metrics_only(
        metrics, worker, health, buffer, sampler, node_client,
        anpr_manager, face_manager, pipeline_start, reader, source_fps,
        inference_latencies, context_status, risk_status,
    )


def _finalize_metrics_only(
    metrics, worker, health, buffer, sampler, node_client,
    anpr_manager, face_manager, pipeline_start, reader, source_fps,
    inference_latencies, context_status, risk_status,
) -> dict:
    """Assemble/print the metrics tail without emitting observations.
    Used by the live runner (observations are emitted streaming) and reused
    by _finalize_and_emit for the file runner.
    """
    total_time = elapsed_ms(pipeline_start)
    metrics["totalProcessingTimeMs"] = round(total_time, 1)
    metrics["sourceFps"] = source_fps if reader.get_metadata().get("fps") else 0
    metrics["bufferStats"] = buffer.get_stats()

    worker_stats = worker.get_stats()
    metrics["averageProcessingLatencyMs"] = worker_stats["averageLatencyMs"]
    metrics["averageInferenceLatencyMs"] = round(
        sum(inference_latencies) / len(inference_latencies), 2
    ) if inference_latencies else 0.0
    metrics["tracksCreated"] = worker_stats["trackManager"]["totalCreated"]
    metrics["confirmedTracksCount"] = worker_stats["trackManager"]["totalEmitted"]
    metrics["contextStatus"] = context_status
    metrics["contextZonesLoaded"] = worker_stats["context"]["zonesLoaded"]
    metrics["contextFencesLoaded"] = worker_stats["context"]["fencesLoaded"]
    metrics["contextProcessingLatencyMs"] = worker_stats["averageContextLatencyMs"]
    metrics["riskStatus"] = risk_status
    metrics["riskRulesLoaded"] = worker_stats["risk"]["rulesLoaded"]
    metrics["riskRulesEnabled"] = worker_stats["risk"]["rulesEnabled"]
    metrics["riskProcessingLatencyMs"] = worker_stats["averageRiskLatencyMs"]

    # Phase 12: ANPR + face stats from the managers.
    anpr_stats = anpr_manager.get_stats()
    face_stats = face_manager.get_stats()
    metrics["anprStatus"] = anpr_stats.get("status")
    metrics["anprPlateDetections"] = anpr_stats.get("plateDetections", 0)
    metrics["anprOcrAttempts"] = anpr_stats.get("ocrAttempts", 0)
    metrics["anprOcrSuccesses"] = anpr_stats.get("ocrSuccesses", 0)
    metrics["anprOcrFailures"] = anpr_stats.get("ocrFailures", 0)
    metrics["anprAveragePlateDetectLatencyMs"] = anpr_stats.get("averagePlateDetectionLatencyMs", 0.0)
    metrics["anprAverageOcrLatencyMs"] = anpr_stats.get("averageOcrLatencyMs", 0.0)
    metrics["faceStatus"] = face_stats.get("status")
    metrics["facePersonsEvaluated"] = face_stats.get("personsEvaluated", 0)
    metrics["faceDetections"] = face_stats.get("faceDetections", 0)
    metrics["faceAverageDetectionLatencyMs"] = face_stats.get("averageFaceDetectionLatencyMs", 0.0)
    set_anpr_info({
        "enabled": ANPR_ENABLED,
        "detectorLoaded": anpr_manager.ready(),
        "detectorMode": anpr_stats.get("detectorMode"),
        "ocrLoaded": anpr_stats.get("ocrLoaded"),
        "ocrEngine": "easyocr",
        "ocrStatus": anpr_stats.get("ocrStatus"),
        "status": anpr_stats.get("status"),
    })
    set_face_info({
        "enabled": FACE_DETECTION_ENABLED,
        "modelLoaded": face_manager.ready(),
        "status": face_stats.get("status"),
        "recognition": False,
    })

    metrics["samplerStats"] = sampler.get_stats() if sampler else {}
    metrics["healthReport"] = health.get_report()
    metrics["modelDevice"] = worker_stats["detectorInfo"]["device"]
    metrics["modelName"] = worker_stats["detectorInfo"]["name"]
    metrics["nodeStats"] = node_client.get_stats()

    _print_metrics(metrics)
    return metrics


def _print_metrics(metrics: dict) -> None:
    logger.info("═══ Phase 9 Pipeline Metrics ═══")
    logger.info("  Model:              %s", metrics.get("modelName"))
    logger.info("  Device:             %s", metrics.get("modelDevice"))
    logger.info("  Source FPS:         %.1f", metrics["sourceFps"])
    logger.info("  Sample FPS:         %d", metrics["sampleFps"])
    logger.info("  Frames read:        %d", metrics["framesRead"])
    logger.info("  Frames sampled:     %d", metrics["framesSampled"])
    logger.info("  Frames skipped:     %d", metrics["framesSkippedBySampler"])
    logger.info("  Frames dropped buf: %d", metrics.get("framesDroppedByBuffer", 0))
    logger.info("  Frames processed:   %d", metrics["framesProcessed"])
    logger.info("  Detections total:   %d", metrics["detectionsTotal"])
    logger.info("  Persons:            %d", metrics["personsDetected"])
    logger.info("  Vehicles:           %d", metrics["vehiclesDetected"])
    logger.info("  Tracks created:     %d", metrics.get("tracksCreated", 0))
    logger.info("  Confirmed tracks:   %d", metrics.get("confirmedTracksCount", 0))
    logger.info("  Inf. latency:       %.2f ms", metrics["averageInferenceLatencyMs"])
    logger.info("  Proc. latency:      %.2f ms", metrics["averageProcessingLatencyMs"])
    logger.info("  Total time:         %.1f ms", metrics["totalProcessingTimeMs"])
    logger.info("  Node success:       %d", metrics.get("nodeDeliveriesSuccess", 0))
    logger.info("  Node failures:      %d", metrics.get("nodeDeliveriesFailed", 0))
    logger.info("── Context engine ──")
    logger.info("  Status:             %s", metrics.get("contextStatus"))
    logger.info("  Zones loaded:       %d", metrics.get("contextZonesLoaded", 0))
    logger.info("  Fences loaded:      %d", metrics.get("contextFencesLoaded", 0))
    logger.info("  Observations gen:   %d", metrics.get("contextObservationsGenerated", 0))
    logger.info("  Observations sent:  %d", metrics.get("contextObservationsDelivered", 0))
    logger.info("  Dup suppressed:     %d", metrics.get("contextDuplicateSuppressed", 0))
    logger.info("  Context latency:    %.2f ms", metrics.get("contextProcessingLatencyMs", 0))
    logger.info("  Context success:    %d", metrics.get("contextDeliveriesSuccess", 0))
    logger.info("  Context failures:   %d", metrics.get("contextDeliveriesFailed", 0))
    logger.info("── Risk engine ──")
    logger.info("  Status:             %s", metrics.get("riskStatus"))
    logger.info("  Rules loaded:       %d", metrics.get("riskRulesLoaded", 0))
    logger.info("  Rules enabled:      %d", metrics.get("riskRulesEnabled", 0))
    logger.info("  Observations gen:   %d", metrics.get("riskObservationsGenerated", 0))
    logger.info("  Observations sent:  %d", metrics.get("riskObservationsDelivered", 0))
    logger.info("  Dup suppressed:     %d", metrics.get("riskDuplicateSuppressed", 0))
    logger.info("  Risk latency:       %.2f ms", metrics.get("riskProcessingLatencyMs", 0))
    logger.info("  Risk success:       %d", metrics.get("riskDeliveriesSuccess", 0))
    logger.info("  Risk failures:      %d", metrics.get("riskDeliveriesFailed", 0))
    logger.info("── Evidence (Phase 11) ──")
    logger.info("  Enabled:            %s", metrics.get("evidenceEnabled"))
    logger.info("  Captured:           %d", metrics.get("evidenceCaptured", 0))
    logger.info("  Delivered:          %d", metrics.get("evidenceDelivered", 0))
    logger.info("  Failed:             %d", metrics.get("evidenceFailed", 0))
    logger.info("── ANPR (Phase 12) ──")
    logger.info("  Enabled:            %s", metrics.get("anprEnabled"))
    logger.info("  Status:             %s", metrics.get("anprStatus"))
    logger.info("  Plate detections:   %d", metrics.get("anprPlateDetections", 0))
    logger.info("  OCR attempts:       %d", metrics.get("anprOcrAttempts", 0))
    logger.info("  OCR success:        %d", metrics.get("anprOcrSuccesses", 0))
    logger.info("  OCR fail:           %d", metrics.get("anprOcrFailures", 0))
    logger.info("  Observations gen:   %d", metrics.get("anprObservationsGenerated", 0))
    logger.info("  Observations sent:  %d", metrics.get("anprObservationsDelivered", 0))
    logger.info("  Deliveries success: %d", metrics.get("anprDeliveriesSuccess", 0))
    logger.info("  Deliveries fail:    %d", metrics.get("anprDeliveriesFailed", 0))
    logger.info("── Face Detection (Phase 12) ──")
    logger.info("  Enabled:            %s", metrics.get("faceEnabled"))
    logger.info("  Status:             %s", metrics.get("faceStatus"))
    logger.info("  Persons evaluated:  %d", metrics.get("facePersonsEvaluated", 0))
    logger.info("  Face detections:    %d", metrics.get("faceDetections", 0))
    logger.info("  Observations gen:   %d", metrics.get("faceObservationsGenerated", 0))
    logger.info("  Observations sent:  %d", metrics.get("faceObservationsDelivered", 0))
    logger.info("  Deliveries success: %d", metrics.get("faceDeliveriesSuccess", 0))
    logger.info("  Deliveries fail:    %d", metrics.get("faceDeliveriesFailed", 0))
    logger.info("═══════════════════════")


def serve_api(video_path: str | None = None, debug_preview: bool = False, save_output: str | None = None,
              camera_code: str | None = None) -> None:
    if video_path:
        pipeline_thread = threading.Thread(
            target=run_video_pipeline,
            args=(video_path, debug_preview, save_output),
            daemon=True,
            name="video-pipeline",
        )
        pipeline_thread.start()
        logger.info("Video pipeline thread started for: %s", video_path)
    elif camera_code:
        pipeline_thread = threading.Thread(
            target=run_live_pipeline,
            args=(camera_code, debug_preview, save_output),
            daemon=True,
            name="live-pipeline",
        )
        pipeline_thread.start()
        logger.info("Live pipeline thread started for camera: %s", camera_code)

    logger.info("Starting FastAPI AI service on %s:%d", AI_HOST, AI_PORT)

    config = uvicorn.Config(
        app="api.server:app",
        host=AI_HOST,
        port=AI_PORT,
        log_level="info",
        access_log=False,
    )
    server = uvicorn.Server(config)

    try:
        server.run()
    except KeyboardInterrupt:
        pass
    finally:
        logger.info("FastAPI service stopped")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="IBVAP AI Engine — Phase 10/13")
    parser.add_argument("--video", type=str, default=None, help="Path to local MP4 video file")
    parser.add_argument("--camera-code", type=str, default=None,
                        help="Camera code (e.g. CAM-01) for live RTSP/HTTP/MJPEG input")
    parser.add_argument("--serve", action="store_true", help="Start FastAPI AI service")
    parser.add_argument("--debug-preview", action="store_true", help="Enable optional CV2 preview")
    parser.add_argument("--preview", action="store_true", help="Enable optional CV2 preview")
    parser.add_argument("--save-output", type=str, default=None, help="Save annotated MP4 output")
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    logger.info("═══════════════════════════════════════")
    logger.info("  IBVAP AI Engine — Phase 10/13")
    logger.info("  Service: %s", AI_SERVICE_NAME)
    logger.info("  Model:   %s", YOLO_MODEL)
    logger.info("  Device:  %s", YOLO_DEVICE)
    logger.info("═══════════════════════════════════════")

    preview = args.debug_preview or args.preview
    effective_video = args.video or (VIDEO_SOURCE if VIDEO_SOURCE else None)
    effective_camera = args.camera_code

    if args.serve or effective_video or effective_camera:
        serve_api(
            video_path=effective_video,
            debug_preview=preview,
            save_output=args.save_output,
            camera_code=effective_camera,
        )
    else:
        logger.info("No --video, no --camera-code, no VIDEO_SOURCE configured.")
        serve_api(video_path=None)


if __name__ == "__main__":
    main()
