import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np
import pytest


@pytest.fixture
def sample_frame():
    return np.zeros((480, 640, 3), dtype=np.uint8)


@pytest.fixture
def test_video_path():
    path = Path(__file__).resolve().parent.parent / "samples" / "test.mp4"
    if path.exists():
        return str(path)
    pytest.skip("samples/test.mp4 not found — skipping video-dependent test")


@pytest.fixture
def synthetic_video(tmp_path):
    """Create a tiny synthetic MP4 for testing."""
    import cv2

    path = str(tmp_path / "test_synth.mp4")
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(path, fourcc, 24.0, (320, 240))

    for i in range(72):
        frame = np.random.randint(0, 255, (240, 320, 3), dtype=np.uint8)
        writer.write(frame)
    writer.release()
    return path
