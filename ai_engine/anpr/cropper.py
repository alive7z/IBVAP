"""Safe plate cropping.

A crop is attempted only when the bbox is geometrically valid (x1<x2, y1<y2,
within frame, and meets a minimum size). Invalid crops return None — the
pipeline skips them safely and never crashes.
"""

from config import ANPR_MIN_PLATE_SIZE
from anpr.models import PlateBBox
from utils.logger import get_logger

logger = get_logger("anpr_cropper")


def validate_crop(bbox: PlateBBox, width: int, height: int, min_size: int = ANPR_MIN_PLATE_SIZE) -> bool:
    """Return True when the bbox is a safe, usable crop."""
    if bbox is None:
        return False
    if bbox.x1 >= bbox.x2 or bbox.y1 >= bbox.y2:
        return False
    if bbox.x1 < 0 or bbox.y1 < 0 or bbox.x2 > width or bbox.y2 > height:
        return False
    if (bbox.x2 - bbox.x1) < min_size or (bbox.y2 - bbox.y1) < min_size:
        return False
    return True


def crop_plate(frame, bbox: PlateBBox, min_size: int = ANPR_MIN_PLATE_SIZE):
    """Crop the plate region from the frame image.

    Returns the cropped image, or None if the bbox is invalid/out-of-frame.
    """
    if frame is None:
        return None
    h, w = frame.shape[:2]
    if not validate_crop(bbox, w, h, min_size):
        return None
    try:
        x1 = int(round(bbox.x1))
        y1 = int(round(bbox.y1))
        x2 = int(round(bbox.x2))
        y2 = int(round(bbox.y2))
        crop = frame[y1:y2, x1:x2]
        if crop.size == 0 or crop.shape[0] < 1 or crop.shape[1] < 1:
            return None
        return crop
    except Exception as e:  # noqa: BLE001
        logger.warning("Plate crop failed: %s", e)
        return None
