import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np
from streaming.file_reader import FileVideoReader
from streaming.frame_buffer import FrameBuffer
from streaming.frame_sampler import FrameSampler
from streaming.stream_health import StreamHealth, StreamStatus
from workers.inference_worker import InferenceWorker
from config import FRAME_BUFFER_SIZE, FRAME_HEIGHT, FRAME_SAMPLE_FPS, FRAME_WIDTH


def test_full_pipeline_with_synthetic_video(synthetic_video):
    health = StreamHealth()
    reader = FileVideoReader(synthetic_video)
    buffer = FrameBuffer(maxsize=FRAME_BUFFER_SIZE)
    worker = InferenceWorker(source_id="TEST", camera_code="TST")

    reader.open()
    meta = reader.get_metadata()
    sampler = FrameSampler(source_fps=meta["fps"], target_fps=FRAME_SAMPLE_FPS, source_id="TEST")
    health.set_source_info("VIDEO_FILE", meta["fps"])
    health.set_status(StreamStatus.ONLINE)

    processed = 0
    sampled = 0
    while reader.is_open():
        ret, raw = reader.read()
        if not ret:
            break
        health.record_frame_received()
        frame = sampler.process_frame(raw)
        if frame is None:
            continue
        sampled += 1
        buffer.push(frame)
        f = buffer.pop()
        if f is None:
            continue
        output = worker.process_frame(f)
        assert output.detections == []
        assert output.tracks == []
        assert output.context == []
        assert output.risk == []
        processed += 1
        health.record_frame_processed(output.processing.latencyMs)

    reader.close()
    assert processed > 0
    assert sampled == processed
    report = health.get_report()
    assert report["framesReceived"] == meta["totalFrames"]
    assert report["framesProcessed"] == processed
