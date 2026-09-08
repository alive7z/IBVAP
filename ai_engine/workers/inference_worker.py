import time

from config import RISK_EVIDENCE_WINDOW_SECONDS
from context.engine import ContextEngine
from detectors.yolo_detector import YOLODetector
from context.geometry import normalize_point
from risk.engine import CONTEXT_TO_RULE, RISK_EXCLUDED_CONTEXT_TYPES, RiskEngine
from schemas.ai_output import (
    AIOutput,
    Bbox,
    Center,
    ContextEvent,
    Detection,
    FrameInfo,
    ProcessingInfo,
    ReferencePoint,
    RiskOutput,
    SourceInfo,
    Track,
)
from schemas.frame import Frame
from preprocessing.pipeline import preprocess_frame
from trackers.track_manager import TrackManager
from utils.logger import get_logger
from utils.time import utc_iso

logger = get_logger("inference_worker")

# Person/vehicle reference point: bottom-center of the bbox, expressed in
# NORMALIZED [0,1] coordinates so Phase 9 / geometry helpers consume it directly.
# See Phase 9 docs.
def _reference_point(bbox: dict, width: int, height: int) -> dict:
    x = (bbox["x1"] + bbox["x2"]) / 2.0
    y = bbox["y2"]
    return normalize_point(x, y, width, height)


# Identify a risk-bearing context signal by track + type + zone/fence instance so
# the same event can be re-fed to the risk engine across frames (not re-emitted).
def _evidence_key(ce: dict) -> tuple:
    meta = ce.get("metadata") or {}
    subtype = meta.get("zoneCode") or meta.get("fenceCode") or ""
    return (ce.get("trackId"), ce.get("type"), subtype)


class InferenceWorker:
    """Phase 8/9/10 worker: YOLO detection + ByteTrack + context engine + risk engine.

    Flow: frame → preprocess → detect+track → track management → context → risk → output.
    """

    def __init__(
        self,
        source_id: str = "VIDEO_FILE",
        camera_code: str = "UNKNOWN",
        detector: YOLODetector | None = None,
        context_engine: ContextEngine | None = None,
        risk_engine: RiskEngine | None = None,
    ):
        self._source_id = source_id
        self._camera_code = camera_code
        self._detector = detector or YOLODetector()
        self._track_manager = TrackManager()
        self._context_engine = context_engine or ContextEngine()
        self._risk_engine = risk_engine or RiskEngine()
        self._total_processed: int = 0
        self._total_latency_ms: float = 0.0
        self._total_context_latency_ms: float = 0.0
        self._total_risk_latency_ms: float = 0.0
        self._total_detections: int = 0
        self._persons_detected: int = 0
        self._vehicles_detected: int = 0
        self._model_loaded = False
        self._current_confirmed_tracks: list[dict] = []
        # Rolling buffer of recent risk-bearing context evidence keyed by
        # (trackId, type, zone/fence). The context engine emits each transition
        # once per track, but the risk engine's temporal confirmation requires
        # the same evidence to keep being observed as time advances. This buffer
        # re-feeds live evidence until the track vanishes or the evidence window
        # elapses (see _sustained_risk_evidence).
        self._recent_evidence: dict[tuple, dict] = {}
        self._recent_evidence_seen: dict[tuple, float] = {}

    @property
    def context_engine(self) -> ContextEngine:
        return self._context_engine

    @property
    def risk_engine(self) -> RiskEngine:
        return self._risk_engine

    def reset_session(self) -> None:
        """Reset per-session state when a live stream reconnects.

        A new decoded session means the previously tracked objects are gone; carry
        their identity across a reconnect would fabricate continuity. Resetting
        the track manager plus context/risk engines clears only ephemeral state.
        """
        detector_reset = getattr(self._detector, "reset_tracking", None)
        if callable(detector_reset):
            detector_reset()
        self._track_manager.reset()
        self._context_engine.reset()
        self._risk_engine.reset()
        self._recent_evidence.clear()
        self._recent_evidence_seen.clear()
        self._current_confirmed_tracks.clear()
        logger.info("Inference worker session state reset (track/context/risk)")

    def initialize(self) -> bool:
        self._model_loaded = self._detector.load()
        if not self._model_loaded:
            logger.error("InferenceWorker could not load YOLO model")
        return self._model_loaded

    def process_frame(self, frame: Frame, now: float | None = None) -> AIOutput:
        start = time.monotonic()

        # `now` is the time base for dwell/loitering/risk temporal confirmation.
        # File pipelines pass video-relative video_time (deterministic); live
        # pipelines pass wall-clock time so timing works even when the source
        # reports no FPS (video_time frozen at 0).
        eval_now = frame.video_time if now is None else now

        preprocessed = preprocess_frame(frame)
        if preprocessed is None:
            return AIOutput(
                source=SourceInfo(cameraCode=self._camera_code, sourceType=self._source_id),
                frame=FrameInfo(frameId=frame.frame_id, frameIndex=frame.frame_index, timestamp=utc_iso()),
                processing=ProcessingInfo(status="error", latencyMs=0),
            )

        detections, tracks_raw = self._run_inference(preprocessed)

        confirmed_tracks = self._track_manager.update(tracks_raw)
        w = preprocessed.width
        h = preprocessed.height

        for det in detections:
            self._total_detections += 1
            obj_type = det.get("objectType") if isinstance(det, dict) else det.objectType
            if obj_type == "PERSON":
                self._persons_detected += 1
            elif obj_type == "VEHICLE":
                self._vehicles_detected += 1

        latency = (time.monotonic() - start) * 1000
        self._total_processed += 1
        self._total_latency_ms += latency

        raw_by_id = {t.get("trackId"): t for t in tracks_raw}
        confirmed_ids = {
            entry.track_id for entry in self._track_manager.get_confirmed_entries()
        }
        self._current_confirmed_tracks = [
            dict(raw_by_id[track_id])
            for track_id in confirmed_ids
            if track_id in raw_by_id
        ]

        track_models = []
        for t in tracks_raw:
            tm = Track(
                trackId=t.get("trackId"),
                className=t["className"],
                objectType=t["objectType"],
                vehicleType=t.get("vehicleType"),
                confidence=t["confidence"],
                bbox=Bbox(**t["bbox"]),
                center=Center(**t["center"]),
                referencePoint=ReferencePoint(**_reference_point(t["bbox"], w, h)),
            )
            track_models.append(tm)

        def _ref_for(entry):
            raw = raw_by_id.get(entry.track_id, {})
            if "bbox" in raw:
                return _reference_point(raw["bbox"], w, h)
            latest_center = entry.history[-1] if entry.history else {"x": 0, "y": 0}
            px = latest_center.get("x", 0)
            py = latest_center.get("y", 0)
            return normalize_point(px, py, w, h)

        # Phase 8: the one-shot newly-confirmed list drives confirmed-track
        # observation emission (each confirmed track emitted once).
        confirmed_models = []
        for entry in confirmed_tracks:
            latest_center = entry.history[-1] if entry.history else {"x": 0, "y": 0}
            raw = raw_by_id.get(entry.track_id, {})
            cm = Track(
                trackId=entry.track_id,
                className=entry.class_name,
                objectType=entry.object_type,
                vehicleType=entry.vehicle_type,
                confidence=latest_center.get("confidence", 0),
                bbox=Bbox(**raw["bbox"]) if "bbox" in raw else Bbox(),
                center=Center(x=latest_center["x"], y=latest_center["y"]),
                state=entry.state,
                seenCount=entry.seen_count,
                historyLength=len(entry.history),
                referencePoint=ReferencePoint(**_ref_for(entry)),
            )
            confirmed_models.append(cm)

        # Phase 9: feed the context engine EVERY currently-confirmed track each
        # frame (not just the one-shot list) so dwell/loitering/zone transitions
        # can accumulate across frames.
        confirmed_with_ref = [
            {
                "trackId": entry.track_id,
                "objectType": entry.object_type,
                "referencePoint": _ref_for(entry),
            }
            for entry in self._track_manager.get_confirmed_entries()
        ]

        ctx_start = time.monotonic()
        context_events = self._context_engine.update(
            confirmed_with_ref,
            now=eval_now,
            occurred_at=frame.captured_at if frame.captured_at else time.time(),
            source_timestamp_ms=int(frame.source_timestamp_ms),
        )
        self._total_context_latency_ms += (time.monotonic() - ctx_start) * 1000
        context_models = [ContextEvent(**c) for c in context_events]

        # Phase 10: risk evaluation based on context evidence. Context events are
        # emitted once per track transition; re-feed the still-relevant recent
        # evidence every frame so temporal confirmation (minimum_duration_ms)
        # can elapse and persistent risk is scored continuously.
        track_states_for_risk = {
            entry.track_id: {
                "objectType": entry.object_type,
                "confidence": entry.history[-1].get("confidence", 0) if entry.history else 0.0,
            }
            for entry in self._track_manager.get_confirmed_entries()
        }
        confirmed_track_ids = set(track_states_for_risk.keys())
        active_provider = getattr(self._context_engine, "active_risk_evidence", None)
        sustained_types = (
            {"LOITERING", "RESTRICTED_ZONE_ENTRY", "FENCE_PROXIMITY"}
            if active_provider else set()
        )
        risk_context = self._sustained_risk_evidence(
            context_events, confirmed_track_ids, eval_now, sustained_types
        )
        # Sustained conditions are internal current state, not replayed
        # one-shot rows. Feed them directly to RiskEngine every frame while the
        # same confirmed track remains in that condition.
        if active_provider:
            for track_id in confirmed_track_ids:
                risk_context.extend(active_provider(track_id))
        else:
            # Backward-compatible test/plugin fallback.
            loitering_provider = getattr(self._context_engine, "loitering_evidence", None)
            if loitering_provider:
                for track_id in confirmed_track_ids:
                    loitering = loitering_provider(track_id)
                    if loitering:
                        risk_context.append(loitering)
        risk_start = time.monotonic()
        risk_observations = self._risk_engine.evaluate(
            risk_context,
            track_states_for_risk,
            now=eval_now,
            occurred_at=frame.captured_at if frame.captured_at else time.time(),
            source_timestamp_ms=int(frame.source_timestamp_ms),
        )
        self._total_risk_latency_ms += (time.monotonic() - risk_start) * 1000
        risk_models = [
            RiskOutput(
                trackId=r["trackId"],
                objectType=r.get("objectType", "PERSON"),
                score=r["score"],
                severity=r["severity"],
                reasons=r.get("reasons", []),
                evidence=r.get("evidence", []),
                occurredAt=utc_iso(),
                sourceTimestampMs=int(r.get("sourceTimestampMs", 0)),
            )
            for r in risk_observations
        ]

        return AIOutput(
            schemaVersion=1,
            source=SourceInfo(cameraCode=self._camera_code, sourceType=self._source_id),
            frame=FrameInfo(
                frameId=frame.frame_id,
                frameIndex=frame.frame_index,
                timestamp=utc_iso(),
                sourceTimestampMs=int(frame.source_timestamp_ms),
            ),
            detections=[Detection(**d) for d in detections],
            tracks=confirmed_models,
            context=context_models,
            risk=risk_models,
            processing=ProcessingInfo(status="processed", latencyMs=round(latency, 2)),
        )

    def get_current_confirmed_tracks(self) -> list[dict]:
        """Visible confirmed tracks from the most recently processed frame.

        Unlike AIOutput.tracks, this is not a one-shot event list. Secondary
        face/ANPR confirmation needs the same live track across several frames.
        """
        return [dict(track) for track in self._current_confirmed_tracks]

    def trace_tracks(self, now: float | None = None) -> list[dict]:
        """Read-only structured trace snapshots for visible confirmed tracks."""
        if now is None:
            now = time.time()
        snapshots = []
        for track in self._current_confirmed_tracks:
            track_id = track.get("trackId")
            entry = self._track_manager.get_track(track_id)
            snapshots.append({
                "trackId": track_id,
                "bbox": track.get("bbox"),
                "detectionConfidence": track.get("confidence", 0),
                "trackAgeSeconds": round(max(0.0, time.time() - entry.first_seen), 2) if entry else 0.0,
                "trackAgeFrames": entry.seen_count if entry else 0,
                "lostFrames": 0,
                "personDetectedEmitted": bool(entry.emitted) if entry else False,
                "context": self._context_engine.trace_state(track_id),
                "risk": self._risk_engine.trace_state(track_id, now=now),
                "stateReset": False,
                "resetReason": "none",
            })
        return snapshots

    def _sustained_risk_evidence(
        self,
        context_events: list[dict],
        confirmed_track_ids: set[int],
        now: float,
        sustained_context_types: set[str] | None = None,
    ) -> list[dict]:
        """Return the risk-bearing context evidence to feed the risk engine.

        The context engine emits each transition once per track, but the risk
        engine's temporal-confirmation rules (minimum_duration_ms) require the
        same evidence to keep being observed as `now` advances. Recently emitted
        risk-relevant events are therefore re-fed every frame while:
          * the originating track is still confirmed this frame, and
          * the event is within RISK_EVIDENCE_WINDOW_SECONDS of first emission.
        Mutates only ephemeral worker state; never re-emits to Node.
        """
        sustained_context_types = sustained_context_types or set()
        for ce in context_events:
            ctype = ce.get("type", "")
            if ctype in sustained_context_types:
                # Current sustained state is appended separately every frame;
                # retaining the transition would outlive an ended condition.
                continue
            if ctype in RISK_EXCLUDED_CONTEXT_TYPES or ctype not in CONTEXT_TO_RULE:
                continue
            key = _evidence_key(ce)
            if key is None:
                continue
            self._recent_evidence[key] = ce
            self._recent_evidence_seen[key] = now

        for key in list(self._recent_evidence):
            expired = (now - self._recent_evidence_seen[key]) > RISK_EVIDENCE_WINDOW_SECONDS
            # A short detector/ByteTrack gap is not proof that an instantaneous
            # observation became unrelated. Keep it only for the bounded
            # evidence window; a new stream session clears the whole buffer.
            if expired:
                del self._recent_evidence[key]
                del self._recent_evidence_seen[key]

        return list(self._recent_evidence.values())

    def _run_inference(self, frame: Frame) -> tuple[list[dict], list[dict]]:
        if not self._model_loaded:
            logger.warning("Model not loaded — returning empty results")
            return [], []

        try:
            detections = self._detector.detect(frame.image)
        except Exception as e:
            logger.error("Detection failed: %s", e)
            return [], []

        try:
            tracked = self._detector.detect_with_tracking(frame.image)
        except Exception as e:
            logger.error("Tracking failed: %s", e)
            tracked = []

        return detections, tracked

    def get_stats(self) -> dict:
        avg = self._total_latency_ms / self._total_processed if self._total_processed > 0 else 0
        return {
            "framesProcessed": self._total_processed,
            "averageLatencyMs": round(avg, 2),
            "totalLatencyMs": round(self._total_latency_ms, 2),
            "totalDetections": self._total_detections,
            "personsDetected": self._persons_detected,
            "vehiclesDetected": self._vehicles_detected,
            "trackManager": self._track_manager.get_stats(),
            "averageContextLatencyMs": round(
                self._total_context_latency_ms / self._total_processed, 2
            ) if self._total_processed > 0 else 0.0,
            "averageRiskLatencyMs": round(
                self._total_risk_latency_ms / self._total_processed, 2
            ) if self._total_processed > 0 else 0.0,
            "context": self._context_engine.snapshot_metrics(),
            "contextStatus": self._context_engine.config_status,
            "contextEnabled": self._context_engine.enabled,
            "zonesLoaded": self._context_engine.zones_loaded(),
            "fencesLoaded": self._context_engine.fences_loaded(),
            "risk": self._risk_engine.snapshot_metrics(),
            "riskStatus": self._risk_engine.config_status,
            "riskEnabled": self._risk_engine.enabled,
            "modelLoaded": self._model_loaded,
            "detectorInfo": self._detector.get_info(),
        }
