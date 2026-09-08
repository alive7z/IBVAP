import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np
import pytest
from preprocessing.resize import resize_frame, validate_frame


def test_resize_preserves_dimensions():
    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    result = resize_frame(frame, 1280, 720)
    assert result.shape == (720, 1280, 3)


def test_resize_aspect_ratio_preserved():
    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    result = resize_frame(frame, 1280, 720, preserve_aspect=True)
    assert result.shape == (720, 1280, 3)
    non_zero_cols = np.any(result != 0, axis=(0, 2))
    non_zero_rows = np.any(result != 0, axis=(1, 2))
    assert non_zero_cols.sum() < 1280
    assert non_zero_rows.sum() < 720


def test_resize_no_preserve():
    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    result = resize_frame(frame, 1280, 720, preserve_aspect=False)
    assert result.shape == (720, 1280, 3)


def test_resize_rejects_empty():
    with pytest.raises(ValueError):
        resize_frame(np.array([]), 100, 100)


def test_validate_frame_valid():
    assert validate_frame(np.zeros((100, 100, 3))) is True


def test_validate_frame_none():
    assert validate_frame(None) is False


def test_validate_frame_empty():
    assert validate_frame(np.array([])) is False
