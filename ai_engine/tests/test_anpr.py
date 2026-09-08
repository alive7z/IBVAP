import numpy as np
import pytest

from anpr.association import associate_plate_to_track, overlap_fraction, plate_center
from anpr.cropper import crop_plate, validate_crop
from anpr.manager import AnprManager
from anpr.models import PlateBBox, PlateCandidate, PlateDetection, PlateObservation
from anpr.normalize import is_equivalent, normalize_plate_text
from anpr.state import AnprState
from anpr.validator import validate_plate, VALID_FORMAT, PARTIAL, LOW_CONFIDENCE


class StubAnprDetector:
    """Stub detector with a scripted set of plate detections."""

    def __init__(self, detections_per_call=None, loaded=True, mode="HEURISTIC"):
        self._detections = detections_per_call if detections_per_call is not None else []
        self._loaded = loaded
        self._mode = mode

    def load(self):
        return self._loaded

    def detect(self, frame, vehicle_bbox):
        return self._detections

    @property
    def is_loaded(self):
        return self._loaded

    @property
    def mode(self):
        return self._mode


class StubPlateOCR:
    """Stub OCR returning a scripted read (raw + confidence).

    raw_text=None simulates an OCR failure.
    """

    def __init__(self, raw_text, confidence=0.95, loaded=True):
        self._raw_text = raw_text
        self._confidence = confidence
        self._loaded = loaded
        self._status = "READY" if loaded else "ERROR"

    def load(self):
        return self._loaded

    def read(self, crop, latency_ms=None):
        from anpr.models import OcrRead

        if crop is None or getattr(crop, "size", 0) == 0:
            return OcrRead(raw_text=None, normalized_text=None, ocr_confidence=0.0)
        if self._raw_text is None:
            return OcrRead(raw_text=None, normalized_text=None, ocr_confidence=0.0)
        return OcrRead(
            raw_text=self._raw_text,
            normalized_text=normalize_plate_text(self._raw_text),
            ocr_confidence=self._confidence,
        )

    @property
    def is_loaded(self):
        return self._loaded

    @property
    def status(self):
        return self._status


PLATE_BBOX = {"x1": 60.0, "y1": 80.0, "x2": 170.0, "y2": 115.0}


def _candidate(raw, conf=0.95):
    return PlateCandidate(
        raw_text=raw,
        normalized_text=normalize_plate_text(raw),
        ocr_confidence=conf,
        plate_detection_confidence=0.85,
        bbox=PlateBBox(**PLATE_BBOX),
    )


def _sample_frame():
    return np.zeros((200, 320, 3), dtype=np.uint8)


# ------------------------------------------------ normalize


def test_normalize_uppercases_and_strips():
    assert normalize_plate_text("  ka01  ab 1234 ") == "KA01AB1234"


def test_normalize_removes_unsupported_punctuation_keeps_hyphen():
    assert normalize_plate_text("uk04/ab.1234") == "UK04AB1234"


def test_normalize_empty_returns_none():
    assert normalize_plate_text("") is None
    assert normalize_plate_text(None) is None


def test_equivalent_exact_match_only():
    assert is_equivalent("KA01AB1234", "KA01AB1234") is True
    assert is_equivalent("KA01AB1234", "KA01AB4321") is False
    assert is_equivalent(None, "KA01AB1234") is False


# ------------------------------------------------ validator


def test_validate_plate_valid():
    assert validate_plate("KA01AB1234", 0.95) == VALID_FORMAT


def test_validate_plate_partial_short():
    assert validate_plate("AB", 0.95) == PARTIAL


def test_validate_plate_low_confidence():
    assert validate_plate("KA01AB1234", 0.2) == LOW_CONFIDENCE


def test_validate_plate_unreadable():
    assert validate_plate(None, 0.95) == "UNREADABLE"


# ------------------------------------------------ association


def test_associate_plate_to_track_containment():
    tid = associate_plate_to_track(
        PlateBBox(x1=80, y1=85, x2=120, y2=100), {5: PLATE_BBOX}
    )
    assert tid == 5


def test_associate_plate_no_fabrication():
    assert associate_plate_to_track(None, {5: PLATE_BBOX}) is None
    assert associate_plate_to_track(PlateBBox(x1=0, y1=0, x2=5, y2=5), {5: PLATE_BBOX}) is None


def test_overlap_fraction():
    plate = PlateBBox(x1=60, y1=80, x2=170, y2=115)
    assert overlap_fraction(plate, PLATE_BBOX) == 1.0
    assert overlap_fraction(plate, {"x1": 0, "y1": 0, "x2": 5, "y2": 5}) == 0.0


# ------------------------------------------------ cropper


def test_crop_plate_invalid_returns_none():
    frame = _sample_frame()
    assert crop_plate(frame, PlateBBox(x1=5, y1=5, x2=2, y2=2)) is None
    assert crop_plate(frame, PlateBBox(x1=-1, y1=0, x2=10, y2=10)) is None
    assert crop_plate(None, PlateBBox(x1=0, y1=0, x2=10, y2=10)) is None


def test_crop_plate_valid():
    frame = _sample_frame()
    crop = crop_plate(frame, PlateBBox(x1=60, y1=80, x2=170, y2=115))
    assert crop is not None
    assert crop.shape[0] == 35


def test_validate_crop_min_size():
    assert validate_crop(PlateBBox(x1=0, y1=0, x2=8, y2=8), 320, 200, min_size=10) is False
    assert validate_crop(PlateBBox(x1=50, y1=50, x2=80, y2=80), 320, 200, min_size=10) is True


# ------------------------------------------------ state (consensus + dedup)


def test_consensus_confirms_after_confirm_reads():
    st = AnprState(confirm_reads=2)
    assert st.update(1, _candidate("KA01AB1234")) is None
    confirmed = st.update(1, _candidate("KA01AB1234"))
    assert confirmed is not None
    assert confirmed.plate_text == "KA01AB1234"


def test_consensus_picks_highest_confidence():
    st = AnprState(confirm_reads=2)
    st.update(1, _candidate("KA01AB1234", conf=0.7))
    confirmed = st.update(1, _candidate("KA01AB1234", conf=0.95))
    assert confirmed is not None
    assert confirmed.ocr_confidence == 0.95


def test_no_confirm_with_fewer_reads():
    st = AnprState(confirm_reads=3)
    assert st.update(1, _candidate("KA01AB1234")) is None
    assert st.update(1, _candidate("KA01AB1234")) is None


def test_emitted_once_per_track():
    st = AnprState(confirm_reads=2)
    st.update(1, _candidate("KA01AB1234"))
    first = st.update(1, _candidate("KA01AB1234"))
    assert first is not None
    second = st.update(1, _candidate("KA01AB1234"))
    assert second is None
    st.mark_emitted(1)
    assert st.is_emitted(1) is True


def test_cleanup_expired_removes_state():
    st = AnprState(confirm_reads=1, timeout_seconds=5.0)
    st.update(1, _candidate("KA01AB1234"), now=100.0)
    assert len(st) == 1
    removed = st.cleanup_expired(active_track_ids={1}, now=200.0)
    assert removed == 1
    assert len(st) == 0


# ------------------------------------------------ manager


def _make_manager(ocr_raw="KA01AB1234", conf=0.95, confirm_reads=2, enabled=True):
    det = StubAnprDetector(
        detections_per_call=[PlateDetection(bbox=PlateBBox(**PLATE_BBOX), confidence=0.8)],
        loaded=True,
    )
    ocr = StubPlateOCR(raw_text=ocr_raw, confidence=conf, loaded=True)
    mgr = AnprManager(
        enabled=enabled, detector=det, ocr=ocr, confirm_reads=confirm_reads,
        min_ocr_confidence=0.6, every_n_frames=1,
    )
    mgr.initialize()
    return mgr


def test_manager_confirms_after_confirm_reads():
    mgr = _make_manager()
    vehicles = {12: PLATE_BBOX}
    first = mgr.process_frame(_sample_frame(), vehicles, "2026-01-01T00:00:00Z", 1000)
    assert first == []
    second = mgr.process_frame(
        _sample_frame(), vehicles, "2026-01-01T00:00:01Z", 2000,
        vehicle_types={12: "CAR"},
    )
    assert len(second) == 1
    obs = second[0]
    assert isinstance(obs, PlateObservation)
    assert obs.vehicle_track_id == 12
    assert obs.plate_text == "KA01AB1234"
    assert obs.camera_code == ""
    assert obs.vehicle_type == "CAR"
    assert obs.to_payload()["vehicleType"] == "CAR"


def test_manager_duplicate_suppressed_after_confirm():
    mgr = _make_manager()
    vehicles = {12: PLATE_BBOX}
    mgr.process_frame(_sample_frame(), vehicles, "2026-01-01T00:00:00Z", 1000)
    mgr.process_frame(_sample_frame(), vehicles, "2026-01-01T00:00:01Z", 2000)
    more = mgr.process_frame(_sample_frame(), vehicles, "2026-01-01T00:00:02Z", 3000)
    assert more == []
    assert mgr.get_stats()["duplicateSuppressed"] >= 1


def test_manager_empty_when_disabled():
    det = StubAnprDetector(detections_per_call=[], loaded=False)
    ocr = StubPlateOCR(raw_text="KA01AB1234", loaded=False)
    mgr = AnprManager(enabled=False, detector=det, ocr=ocr, confirm_reads=2, min_ocr_confidence=0.6, every_n_frames=1)
    mgr.initialize()
    obs = mgr.process_frame(_sample_frame(), {12: PLATE_BBOX}, "2026-01-01T00:00:00Z", 1000)
    assert obs == []
    assert mgr.get_stats()["status"] == "DISABLED"


def test_manager_ocr_failure_no_observation():
    det = StubAnprDetector(
        detections_per_call=[PlateDetection(bbox=PlateBBox(**PLATE_BBOX), confidence=0.8)],
        loaded=True,
    )
    ocr = StubPlateOCR(raw_text=None, loaded=True)
    mgr = AnprManager(enabled=True, detector=det, ocr=ocr, confirm_reads=2, min_ocr_confidence=0.6, every_n_frames=1)
    mgr.initialize()
    obs = mgr.process_frame(_sample_frame(), {12: PLATE_BBOX}, "2026-01-01T00:00:00Z", 1000)
    assert obs == []
    assert mgr.get_stats()["ocrFailures"] >= 1


def test_manager_different_vehicle_no_merge():
    mgr = _make_manager()
    mgr.process_frame(_sample_frame(), {1: PLATE_BBOX}, "2026-01-01T00:00:00Z", 1000)
    mgr.process_frame(_sample_frame(), {1: PLATE_BBOX}, "2026-01-01T00:00:01Z", 2000)
    # A fresh track 2 needs its own two confirm reads.
    frame1 = mgr.process_frame(_sample_frame(), {2: PLATE_BBOX}, "2026-01-01T00:00:02Z", 3000)
    assert frame1 == []
    obs1 = mgr.process_frame(_sample_frame(), {2: PLATE_BBOX}, "2026-01-01T00:00:03Z", 4000)
    assert len(obs1) == 1
    assert obs1[0].vehicle_track_id == 2


def test_manager_stats_status_degraded_without_dedicated_model():
    mgr = _make_manager()
    stats = mgr.get_stats()
    assert stats["status"] == "DEGRADED"
    assert "detectorMode" in stats
    assert "ocrStatus" in stats
