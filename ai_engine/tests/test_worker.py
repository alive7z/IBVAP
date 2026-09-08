import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np
import pytest
from context.engine import ContextEngine
from risk.engine import RiskEngine
from risk.rules import SeverityThresholds
from workers.inference_worker import InferenceWorker
from schemas.frame import Frame
from utils.time import ms_now
from tests.stubs import PERSON_TRACK, StubDetector


TEST_RULES = [
    {"ruleCode": "RESTRICTED_ZONE_ENTRY", "weight": 3.0, "minimumDurationMs": 1000,
     "confidenceThreshold": 0.60, "cooldownSeconds": 30, "enabled": True},
    {"ruleCode": "VIRTUAL_FENCE_CROSSING", "weight": 3.0, "minimumDurationMs": 500,
     "confidenceThreshold": 0.65, "cooldownSeconds": 30, "enabled": True},
    {"ruleCode": "FENCE_PROXIMITY", "weight": 1.5, "minimumDurationMs": 2000,
     "confidenceThreshold": 0.50, "cooldownSeconds": 20, "enabled": True},
    {"ruleCode": "NIGHT_MOVEMENT", "weight": 2.0, "minimumDurationMs": 3000,
     "confidenceThreshold": 0.55, "cooldownSeconds": 45, "enabled": True},
    {"ruleCode": "TOWARD_BOUNDARY", "weight": 2.5, "minimumDurationMs": 3000,
     "confidenceThreshold": 0.60, "cooldownSeconds": 30, "enabled": True},
    {"ruleCode": "UNUSUAL_SPEED", "weight": 1.5, "minimumDurationMs": 0,
     "confidenceThreshold": 0.55, "cooldownSeconds": 30, "enabled": True},
]

TEST_THRESHOLDS = SeverityThresholds(info=0, low=20, medium=40, high=60, critical=80)


def _make_frame(index: int = 1) -> Frame:
    return Frame(
        frame_id=f"TEST_{index:04d}",
        source_id="TEST",
        frame_index=index,
        captured_at=0.0,
        source_timestamp_ms=ms_now(),
        width=320,
        height=240,
        image=np.zeros((240, 320, 3), dtype=np.uint8),
    )


class _DetectorStub:
    def __init__(self):
        self.tracking_resets = 0

    def load(self):
        return True

    def detect(self, image):
        return []

    def detect_with_tracking(self, image):
        return []

    def reset_tracking(self):
        self.tracking_resets += 1


class _TrackEntry:
    def __init__(self, track_id: int, object_type: str = "PERSON", confidence: float = 0.9):
        self.track_id = track_id
        self.class_name = "person"
        self.object_type = object_type
        self.vehicle_type = None
        self.state = "CONFIRMED"
        self.seen_count = 5
        self.history = [{"x": 0.5, "y": 0.5, "confidence": confidence}]


class _TrackManagerStub:
    def __init__(self, entries):
        self._entries = entries

    def update(self, tracks_raw):
        return []

    def get_confirmed_entries(self):
        return list(self._entries)

    def get_track(self, track_id):
        return None

    def reset(self):
        self._entries = []


class _ContextEngineStub:
    """Emits each transition exactly once (like the real context engine)."""

    def __init__(self):
        self._emitted = set()

    def update(self, confirmed_with_ref, now=None, occurred_at=None, source_timestamp_ms=0):
        out = []
        for entry in confirmed_with_ref:
            key = (entry["trackId"], "RESTRICTED_ZONE_ENTRY", "ZONE-A")
            if key in self._emitted:
                continue
            self._emitted.add(key)
            out.append({
                "type": "RESTRICTED_ZONE_ENTRY",
                "trackId": entry["trackId"],
                "objectType": entry["objectType"],
                "occurredAt": "2026-09-06T00:00:00Z",
                "sourceTimestampMs": source_timestamp_ms,
                "metadata": {"zoneCode": "ZONE-A"},
                "referencePoint": {"x": 0.5, "y": 0.5},
            })
        return out

    def reset(self):
        self._emitted.clear()


def _make_worker(track_ids=(1,)):
    context_stub = _ContextEngineStub()
    risk_engine = RiskEngine()
    risk_engine.set_config(TEST_RULES, TEST_THRESHOLDS.__dict__, "TST-01")
    worker = InferenceWorker(
        source_id="TEST",
        camera_code="TST-01",
        detector=_DetectorStub(),
        context_engine=context_stub,
        risk_engine=risk_engine,
    )
    worker._model_loaded = True
    worker._track_manager = _TrackManagerStub([
        _TrackEntry(tid) for tid in track_ids
    ])
    return worker


def test_worker_produces_output():
    worker = InferenceWorker(source_id="TEST", camera_code="TST-01")
    output = worker.process_frame(_make_frame())
    assert output.schemaVersion == 1
    assert output.source.sourceType == "TEST"
    assert output.source.cameraCode == "TST-01"


def test_detections_empty():
    worker = InferenceWorker()
    output = worker.process_frame(_make_frame())
    assert output.detections == []


def test_tracks_empty():
    worker = InferenceWorker()
    output = worker.process_frame(_make_frame())
    assert output.tracks == []


def test_context_empty():
    worker = InferenceWorker()
    output = worker.process_frame(_make_frame())
    assert output.context == []


def test_risk_empty():
    worker = InferenceWorker()
    output = worker.process_frame(_make_frame())
    assert output.risk == []


def test_processing_metadata():
    worker = InferenceWorker()
    output = worker.process_frame(_make_frame())
    assert output.processing.status == "processed"
    assert output.processing.latencyMs >= 0


def test_worker_stats():
    worker = InferenceWorker()
    for i in range(5):
        worker.process_frame(_make_frame(i))
    stats = worker.get_stats()
    assert stats["framesProcessed"] == 5
    assert stats["averageLatencyMs"] >= 0


def test_frame_not_json_serialized():
    worker = InferenceWorker()
    output = worker.process_frame(_make_frame())
    d = output.model_dump()
    assert isinstance(d["detections"], list)
    assert isinstance(d["tracks"], list)


def test_output_is_future_compatible():
    worker = InferenceWorker()
    output = worker.process_frame(_make_frame())
    d = output.model_dump()
    required_keys = {"schemaVersion", "source", "frame", "detections", "tracks", "context", "risk", "processing"}
    assert required_keys.issubset(d.keys())


def test_current_confirmed_tracks_remain_available_after_one_shot_emission():
    """Regression: secondary detectors need a confirmed track on later frames."""
    worker = InferenceWorker(
        source_id="TEST",
        camera_code="TST-01",
        detector=StubDetector(detections=[], tracks=[PERSON_TRACK]),
    )
    assert worker.initialize()
    worker.process_frame(_make_frame(1))
    confirmed_once = worker.process_frame(_make_frame(2))
    assert len(confirmed_once.tracks) == 1
    assert worker.get_current_confirmed_tracks()[0]["trackId"] == 7

    later = worker.process_frame(_make_frame(3))
    assert later.tracks == []
    current = worker.get_current_confirmed_tracks()
    assert len(current) == 1
    assert current[0]["bbox"] == PERSON_TRACK["bbox"]


def test_session_reset_clears_detector_tracker_and_all_track_scoped_state():
    detector = _DetectorStub()
    worker = InferenceWorker(
        source_id="TEST",
        camera_code="TST-01",
        detector=detector,
        context_engine=ContextEngine(zone_config={"zones": []}, enabled=True),
        risk_engine=RiskEngine(),
    )
    worker._recent_evidence[(7, "VIRTUAL_FENCE_CROSSING", "F-1")] = {"trackId": 7}
    worker._recent_evidence_seen[(7, "VIRTUAL_FENCE_CROSSING", "F-1")] = 1.0

    worker.reset_session()

    assert detector.tracking_resets == 1
    assert worker._recent_evidence == {}
    assert worker._recent_evidence_seen == {}


class TestSustainedRiskEvidence:
    """Regression: a once-emitted context transition must still drive risk.

    The context engine emits entering a restricted zone once per track, but the
    risk rule requires the evidence to keep being observed for
    minimum_duration_ms. The worker must re-feed recent risk-relevant evidence
    each frame while the track is confirmed, or the score stays 0 forever.
    """

    def test_single_emission_confirms_over_time(self):
        worker = _make_worker()
        # Frame 0: event emitted, but 0.2s < 1000ms → not yet confirmed.
        out1 = worker.process_frame(_make_frame(1), now=0.2)
        assert out1.risk == []

        # Frame 1: no fresh event; re-fed evidence confirms after 1000ms elapse.
        out2 = worker.process_frame(_make_frame(2), now=1.2)
        assert len(out2.risk) == 1
        assert out2.risk[0].trackId == 1
        assert out2.risk[0].score == pytest.approx(3.0 / 9.5 * 100, abs=0.1)
        assert out2.risk[0].severity == "LOW"

    def test_frozen_video_time_still_advances_with_override(self):
        # _make_frame leaves video_time == 0 (live source reporting no FPS).
        # The live pipeline passes wall-clock `now`, so temporal confirmation
        # must still elapse rather than remaining frozen at 0.
        worker = _make_worker()
        worker.process_frame(_make_frame(1), now=0.2)
        out = worker.process_frame(_make_frame(2), now=1.2)
        assert len(out.risk) == 1

    def test_evidence_expires_outside_window(self):
        worker = _make_worker()
        worker.process_frame(_make_frame(1), now=0.2)
        assert worker.process_frame(_make_frame(2), now=1.2).risk
        # Beyond RISK_EVIDENCE_WINDOW_SECONDS (30s) without re-observation the
        # evidence must lapse even though the track is still confirmed.
        out = worker.process_frame(_make_frame(3), now=31.5)
        assert out.risk == []

    def test_short_unconfirmed_gap_preserves_evidence_without_emitting_for_missing_track(self):
        worker = _make_worker()
        worker.process_frame(_make_frame(1), now=0.2)
        assert worker.process_frame(_make_frame(2), now=1.2).risk
        # A short gap preserves bounded evidence, but absent tracks cannot emit.
        worker._track_manager = _TrackManagerStub([])
        out = worker.process_frame(_make_frame(3), now=2.2)
        assert out.risk == []
        assert worker.risk_engine.get_track_state(1).current_score > 0

        worker._track_manager = _TrackManagerStub([_TrackEntry(1)])
        recovered = worker.process_frame(_make_frame(4), now=2.3)
        assert recovered.risk == []  # unchanged score is deduplicated
        assert worker.risk_engine.get_track_state(1).current_score > 0

    def test_sustained_evidence_scopes_to_its_track(self):
        worker = _make_worker(track_ids=(1, 2))
        worker.process_frame(_make_frame(1), now=0.2)
        # Only track 2 later remains confirmed; track 1 may retain bounded state
        # but must never emit or aggregate into track 2.
        worker._track_manager = _TrackManagerStub([_TrackEntry(2)])
        out = worker.process_frame(_make_frame(2), now=1.2)
        assert all(r.trackId == 2 for r in out.risk)
        assert all(r.trackId != 1 for r in out.risk)


class TestLoiteringProgressionIntegration:
    def test_context_duration_drives_risk_tiers_without_context_duplicates(self):
        context_engine = ContextEngine(
            zone_config={"zones": []}, enabled=True, loitering_seconds=10.0
        )
        risk_engine = RiskEngine()
        risk_engine.set_config([{
            "ruleCode": "LOITERING",
            "weight": 2.0,
            "minimumDurationMs": 15000,
            "confidenceThreshold": 0.6,
            "cooldownSeconds": 60,
            "enabled": True,
            "durationTiers": [
                {"minimumDurationSeconds": 10, "score": 15},
                {"minimumDurationSeconds": 20, "score": 25},
                {"minimumDurationSeconds": 30, "score": 40},
            ],
        }], TEST_THRESHOLDS.__dict__, "TST-01")
        worker = InferenceWorker(
            source_id="TEST",
            camera_code="TST-01",
            detector=_DetectorStub(),
            context_engine=context_engine,
            risk_engine=risk_engine,
        )
        worker._model_loaded = True
        worker._track_manager = _TrackManagerStub([_TrackEntry(130)])

        at_zero = worker.process_frame(_make_frame(1), now=0.0)
        at_ten = worker.process_frame(_make_frame(2), now=10.0)
        at_twenty = worker.process_frame(_make_frame(3), now=20.0)
        at_thirty = worker.process_frame(_make_frame(4), now=30.0)

        assert at_zero.risk == []
        assert [r.score for r in at_ten.risk] == [15]
        assert [r.score for r in at_twenty.risk] == [25]
        assert [r.score for r in at_thirty.risk] == [40]
        all_context = at_zero.context + at_ten.context + at_twenty.context + at_thirty.context
        assert sum(1 for event in all_context if event.type == "LOITERING") == 1


class TestLiveContextRiskIntegration:
    @staticmethod
    def _zones():
        return {
            "zones": [
                {
                    "zoneCode": "RESTRICTED-1",
                    "name": "Restricted",
                    "zoneType": "RESTRICTED",
                    "enabled": True,
                    "coordinates": [
                        {"x": 0.1, "y": 0.1}, {"x": 0.9, "y": 0.1},
                        {"x": 0.9, "y": 0.9}, {"x": 0.1, "y": 0.9},
                    ],
                },
                {
                    "zoneCode": "FENCE-1",
                    "name": "Fence",
                    "zoneType": "VIRTUAL_FENCE",
                    "enabled": True,
                    "coordinates": [
                        {"x": 0.5, "y": 0.1}, {"x": 0.5, "y": 0.9},
                    ],
                },
            ],
        }

    @staticmethod
    def _worker(rules):
        context_engine = ContextEngine(
            zone_config=TestLiveContextRiskIntegration._zones(),
            enabled=True,
            confirm_frames=1,
            loitering_seconds=999.0,
        )
        risk_engine = RiskEngine()
        risk_engine.set_config(rules, TEST_THRESHOLDS.__dict__, "TST-01")
        worker = InferenceWorker(
            source_id="TEST",
            camera_code="TST-01",
            detector=_DetectorStub(),
            context_engine=context_engine,
            risk_engine=risk_engine,
        )
        worker._model_loaded = True
        worker._track_manager = _TrackManagerStub([_TrackEntry(1)])
        worker._track_manager._entries[0].history[-1].update({"x": 640.0, "y": 360.0})
        return worker

    def test_restricted_and_proximity_stay_active_and_aggregate(self):
        worker = self._worker([
            {"ruleCode": "RESTRICTED_ZONE_ENTRY", "weight": 5.0,
             "minimumDurationMs": 1000, "confidenceThreshold": 0.6,
             "cooldownSeconds": 0, "enabled": True},
            {"ruleCode": "FENCE_PROXIMITY", "weight": 3.0,
             "minimumDurationMs": 2000, "confidenceThreshold": 0.5,
             "cooldownSeconds": 0, "enabled": True},
        ])

        first = worker.process_frame(_make_frame(1), now=1.0)
        restricted = worker.process_frame(_make_frame(2), now=2.1)
        combined = worker.process_frame(_make_frame(3), now=3.2)

        assert first.risk == []
        assert restricted.risk[0].score == pytest.approx(62.5)
        assert combined.risk[0].score == 100
        assert {r["code"] for r in combined.risk[0].reasons} == {
            "RESTRICTED_ZONE_ENTRY", "FENCE_PROXIMITY"
        }
        all_context = first.context + restricted.context + combined.context
        assert sum(e.type == "RESTRICTED_ZONE_ENTRY" for e in all_context) == 1
        assert sum(e.type == "FENCE_PROXIMITY" for e in all_context) == 1

    def test_crossing_is_retained_long_enough_to_confirm_once(self):
        worker = self._worker([
            {"ruleCode": "VIRTUAL_FENCE_CROSSING", "weight": 6.0,
             "minimumDurationMs": 500, "confidenceThreshold": 0.65,
             "cooldownSeconds": 0, "enabled": True},
        ])

        worker._track_manager._entries[0].history[-1].update({"x": 512.0, "y": 360.0})
        before = worker.process_frame(_make_frame(1), now=1.0)
        worker._track_manager._entries[0].history[-1].update({"x": 768.0, "y": 360.0})
        crossing = worker.process_frame(_make_frame(2), now=1.2)
        confirmed = worker.process_frame(_make_frame(3), now=1.8)

        assert crossing.risk == []
        assert [e.type for e in crossing.context].count("VIRTUAL_FENCE_CROSSING") == 1
        assert confirmed.risk[0].score == 100
        assert confirmed.risk[0].reasons[0]["code"] == "VIRTUAL_FENCE_CROSSING"
        assert all(e.type != "VIRTUAL_FENCE_CROSSING" for e in before.context)
        assert all(e.type != "VIRTUAL_FENCE_CROSSING" for e in confirmed.context)
