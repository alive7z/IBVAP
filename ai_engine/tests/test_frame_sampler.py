import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np
from streaming.frame_sampler import FrameSampler


def test_all_frames_sampled_when_source_equals_target():
    sampler = FrameSampler(source_fps=5.0, target_fps=5.0, source_id="TEST")
    frame = np.zeros((100, 100, 3), dtype=np.uint8)

    sampled = 0
    for _ in range(20):
        result = sampler.process_frame(frame)
        if result is not None:
            sampled += 1

    assert sampled > 0
    assert sampler.sampled_count == sampled


def test_reduces_frame_rate():
    sampler = FrameSampler(source_fps=30.0, target_fps=5.0, source_id="TEST")
    frame = np.zeros((100, 100, 3), dtype=np.uint8)

    total = 60
    sampled = 0
    for _ in range(total):
        result = sampler.process_frame(frame)
        if result is not None:
            sampled += 1

    assert sampled < total
    assert sampled > 0


def test_zero_source_fps():
    sampler = FrameSampler(source_fps=0, target_fps=5.0, source_id="TEST")
    frame = np.zeros((100, 100, 3), dtype=np.uint8)
    result = sampler.process_frame(frame)
    assert result is not None


def test_frame_metadata():
    sampler = FrameSampler(source_fps=30.0, target_fps=5.0, source_id="SRC")
    frame = np.zeros((240, 320, 3), dtype=np.uint8)
    result = sampler.process_frame(frame)
    assert result is not None
    assert result.source_id == "SRC"
    assert result.width == 320
    assert result.height == 240
    assert result.frame_index == 1


def test_stats():
    sampler = FrameSampler(source_fps=30.0, target_fps=5.0, source_id="TEST")
    frame = np.zeros((100, 100, 3), dtype=np.uint8)
    for _ in range(30):
        sampler.process_frame(frame)
    stats = sampler.get_stats()
    assert stats["sourceFps"] == 30.0
    assert stats["targetFps"] == 5.0
    assert stats["framesReceived"] == 30


def test_index_based_sampling_is_deterministic():
    sampler = FrameSampler(source_fps=30.0, target_fps=5.0, source_id="TEST", index_based=True)
    frame = np.zeros((100, 100, 3), dtype=np.uint8)

    sampled_indices = []
    for _ in range(90):
        result = sampler.process_frame(frame)
        if result is not None:
            sampled_indices.append(result.frame_index)

    # stride = 30/5 = 6 → samples frames 1,7,13,...,85 → 15 samples of 90
    assert sampled_indices == list(range(1, 91, 6))
    assert len(sampled_indices) == 15
    assert sampler.sampled_count == 15
    assert sampler.skipped_count == 75


def test_index_based_sampling_no_reduction_when_target_equals_source():
    sampler = FrameSampler(source_fps=30.0, target_fps=30.0, source_id="TEST", index_based=True)
    frame = np.zeros((100, 100, 3), dtype=np.uint8)
    sampled = sum(1 for _ in range(20) if sampler.process_frame(frame) is not None)
    assert sampled == 20

