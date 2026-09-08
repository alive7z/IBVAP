import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest

from streaming.file_reader import FileVideoReader
from streaming.live_reader import LiveVideoSource
from streaming.source_factory import (
    UnknownSourceTypeError,
    build_source_config,
    create_video_source,
)
from streaming.video_source import SourceType


def test_video_file_maps_to_file_reader():
    src = create_video_source(build_source_config(
        camera_code="CAM-00",
        source_type="VIDEO_FILE",
        stream_url="/tmp/demo.mp4",
    ))
    assert isinstance(src, FileVideoReader)
    assert src.source_type == SourceType.VIDEO_FILE
    assert src.source_id == "CAM-00"


def test_rtsp_maps_to_live_reader():
    src = create_video_source(build_source_config(
        camera_code="CAM-01",
        source_type="RTSP",
        stream_url="rtsp://127.0.0.1/live",
    ))
    assert isinstance(src, LiveVideoSource)
    assert src.source_type == SourceType.RTSP
    assert src.source_id == "CAM-01"
    assert src.stream_url == "rtsp://127.0.0.1/live"


def test_http_maps_to_live_reader():
    src = create_video_source(build_source_config(
        camera_code="CAM-02",
        source_type="HTTP",
        stream_url="http://127.0.0.1/mjpeg",
    ))
    assert isinstance(src, LiveVideoSource)
    assert src.source_type == SourceType.HTTP


def test_mobile_with_rtsp_protocol_resolves_to_rtsp():
    src = create_video_source(build_source_config(
        camera_code="CAM-PHONE",
        source_type="MOBILE",
        protocol="RTSP",
        stream_url="rtsp://127.0.0.1/phone",
    ))
    assert isinstance(src, LiveVideoSource)
    assert src.source_type == SourceType.RTSP


def test_mobile_with_mjpeg_protocol_resolves_to_mjpeg():
    src = create_video_source(build_source_config(
        camera_code="CAM-PHONE",
        source_type="MOBILE",
        protocol="MJPEG",
        stream_url="http://127.0.0.1/mjpeg",
    ))
    assert src.source_type == SourceType.MJPEG


def test_unsupported_source_type_rejected():
    with pytest.raises(UnknownSourceTypeError):
        create_video_source(build_source_config(
            camera_code="CAM-X",
            source_type="OTHER",
            stream_url="not-a-source",
        ))


def test_unknown_source_type_rejected():
    with pytest.raises(UnknownSourceTypeError):
        create_video_source(build_source_config(
            camera_code="CAM-X",
            source_type="MAGIC_CAMERA",
            stream_url="x",
        ))


def test_live_source_requires_stream_url():
    with pytest.raises(UnknownSourceTypeError):
        create_video_source(build_source_config(
            camera_code="CAM-01",
            source_type="RTSP",
            stream_url=None,
        ))


def test_file_reader_requires_stream_url():
    with pytest.raises(UnknownSourceTypeError):
        create_video_source(build_source_config(
            camera_code="CAM-00",
            source_type="VIDEO_FILE",
            stream_url=None,
        ))


def test_connect_read_timeouts_passthrough():
    src = create_video_source(build_source_config(
        camera_code="CAM-01",
        source_type="RTSP",
        stream_url="rtsp://127.0.0.1/live",
        connect_timeout_seconds=7.0,
        read_timeout_seconds=9.0,
    ))
    assert src._connect_timeout == 7.0
    assert src._read_timeout == 9.0