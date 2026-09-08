import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx

from integrations import node_client as nc


class FakeResponse:
    status_code = 200
    text = '{"success":true,"data":{}}'

    def json(self):
        return {
            "success": True,
            "data": {
                "cameraCode": "CAM-01",
                "enabled": True,
                "classification": "MOBILE",
                "protocol": None,
                "sourceType": "MOBILE",
                "streamUrl": None,
            },
        }


class FakeAsyncClient:
    def __init__(self, *args, **kwargs):
        self.called_urls = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def get(self, url, headers=None):
        self.called_urls.append(url)
        return FakeResponse()


def test_fetch_source_config_requests_mounted_internal_route(monkeypatch):
    fake = FakeAsyncClient()
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: fake)
    monkeypatch.setattr(nc, "NODE_AI_SERVICE_TOKEN", "test-service-token")

    client = nc.NodeClient(base_url="http://localhost:5001/api")
    result = asyncio.run(client.fetch_source_config("CAM-01", retries=0))

    assert result["ok"] is True
    assert fake.called_urls[0] == (
        "http://localhost:5001/api" + nc.SOURCE_CONFIG_ROUTE.format(camera_code="CAM-01")
    )
    # exact route contract: /api/internal/ai/cameras/:code/source-config
    assert fake.called_urls[0] == (
        "http://localhost:5001/api/internal/ai/cameras/CAM-01/source-config"
    )


def test_stream_url_redaction_never_logs_host_path_or_credentials():
    original = "rtsp://camera-user:camera-password@private-host:8554/secret-path"
    redacted = nc.redact_stream_url(original)

    assert redacted == "rtsp://<redacted>"
    assert "camera-user" not in redacted
    assert "camera-password" not in redacted
    assert "private-host" not in redacted
    assert "secret-path" not in redacted
