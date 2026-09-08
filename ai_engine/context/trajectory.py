"""Bounded per-track trajectory store.

Holds normalized reference points with timestamps. Reuses the bounded-history
philosophy from Phase 8 (a deque with a max length) so memory cannot grow
without bound.
"""

from collections import deque

from config import TRACK_HISTORY_LENGTH


class Trajectory:
    def __init__(self, maxlen: int = TRACK_HISTORY_LENGTH):
        self._points: deque = deque(maxlen=maxlen)

    def add(self, point: dict) -> None:
        """point: normalized {x, y, timestamp[, confidence]}"""
        self._points.append(point)

    def points(self) -> list[dict]:
        return list(self._points)

    def recent(self, n: int) -> list[dict]:
        pts = list(self._points)
        return pts[-n:] if n > 0 else []

    def __len__(self) -> int:
        return len(self._points)

    def reset(self) -> None:
        self._points.clear()
