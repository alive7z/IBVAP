"""Reason formatting helpers for risk observations."""
from __future__ import annotations


def format_reasons(active_evidence: dict) -> list[dict]:
    """Convert active evidence dict to a list of reason dicts."""
    return [
        {"code": ev.rule_code, "weight": ev.weight}
        for ev in active_evidence.values()
        if ev.active
    ]


def format_evidence(active_evidence: dict) -> list[dict]:
    """Convert active evidence dict to a list of evidence context dicts."""
    return [
        {"type": ev.rule_code}
        for ev in active_evidence.values()
        if ev.active
    ]
