"""Conservative, continuous per-track loitering detection."""

from config import LOITERING_RADIUS, LOITERING_SECONDS


class LoiteringDetector:
    def __init__(self, radius: float = LOITERING_RADIUS, seconds: float = LOITERING_SECONDS):
        self._radius = radius
        self._seconds = seconds
        self._anchor = None  # first reference point of the window
        self._anchor_time = None
        self._max_displacement = 0.0
        self._active = False

    def _reset(self, point: dict, now: float):
        self._anchor = point
        self._anchor_time = now
        self._max_displacement = 0.0
        self._active = False

    def detect(self, point: dict, now: float) -> bool:
        """Feed a point and return True only when a loiter episode starts.

        Once confirmed, the original anchor/time are preserved so callers can
        measure the continuous episode duration. Leaving the configured radius
        ends the episode and starts a fresh candidate window.
        """
        if self._anchor is None:
            self._reset(point, now)
            return False

        disp = ((point["x"] - self._anchor["x"]) ** 2 + (point["y"] - self._anchor["y"]) ** 2) ** 0.5
        self._max_displacement = max(self._max_displacement, disp)

        # If the object strayed outside the radius, reset the window.
        if disp > self._radius:
            self._reset(point, now)
            return False

        elapsed = now - self._anchor_time
        if not self._active and elapsed >= self._seconds:
            self._active = True
            return True

        return False

    def stats_for_trigger(self) -> dict:
        return {"radius": round(self._max_displacement, 4)}

    def current_radius(self) -> float:
        return round(self._max_displacement, 4)

    @property
    def is_active(self) -> bool:
        return self._active

    def current_duration(self, now: float) -> float:
        if not self._active or self._anchor_time is None:
            return 0.0
        return max(0.0, now - self._anchor_time)
