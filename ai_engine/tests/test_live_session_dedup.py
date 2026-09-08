"""Regressions for live observation deduplication across stream sessions."""

from main import (
    _clear_live_session_dedup,
    _emit_live_observations,
    _live_track_event_key,
)


def test_reconnect_clears_session_scoped_track_and_observation_keys():
    tracks = {7}
    context = {("LOITERING", 7)}
    risk = {(7, "INFO", 12.9)}

    _clear_live_session_dedup(tracks, context, risk)

    assert tracks == set()
    assert context == set()
    assert risk == set()


def test_live_person_detection_key_is_once_per_camera_session_track():
    track = {"trackId": 7, "objectType": "PERSON"}
    first = _live_track_event_key("CAM-01", "session-a", track)
    repeated = _live_track_event_key("CAM-01", "session-a", track)
    next_session = _live_track_event_key("CAM-01", "session-b", track)

    assert first == repeated
    assert first != next_session
    assert first == ("CAM-01", "session-a", 7, "PERSON_DETECTED")


def test_live_context_delivery_carries_stream_session_id():
    class NodeClient:
        is_enabled = True

        def __init__(self):
            self.context = []

        async def send_context_observations(self, camera_code, observations):
            self.context.extend(observations)
            return {"sent": True}

    class EvidenceManager:
        enabled = False

    metrics = {
        "confirmedTracks": 0,
        "contextDuplicateSuppressed": 0,
        "contextObservationsGenerated": 0,
        "contextObservationsDelivered": 0,
        "contextDeliveriesSuccess": 0,
        "contextDeliveriesFailed": 0,
        "riskObservationsGenerated": 0,
        "riskObservationsDelivered": 0,
        "riskDeliveriesSuccess": 0,
        "riskDeliveriesFailed": 0,
        "anprObservationsGenerated": 0,
        "faceObservationsGenerated": 0,
    }
    node = NodeClient()
    out = {
        "tracks": [],
        "risk": [],
        "context": [{
            "type": "FENCE_PROXIMITY",
            "trackId": 7,
            "objectType": "PERSON",
            "occurredAt": "2026-09-07T00:00:00Z",
            "sourceTimestampMs": 1000,
            "referencePoint": {"x": 0.5, "y": 0.5},
            "metadata": {"fenceCode": "FENCE-1", "distance": 0.01},
        }],
    }

    _emit_live_observations(
        metrics,
        node,
        EvidenceManager(),
        "CAM-01",
        out,
        [],
        [],
        set(),
        set(),
        set(),
        stream_session_id="session-a",
    )

    assert node.context[0]["streamSessionId"] == "session-a"
