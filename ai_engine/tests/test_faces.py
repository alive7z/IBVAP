import numpy as np
import pytest

from faces.association import associate_face_to_person, box_contains_point, face_center
from faces.cropper import crop_face, validate_face_crop
from faces.manager import FaceManager
from faces.models import FaceBBox, FaceDetection, FaceObservation
from faces.state import FaceState


class StubFaceDetector:
    """Stub YuNet detector with a scripted set of face detections."""

    def __init__(self, detections=None, loaded=True, status="READY"):
        self._detections = detections if detections is not None else []
        self._loaded = loaded
        self._status = status

    def load(self):
        return self._loaded

    def detect(self, frame, person_bbox, latency_ms=None):
        return self._detections

    @property
    def is_loaded(self):
        return self._loaded

    @property
    def status(self):
        return self._status


PERSON_BBOX = {"x1": 100.0, "y1": 80.0, "x2": 200.0, "y2": 300.0}


def _face(cx=150, cy=150, w=30, h=30, conf=0.9):
    return FaceDetection(
        bbox=FaceBBox(x1=cx - w / 2, y1=cy - h / 2, x2=cx + w / 2, y2=cy + h / 2),
        confidence=conf,
    )


def _sample_frame():
    return np.zeros((360, 320, 3), dtype=np.uint8)


# ------------------------------------------------ association


def test_face_center():
    face = FaceBBox(x1=100, y1=100, x2=140, y2=160)
    assert face_center(face) == (120.0, 130.0)


def test_box_contains_point():
    assert box_contains_point(PERSON_BBOX, 150, 150) is True
    assert box_contains_point(PERSON_BBOX, 50, 50) is False


def test_associate_face_inside_person():
    # Face centered inside the person bbox associates to that track.
    tid = associate_face_to_person(_face(150, 190).bbox, {7: PERSON_BBOX})
    assert tid == 7


def test_associate_face_outside_person_no_fabrication():
    assert associate_face_to_person(_face(20, 20).bbox, {7: PERSON_BBOX}) is None
    assert associate_face_to_person(None, {7: PERSON_BBOX}) is None


def test_associate_face_multiple_tracks_picks_largest_containing():
    big = {"x1": 0, "y1": 0, "x2": 320, "y2": 360}
    small = {"x1": 120, "y1": 150, "x2": 180, "y2": 210}
    tid = associate_face_to_person(_face(150, 180).bbox, {1: big, 2: small})
    assert tid == 1


# ------------------------------------------------ cropper


def test_crop_face_invalid_returns_none():
    frame = _sample_frame()
    assert crop_face(frame, FaceBBox(x1=5, y1=5, x2=2, y2=2)) is None
    assert crop_face(frame, FaceBBox(x1=-1, y1=0, x2=10, y2=10)) is None
    assert crop_face(None, FaceBBox(x1=0, y1=0, x2=10, y2=10)) is None


def test_crop_face_valid():
    frame = _sample_frame()
    crop = crop_face(frame, FaceBBox(x1=100, y1=100, x2=140, y2=160))
    assert crop is not None
    assert crop.shape[0] == 60


def test_validate_face_crop_min_size():
    assert validate_face_crop(FaceBBox(x1=0, y1=0, x2=5, y2=5), 320, 360, min_size=10) is False
    assert validate_face_crop(FaceBBox(x1=0, y1=0, x2=20, y2=20), 320, 360, min_size=10) is True


# ------------------------------------------------ state (frame confirmation)


def test_face_confirms_after_confirm_frames():
    st = FaceState(confirm_frames=2)
    assert st.update(7, 0.9, _face().bbox) is None
    confirmed = st.update(7, 0.91, _face().bbox)
    assert confirmed is not None
    assert confirmed.confidence == 0.91


def test_face_keeps_best_confidence():
    st = FaceState(confirm_frames=3)
    st.update(7, 0.6, _face(conf=0.6).bbox)
    st.update(7, 0.95, _face(conf=0.95).bbox)
    confirmed = st.update(7, 0.7, _face(conf=0.7).bbox)
    assert confirmed is not None
    assert confirmed.confidence == 0.95


def test_face_emitted_once_per_track():
    st = FaceState(confirm_frames=2)
    st.update(7, 0.9, _face().bbox)
    first = st.update(7, 0.9, _face().bbox)
    assert first is not None
    st.mark_emitted(7)
    assert st.is_emitted(7) is True
    later = st.update(7, 0.9, _face().bbox)
    assert later is None


def test_face_cleanup_expired():
    st = FaceState(confirm_frames=1, timeout_seconds=5.0)
    st.update(7, 0.9, _face().bbox, now=100.0)
    assert len(st) == 1
    removed = st.cleanup_expired(active_track_ids={7}, now=200.0)
    assert removed == 1
    assert len(st) == 0


# ------------------------------------------------ manager


def _make_manager(detections=None, confirm_frames=2, enabled=True):
    det = StubFaceDetector(
        detections=[detections] if detections else [],
        loaded=True,
    )
    mgr = FaceManager(enabled=enabled, detector=det, confirm_frames=confirm_frames, every_n_frames=1)
    mgr.initialize()
    return mgr


def test_face_manager_confirms_after_frames():
    mgr = _make_manager(detections=_face(150, 190), confirm_frames=2)
    persons = {7: PERSON_BBOX}
    first = mgr.process_frame(_sample_frame(), persons, "2026-01-01T00:00:00Z", 1000)
    assert first == []
    second = mgr.process_frame(_sample_frame(), persons, "2026-01-01T00:00:01Z", 2000)
    assert len(second) == 1
    obs = second[0]
    assert isinstance(obs, FaceObservation)
    assert obs.person_track_id == 7


def test_face_manager_duplicate_suppressed():
    mgr = _make_manager(detections=_face(150, 190), confirm_frames=1)
    persons = {7: PERSON_BBOX}
    mgr.process_frame(_sample_frame(), persons, "2026-01-01T00:00:00Z", 1000)
    more = mgr.process_frame(_sample_frame(), persons, "2026-01-01T00:00:01Z", 2000)
    assert more == []
    assert mgr.get_stats()["duplicateSuppressed"] >= 1


def test_face_manager_no_detections_no_observation():
    mgr = _make_manager(detections=None, confirm_frames=2)
    obs = mgr.process_frame(_sample_frame(), {7: PERSON_BBOX}, "2026-01-01T00:00:00Z", 1000)
    assert obs == []
    assert mgr.get_stats()["personsEvaluated"] == 0


def test_face_manager_disabled():
    mgr = _make_manager(detections=_face(150, 190), confirm_frames=2, enabled=False)
    mgr.initialize()
    obs = mgr.process_frame(_sample_frame(), {7: PERSON_BBOX}, "2026-01-01T00:00:00Z", 1000)
    assert obs == []


def test_face_manager_stats_recognition_false():
    mgr = _make_manager()
    stats = mgr.get_stats()
    assert stats["status"] == "READY"
    assert stats["recognition"] is False
