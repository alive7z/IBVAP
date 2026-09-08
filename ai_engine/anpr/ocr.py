"""Plate OCR using EasyOCR (single documented OCR engine).

EasyOCR is used because it is the simpler, more stable option that integrates
cleanly with the existing Python 3.11 + torch + Apple Silicon environment
(PaddleOCR's paddlepaddle wheel coverage for this stack lags).

The model is loaded lazily so unit tests (and pipeline startup) never block on
a download. If EasyOCR is unavailable or fails, OCR reports UNAVAILABLE and
returns rawText=null — the rest of the pipeline continues.
"""

import time

from anpr.models import OcrRead
from utils.logger import get_logger

logger = get_logger("anpr_ocr")


class PlateOCR:
    """Runs OCR on a plate crop and returns an OcrRead with honest confidence."""

    def __init__(self, allowlist: str = None):
        self._reader = None
        self._loaded = False
        self._load_errors = 0
        self._status = "NOT_LOADED"
        # Conservative allowlist: alphanumerics plus a space/hyphen. No O↔0/I↔1
        # substitution is performed by the OCR layer.
        self._allowlist = allowlist or "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789- "

    def load(self) -> bool:
        try:
            import easyocr  # lazy import

            self._reader = easyocr.Reader(["en"], gpu=False)
            self._loaded = True
            self._status = "READY"
            logger.info("EasyOCR loaded (status=READY)")
            return True
        except Exception as e:  # noqa: BLE001
            self._load_errors += 1
            self._loaded = False
            self._status = "ERROR"
            logger.error("EasyOCR failed to load: %s", e)
            return False

    def read(self, crop, latency_ms: list | None = None):
        """Run OCR on a plate crop.

        Returns an OcrRead. On failure or no text, raw_text is None (never
        fabricates a plate number).
        """
        if crop is None or crop.size == 0:
            return OcrRead(raw_text=None, normalized_text=None, ocr_confidence=0.0)
        if not self._loaded or self._reader is None:
            return OcrRead(raw_text=None, normalized_text=None, ocr_confidence=0.0)

        start = time.time()
        try:
            results = self._reader.readtext(crop, allowlist=self._allowlist, detail=1, paragraph=False)
        except Exception as e:  # noqa: BLE001
            logger.error("OCR inference failed: %s", e)
            return OcrRead(raw_text=None, normalized_text=None, ocr_confidence=0.0)
        finally:
            if latency_ms is not None:
                latency_ms.append(round((time.time() - start) * 1000, 2))

        if not results:
            return OcrRead(raw_text=None, normalized_text=None, ocr_confidence=0.0)

        # Prefer the highest-confidence text region.
        best = max(results, key=lambda r: r[2] if len(r) > 2 else 0.0)
        text = best[1] if len(best) > 1 else None
        conf = best[2] if len(best) > 2 else 0.0
        text = (text or "").strip()
        if not text:
            return OcrRead(raw_text=None, normalized_text=None, ocr_confidence=0.0)
        return OcrRead(
            raw_text=text,
            normalized_text=None,
            ocr_confidence=round(float(conf), 4),
        )

    @property
    def is_loaded(self) -> bool:
        return self._loaded

    @property
    def status(self) -> str:
        return self._status

    def get_info(self) -> dict:
        return {
            "loaded": self._loaded,
            "status": self._status,
            "engine": "easyocr",
            "loadErrors": self._load_errors,
        }
