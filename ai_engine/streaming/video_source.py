from abc import ABC, abstractmethod
from enum import Enum

import numpy as np


class SourceType(str, Enum):
    VIDEO_FILE = "VIDEO_FILE"
    RTSP = "RTSP"
    HTTP = "HTTP"
    MJPEG = "MJPEG"
    MOBILE = "MOBILE"
    OTHER = "OTHER"


# Live-capable source types (anything that is not a local video file). A MOBILE
# camera is a classification whose actual transport is HTTP/MJPEG/RTSP.
LIVE_SOURCE_TYPES = {SourceType.RTSP, SourceType.HTTP, SourceType.MJPEG, SourceType.MOBILE}


class VideoSource(ABC):
    """Abstract video source — all ingestion backends implement this."""

    @abstractmethod
    def open(self) -> None: ...

    @abstractmethod
    def read(self) -> tuple[bool, np.ndarray | None]: ...

    @abstractmethod
    def is_open(self) -> bool: ...

    @abstractmethod
    def close(self) -> None: ...

    @abstractmethod
    def get_metadata(self) -> dict: ...

    @property
    @abstractmethod
    def source_type(self) -> SourceType: ...

    @property
    @abstractmethod
    def source_id(self) -> str: ...
