import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest
from streaming.file_reader import FileVideoReader


def test_reject_missing_file():
    reader = FileVideoReader("/nonexistent/video.mp4")
    with pytest.raises(FileNotFoundError):
        reader.open()


def test_metadata_before_open():
    reader = FileVideoReader("/fake/path.mp4")
    meta = reader.get_metadata()
    assert meta["isOpen"] is False
    assert meta["framesRead"] == 0


def test_read_before_open():
    reader = FileVideoReader("/fake/path.mp4")
    ret, frame = reader.read()
    assert ret is False
    assert frame is None


def test_valid_video_opens(synthetic_video):
    reader = FileVideoReader(synthetic_video)
    reader.open()
    assert reader.is_open()
    meta = reader.get_metadata()
    assert meta["fps"] > 0
    assert meta["width"] == 320
    assert meta["height"] == 240
    assert meta["totalFrames"] == 72
    reader.close()
    assert not reader.is_open()


def test_read_frames(synthetic_video):
    reader = FileVideoReader(synthetic_video)
    reader.open()
    count = 0
    while reader.is_open():
        ret, frame = reader.read()
        if not ret:
            break
        assert frame is not None
        assert frame.shape == (240, 320, 3)
        count += 1
    assert count == 72
    reader.close()


def test_eof_detected(synthetic_video):
    reader = FileVideoReader(synthetic_video)
    reader.open()
    for _ in range(72):
        reader.read()
    ret, frame = reader.read()
    assert ret is False
    assert frame is None
    assert not reader.is_open()
    reader.close()


def test_context_manager(synthetic_video):
    with FileVideoReader(synthetic_video) as reader:
        assert reader.is_open()
        ret, frame = reader.read()
        assert ret is True
    assert not reader.is_open()
