"""Central factory for constructing a VideoSource from a camera source config.

The downstream AI pipeline always consumes the same Frame representation, so the
inference worker never cares whether a frame came from an MP4, an RTSP stream, a
phone, or an HTTP/MJPEG endpoint.
"""
from dataclasses import dataclass, field

from streaming.file_reader import FileVideoReader
from streaming.live_reader import LiveVideoSource
from streaming.video_source import LIVE_SOURCE_TYPES, SourceType
from utils.logger import get_logger

logger = get_logger("source_factory")


class UnknownSourceTypeError(ValueError):
    """Raised when a source config requests a type the factory cannot build."""


@dataclass
class SourceConfig:
    camera_code: str
    source_type: str
    protocol: str | None = None
    stream_url: str | None = None
    rotation_degrees: int = 0
    connect_timeout_seconds: float = 10.0
    read_timeout_seconds: float = 10.0


def _resolve_source_type(raw: str) -> SourceType:
    key = (raw or "").strip().upper()
    try:
        return SourceType(key)
    except ValueError:
        return SourceType.OTHER


def create_video_source(config: SourceConfig) -> FileVideoReader | LiveVideoSource:
    """Build the appropriate VideoSource for the given config.

    VIDEO_FILE -> FileVideoReader
    RTSP / HTTP / MJPEG / MOBILE -> LiveVideoSource
    anything else -> UnknownSourceTypeError (rejected safely)
    """
    source_type = _resolve_source_type(config.source_type)

    if source_type == SourceType.VIDEO_FILE:
        if not config.stream_url:
            raise UnknownSourceTypeError("VIDEO_FILE source requires a stream_url (file path)")
        return FileVideoReader(
            config.stream_url,
            source_id=config.camera_code,
        )

    if source_type in LIVE_SOURCE_TYPES:
        if not config.stream_url:
            raise UnknownSourceTypeError(
                f"{source_type.value} source requires a stream_url"
            )
        return LiveVideoSource(
            stream_url=config.stream_url,
            source_id=config.camera_code,
            source_type=source_type,
            protocol=config.protocol,
            connect_timeout_seconds=config.connect_timeout_seconds,
            read_timeout_seconds=config.read_timeout_seconds,
        )

    raise UnknownSourceTypeError(f"Unsupported source type: {config.source_type!r}")


def build_source_config(
    camera_code: str,
    source_type: str,
    protocol: str | None = None,
    stream_url: str | None = None,
    rotation_degrees: int = 0,
    connect_timeout_seconds: float = 10.0,
    read_timeout_seconds: float = 10.0,
) -> SourceConfig:
    return SourceConfig(
        camera_code=camera_code,
        source_type=source_type,
        protocol=protocol,
        stream_url=stream_url,
        rotation_degrees=rotation_degrees,
        connect_timeout_seconds=connect_timeout_seconds,
        read_timeout_seconds=read_timeout_seconds,
    )
