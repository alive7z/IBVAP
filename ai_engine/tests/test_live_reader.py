import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np

from streaming.live_reader import LiveVideoSource
from streaming.video_source import SourceType


def make_live(stream_url="http://127.0.0.1/mjpeg", **kw):
    return LiveVideoSource(
        stream_url=stream_url,
        source_id="CAM-LIVE",
        source_type=SourceType.HTTP,
        **kw,
    )


def test_initial_metadata_shape():
    src = make_live()
    meta = src.get_metadata()
    assert meta["sourceId"] == "CAM-LIVE"
    assert meta["sourceType"] == SourceType.HTTP.value
    assert meta["isOpen"] is False
    assert meta["framesRead"] == 0
    assert meta["consecutiveFailures"] == 0


def test_not_open_no_read():
    src = make_live()
    ok, frame = src.read()
    assert ok is False
    assert frame is None


def test_stale_true_when_open_and_stalled():
    src = make_live()
    src._is_open = True
    src._last_read_monotonic = time.monotonic() - 10.0
    assert src.is_stale(5.0) is True


def test_stale_false_when_not_open():
    src = make_live()
    assert src.is_stale(5.0) is False


def test_valid_frame_accepts_real_image():
    src = make_live()
    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    assert src._valid_frame(frame) is True


def test_valid_frame_rejects_empty():
    src = make_live()
    assert src._valid_frame(None) is False
    assert src._valid_frame(np.zeros((0, 0, 3), dtype=np.uint8)) is False


def test_mobile_resolves_to_http_by_default():
    src = LiveVideoSource(
        stream_url="http://127.0.0.1/phone",
        source_id="CAM-PHONE",
        source_type=SourceType.MOBILE,
        protocol="HTTP",
    )
    assert src.source_type == SourceType.HTTP