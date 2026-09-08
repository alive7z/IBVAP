"""Bounded per-vehicle ANPR state with multi-frame consensus + expiry cleanup.

The same confirmed vehicle track may yield several plate reads across frames.
We collect a bounded set of candidates and choose the strongest/consensus
result (highest-confidence normalized text; ties broken by read count). A
confirmed observation is emitted at most once per vehicle track.

State is pruned when a track expires (no unbounded dictionaries / leaks).
"""

import time
from collections import defaultdict

from anpr.models import ConfirmedPlate, PlateCandidate, VehiclePlateState
from config import ANPR_CONFIRM_READS, ANPR_TRACK_TIMEOUT_SECONDS
from utils.logger import get_logger

logger = get_logger("anpr_state")


class AnprState:
    def __init__(self, confirm_reads: int = ANPR_CONFIRM_READS, timeout_seconds: float = ANPR_TRACK_TIMEOUT_SECONDS):
        self._confirm_reads = confirm_reads
        self._timeout_seconds = timeout_seconds
        self._states: dict[int, VehiclePlateState] = {}

    def _get(self, track_id: int) -> VehiclePlateState:
        st = self._states.get(track_id)
        if st is None:
            st = VehiclePlateState(vehicle_track_id=track_id)
            self._states[track_id] = st
        return st

    def update(self, track_id: int, candidate: PlateCandidate | None, now: float | None = None) -> ConfirmedPlate | None:
        """Record a candidate read for a vehicle track.

        Returns the confirmed plate when consensus is reached for the first
        time; otherwise returns None. Confirmation is emitted once per track.
        """
        now = now or time.time()
        st = self._get(track_id)
        st.last_seen_at = now
        if candidate is None:
            return None
        if st.confirmed or st.emitted:
            return None

        st.candidates.append(candidate)
        # Bound the candidate list to a small window.
        if len(st.candidates) > 16:
            st.candidates = st.candidates[-16:]

        # Consensus: pick highest-confidence normalized text; tie-break by count.
        counts: dict[str, int] = defaultdict(int)
        best_conf: dict[str, float] = {}
        best_box: dict[str, object] = {}
        for c in st.candidates:
            if not c.normalized_text:
                continue
            counts[c.normalized_text] += 1
            if c.ocr_confidence > best_conf.get(c.normalized_text, 0.0):
                best_conf[c.normalized_text] = c.ocr_confidence
                best_box[c.normalized_text] = c

        if not best_conf:
            return None

        best_text = max(
            best_conf,
            key=lambda t: (best_conf[t], counts[t]),
        )
        total_reads = counts[best_text]
        # Only confirmation-eligible when we have enough same-text reads with
        # the highest confidence at or above the threshold (threshold enforced
        # by the caller's validator via `candidate` eligibility).
        if total_reads >= self._confirm_reads:
            chosen = best_box[best_text]
            st.confirmed = ConfirmedPlate(
                plate_text=chosen.normalized_text,
                raw_text=chosen.raw_text,
                ocr_confidence=chosen.ocr_confidence,
                plate_detection_confidence=chosen.plate_detection_confidence,
                bbox=chosen.bbox,
            )
            return st.confirmed
        return None

    def mark_emitted(self, track_id: int) -> None:
        st = self._get(track_id)
        st.emitted = True

    def confirmed_for(self, track_id: int) -> ConfirmedPlate | None:
        st = self._states.get(track_id)
        return st.confirmed if st else None

    def is_emitted(self, track_id: int) -> bool:
        st = self._states.get(track_id)
        return bool(st and st.emitted)

    def cleanup_expired(self, active_track_ids: set, now: float | None = None) -> int:
        """Remove state for tracks that are gone or stale. Returns count removed."""
        now = now or time.time()
        expired = [
            tid
            for tid, st in list(self._states.items())
            if tid not in active_track_ids
            or (now - st.last_seen_at) > self._timeout_seconds
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
