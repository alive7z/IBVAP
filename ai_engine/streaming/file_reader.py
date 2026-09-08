from pathlib import Path

import cv2
import numpy as np

from streaming.video_source import SourceType, VideoSource
from utils.logger import get_logger

logger = get_logger("file_reader")


class FileVideoReader(VideoSource):
    """Reads local video files via OpenCV."""

    def __init__(self, file_path: str, source_id: str = "VIDEO_FILE"):
        self._file_path = Path(file_path)
        self._source_id = source_id
        self._cap: cv2.VideoCapture | None = None
        self._is_open = False
        self._fps: float = 0.0
        self._width: int = 0
        self._height: int = 0
        self._frame_count: int = 0
        self._total_frames_read: int = 0

    # ── VideoSource interface ────────────────────────────────
    @property
    def source_type(self) -> SourceType:
        return SourceType.VIDEO_FILE

    @property
    def source_id(self) -> str:
        return self._source_id

    def open(self) -> None:
        if not self._file_path.exists():
            raise FileNotFoundError(f"Video file not found: {self._file_path}")

        self._cap = cv2.VideoCapture(str(self._file_path))
        if not self._cap.isOpened():
            raise IOError(f"OpenCV cannot open: {self._file_path}")

        self._fps = self._cap.get(cv2.CAP_PROP_FPS) or 0.0
        self._width = int(self._cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        self._height = int(self._cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fc = self._cap.get(cv2.CAP_PROP_FRAME_COUNT)
        self._frame_count = int(fc) if fc > 0 else 0
        self._is_open = True

        logger.info(
            "Video opened: %s | %dx%d | %.1f fps | %d frames",
            self._file_path.name,
            self._width,
            self._height,
            self._fps,
            self._frame_count,
        )

    def read(self) -> tuple[bool, np.ndarray | None]:
        if not self._is_open or self._cap is None:
            return False, None

        ret, frame = self._cap.read()
        if not ret or frame is None:
            self._is_open = False
            return False, None

        self._total_frames_read += 1
        return True, frame

    def is_open(self) -> bool:
        return self._is_open

    def close(self) -> None:
        if self._cap is not None:
            self._cap.release()
            self._cap = None
        self._is_open = False
        logger.info("Video resource released: %s", self._file_path.name)

    def get_metadata(self) -> dict:
        return {
            "sourceId": self._source_id,
            "sourceType": self.source_type.value,
            "filePath": str(self._file_path),
            "fps": self._fps,
            "width": self._width,
            "height": self._height,
            "totalFrames": self._frame_count,
            "framesRead": self._total_frames_read,
            "isOpen": self._is_open,
        }

    def __enter__(self):
        self.open()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
        return False
