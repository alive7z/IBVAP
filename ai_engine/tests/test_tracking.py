import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from trackers.track_manager import TrackManager, TrackState


def make_person_track(tid, cx=150, cy=190):
    return {
        "trackId": tid,
        "className": "person",
        "objectType": "PERSON",
        "confidence": 0.9,
        "bbox": {"x1": 100, "y1": 80, "x2": 200, "y2": 300},
        "center": {"x": cx, "y": cy},
    }


def test_track_id_present():
    tm = TrackManager(confirm_frames=2)
    tm.update([make_person_track(7)])
    # first sighting -> tentative, not yet confirmed
    assert tm.get_track(7) is not None
    assert tm.get_track(7).state == TrackState.TENTATIVE


def test_track_confirms_after_n_frames():
    tm = TrackManager(confirm_frames=2)
    tm.update([make_person_track(7)])
    ready = tm.update([make_person_track(7)])
    assert len(ready) == 1
    assert ready[0].track_id == 7
    assert ready[0].state == TrackState.CONFIRMED


def test_one_frame_track_not_emitted():
    tm = TrackManager(confirm_frames=2)
    after_first = tm.update([make_person_track(7)])
    assert after_first == []


def test_confirmed_track_emitted_only_once():
    tm = TrackManager(confirm_frames=2)
    tm.update([make_person_track(7)])
    first = tm.update([make_person_track(7)])
    second = tm.update([make_person_track(7)])
    third = tm.update([make_person_track(7)])
    assert len(first) == 1
    assert second == []
    assert third == []


def test_track_center_computed():
    tm = TrackManager(confirm_frames=1)
    tm.update([make_person_track(7, cx=150, cy=190)])
    entry = tm.get_track(7)
    assert entry.history[-1]["x"] == 150
    assert entry.history[-1]["y"] == 190


def test_track_history_bounded():
    from trackers.track_manager import TrackEntry
    entry = TrackEntry(7, "person", "PERSON")
    for i in range(100):
        entry.observe(float(i), float(i), 0.9)
    # uses deque(maxlen=30) so history stays bounded
    assert len(entry.history) <= 30


def test_multiple_tracks_separate():
    tm = TrackManager(confirm_frames=2)
    tm.update([make_person_track(1), make_person_track(2)])
    ready = tm.update([make_person_track(1), make_person_track(2)])
    ids = {e.track_id for e in ready}
    assert ids == {1, 2}


def test_lost_track_transitions():
    tm = TrackManager(confirm_frames=1)
    tm.update([make_person_track(7)])
    tm.update([])  # no longer present
    assert tm.get_track(7).state == TrackState.LOST


def test_same_bytetrack_id_recovers_without_duplicate_person_emission():
    tm = TrackManager(confirm_frames=1)
    first = tm.update([make_person_track(7)])
    assert len(first) == 1

    tm.update([])
    assert tm.get_track(7).state == TrackState.LOST

    recovered = tm.update([make_person_track(7)])
    assert tm.get_track(7).state == TrackState.CONFIRMED
    assert tm.get_track(7).emitted is True
    assert recovered == []
    assert tm.get_stats()["totalEmitted"] == 1


def test_new_stream_session_reset_allows_reused_numeric_track_id():
    tm = TrackManager(confirm_frames=1)
    assert len(tm.update([make_person_track(7)])) == 1

    tm.reset()

    # A new decoded stream session has a new identity namespace, even when
    # ByteTrack starts numbering from 7 again.
    again = tm.update([make_person_track(7)])
    assert len(again) == 1
    assert again[0].track_id == 7
    assert again[0].seen_count == 1


def test_stats():
    tm = TrackManager(confirm_frames=2)
    tm.update([make_person_track(7)])
    tm.update([make_person_track(7)])
    stats = tm.get_stats()
    assert stats["totalCreated"] == 1
    assert stats["totalEmitted"] == 1
