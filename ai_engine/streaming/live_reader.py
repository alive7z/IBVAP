"""Live video source for transient streams (RTSP / HTTP / MJPEG / phone).

Implementation uses OpenCV's VideoCapture (which is backed by FFmpeg for RTSP/MJPEG
on the installed build). Reads are validated (non-null, non-zero dims, sane
timestamps) and guarded by connection/read timeouts so a dead or hanging camera
fails visibly instead of blocking forever.
"""
import os
import threading
import time
from contextlib import contextmanager

import cv2
import numpy as np

from streaming.video_source import SourceType, VideoSource
from utils.logger import get_logger

logger = get_logger("live_reader")

_native_stderr_lock = threading.Lock()


@contextmanager
def _suppress_native_stderr():
    """Prevent native video backends from echoing private source URLs."""
    with _native_stderr_lock:
        saved_stderr = os.dup(2)
        try:
            devnull = os.open(os.devnull, os.O_WRONLY)
            os.dup2(devnull, 2)
            os.close(devnull)
            yield
        finally:
            os.dup2(saved_stderr, 2)
            os.close(saved_stderr)


class LiveVideoSource(VideoSource):
    """A live source identified by camera code + a stream URL.

    `source_type` maps a MOBILE classification to its transport protocol when
    available (MOBILE + MJPEG -> MJPEG), otherwise falls back to the requested
    type. Reconnect/session logic lives in the caller via ReconnectController but
    this class tracks its own open state and per-read timestamps.
    """

    def __init__(
        self,
        stream_url: str,
        source_id: str = "LIVE",
        source_type: SourceType = SourceType.HTTP,
        protocol: str | None = None,
        connect_timeout_seconds: float = 10.0,
        read_timeout_seconds: float = 10.0,
        share_behind: float = 0.0,
    ):
        self._stream_url = stream_url
        self._source_id = source_id
        self._requested_type = source_type
        self._protocol = (protocol or "").upper()
        self._source_type = self._resolve_type()
        self._connect_timeout = connect_timeout_seconds
        self._read_timeout = read_timeout_seconds
        self._share_behind = share_behind
        self._cap: cv2.VideoCapture | None = None
        self._is_open = False
        self._fps: float = 0.0
        self._width: int = 0
        self._height: int = 0
        self._total_frames_read: int = 0
        self._last_read_monotonic: float = 0.0
        self._last_read_at_utc: str | None = None
        self._consecutive_failures: int = 0
        self._last_failure_reason: str | None = None

    def _resolve_type(self) -> SourceType:
        # MOBILE is a classification; its actual transport is the protocol.
        if self._requested_type == SourceType.MOBILE:
            if self._protocol == "MJPEG":
                return SourceType.MJPEG
            if self._protocol == "RTSP":
                return SourceType.RTSP
            if self._protocol == "HTTP":
                return SourceType.HTTP
            return SourceType.HTTP  # default for phone IP-camera transport
        return self._requested_type

    @property
    def source_type(self) -> SourceType:
        return self._source_type

    @property
    def source_id(self) -> str:
        return self._source_id

    @property
    def stream_url(self) -> str:
        return self._stream_url

    @property
    def consecutive_failures(self) -> int:
        return self._consecutive_failures

    @property
    def last_read_at(self) -> str | None:
        return self._last_read_at_utc

    def seconds_since_last_frame(self) -> float:
        if self._last_read_monotonic <= 0:
            return 0.0
        return max(0.0, time.monotonic() - self._last_read_monotonic)

    def capture_is_open(self) -> bool:
        if not self._is_open or self._cap is None:
            return False
        try:
            return bool(self._cap.isOpened())
        except Exception:
            return False

    def open(self) -> None:
        # OpenCV/FFmpeg can write the full URL (including credentials) directly
        # to native stderr on failure. Suppress that output and emit only the
        # safe camera source_id through the application logger below.
        with _suppress_native_stderr():
            cap = cv2.VideoCapture(self._stream_url)

            # For transient sources, prefer the FFmpeg backend which reliably
            # handles RTSP/MJPEG/HTTP. Release the failed first handle.
            if not cap.isOpened():
                cap.release()
                cap = cv2.VideoCapture(self._stream_url, cv2.CAP_FFMPEG)

        if not cap.isOpened():
            self._cap = None
            self._is_open = False
            self._consecutive_failures += 1
            raise IOError(f"OpenCV cannot open live source: {self._source_id}")

        # Best-effort latency tuning (TCP for RTSP; small buffer). Non-fatal.
        try:
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            if self._source_type == SourceType.RTSP:
                cap.set(cv2.CAP_PROP_RTSP_TRANSPORT, cv2.CAP_PROP_RTSP_TRANSPORT_TCP)
        except Exception:
            pass

        self._fps = cap.get(cv2.CAP_PROP_FPS) or 0.0
        self._width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        self._height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        self._cap = cap
        self._is_open = True
        self._consecutive_failures = 0
        self._last_read_monotonic = time.monotonic()
        logger.info(
            "Live source opened: %s | %dx%d | %.1f fps (type=%s)",
            self._source_id, self._width, self._height, self._fps, self._source_type.value,
        )

    def is_open(self) -> bool:
        return self._is_open and self._cap is not None

    def read(self) -> tuple[bool, np.ndarray | None]:
        if not self._is_open or self._cap is None:
            return False, None

        try:
            with _suppress_native_stderr():
                ret, frame = self._cap.read()
        except Exception as e:
            logger.warning("Live read exception %s: %s", self._source_id, e)
            self._consecutive_failures += 1
            self._last_failure_reason = "read_exception"
            return False, None

        if not ret or frame is None or not self._valid_frame(frame):
            self._consecutive_failures += 1
            if not ret:
                self._last_failure_reason = "capture_returned_false"
            elif frame is None:
                self._last_failure_reason = "frame_none"
            else:
                self._last_failure_reason = "invalid_frame_dimensions"
            if self._consecutive_failures >= 5:
                # Likely a disconnected/hung stream -> surface failure.
                logger.warning("Live source %s producing invalid frames", self._source_id)
            return False, None

        self._consecutive_failures = 0
        self._last_failure_reason = None
        self._total_frames_read += 1
        self._last_read_monotonic = time.monotonic()
        self._last_read_at_utc = __import__("utils.time", fromlist=["utc_iso"]).utc_iso()
        return True, frame

    def _valid_frame(self, frame: np.ndarray) -> bool:
        if frame is None:
            return False
        h, w = frame.shape[:2]
        if h <= 0 or w <= 0:
            return False
        # Reject mostly-empty/blank captures that are not real video.
        if frame.size == 0:
            return False
        return True

    def is_stale(self, stale_seconds: float) -> bool:
        """True when no fresh frame arrived within `stale_seconds`."""
        if not self._is_open:
            return False
        return (time.monotonic() - self._last_read_monotonic) > stale_seconds

    def get_metadata(self) -> dict:
        return {
            "sourceId": self._source_id,
            "sourceType": self._source_type.value,
            "protocol": self._protocol or None,
            "fps": self._fps,
            "width": self._width,
            "height": self._height,
            "framesRead": self._total_frames_read,
            "isOpen": self._is_open,
            "consecutiveFailures": self._consecutive_failures,
            "lastReadAt": self._last_read_at_utc,
            "secondsSinceLastFrame": round(self.seconds_since_last_frame(), 3),
            "captureIsOpened": self.capture_is_open(),
            "lastFailureReason": self._last_failure_reason,
            "readerMode": "synchronous",
            "connectTimeoutSeconds": self._connect_timeout,
            "readTimeoutSeconds": self._read_timeout,
        }

    def close(self) -> None:
        if self._cap is not None:
            try:
                self._cap.release()
            except Exception as e:
                logger.warning("Live source release error %s: %s", self._source_id, e)
            self._cap = None
        self._is_open = False
        logger.info("Live source released: %s", self._source_id)

    def __enter__(self):
        self.open()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
        return False
