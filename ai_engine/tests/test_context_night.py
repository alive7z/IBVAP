"""Unit tests for time-based night-state determination (no brightness inference)."""

import datetime

import pytest

import context.engine as engine_module
import context.night as night_module
from context.engine import ContextEngine
from context.night import is_night


@pytest.fixture(autouse=True)
def _pin_utc_timezone(monkeypatch):
    """Night-window assertions are written in UTC wall-clock terms, but the
    operator .env may set CONTEXT_TZ (e.g. Asia/Kolkata) for the running engine.
    Pin the module-level timezone so this suite stays deterministic regardless
    of deployment config."""
    monkeypatch.setattr(engine_module, "CONTEXT_TZ", "UTC")
    monkeypatch.setattr(night_module, "CONTEXT_TZ", "UTC")


def _dt(hour, tz="UTC"):
    return datetime.datetime(2026, 8, 31, hour, 0, 0, tzinfo=datetime.timezone.utc)


class TestEngineNight:
    def test_within_window(self):
        engine = ContextEngine(enabled=True, night_start=20, night_end=6)
        assert engine._is_night(_dt(22).timestamp()) is True

    def test_after_midnight(self):
        engine = ContextEngine(enabled=True, night_start=20, night_end=6)
        assert engine._is_night(_dt(3).timestamp()) is True

    def test_daytime(self):
        engine = ContextEngine(enabled=True, night_start=20, night_end=6)
        assert engine._is_night(_dt(12).timestamp()) is False

    def test_non_wrapping_window(self):
        engine = ContextEngine(enabled=True, night_start=22, night_end=23)
        assert engine._is_night(_dt(22).timestamp()) is True
        assert engine._is_night(_dt(12).timestamp()) is False

    def test_degenerate_all_night(self):
        engine = ContextEngine(enabled=True, night_start=0, night_end=0)
        assert engine._is_night(_dt(12).timestamp()) is True


class TestNightModule:
    def test_returns_bool(self):
        assert isinstance(is_night(_dt(3)), bool)


class TestNightWallClockNotVideoPosition:
    """Night must be derived from the real wall-clock timestamp, never the MP4
    playback position (which would turn 1.84s into 1970 epoch hour)."""

    def test_2200_is_night(self):
        engine = ContextEngine(enabled=True, night_start=20, night_end=6)
        assert engine._is_night(_dt(22).timestamp()) is True

    def test_1200_is_day(self):
        engine = ContextEngine(enabled=True, night_start=20, night_end=6)
        assert engine._is_night(_dt(12).timestamp()) is False

    def test_mp4_position_not_used_as_wall_clock(self):
        # occurredAt is a daytime wall-clock; video_time now=1.84s must not imply
        # 1970-01-01 05:30 (night). Daytime -> NIGHT_MOVEMENT does not fire.
        engine = ContextEngine(enabled=True, night_start=20, night_end=6)
        tr = [{"trackId": 1, "objectType": "PERSON", "referencePoint": {"x": 0.2, "y": 0.5}}]
        events = engine.update(tr, now=1.84, occurred_at=_dt(12).timestamp())
        events += engine.update(
            [{"trackId": 1, "objectType": "PERSON", "referencePoint": {"x": 0.5, "y": 0.5}}],
            now=2.04, occurred_at=_dt(12).timestamp(),
        )
        assert all(e["type"] != "NIGHT_MOVEMENT" for e in events)

    def test_1970_epoch_would_be_night_is_rejected_for_occurred_at(self):
        # Strictly: a real observation must never carry a 1970 occurredAt.
        engine = ContextEngine(enabled=True, night_start=20, night_end=6)
        events = engine.update(
            [{"trackId": 1, "objectType": "PERSON", "referencePoint": {"x": 0.2, "y": 0.5}}],
            now=1.84, occurred_at=_dt(22).timestamp(),
        )
        events += engine.update(
            [{"trackId": 1, "objectType": "PERSON", "referencePoint": {"x": 0.5, "y": 0.5}}],
            now=2.04, occurred_at=_dt(22).timestamp(),
        )
        for e in events:
            assert "1970-01-01" not in e["occurredAt"]
