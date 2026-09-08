import threading
from collections import deque

from schemas.frame import Frame
from utils.logger import get_logger

logger = get_logger("frame_buffer")


class FrameBuffer:
    """Bounded deque-based frame buffer with drop-on-full semantics."""

    def __init__(self, maxsize: int = 10):
        self._maxsize = maxsize
        self._frames: deque[Frame] = deque(maxlen=maxsize)
        self._lock = threading.Lock()
        self._total_added: int = 0
        self._total_dropped: int = 0

    def push(self, frame: Frame) -> bool:
        with self._lock:
            if len(self._frames) >= self._maxsize:
                self._frames.popleft()
                self._total_dropped += 1
                logger.debug("Buffer full — dropped oldest frame (total dropped: %d)", self._total_dropped)

            self._frames.append(frame)
            self._total_added += 1
            return True

    def pop(self) -> Frame | None:
        with self._lock:
            if self._frames:
                return self._frames.popleft()
            return None

    def peek_latest(self) -> Frame | None:
        with self._lock:
            if self._frames:
                return self._frames[-1]
            return None

    def clear(self) -> None:
        with self._lock:
            self._frames.clear()

    @property
    def size(self) -> int:
        with self._lock:
            return len(self._frames)

    @property
    def is_full(self) -> bool:
        with self._lock:
            return len(self._frames) >= self._maxsize

    @property
    def is_empty(self) -> bool:
        with self._lock:
            return len(self._frames) == 0

    @property
    def maxsize(self) -> int:
        return self._maxsize

    def get_stats(self) -> dict:
        with self._lock:
            return {
                "currentSize": len(self._frames),
                "maxSize": self._maxsize,
                "totalAdded": self._total_added,
                "totalDropped": self._total_dropped,
                "isFull": len(self._frames) >= self._maxsize,
            }
