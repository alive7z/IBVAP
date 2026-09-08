import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from streaming.reconnect import (
    ReconnectController,
    ReconnectPolicy,
    new_stream_session_id,
    should_rebuild_after_no_frame,
)


def test_no_frame_rebuild_requires_failure_count_and_elapsed_tolerance():
    # Tight OpenCV false-read bursts must retain the current stream session.
    assert should_rebuild_after_no_frame(5, 5, 0.4, 3.0) is False
    assert should_rebuild_after_no_frame(50, 5, 2.9, 3.0) is False

    # A genuinely sustained outage rebuilds only after both gates are met.
    assert should_rebuild_after_no_frame(5, 5, 3.0, 3.0) is True
    assert should_rebuild_after_no_frame(4, 5, 10.0, 3.0) is False


def test_backoff_grows_exponentially():
    p = ReconnectPolicy(base_seconds=1.0, max_seconds=30.0, factor=2.0)
    assert p.next_delay() == 1.0
    assert p.next_delay() == 2.0
    assert p.next_delay() == 4.0
    assert p.next_delay() == 8.0
    assert p.attempts == 4


def test_backoff_bounded_by_max():
    p = ReconnectPolicy(base_seconds=1.0, max_seconds=30.0, factor=2.0)
    for _ in range(10):
        p.next_delay()
    assert p.current_delay() == 30.0
    assert p.current_delay() <= 30.0


def test_record_success_resets_attempts():
    p = ReconnectPolicy(base_seconds=1.0, max_seconds=30.0)
    for _ in range(5):
        p.next_delay()
    assert p.attempts == 5
    p.record_success()
    assert p.attempts == 0
    assert p.current_delay() == 0.0


def test_new_session_id_unique():
    a = new_stream_session_id()
    b = new_stream_session_id()
    assert a != b
    assert isinstance(a, str) and len(a) == 12


def test_controller_begin_session_marks_success():
    c = ReconnectController(max_delay_seconds=30.0)
    sid = c.begin_session()
    assert sid == c.session_id
    assert c.policy.attempts == 0


def test_controller_session_changed_after_reconnect():
    c = ReconnectController(max_delay_seconds=30.0)
    first = c.begin_session()
    assert c.session_changed() is False
    # simulate a failure + reconnect -> new session
    c.on_failure()
    second = c.begin_session()
    assert second != first
    assert c.session_changed() is True
    assert c.last_session_id == first
    assert c.session_id == second


def test_controller_after_reconnect_success_no_further_change():
    c = ReconnectController(max_delay_seconds=30.0)
    c.begin_session()
    c.on_failure()
    c.begin_session()
    assert c.session_changed() is True
    # no new session -> still reports the previous change until reset/next begin
    assert c.policy.attempts == 0


def test_controller_to_dict_shape():
    c = ReconnectController(max_delay_seconds=30.0)
    c.begin_session()
    data = c.to_dict()
    assert "sessionId" in data
    assert "lastSessionId" in data
    assert "sessionChanged" in data
    assert "backoff" in data
    assert data["active"] is True


def test_controller_stop():
    c = ReconnectController(max_delay_seconds=30.0)
    assert c.active is True
    c.stop()
    assert c.active is False
