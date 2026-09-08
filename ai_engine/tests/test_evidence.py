"""Unit tests for the Phase 11 evidence package (buffer, recorder, models, manager)."""

import numpy as np

from evidence.buffer import BufferedFrame, FrameRingBuffer
from evidence.manager import EvidenceManager, FACE, SNAPSHOT, INCIDENT_CLIP
from evidence.models import EvidenceMeta, build_payload
from evidence.recorder import capture_clip, capture_face_crop, capture_snapshot


def _frame(index=0, ts_ms=1000, h=240, w=320, val=None):
    img = np.full((h, w, 3), val if val is not None else (index * 10) % 255, dtype=np.uint8)
    return BufferedFrame(image=img, captured_at=index, source_timestamp_ms=ts_ms, frame_index=index)


class TestFrameRingBuffer:
    def test_push_and_size(self):
        buf = FrameRingBuffer(maxlen=10)
        assert buf.size == 0
        buf.push(_frame(0, 1000))
        buf.push(_frame(1, 2000))
        assert buf.size == 2
        assert buf.get_stats()["totalPushed"] == 2

    def test_bounded_drops_oldest(self):
        buf = FrameRingBuffer(maxlen=3)
        for i in range(5):
            buf.push(_frame(i, i * 1000))
        assert buf.size == 3
        assert buf.get_stats()["totalDropped"] == 2

    def test_snapshot_nearest_timestamp(self):
        buf = FrameRingBuffer(maxlen=10)
        for i in range(5):
            buf.push(_frame(i, i * 1000, val=i * 20))
        best = buf.snapshot_frame(3200)  # nearest to 3000 (index 3)
        assert best[0, 0, 0] == 60  # index 3 -> 60

    def test_snapshot_none_when_empty(self):
        buf = FrameRingBuffer(maxlen=5)
        assert buf.snapshot_frame() is None
        assert buf.clip_frames() == []

    def test_clip_frames_ordered_by_timestamp_window(self):
        buf = FrameRingBuffer(maxlen=10)
        for i in range(5):
            buf.push(_frame(i, (i + 1) * 1000))
        window = buf.clip_frames(3000)  # includes ts<=3000 -> indices 0..2
        assert [f.frame_index for f in window] == [0, 1, 2]

    def test_clear(self):
        buf = FrameRingBuffer(maxlen=5)
        buf.push(_frame(0, 0))
        buf.clear()
        assert buf.size == 0


class TestRecorder:
    def test_capture_snapshot_writes_jpeg(self, tmp_path):
        meta = capture_snapshot(_frame(0, 1000).image, "ev-abc", tmp_path, "snapshots")
        assert meta is not None
        assert meta["type"] == "SNAPSHOT"
        assert meta["storageReference"] == "storage/snapshots/ev-abc.jpg"
        assert meta["mimeType"] == "image/jpeg"
        assert meta["fileSizeBytes"] > 0
        assert len(meta["checksum"]) == 64
        assert (tmp_path / "ev-abc.jpg").exists()

    def test_capture_snapshot_none_for_empty_frame(self, tmp_path):
        assert capture_snapshot(None, "x", tmp_path, "snapshots") is None

    def test_capture_clip_writes_mp4(self, tmp_path):
        frames = [_frame(i, i * 1000) for i in range(6)]
        meta = capture_clip(frames, "ev-clip", tmp_path, fps=5, subdir="clips")
        assert meta is not None
        assert meta["type"] == "INCIDENT_CLIP"
        assert meta["storageReference"] == "storage/clips/ev-clip.mp4"
        assert meta["mimeType"] == "video/mp4"
        assert meta["fileSizeBytes"] > 0
        assert len(meta["checksum"]) == 64
        assert (tmp_path / "ev-clip.mp4").exists()

    def test_capture_clip_none_for_insufficient_frames(self, tmp_path):
        assert capture_clip([_frame(0, 0)], "c", tmp_path, fps=5, subdir="clips") is None

    def test_capture_face_crop_writes_jpeg(self, tmp_path):
        img = np.zeros((240, 320, 3), dtype=np.uint8)
        img[60:160, 120:200] = 180
        meta = capture_face_crop(img, {"x1": 120, "y1": 60, "x2": 200, "y2": 160}, "face-abc", tmp_path)
        assert meta is not None
        assert meta["type"] == "FACE"
        assert meta["storageReference"] == "storage/faces/face-abc.jpg"
        assert meta["mimeType"] == "image/jpeg"
        assert meta["fileSizeBytes"] > 0
        assert len(meta["checksum"]) == 64
        assert (tmp_path / "face-abc.jpg").exists()

    def test_capture_face_crop_clamps_and_rejects(self, tmp_path):
        img = np.zeros((240, 320, 3), dtype=np.uint8)
        out_of_frame = capture_face_crop(img, {"x1": 400, "y1": 400, "x2": 500, "y2": 500}, "f1", tmp_path)
        assert out_of_frame is None
        assert capture_face_crop(None, {"x1": 0, "y1": 0, "x2": 10, "y2": 10}, "f2", tmp_path) is None


class TestModels:
    def test_evidence_meta_to_dict(self):
        meta = EvidenceMeta(
            evidence_id="e1", alert_id=7, alert_code="ac", type="SNAPSHOT",
            storage_reference="storage/snapshots/e1.jpg", mime_type="image/jpeg",
            file_size_bytes=10, checksum="x" * 64, captured_at="2026-01-01T00:00:00",
        )
        d = meta.to_dict()
        assert d["evidenceId"] == "e1"
        assert d["alertId"] == 7
        assert d["type"] == "SNAPSHOT"
        assert d["storageReference"] == "storage/snapshots/e1.jpg"
        assert d["mimeType"] == "image/jpeg"
        assert d["fileSizeBytes"] == 10
        assert d["checksum"] == "x" * 64
        assert d["capturedAt"] == "2026-01-01T00:00:00"

    def test_validate(self):
        ok = EvidenceMeta(
            evidence_id="e", alert_id=1, type="SNAPSHOT",
            storage_reference="r", mime_type="image/jpeg",
            file_size_bytes=1, checksum="", captured_at="t",
        )
        assert ok.validate() is True
        bad_type = EvidenceMeta(
            evidence_id="e", alert_id=1, type="VIDEO",
            storage_reference="r", mime_type="video/mp4",
            file_size_bytes=1, checksum="", captured_at="t",
        )
        assert bad_type.validate() is False
        no_alert = EvidenceMeta(
            evidence_id="e", alert_id=None, type="SNAPSHOT",
            storage_reference="r", mime_type="image/jpeg",
            file_size_bytes=1, checksum="", captured_at="t",
        )
        assert no_alert.validate() is False

    def test_face_evidence_validate(self):
        face = EvidenceMeta(
            evidence_id="f1", type="FACE", event_id="ev-code",
            storage_reference="storage/faces/f1.jpg", mime_type="image/jpeg",
            file_size_bytes=10, checksum="x" * 64, captured_at="t",
        )
        assert face.validate() is True
        no_event = EvidenceMeta(
            evidence_id="f2", type="FACE",
            storage_reference="r", mime_type="image/jpeg",
            file_size_bytes=1, checksum="", captured_at="t",
        )
        assert no_event.validate() is False

    def test_face_evidence_to_dict(self):
        face = EvidenceMeta(
            evidence_id="f1", type="FACE", event_id="ev-code",
            storage_reference="storage/faces/f1.jpg", mime_type="image/jpeg",
            file_size_bytes=10, checksum="x" * 64, captured_at="t",
        )
        d = face.to_dict()
        assert d["eventId"] == "ev-code"
        assert d["alertId"] is None
        assert d["type"] == "FACE"

    def test_build_payload(self):
        meta = EvidenceMeta(
            evidence_id="e1", alert_id=7, type="SNAPSHOT",
            storage_reference="r", mime_type="image/jpeg",
            file_size_bytes=10, checksum="x", captured_at="t",
        )
        payload = build_payload("CAM-01", [meta])
        assert payload["schemaVersion"] == 1
        assert payload["cameraCode"] == "CAM-01"
        assert payload["evidence"][0]["evidenceId"] == "e1"


class TestEvidenceManager:
    def test_disabled_returns_no_items(self, tmp_path):
        mgr = EvidenceManager(enabled=False, snapshot_dir=tmp_path, clip_dir=tmp_path)
        assert mgr.enabled is False
        action = {"observationId": "o1", "action": "CREATED", "alertId": 5, "alertCode": "ac", "evidenceRequested": True}
        assert mgr.build_evidence_items(action, None) == []

    def test_not_requested_returns_no_items(self, tmp_path):
        mgr = EvidenceManager(enabled=True, snapshot_dir=tmp_path, clip_dir=tmp_path)
        action = {"observationId": "o1", "action": "DEDUPLICATED", "alertId": 5, "evidenceRequested": False}
        assert mgr.build_evidence_items(action, None) == []

    def test_builds_snapshot_and_clip(self, tmp_path):
        mgr = EvidenceManager(enabled=True, snapshot_dir=tmp_path, clip_dir=tmp_path, sample_fps=5)
        for i in range(12):
            mgr.record_frame(_frame(i, i * 1000).image, float(i), float(i) * 1000, i)
        action = {"observationId": "o1", "action": "CREATED", "alertId": 9, "alertCode": "ac", "evidenceRequested": True}
        risk_obs = {"sourceTimestampMs": 10000, "occurredAt": "2026-01-01T00:00:00"}
        items = mgr.build_evidence_items(action, risk_obs)
        types = {i.type for i in items}
        assert SNAPSHOT in types
        assert INCIDENT_CLIP in types
        assert all(i.alert_id == 9 for i in items)
        assert all(i.validate() for i in items)
        assert mgr.get_stats()["captured"] == len(items)

    def test_capture_face_evidence_event_anchored(self, tmp_path):
        mgr = EvidenceManager(enabled=True, snapshot_dir=tmp_path, clip_dir=tmp_path, face_dir=tmp_path)
        img = np.zeros((240, 320, 3), dtype=np.uint8)
        img[60:160, 120:200] = 180
        item = mgr.capture_face_evidence(img, {"x1": 120, "y1": 60, "x2": 200, "y2": 160}, "ev-code", "t")
        assert item is not None
        assert item.type == FACE
        assert item.event_id == "ev-code"
        assert item.alert_id is None
        assert item.validate() is True

    def test_capture_face_evidence_disabled_or_bad(self, tmp_path):
        mgr = EvidenceManager(enabled=False, snapshot_dir=tmp_path, clip_dir=tmp_path, face_dir=tmp_path)
        assert mgr.capture_face_evidence(None, {"x1": 0, "y1": 0, "x2": 10, "y2": 10}, "ev", "t") is None
        assert mgr.capture_face_evidence(np.zeros((20, 20, 3), dtype=np.uint8), None, "ev", "t") is None
        assert mgr.capture_face_evidence(np.zeros((20, 20, 3), dtype=np.uint8), {"x1": 0, "y1": 0, "x2": 10, "y2": 10}, "", "t") is None


class TestNodeClientEvidence:
    def test_send_evidence_payload_and_success(self, monkeypatch):
        import httpx

        from integrations.node_client import NodeClient

        captured = {}

        def handler(request):
            captured["url"] = request.url
            captured["body"] = request.read()
            captured["header"] = request.headers.get("X-IBVAP-AI-Key")
            return httpx.Response(
                200,
                json={"success": True, "data": {"evidenceCreated": 2}},
            )

        class FakeClient(httpx.AsyncClient):
            def __init__(self, *args, **kwargs):
                kwargs["transport"] = httpx.MockTransport(handler)
                super().__init__(*args, **kwargs)

        monkeypatch.setattr("integrations.node_client.httpx.AsyncClient", FakeClient)
        monkeypatch.setattr("integrations.node_client.NODE_INTEGRATION_ENABLED", True)
        monkeypatch.setattr("integrations.node_client.NODE_AI_SERVICE_TOKEN", "tok")

        nc = NodeClient(base_url="http://localhost:5001/api")
        meta = EvidenceMeta(
            evidence_id="e1", alert_id=7, type="SNAPSHOT",
            storage_reference="storage/snapshots/e1.jpg", mime_type="image/jpeg",
            file_size_bytes=10, checksum="x" * 64, captured_at="t",
        )
        result = __import__("asyncio").run(nc.send_evidence("CAM-01", [meta]))

        assert result["sent"] is True
        assert result["evidenceCreated"] == 2
        assert "/internal/ai/evidence" in str(captured["url"])
        assert captured["header"] == "tok"
        body = __import__("json").loads(captured["body"])
        assert body["cameraCode"] == "CAM-01"
        assert body["evidence"][0]["evidenceId"] == "e1"

    def test_risk_observations_parse_alert_actions(self, monkeypatch):
        import asyncio
        import httpx
        import json

        from integrations.node_client import NodeClient

        class FakeClient(httpx.AsyncClient):
            def __init__(self, *args, **kwargs):
                kwargs["transport"] = httpx.MockTransport(
                    lambda req: httpx.Response(
                        200,
                        json={
                            "success": True,
                            "data": {
                                "eventsCreated": 1,
                                "alertActions": [
                                    {"observationId": "o1", "action": "CREATED", "alertId": 5, "evidenceRequested": True}
                                ],
                            },
                        },
                    )
                )
                super().__init__(*args, **kwargs)

        monkeypatch.setattr("integrations.node_client.httpx.AsyncClient", FakeClient)
        monkeypatch.setattr("integrations.node_client.NODE_INTEGRATION_ENABLED", True)
        monkeypatch.setattr("integrations.node_client.NODE_AI_SERVICE_TOKEN", "tok")

        nc = NodeClient(base_url="http://localhost:5001/api")
        obs = [{"observationId": "o1", "trackId": 3, "riskScore": 70, "riskSeverity": "HIGH", "reasons": ["RESTRICTED_ZONE_ENTRY"]}]
        result = asyncio.run(nc.send_risk_observations("CAM-01", obs))
        assert result["sent"] is True
        actions = result["alertActions"]
        assert len(actions) == 1
        assert actions[0]["action"] == "CREATED"
        assert actions[0]["alertId"] == 5
        assert actions[0]["evidenceRequested"] is True
        assert json.dumps(result)  # ensure serializable
