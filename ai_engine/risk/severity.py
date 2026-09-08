"""Severity classification from score + threshold configuration."""
from __future__ import annotations

from risk.rules import SeverityThresholds

# Ordered from highest to lowest — first match wins.
SEVERITY_ORDER = ("CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO")


def classify(score: float, thresholds: SeverityThresholds) -> str:
    """Map a risk score (0–100) to a severity label."""
    if score >= thresholds.critical:
        return "CRITICAL"
    if score >= thresholds.high:
        return "HIGH"
    if score >= thresholds.medium:
        return "MEDIUM"
    if score >= thresholds.low:
        return "LOW"
    return "INFO"


def classify_int(score: int, thresholds: SeverityThresholds) -> str:
    return classify(float(score), thresholds)
