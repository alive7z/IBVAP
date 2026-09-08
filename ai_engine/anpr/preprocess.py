"""Conservative OCR preprocessing.

Only non-destructive enhancements are applied: grayscale, capped resize,
gentle contrast enhancement, and light denoise. We do NOT apply aggressive
morphology or binarization that could destroy plate characters.

Both the original crop and the enhanced crop are returned so callers may
compare if needed.
"""

import cv2
import numpy as np


def _normalize_size(crop: np.ndarray, max_width: int = 320) -> np.ndarray:
    """Scale the crop up so characters are clearer, but never destructively."""
    h, w = crop.shape[:2]
    if w == 0 or h == 0:
        return crop
    scale = max_width / float(w)
    if scale < 1.0:
        scale = 1.0
    new_w = int(round(w * scale))
    new_h = int(round(h * scale))
    return cv2.resize(crop, (new_w, new_h), interpolation=cv2.INTER_CUBIC)


def _enhance(gray: np.ndarray) -> np.ndarray:
    # Gentle contrast stretch (clahe), then light bilateral denoise.
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    # Bilateral filter preserves edges while smoothing noise.
    denoised = cv2.bilateralFilter(enhanced, 5, 60, 60)
    return denoised


def preprocess_plate_crop(crop: np.ndarray):
    """Enhance a plate crop for OCR.

    Returns (gray, enhanced) where:
      - gray is the resized grayscale original (for comparison)
      - enhanced is the OCR-ready enhanced grayscale image
    """
    if crop is None or crop.size == 0:
        return None, None
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    gray = _normalize_size(gray)
    enhanced = _enhance(gray)
    return gray, enhanced
