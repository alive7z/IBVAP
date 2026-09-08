"""Face detection pipeline coordinator.

Per confirmed person track: detect faces inside the person bbox -> associate
face -> person track -> accumulate state (frame-level confirmation).

Emits a single confirmed FaceObservation per person track (dedup via state).
Detection failures degrade gracefully and never crash the pipeline.

FACE DETECTION ONLY — never emits identity.
"""

import time
import uuid

import numpy as np

from config import (
    FACE_CONFIRM_FRAMES,
    FACE_DETECTION_ENABLED,
    FACE_PROCESS_EVERY_N_FRAMES,
)
from faces.association import associate_face_to_person
from faces.detector import FaceDetector
from faces.models import FaceObservation
from faces.state import FaceState
from utils.logger import get_logger
from utils.time import utc_iso

logger = get_logger("face_manager")


class FaceManager:
    def __init__(
        self,
        enabled: bool = FACE_DETECTION_ENABLED,
        detector: FaceDetector | None = None,
        confirm_frames: int = FACE_CONFIRM_FRAMES,
        every_n_frames: int = FACE_PROCESS_EVERY_N_FRAMES,
    ):
        self._enabled = enabled
        self._detector = detector or FaceDetector()
        self._state = FaceState(confirm_frames=confirm_frames)
        self._every_n_frames = max(1, every_n_frames)
        self._frame_counter = 0

        self._persons_evaluated = 0
        self._face_detections = 0
        self._confirmed = 0
        self._dup_suppressed = 0
        self._face_latency_ms: list[float] = []

    def initialize(self) -> bool:
        if not self._enabled:
            return True
        return self._detector.load()

    def ready(self) -> bool:
        return self._enabled and self._detector.is_loaded

    def reset(self) -> None:
        self._state.reset()
        self._frame_counter = 0
        logger.info("FACE confirmation state reset (session change)")

    def process_frame(
        self,
        frame: np.ndarray,
        person_bboxes: dict,
        occurred_at: str,
        source_timestamp_ms: int,
    ) -> list[FaceObservation]:
        """Process all confirmed person tracks in this frame.

        `person_bboxes` maps trackId -> pixel bbox dict {x1,y1,x2,y2}.
        Returns newly-confirmed face observations (emitted once per track).
        """
        if not self.ready():
            return []
        self._frame_counter += 1
        if self._frame_counter % self._every_n_frames != 0:
            return []

        new_observations = []
        active_track_ids = set(person_bboxes.keys())

        for track_id, pbox in list(person_bboxes.items()):
            dets = self._detect(frame, pbox)
            if not dets:
                continue
            self._face_detections += 1
            self._persons_evaluated += 1

            # Associate each face; use the best (highest-confidence) face for
            # this person track this frame.
            best_face = max(dets, key=lambda d: d.confidence)
            assoc_id = associate_face_to_person(best_face.bbox, person_bboxes)
            if assoc_id is None or assoc_id != track_id:
                # Avoid associating one face with multiple person tracks.
                continue

            confirmed = self._state.update(track_id, best_face.confidence, best_face.bbox)
            if confirmed is not None and not self._state.is_emitted(track_id):
                self._state.mark_emitted(track_id)
                self._confirmed += 1
                obs = FaceObservation(
                    observation_id=str(uuid.uuid4()),
                    camera_code="",
                    person_track_id=int(track_id),
                    face_detection_confidence=round(confirmed.confidence, 4),
                    occurred_at=occurred_at,
                    source_timestamp_ms=int(source_timestamp_ms),
                    bbox=confirmed.bbox,
                )
                new_observations.append(obs)
                logger.info(
                    "FACE confirmed: person=%d faceConf=%.2f frames=%d",
                    int(track_id), confirmed.confidence, self._state._confirm_frames,
                )
            else:
                self._dup_suppressed += 1

        self._state.cleanup_expired(active_track_ids)
        return new_observations

    def _detect(self, frame: np.ndarray, pbox: dict):
        start = time.time()
        try:
            dets = self._detector.detect(frame, pbox, latency_ms=self._face_latency_ms)
        except Exception as e:  # noqa: BLE001
            logger.error("Face detect error: %s", e)
            return []
        return dets

    def get_stats(self) -> dict:
        def avg(xs):
            return round(sum(xs) / len(xs), 2) if xs else 0.0

        return {
            "enabled": self._enabled,
            "modelLoaded": self._detector.is_loaded,
            "status": self._detector.status,
            "recognition": False,
            "personsEvaluated": self._persons_evaluated,
            "faceDetections": self._face_detections,
            "confirmedObservations": self._confirmed,
            "duplicateSuppressed": self._dup_suppressed,
            "averageFaceDetectionLatencyMs": avg(self._face_latency_ms),
            "state": self._state.snapshot(),
        }
