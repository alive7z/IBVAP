"""Face crop (temporary / in-memory only)."""

from faces.models import FaceBBox


def validate_face_crop(bbox: FaceBBox, width: int, height: int, min_size: int = 10) -> bool:
    if bbox is None:
        return False
    if bbox.x1 >= bbox.x2 or bbox.y1 >= bbox.y2:
        return False
    if bbox.x1 < 0 or bbox.y1 < 0 or bbox.x2 > width or bbox.y2 > height:
        return False
    if (bbox.x2 - bbox.x1) < min_size or (bbox.y2 - bbox.y1) < min_size:
        return False
    return True


def crop_face(frame, bbox: FaceBBox, min_size: int = 10):
    """Return a temporary in-memory face crop, or None if invalid.

    Face crops are NOT persisted to any biometric image database.
    """
    if frame is None:
        return None
    h, w = frame.shape[:2]
    if not validate_face_crop(bbox, w, h, min_size):
        return None
    try:
        crop = frame[int(bbox.y1):int(bbox.y2), int(bbox.x1):int(bbox.x2)]
        if crop.size == 0:
            return None
        return crop
    except Exception:  # noqa: BLE001
        return None
