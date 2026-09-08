"""Evidence capture orchestration (Phase 11).

Holds the annotated-frame ring buffer and, when Node returns alertActions with
evidenceRequested == true for a delivered risk observation, captures a snapshot
and an incident clip from real buffered frames and hands the metadata to the
NodeClient for delivery. Evidence failure must never cancel alert creation —
it is best-effort, logged, and non-fatal.
"""
from __future__ import annotations

import time
import uuid

from config import (
    CLIP_DIR,
    EVIDENCE_ENABLED,
    EVIDENCE_MIME_CLIP,
    EVIDENCE_MIME_SNAPSHOT,
    EVIDENCE_POST_SECONDS,
    EVIDENCE_PRE_SECONDS,
    FACE_DIR,
    FRAME_SAMPLE_FPS,
    SNAPSHOT_DIR,
)
from evidence.buffer import BufferedFrame, FrameRingBuffer
from evidence.models import EvidenceMeta, build_payload
from evidence.recorder import capture_clip, capture_face_crop, capture_snapshot
from utils.logger import get_logger
from utils.time import utc_iso

logger = get_logger("evidence")

SNAPSHOT = "SNAPSHOT"
INCIDENT_CLIP = "INCIDENT_CLIP"
FACE = "FACE"


class EvidenceManager:
    """Best-effort evidence capture triggered by Node alert decisions."""

    def __init__(
        self,
        enabled: bool = EVIDENCE_ENABLED,
        snapshot_dir=SNAPSHOT_DIR,
        clip_dir=CLIP_DIR,
        face_dir=FACE_DIR,
        sample_fps: int = FRAME_SAMPLE_FPS,
        maxlen: int | None = None,
    ):
        self._enabled = enabled
        self._snapshot_dir = snapshot_dir
        self._clip_dir = clip_dir
        self._face_dir = face_dir
        self._sample_fps = max(int(sample_fps), 1)
        if maxlen is None:
            maxlen = int(self._sample_fps * (EVIDENCE_PRE_SECONDS + EVIDENCE_POST_SECONDS)) + 2
        self._ring = FrameRingBuffer(maxlen=maxlen)
        self._captured_count = 0
        self._failed_count = 0

    @property
    def enabled(self) -> bool:
        return self._enabled

    def record_frame(self, image, captured_at: float, source_timestamp_ms: float, frame_index: int) -> None:
        """Push an annotated frame into the ring buffer for later capture."""
        if not self._enabled:
            return
        self._ring.push(BufferedFrame(
            image=image,
            captured_at=captured_at,
            source_timestamp_ms=source_timestamp_ms,
            frame_index=frame_index,
        ))

    def clear(self) -> None:
        self._ring.clear()

    def get_stats(self) -> dict:
        return {
            "enabled": self._enabled,
            "ringBuffer": self._ring.get_stats(),
            "captured": self._captured_count,
            "failed": self._failed_count,
            "preSeconds": EVIDENCE_PRE_SECONDS,
            "postSeconds": EVIDENCE_POST_SECONDS,
            "sampleFps": self._sample_fps,
        }

    def build_evidence_items(
        self,
        alert_action: dict,
        risk_obs: dict | None,
    ) -> list[EvidenceMeta]:
        """Capture snapshot + clip for an alert action and return metadata items.

        Returns an empty list when evidence is disabled, no match/request, or
        capture failed (evidence failure never cancels the alert).
        """
        if not self._enabled:
            return []
        if not alert_action.get("evidenceRequested"):
            return []
        alert_id = alert_action.get("alertId")
        if not alert_id:
            return []

        target_ms = (risk_obs or {}).get("sourceTimestampMs")
        captured_at = (risk_obs or {}).get("occurredAt") or utc_iso()

        items: list[EvidenceMeta] = []

        snap_id = str(uuid.uuid4())
        snapshot = capture_snapshot(
            self._ring.snapshot_frame(target_ms),
            snap_id,
            self._snapshot_dir,
        )
        if snapshot:
            items.append(EvidenceMeta(
                evidence_id=snap_id,
                alert_id=alert_id,
                alert_code=alert_action.get("alertCode"),
                type=SNAPSHOT,
                storage_reference=snapshot["storageReference"],
                mime_type=EVIDENCE_MIME_SNAPSHOT,
                file_size_bytes=snapshot["fileSizeBytes"],
                checksum=snapshot["checksum"],
                captured_at=captured_at,
            ))
        else:
            self._failed_count += 1
            logger.warning("Snapshot capture failed for alert %s", alert_id)

        clip_id = str(uuid.uuid4())
        clip = capture_clip(
            self._ring.clip_frames(target_ms),
            clip_id,
            self._clip_dir,
            self._sample_fps,
        )
        if clip:
            items.append(EvidenceMeta(
                evidence_id=clip_id,
                alert_id=alert_id,
                alert_code=alert_action.get("alertCode"),
                type=INCIDENT_CLIP,
                storage_reference=clip["storageReference"],
                mime_type=EVIDENCE_MIME_CLIP,
                file_size_bytes=clip["fileSizeBytes"],
                checksum=clip["checksum"],
                captured_at=captured_at,
            ))
        else:
            self._failed_count += 1
            logger.info("Clip capture unavailable for alert %s (insufficient frames)", alert_id)

        self._captured_count += len(items)
        return items

    def capture_face_evidence(
        self,
        frame,
        bbox: dict,
        event_id: str,
        captured_at: str | None = None,
    ) -> EvidenceMeta | None:
        """Crop + save a face from the full frame as event-anchored evidence.

        Attachment to a delivered face observation is best-effort: failure never
        affects the observation itself. Returns None when disabled or unusable.
        """
        if not self._enabled or not bbox or not event_id:
            return None
        face_id = str(uuid.uuid4())
        try:
            crop = capture_face_crop(frame, bbox, face_id, self._face_dir)
        except Exception as e:  # best-effort capture must never raise
            self._failed_count += 1
            logger.warning("Face crop capture failed for event %s: %s", event_id, e)
            return None
        if not crop:
            self._failed_count += 1
            logger.warning("Face crop unavailable for event %s", event_id)
            return None
        self._captured_count += 1
        return EvidenceMeta(
            evidence_id=face_id,
            alert_id=None,
            alert_code=None,
            event_id=event_id,
            type=FACE,
            storage_reference=crop["storageReference"],
            mime_type=EVIDENCE_MIME_SNAPSHOT,
            file_size_bytes=crop["fileSizeBytes"],
            checksum=crop["checksum"],
            captured_at=captured_at or utc_iso(),
        )

    async def handle_alert_actions(
        self, alert_actions: list[dict], risk_obs_by_id: dict, node_client, camera_code: str
    ) -> dict:
        """Capture + deliver evidence for all evidence-requested alert actions."""
        delivered = 0
        failed = 0
        for action in alert_actions or []:
            obs_id = action.get("observationId")
            risk_obs = risk_obs_by_id.get(obs_id)
            items = self.build_evidence_items(action, risk_obs)
            if not items:
                if action.get("evidenceRequested") and not self._enabled:
                    failed += 1
                continue
            if not node_client.is_enabled:
                logger.info("Node integration disabled — evidence captured locally (%d)", len(items))
                delivered += len(items)
                continue
            try:
                result = await node_client.send_evidence(camera_code, items)
                if result.get("sent"):
                    delivered += 1
                    logger.info("Evidence delivered for alert %s (%d items)", action.get("alertId"), len(items))
                else:
                    failed += 1
                    logger.warning("Evidence delivery failed for alert %s: %s", action.get("alertId"), result.get("error"))
            except Exception as e:  # evidence failure must not cancel alerting
                failed += 1
                logger.warning("Evidence delivery error for alert %s: %s", action.get("alertId"), e)
        return {"delivered": delivered, "failed": failed}
