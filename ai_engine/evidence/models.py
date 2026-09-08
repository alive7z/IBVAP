"""Evidence metadata models and payload builders (Phase 11).

Python never inserts alerts or queries MySQL. When Node's alert decision asks
for evidence (alertActions[].evidenceRequested == true), Python captures a
snapshot / incident clip on the local filesystem and POSTs metadata to Node's
internal evidence endpoint so Node can persist it.

Only metadata is sent to Node — the actual media bytes stay on the Python side
under the shared storage directory (mounted/accessible to both services).
"""
from __future__ import annotations

from dataclasses import dataclass, asdict

SNAPSHOT = "SNAPSHOT"
INCIDENT_CLIP = "INCIDENT_CLIP"
FACE = "FACE"
VALID_TYPES = frozenset({SNAPSHOT, INCIDENT_CLIP, FACE})
# Alert-anchored evidence types require an alertId; FACE is event-anchored.
ALERT_TYPES = frozenset({SNAPSHOT, INCIDENT_CLIP})


@dataclass
class EvidenceMeta:
    """Metadata for a single captured media item (mirrors backend ingest shape)."""

    evidence_id: str
    type: str
    storage_reference: str
    mime_type: str
    file_size_bytes: int
    checksum: str
    captured_at: str
    alert_id: int | None = None
    alert_code: str | None = None
    event_id: str | None = None

    def to_dict(self) -> dict:
        data = asdict(self)
        data["evidenceId"] = data.pop("evidence_id")
        data["alertId"] = data.pop("alert_id")
        data["alertCode"] = data.pop("alert_code")
        data["eventId"] = data.pop("event_id")
        data["storageReference"] = data.pop("storage_reference")
        data["mimeType"] = data.pop("mime_type")
        data["fileSizeBytes"] = data.pop("file_size_bytes")
        data["capturedAt"] = data.pop("captured_at")
        data["type"] = data["type"]
        data["checksum"] = data["checksum"]
        return data

    def validate(self) -> bool:
        if self.type not in VALID_TYPES or not self.evidence_id or not self.storage_reference:
            return False
        if self.type in ALERT_TYPES:
            return bool(self.alert_id)
        return bool(self.event_id)


def build_payload(camera_code: str, evidence: list[EvidenceMeta]) -> dict:
    """Build the body for POST /api/internal/ai/evidence."""
    return {
        "schemaVersion": 1,
        "cameraCode": camera_code,
        "evidence": [e.to_dict() for e in evidence],
    }
