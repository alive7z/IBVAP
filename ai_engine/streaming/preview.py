"""Browser-compatible preview support: latest-frame store + MJPEG multipart.

A single (shared) frame store holds ONLY the most recent annotated frame per
camera per session — never an unbounded history. Slow browsers read the latest
frame (latest-frame semantics) rather than blocking AI inference, and multiple
preview clients share the one decoder/frame store.
"""
import threading
import time

import cv2
import numpy as np

from config import (
    PREVIEW_FPS,
    PREVIEW_JPEG_QUALITY,
    PREVIEW_WIDTH,
)
from utils.logger import get_logger

logger = get_logger("preview")

_JPEG_HEADER = b"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: %d\r\n\r\n"


class LatestFrameStore:
    """Holds the single most recent annotated frame for a camera (latest-frame)."""

    def __init__(self):
        self._lock = threading.Lock()
        self._frame: np.ndarray | None = None
        self._captured_at: float = 0.0

    def set(self, frame: np.ndarray) -> None:
        with self._lock:
            self._frame = frame
            self._captured_at = time.time()

    def get(self) -> tuple[np.ndarray | None, float]:
        with self._lock:
            return self._frame, self._captured_at

    def clear(self) -> None:
        with self._lock:
            self._frame = None
            self._captured_at = 0.0

    def has_frame(self) -> bool:
        with self._lock:
            return self._frame is not None


def prepare_preview_frame(frame: np.ndarray) -> np.ndarray:
    """Downscale a frame for preview delivery (keeps aspect ratio)."""
    h, w = frame.shape[:2]
    if PREVIEW_WIDTH > 0 and w > PREVIEW_WIDTH:
        scale = PREVIEW_WIDTH / float(w)
        new_w = PREVIEW_WIDTH
        new_h = int(round(h * scale))
        return cv2.resize(frame, (new_w, new_h), interpolation=cv2.INTER_AREA)
    return frame


def encode_jpeg(frame: np.ndarray) -> bytes:
    """Encode a frame to JPEG bytes (quality from config). Returns b"" on failure."""
    img = prepare_preview_frame(frame)
    ok, buf = cv2.imencode(".jpg", img, [int(cv2.IMWRITE_JPEG_QUALITY), PREVIEW_JPEG_QUALITY])
    if not ok:
        return b""
    return buf.tobytes()


def iter_mjpeg(store: LatestFrameStore,
               min_interval: float | None = None):
    """Yield MJPEG multipart body chunks from a LatestFrameStore (latest-frame).

    `min_interval` (seconds) throttles delivery; if None the caller's loop paces
    it. This is a generator for FastAPI StreamingResponse; no unbounded queue.
    """
    last_sent: float = 0.0
    last_key: tuple | None = None
    min_interval = min_interval if min_interval is not None else (1.0 / PREVIEW_FPS if PREVIEW_FPS > 0 else 0.0)

    while True:
        frame, captured_at = store.get()
        if frame is not None:
            now = time.time()
            if (now - last_sent) >= min_interval:
                jpeg = encode_jpeg(frame)
                if jpeg:
                    yield _JPEG_HEADER % len(jpeg) + jpeg + b"\r\n"
                    last_sent = now
        time.sleep(0.03)
