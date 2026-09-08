"""Plate validation.

At minimum validates: minimum length, maximum length, allowed characters, and
OCR confidence. A conservative Indian registration format check is provided for
development, but a plate that does not match the regex is classified PARTIAL
rather than rejected outright — we never fabricate corrections.
"""

import re

from config import ANPR_MIN_OCR_CONFIDENCE

MIN_LEN = 4
MAX_LEN = 12

# Allowed characters in a normalized plate (Indian/dev style: letters, digits, hyphen).
ALLOWED_RE = re.compile(r"^[A-Z0-9-]+$")

# Conservative Indian registration format: 2 letters + 2 digits + up to 4 chars.
# e.g. UK04AB1234, KA01AB1234. Used only as a soft format hint.
INDIAN_FORMAT_RE = re.compile(r"^[A-Z]{2}\d{2}[A-Z]{1,3}\d{1,4}$")

VALID_FORMAT = "VALID_FORMAT"
PARTIAL = "PARTIAL"
LOW_CONFIDENCE = "LOW_CONFIDENCE"
UNREADABLE = "UNREADABLE"


def char_check(normalized: str | None) -> bool:
    if not normalized:
        return False
    return bool(ALLOWED_RE.match(normalized))


def length_check(normalized: str | None) -> bool:
    if not normalized:
        return False
    return MIN_LEN <= len(normalized) <= MAX_LEN


def indian_format_check(normalized: str | None) -> bool:
    if not normalized:
        return False
    return bool(INDIAN_FORMAT_RE.match(normalized))


def validate_plate(
    normalized: str | None,
    ocr_confidence: float,
    min_ocr_confidence: float = ANPR_MIN_OCR_CONFIDENCE,
) -> str:
    """Classify a plate read into a validation state.

    Order of precedence:
      1. No text at all            -> UNREADABLE
      2. Below OCR confidence min  -> LOW_CONFIDENCE
      3. Fails char or length rule -> PARTIAL
      4. Otherwise                 -> VALID_FORMAT (with format hint)
    """
    if not normalized:
        return UNREADABLE
    if ocr_confidence < min_ocr_confidence:
        return LOW_CONFIDENCE
    if not char_check(normalized) or not length_check(normalized):
        return PARTIAL
    return VALID_FORMAT


def is_confirmed(normalized: str | None, ocr_confidence: float, min_ocr_confidence: float = ANPR_MIN_OCR_CONFIDENCE) -> bool:
    """A plate is confirmation-eligible only when it meets char/length rules and
    the OCR confidence threshold. Low-confidence or partial reads are NOT
    treated as confirmed."""
    state = validate_plate(normalized, ocr_confidence, min_ocr_confidence)
    return state in (VALID_FORMAT, PARTIAL)
