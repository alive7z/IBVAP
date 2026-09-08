import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np
from tests.stubs import CAR_TRACK, PERSON_DET, PERSON_TRACK, StubDetector
from workers.inference_worker import InferenceWorker
from schemas.frame import Frame
from utils.time import ms_now


def _make_frame(index: int = 1) -> Frame:
    return Frame(
        frame_id=f"TEST_{index:04d}",
        source_id="TEST",
        frame_index=index,
        captured_at=0.0,
        source_timestamp_ms=ms_now(),
        width=640,
        height=360,
        image=np.zeros((360, 640, 3), dtype=np.uint8),
    )


def test_detections_populated_from_stub():
    stub = StubDetector(detections=[PERSON_DET], tracks=[PERSON_TRACK])
    worker = InferenceWorker(source_id="TEST", camera_code="TST", detector=stub)
    worker.initialize()
    output = worker.process_frame(_make_frame())
    assert len(output.detections) == 1
    assert output.detections[0].className == "person"
    assert output.detections[0].objectType == "PERSON"


def test_vehicle_detection_subtype():
    car_det = dict(PERSON_DET)
    car_det["className"] = "car"
    car_det["objectType"] = "VEHICLE"
    car_det["vehicleType"] = "CAR"
    stub = StubDetector(detections=[car_det], tracks=[])
    worker = InferenceWorker(source_id="TEST", camera_code="TST", detector=stub)
    worker.initialize()
    output = worker.process_frame(_make_frame())
    assert output.detections[0].vehicleType == "CAR"


def test_context_stays_empty():
    stub = StubDetector(detections=[PERSON_DET], tracks=[])
    worker = InferenceWorker(source_id="TEST", camera_code="TST", detector=stub)
    worker.initialize()
    output = worker.process_frame(_make_frame())
    assert output.context == []


def test_risk_stays_empty():
    stub = StubDetector(detections=[PERSON_DET], tracks=[])
    worker = InferenceWorker(source_id="TEST", camera_code="TST", detector=stub)
    worker.initialize()
    output = worker.process_frame(_make_frame())
    assert output.risk == []


def test_tracks_populated_after_confirmation():
    stub = StubDetector(detections=[PERSON_DET], tracks=[PERSON_TRACK])
    worker = InferenceWorker(source_id="TEST", camera_code="TST", detector=stub)
    worker.initialize()
    worker.process_frame(_make_frame(1))  # tentative
    output = worker.process_frame(_make_frame(2))  # confirmed
    assert len(output.tracks) == 1
    assert output.tracks[0].trackId == 7
    assert output.tracks[0].state == "CONFIRMED"


def test_raw_frame_not_json_serialized():
    stub = StubDetector(detections=[PERSON_DET], tracks=[])
    worker = InferenceWorker(source_id="TEST", camera_code="TST", detector=stub)
    worker.initialize()
    output = worker.process_frame(_make_frame())
    d = output.model_dump()
    assert isinstance(d["detections"], list)
    assert "image" not in d


def test_model_error_handling_no_crash():
    stub = StubDetector(loaded=False)
    worker = InferenceWorker(source_id="TEST", camera_code="TST", detector=stub)
    worker.initialize()
    output = worker.process_frame(_make_frame())
    # Inference failure should not crash; returns structured output.
    assert output.detections == []
    assert output.tracks == []
