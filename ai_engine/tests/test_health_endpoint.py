import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest
from fastapi.testclient import TestClient
from api.server import app
import api.routes as routes
from streaming.stream_health import StreamHealth, StreamStatus


@pytest.fixture
def client():
    return TestClient(app)


def test_health_endpoint(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["service"] == "IBVAP-AI"
    assert "status" in data
    assert "videoSource" in data


def test_health_video_source_structure(client):
    resp = client.get("/health")
    data = resp.json()
    vs = data["videoSource"]
    assert "configured" in vs
    assert "status" in vs


def test_health_not_configured_default(client):
    resp = client.get("/health")
    data = resp.json()
    assert data["videoSource"]["configured"] is False


def test_health_has_uptime(client):
    resp = client.get("/health")
    data = resp.json()
    assert isinstance(data["uptime"], float)
    assert data["uptime"] >= 0


def test_health_model_structure(client):
    resp = client.get("/health")
    data = resp.json()
    assert "loaded" in data["model"]
    assert "name" in data["model"]
    assert "device" in data["model"]
    # No ANPR/face/risk claims
    assert "anpr" not in data["model"]
    assert "face" not in data["model"]
    assert "risk" not in data["model"]


def test_health_tracking_structure(client):
    resp = client.get("/health")
    data = resp.json()
    assert "enabled" in data["tracking"]
    assert "tracker" in data["tracking"]


def test_health_camera_code(client):
    resp = client.get("/health")
    data = resp.json()
    assert "cameraCode" in data


def test_health_stream_uses_current_video_health(client, monkeypatch):
    health = StreamHealth()
    health.set_status(StreamStatus.ONLINE)
    health.set_source_info("MOBILE", 25.0)
    health.record_frame_received()
    health.record_frame_processed(8.5)
    monkeypatch.setattr(routes, "_global_health", health)
    monkeypatch.setattr(routes, "_global_source_info", {
        "cameraCode": "CAM-01",
        "protocol": "RTSP",
        "status": "CONNECTING",
    })

    data = client.get("/health").json()
    assert data["videoSource"]["status"] == "ONLINE"
    assert data["stream"]["status"] == "ONLINE"
    assert data["stream"]["cameraCode"] == "CAM-01"
    assert data["stream"]["framesRead"] == 1
    assert data["stream"]["framesProcessed"] == 1
