import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np
from streaming.frame_buffer import FrameBuffer
from schemas.frame import Frame
from utils.time import ms_now


def _make_frame(index: int) -> Frame:
    return Frame(
        frame_id=f"F_{index:04d}",
        source_id="TEST",
        frame_index=index,
        captured_at=0.0,
        source_timestamp_ms=ms_now(),
        width=100,
        height=100,
        image=np.zeros((100, 100, 3), dtype=np.uint8),
    )


def test_push_and_pop():
    buf = FrameBuffer(maxsize=3)
    buf.push(_make_frame(1))
    buf.push(_make_frame(2))
    f = buf.pop()
    assert f is not None
    assert f.frame_id == "F_0001"


def test_max_size_respected():
    buf = FrameBuffer(maxsize=5)
    for i in range(10):
        buf.push(_make_frame(i))
    assert buf.size == 5
    assert buf.is_full
    stats = buf.get_stats()
    assert stats["totalDropped"] == 5
    assert stats["totalAdded"] == 10


def test_never_unbounded():
    buf = FrameBuffer(maxsize=3)
    for i in range(100):
        buf.push(_make_frame(i))
    assert buf.size <= 3


def test_pop_empty():
    buf = FrameBuffer(maxsize=5)
    assert buf.pop() is None


def test_clear():
    buf = FrameBuffer(maxsize=5)
    for i in range(5):
        buf.push(_make_frame(i))
    buf.clear()
    assert buf.is_empty
    assert buf.size == 0


def test_peek_latest():
    buf = FrameBuffer(maxsize=5)
    buf.push(_make_frame(1))
    buf.push(_make_frame(2))
    latest = buf.peek_latest()
    assert latest is not None
    assert latest.frame_id == "F_0002"
    assert buf.size == 2


def test_stats():
    buf = FrameBuffer(maxsize=3)
    for i in range(5):
        buf.push(_make_frame(i))
    stats = buf.get_stats()
    assert stats["maxSize"] == 3
    assert stats["totalAdded"] == 5
    assert stats["totalDropped"] == 2
    assert stats["currentSize"] == 3
