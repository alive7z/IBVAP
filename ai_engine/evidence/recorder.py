"""Media write helpers for evidence capture (Phase 11).

Writes snapshot (JPEG) and incident clip (MP4) media to the local storage
directories and returns the file metadata (relative storage reference, MIME,
byte size, sha256 checksum) that gets POSTed to Node. Media lives on the
filesystem — only metadata reaches Node.
"""
from __future__ import annotations

import hashlib
from pathlib import Path

import cv2

from evidence.buffer import BufferedFrame


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _storage_reference(evidence_id: str, ext: str, subdir: str) -> str:
    # Relative path under the shared storage root (snapshots/ or clips/).
    return f"storage/{subdir}/{evidence_id}{ext}"


def capture_snapshot(
    frame,
    evidence_id: str,
    snapshots_dir: Path,
    subdir: str = "snapshots",
) -> dict:
    """Write a single annotated frame as a JPEG snapshot.

    Returns a metadata dict (storageReference, mimeType, fileSizeBytes,
    checksum) ready for the Node evidence payload, or None if the frame is bad.
    """
    if frame is None:
        return None

    snapshots_dir = Path(snapshots_dir)
    snapshots_dir.mkdir(parents=True, exist_ok=True)
    rel = _storage_reference(evidence_id, ".jpg", subdir)
    path = snapshots_dir / f"{evidence_id}.jpg"

    ok, buf = cv2.imencode(".jpg", frame)
    if not ok:
        return None
    path.write_bytes(buf.tobytes())
    size = path.stat().st_size

    return {
        "type": "SNAPSHOT",
        "storageReference": rel,
        "mimeType": "image/jpeg",
        "fileSizeBytes": size,
        "checksum": _sha256(path),
    }


def capture_face_crop(
    frame,
    bbox: dict,
    evidence_id: str,
    faces_dir: Path,
    subdir: str = "faces",
    margin_frac: float = 0.25,
    max_side: int = 256,
) -> dict:
    """Write a cropped face JPEG from the full frame.

    bbox uses full-frame pixel coordinates (x1, y1, x2, y2); it is clamped to
    the frame, padded by margin_frac, and downscaled to at most max_side px.
    Returns metadata identical to capture_snapshot but with type "FACE", or
    None when the frame or bbox is unusable.
    """
    if frame is None or bbox is None:
        return None

    h, w = frame.shape[:2]
    x1 = max(0, int(bbox.get("x1", 0)))
    y1 = max(0, int(bbox.get("y1", 0)))
    x2 = min(w, int(bbox.get("x2", 0)))
    y2 = min(h, int(bbox.get("y2", 0)))
    if x2 <= x1 or y2 <= y1:
        return None

    bw, bh = x2 - x1, y2 - y1
    pad_x = int(bw * margin_frac)
    pad_y = int(bh * margin_frac)
    crop = frame[max(0, y1 - pad_y):min(h, y2 + pad_y), max(0, x1 - pad_x):min(w, x2 + pad_x)]
    if crop.size == 0 or crop.shape[0] < 1 or crop.shape[1] < 1:
        return None

    ch, cw = crop.shape[:2]
    scale = max_side / max(ch, cw)
    if scale < 1.0:
        crop = cv2.resize(
            crop,
            (max(1, int(cw * scale)), max(1, int(ch * scale))),
            interpolation=cv2.INTER_AREA,
        )

    faces_dir = Path(faces_dir)
    faces_dir.mkdir(parents=True, exist_ok=True)
    rel = _storage_reference(evidence_id, ".jpg", subdir)
    path = faces_dir / f"{evidence_id}.jpg"

    ok, buf = cv2.imencode(".jpg", crop)
    if not ok:
        return None
    path.write_bytes(buf.tobytes())
    size = path.stat().st_size

    return {
        "type": "FACE",
        "storageReference": rel,
        "mimeType": "image/jpeg",
        "fileSizeBytes": size,
        "checksum": _sha256(path),
    }


def capture_clip(
    frames: list[BufferedFrame],
    evidence_id: str,
    clips_dir: Path,
    fps: int = 5,
    subdir: str = "clips",
) -> dict:
    """Write a short incident clip (MP4) from buffered frames.

    If fewer than 2 frames are available the clip cannot be encoded; the caller
    decides whether to publish metadata (best-effort capture).
    """
    clips_dir = Path(clips_dir)
    clips_dir.mkdir(parents=True, exist_ok=True)
    rel = _storage_reference(evidence_id, ".mp4", subdir)
    path = clips_dir / f"{evidence_id}.mp4"

    usable = [f for f in frames if f is not None and f.image is not None]
    if len(usable) < 2:
        return None

    h, w = usable[0].image.shape[:2]
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"mp4v"), max(int(fps), 1), (w, h))
    try:
        for f in usable:
            writer.write(f.image)
    finally:
        writer.release()

    if not path.exists() or path.stat().st_size == 0:
        return None
    size = path.stat().st_size

    return {
        "type": "INCIDENT_CLIP",
        "storageReference": rel,
        "mimeType": "video/mp4",
        "fileSizeBytes": size,
        "checksum": _sha256(path),
    }
