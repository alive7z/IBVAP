"""Bounded ring buffer of annotated frames for evidence capture (Phase 11).

Keeps the most recent ~ (pre + post) seconds of sampled frames so that when Node
requests evidence for an alert we can recover a snapshot frame and a short clip
from real processed frames (never fabricated media).
"""
from __future__ import annotations

import threading
from collections import deque
from dataclasses import dataclass

import numpy as np


@dataclass
class BufferedFrame:
    image: np.ndarray
    captured_at: float
    source_timestamp_ms: float
    frame_index: int


class FrameRingBuffer:
    """Thread-safe bounded ring buffer indexed by source timestamp."""

    def __init__(self, maxlen: int = 60):
        self._maxlen = max(int(maxlen), 1)
        self._frames: deque[BufferedFrame] = deque(maxlen=self._maxlen)
        self._lock = threading.Lock()
        self._total_pushed: int = 0
        self._total_dropped: int = 0

    def push(self, frame: BufferedFrame) -> None:
        with self._lock:
            if len(self._frames) >= self._maxlen:
                self._total_dropped += 1
            self._frames.append(frame)
            self._total_pushed += 1

    def snapshot_frame(self, source_timestamp_ms: float | None = None) -> np.ndarray | None:
        """Return the frame nearest the given source timestamp (default: newest)."""
        with self._lock:
            if not self._frames:
                return None
            if source_timestamp_ms is None:
                return self._frames[-1].image
            best = min(self._frames, key=lambda f: abs(f.source_timestamp_ms - source_timestamp_ms))
            return best.image

    def clip_frames(self, source_timestamp_ms: float | None = None) -> list[BufferedFrame]:
        """Return recent frames as a list, ordered oldest → newest.

        If a target timestamp is provided, frames are returned in a window ending
        near that timestamp; otherwise the whole retained buffer is used.
        """
        with self._lock:
            items = list(self._frames)
        if source_timestamp_ms is None:
            return items
        # Keep frames at or before the target timestamp (the incident window).
        window = [f for f in items if f.source_timestamp_ms <= source_timestamp_ms]
        return window or items[-1:]

    def clear(self) -> None:
        with self._lock:
            self._frames.clear()

    @property
    def size(self) -> int:
        with self._lock:
            return len(self._frames)

    @property
    def maxlen(self) -> int:
        return self._maxlen

    def get_stats(self) -> dict:
        with self._lock:
            return {
                "currentSize": len(self._frames),
                "maxSize": self._maxlen,
                "totalPushed": self._total_pushed,
                "totalDropped": self._total_dropped,
            }
