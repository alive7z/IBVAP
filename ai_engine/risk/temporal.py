"""Temporal confirmation logic for risk rules."""
from __future__ import annotations

import time


def is_temporally_confirmed(
    first_observed_at: float,
    now: float,
    minimum_duration_ms: int,
) -> bool:
    """Return True if the evidence has persisted beyond the rule's minimum duration."""
    if minimum_duration_ms <= 0:
        return True
    elapsed_ms = (now - first_observed_at) * 1000
    return elapsed_ms >= minimum_duration_ms


def is_in_cooldown(last_emitted_at: float, now: float, cooldown_seconds: int) -> bool:
    """Return True if we are still within the rule's cooldown period.

    `last_emitted_at == 0.0` is the "never emitted" sentinel — a first
    emission (even HIGH/CRITICAL) must never be blocked by cooldown,
    otherwise cooldown-carrying severities can never fire within the
    evidence window. Cooldown is measured from a real prior emission.
    """
    if cooldown_seconds <= 0:
        return False
    if last_emitted_at <= 0:
        return False
    return (now - last_emitted_at) < cooldown_seconds


def is_within_evidence_window(
    last_observed_at: float,
    now: float,
    window_seconds: float,
) -> bool:
    """Return True if the evidence was observed within the recent window."""
    return (now - last_observed_at) <= window_seconds
