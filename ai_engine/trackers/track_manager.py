import time
from collections import deque

from config import TRACK_CONFIRM_FRAMES, TRACK_HISTORY_LENGTH
from utils.logger import get_logger

logger = get_logger("track_manager")


class TrackState:
    TENTATIVE = "TENTATIVE"
    CONFIRMED = "CONFIRMED"
    LOST = "LOST"


class TrackEntry:
    __slots__ = (
        "track_id", "class_name", "object_type", "vehicle_type",
        "state", "seen_count", "first_seen", "last_seen",
        "history", "emitted",
    )

    def __init__(self, track_id: int, class_name: str, object_type: str, vehicle_type: str | None = None):
        self.track_id = track_id
        self.class_name = class_name
        self.object_type = object_type
        self.vehicle_type = vehicle_type
        self.state = TrackState.TENTATIVE
        self.seen_count = 0
        self.first_seen = time.time()
        self.last_seen = time.time()
        self.history: deque = deque(maxlen=TRACK_HISTORY_LENGTH)
        self.emitted = False

    def observe(self, center_x: float, center_y: float, confidence: float) -> None:
        self.seen_count += 1
        self.last_seen = time.time()
        self.history.append({
            "x": center_x,
            "y": center_y,
            "confidence": confidence,
            "timestamp": self.last_seen,
        })

    def maybe_confirm(self, confirm_frames: int) -> None:
        if self.seen_count >= confirm_frames and self.state == TrackState.TENTATIVE:
            self.state = TrackState.CONFIRMED
            logger.debug("Track %d confirmed after %d frames", self.track_id, self.seen_count)

    @property
    def is_confirmed(self) -> bool:
        return self.state == TrackState.CONFIRMED

    @property
    def should_emit(self) -> bool:
        return self.is_confirmed and not self.emitted

    def mark_emitted(self) -> None:
        self.emitted = True

    def to_dict(self) -> dict:
        return {
            "trackId": self.track_id,
            "className": self.class_name,
            "objectType": self.object_type,
            "vehicleType": self.vehicle_type,
            "state": self.state,
            "seenCount": self.seen_count,
            "historyLength": len(self.history),
            "emitted": self.emitted,
        }


class TrackManager:
    """Manages track lifecycle: tentative → confirmed → emitted."""

    def __init__(self, confirm_frames: int = TRACK_CONFIRM_FRAMES):
        self._confirm_frames = confirm_frames
        self._tracks: dict[int, TrackEntry] = {}
        self._total_created: int = 0
        self._total_confirmed: int = 0
        self._total_emitted: int = 0

    def update(self, tracked_objects: list[dict]) -> list[dict]:
        active_ids = set()

        for obj in tracked_objects:
            tid = obj.get("trackId")
            if tid is None:
                continue
            active_ids.add(tid)

            if tid in self._tracks:
                entry = self._tracks[tid]
                # ByteTrack owns the short-term lost-track buffer. If it emits
                # this same ID again, the association has been recovered and
                # the application lifecycle must follow it back to CONFIRMED.
                # Keep `emitted` intact so PERSON_DETECTED is not duplicated.
                if entry.state == TrackState.LOST:
                    entry.state = TrackState.CONFIRMED
                    logger.debug("Track %d recovered by ByteTrack", tid)
                entry.observe(obj["center"]["x"], obj["center"]["y"], obj["confidence"])
            else:
                entry = TrackEntry(
                    track_id=tid,
                    class_name=obj["className"],
                    object_type=obj["objectType"],
                    vehicle_type=obj.get("vehicleType"),
                )
                entry.observe(obj["center"]["x"], obj["center"]["y"], obj["confidence"])
                self._tracks[tid] = entry
                self._total_created += 1

            entry.maybe_confirm(self._confirm_frames)

        for tid in list(self._tracks.keys()):
            if tid not in active_ids:
                self._tracks[tid].state = TrackState.LOST

        confirmed_count = sum(1 for e in self._tracks.values() if e.is_confirmed)
        self._total_confirmed = max(self._total_confirmed, confirmed_count)

        return self._get_confirmed_tracks()

    def _get_confirmed_tracks(self) -> list[dict]:
        ready = []
        for entry in self._tracks.values():
            if entry.should_emit:
                entry.mark_emitted()
                self._total_emitted += 1
                ready.append(entry)
        return ready

    def get_confirmed_entries(self) -> list[TrackEntry]:
        """Return EVERY currently-CONFIRMED track entry (every frame), without
        consuming/marking emitted. Used by the Phase 9 context engine so it can
        observe the same confirmed track across many frames and accumulate
        zone/dwell/loitering state."""
        return [e for e in self._tracks.values() if e.is_confirmed]

    def get_track(self, track_id: int) -> TrackEntry | None:
        return self._tracks.get(track_id)

    def get_all_tracks(self) -> dict[int, TrackEntry]:
        return dict(self._tracks)

    def reset(self) -> None:
        self._tracks.clear()
        self._total_created = 0
        self._total_confirmed = 0
        self._total_emitted = 0

    def get_stats(self) -> dict:
        active = sum(1 for e in self._tracks.values() if e.state != TrackState.LOST)
        return {
            "totalCreated": self._total_created,
            "totalConfirmed": self._total_confirmed,
            "totalEmitted": self._total_emitted,
            "activeTracks": active,
            "lostTracks": sum(1 for e in self._tracks.values() if e.state == TrackState.LOST),
        }
