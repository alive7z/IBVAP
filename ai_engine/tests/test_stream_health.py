import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from streaming.stream_health import StreamHealth, StreamStatus


def test_initial_state():
    h = StreamHealth()
    report = h.get_report()
    assert report["status"] == "NOT_CONFIGURED"
    assert report["configured"] is False
    assert report["framesReceived"] == 0


def test_status_transitions():
    h = StreamHealth()
    h.set_status(StreamStatus.CONNECTING)
    assert h.get_report()["status"] == "CONNECTING"

    h.set_status(StreamStatus.ONLINE)
    report = h.get_report()
    assert report["status"] == "ONLINE"
    assert report["configured"] is True


def test_eof_status():
    h = StreamHealth()
    h.set_status(StreamStatus.EOF)
    report = h.get_report()
    assert report["status"] == "EOF"


def test_error_status():
    h = StreamHealth()
    h.set_status(StreamStatus.ERROR, "corrupt file")
    report = h.get_report()
    assert report["status"] == "ERROR"
    assert report["errorMessage"] == "corrupt file"


def test_frame_metrics():
    h = StreamHealth()
    h.record_frame_received()
    h.record_frame_received()
    h.record_frame_processed(10.0)
    h.record_frame_dropped()
    report = h.get_report()
    assert report["framesReceived"] == 2
    assert report["framesProcessed"] == 1
    assert report["framesDropped"] == 1
    assert report["averageLatencyMs"] == 10.0


def test_reset():
    h = StreamHealth()
    h.set_status(StreamStatus.ONLINE)
    h.record_frame_received()
    h.reset()
    report = h.get_report()
    assert report["status"] == "NOT_CONFIGURED"
    assert report["framesReceived"] == 0


def test_processing_fps():
    h = StreamHealth()
    import time
    for _ in range(10):
        h.record_frame_processed(5.0)
        time.sleep(0.01)
    report = h.get_report()
    assert report["processingFps"] is not None
    assert report["processingFps"] > 0


def test_session_heartbeat_reconnect_fields():
    h = StreamHealth()
    h.set_status(StreamStatus.ONLINE)
    h.set_session("abc123")
    h.set_reconnect_attempts(3)
    h.record_heartbeat()
    report = h.get_report()
    assert report["streamSessionId"] == "abc123"
    assert report["reconnectAttempts"] == 3
    assert report["lastHeartbeatAt"] is not None


def test_session_fields_initial_none():
    h = StreamHealth()
    report = h.get_report()
    assert report["streamSessionId"] is None
    assert report["reconnectAttempts"] == 0
    assert report["lastHeartbeatAt"] is None


def test_reset_clears_session_state():
    h = StreamHealth()
    h.set_status(StreamStatus.ONLINE)
    h.set_session("abc123")
    h.set_reconnect_attempts(5)
    h.record_heartbeat()
    h.reset()
    report = h.get_report()
    assert report["streamSessionId"] is None
    assert report["reconnectAttempts"] == 0
    assert report["lastHeartbeatAt"] is None
