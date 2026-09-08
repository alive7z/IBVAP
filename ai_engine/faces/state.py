"""Bounded per-person face state with frame-level confirmation + expiry cleanup.

A confirmed FACE_DETECTED observation is emitted once per person track after a
configurable number of frames with a detected face. State is pruned on track
expiry (no leaks / no unbounded dictionaries).
"""

import time

from faces.models import ConfirmedFace, PersonFaceState
from config import FACE_CONFIRM_FRAMES, FACE_TRACK_TIMEOUT_SECONDS
from utils.logger import get_logger

logger = get_logger("face_state")


class FaceState:
    def __init__(self, confirm_frames: int = FACE_CONFIRM_FRAMES, timeout_seconds: float = FACE_TRACK_TIMEOUT_SECONDS):
        self._confirm_frames = confirm_frames
        self._timeout_seconds = timeout_seconds
        self._states: dict[int, PersonFaceState] = {}

    def _get(self, track_id: int) -> PersonFaceState:
        st = self._states.get(track_id)
        if st is None:
            st = PersonFaceState(person_track_id=track_id)
            self._states[track_id] = st
        return st

    def update(self, track_id: int, face_conf: float, bbox, now: float | None = None) -> ConfirmedFace | None:
        """Record a face detection observation for a person track.

        Returns the confirmed face when confirmation count is reached for the
        first time; otherwise None. Emitted only once per person track.
        """
        now = now or time.time()
        st = self._get(track_id)
        st.last_seen_at = now
        if st.confirmed or st.emitted:
            return None

        st.observations.append(face_conf)
        if len(st.observations) > 10:
            st.observations = st.observations[-10:]

        # Keep the best confidence + its bbox for the confirmation.
        if face_conf > st.best_confidence:
            st.best_confidence = face_conf
            st.best_bbox = bbox

        if len(st.observations) >= self._confirm_frames:
            st.confirmed = ConfirmedFace(confidence=st.best_confidence, bbox=st.best_bbox or bbox)
            return st.confirmed
        return None

    def mark_emitted(self, track_id: int) -> None:
        st = self._get(track_id)
        st.emitted = True

    def is_emitted(self, track_id: int) -> bool:
        st = self._states.get(track_id)
        return bool(st and st.emitted)

    def cleanup_expired(self, active_track_ids: set, now: float | None = None) -> int:
        now = now or time.time()
        expired = [
            tid
            for tid, st in list(self._states.items())
            if tid not in active_track_ids or (now - st.last_seen_at) > self._timeout_seconds
        ]
        for tid in expired:
            del self._states[tid]
        return len(expired)

    def __len__(self) -> int:
        return len(self._states)

    def snapshot(self) -> dict:
        confirmed = sum(1 for s in self._states.values() if s.confirmed)
        emitted = sum(1 for s in self._states.values() if s.emitted)
        return {"activeTracks": len(self._states), "confirmed": confirmed, "emitted": emitted}

    def reset(self) -> None:
        self._states.clear()
