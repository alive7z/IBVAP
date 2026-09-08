"""ANPR pipeline coordinator.

Per confirmed vehicle track:
  plate detect (inside vehicle bbox) -> crop -> preprocess -> OCR -> normalize
  -> validate -> associate -> accumulate state (multi-frame consensus).

Emits a single confirmed PlateObservation per vehicle track (dedup via state).
Model / OCR failures degrade gracefully and never crash the pipeline.
"""

import time
import uuid

import numpy as np

from anpr.association import associate_plate_to_track
from anpr.cropper import crop_plate
from anpr.detector import PlateDetector
from anpr.models import PlateBBox, PlateCandidate, PlateObservation
from anpr.normalize import normalize_plate_text
from anpr.ocr import PlateOCR
from anpr.preprocess import preprocess_plate_crop
from anpr.state import AnprState
from anpr.validator import is_confirmed
from config import ANPR_CONFIRM_READS, ANPR_ENABLED, ANPR_MIN_OCR_CONFIDENCE, ANPR_PROCESS_EVERY_N_FRAMES
from utils.logger import get_logger
from utils.time import utc_iso

logger = get_logger("anpr_manager")


class AnprManager:
    def __init__(
        self,
        enabled: bool = ANPR_ENABLED,
        detector: PlateDetector | None = None,
        ocr: PlateOCR | None = None,
        confirm_reads: int = ANPR_CONFIRM_READS,
        min_ocr_confidence: float = ANPR_MIN_OCR_CONFIDENCE,
        every_n_frames: int = ANPR_PROCESS_EVERY_N_FRAMES,
    ):
        self._enabled = enabled
        self._detector = detector or PlateDetector()
        self._ocr = ocr or PlateOCR()
        self._confirmation = AnprState(confirm_reads=confirm_reads)
        self._min_ocr_confidence = min_ocr_confidence
        self._every_n_frames = max(1, every_n_frames)
        self._frame_counter = 0

        self._vehicles_evaluated = 0
        self._plate_detections = 0
        self._ocr_attempts = 0
        self._ocr_successes = 0
        self._ocr_failures = 0
        self._confirmed = 0
        self._dup_suppressed = 0
        self._plate_detect_latency_ms: list[float] = []
        self._ocr_latency_ms: list[float] = []

    def initialize(self) -> bool:
        """Load plate detector + OCR. Returns True if at least detector ready.
        Model/OCR failures are reported but do not stop the pipeline."""
        if not self._enabled:
            return True
        det_ok = self._detector.load()
        ocr_ok = self._ocr.load()
        return bool(det_ok or ocr_ok)

    def ready(self) -> bool:
        return self._enabled and self._detector.is_loaded

    def reset(self) -> None:
        self._confirmation.reset()
        self._frame_counter = 0
        logger.info("ANPR confirmation state reset (session change)")

    def process_frame(
        self,
        frame: np.ndarray,
        vehicle_bboxes: dict,
        occurred_at: str,
        source_timestamp_ms: int,
        vehicle_types: dict | None = None,
    ) -> list[PlateObservation]:
        """Process all confirmed vehicle tracks in this frame.

        `vehicle_bboxes` maps trackId -> pixel bbox dict {x1,y1,x2,y2}.
        Returns newly-confirmed observations (emitted once per track).
        """
        if not self.ready():
            return []
        self._frame_counter += 1
        if self._frame_counter % self._every_n_frames != 0:
            return []

        new_observations = []
        vehicle_types = vehicle_types or {}
        active_track_ids = set(vehicle_bboxes.keys())

        for track_id, vbox in list(vehicle_bboxes.items()):
            # Only evaluate the bottom portion of confirmed vehicles.
            dets = self._detect(frame, vbox)
            if not dets:
                continue
            for det in dets:
                self._plate_detections += 1
                crop = crop_plate(frame, det.bbox)
                if crop is None:
                    continue
                self._ocr_attempts += 1
                _, enhanced = preprocess_plate_crop(crop)
                read = self._ocr.read(enhanced, latency_ms=self._ocr_latency_ms)
                if read.raw_text is None:
                    self._ocr_failures += 1
                    continue
                self._ocr_successes += 1
                norm = normalize_plate_text(read.raw_text)
                if norm is None:
                    self._ocr_failures += 1
                    continue
                if not is_confirmed(norm, read.ocr_confidence, self._min_ocr_confidence):
                    self._ocr_failures += 1
                    continue

                candidate = PlateCandidate(
                    raw_text=read.raw_text,
                    normalized_text=norm,
                    ocr_confidence=read.ocr_confidence,
                    plate_detection_confidence=det.confidence,
                    bbox=det.bbox,
                )
                self._vehicles_evaluated += 1
                confirmed = self._confirmation.update(track_id, candidate)
                if confirmed is not None and not self._confirmation.is_emitted(track_id):
                    self._confirmation.mark_emitted(track_id)
                    self._confirmed += 1
                    obs = PlateObservation(
                        observation_id=str(uuid.uuid4()),
                        camera_code="",
                        vehicle_track_id=int(track_id),
                        plate_text=confirmed.plate_text,
                        raw_text=confirmed.raw_text,
                        ocr_confidence=confirmed.ocr_confidence,
                        plate_detection_confidence=confirmed.plate_detection_confidence,
                        occurred_at=occurred_at,
                        source_timestamp_ms=int(source_timestamp_ms),
                        bbox=confirmed.bbox,
                        vehicle_type=vehicle_types.get(track_id),
                    )
                    new_observations.append(obs)
                    logger.info(
                        "ANPR confirmed: veh=%d plate=%s conf=%.2f reads=%d",
                        int(track_id), confirmed.plate_text, confirmed.ocr_confidence, self._confirmation._confirm_reads,
                    )
                else:
                    self._dup_suppressed += 1

        self._confirmation.cleanup_expired(active_track_ids)
        return new_observations

    def _detect(self, frame: np.ndarray, vbox: dict):
        start = time.time()
        try:
            dets = self._detector.detect(frame, vbox)
        except Exception as e:  # noqa: BLE001
            logger.error("Plate detect error: %s", e)
            return []
        finally:
            self._plate_detect_latency_ms.append(round((time.time() - start) * 1000, 2))
        return dets

    def get_stats(self) -> dict:
        def avg(xs):
            return round(sum(xs) / len(xs), 2) if xs else 0.0

        if not self._enabled:
            status = "DISABLED"
        elif not self._detector.is_loaded or not self._ocr.is_loaded:
            status = "ERROR"
        elif self._detector.mode == "MODEL":
            status = "READY"
        else:
            # A bbox heuristic can support development experiments, but it is
            # not a dedicated plate detector and must never be presented as a
            # fully ready ANPR pipeline in health/demo status.
            status = "DEGRADED"

        return {
            "enabled": self._enabled,
            "detectorLoaded": self._detector.is_loaded,
            "detectorMode": self._detector.mode,
            "status": status,
            "ocrLoaded": self._ocr.is_loaded,
            "ocrStatus": self._ocr.status,
            "vehiclesEvaluated": self._vehicles_evaluated,
            "plateDetections": self._plate_detections,
            "ocrAttempts": self._ocr_attempts,
            "ocrSuccesses": self._ocr_successes,
            "ocrFailures": self._ocr_failures,
            "confirmedObservations": self._confirmed,
            "duplicateSuppressed": self._dup_suppressed,
            "averagePlateDetectionLatencyMs": avg(self._plate_detect_latency_ms),
            "averageOcrLatencyMs": avg(self._ocr_latency_ms),
            "state": self._confirmation.snapshot(),
        }
