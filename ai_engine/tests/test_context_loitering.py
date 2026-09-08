"""Unit tests for direction classification, dwell, and loitering."""

import pytest

from context.direction import compute_direction
from context.dwell import DwellTracker
from context.loitering import LoiteringDetector
from context.movement import movement_speed, is_stationary


class TestDirection:
    def test_stationary_when_no_points(self):
        assert compute_direction([])["label"] == "STATIONARY"

    def test_single_point_stationary(self):
        assert compute_direction([{"x": 0.5, "y": 0.5}])["label"] == "STATIONARY"

    def test_moving_right(self):
        pts = [{"x": 0.1, "y": 0.5}, {"x": 0.3, "y": 0.5}, {"x": 0.5, "y": 0.5}]
        assert compute_direction(pts)["label"] == "RIGHT"

    def test_moving_up(self):
        pts = [{"x": 0.5, "y": 0.8}, {"x": 0.5, "y": 0.6}, {"x": 0.5, "y": 0.4}]
        assert compute_direction(pts)["label"] == "UP"

    def test_generic_labels_not_compass(self):
        labels = {
            compute_direction([{"x": 0.1, "y": 0.5}, {"x": 0.9, "y": 0.5}])["label"],
            compute_direction([{"x": 0.5, "y": 0.1}, {"x": 0.5, "y": 0.9}])["label"],
        }
        assert not labels & {"NORTH", "SOUTH", "EAST", "WEST"}


class TestMovement:
    def test_stationary_small_disp(self):
        pts = [{"x": 0.5, "y": 0.5}, {"x": 0.5001, "y": 0.5}, {"x": 0.5, "y": 0.5}]
        assert is_stationary(pts, min_displacement=0.01) is True

    def test_moving_speed_normalized(self):
        pts = [{"x": 0.1, "y": 0.5}, {"x": 0.3, "y": 0.5}, {"x": 0.5, "y": 0.5}]
        r = movement_speed(pts, seconds=1.0, min_displacement=0.01)
        assert r["moving"] is True
        assert r["normalizedUnitsPerSecond"] > 0
        # No physical units (no camera calibration).
        assert "km/h" not in r and "m/s" not in r


class TestDwell:
    def test_track_duration(self):
        d = DwellTracker()
        d.touch(100.0)
        d.touch(105.0)
        assert d.track_duration(105.0) == pytest.approx(5.0)

    def test_zone_dwell(self):
        d = DwellTracker()
        d.touch(0.0)
        d.enter_zone("ZONE-07", 10.0)
        assert d.zone_dwell("ZONE-07", 30.0) == pytest.approx(20.0)
        d.exit_zone("ZONE-07")
        assert d.zone_dwell("ZONE-07", 40.0) == 0.0


class TestLoitering:
    def test_emits_after_duration_within_radius(self):
        det = LoiteringDetector(radius=0.05, seconds=5.0)
        point = {"x": 0.53, "y": 0.98, "timestamp": 0.0}
        assert det.detect(point, 0.0) is False
        assert det.detect(point, 1.0) is False
        assert det.detect(point, 6.0) is True  # >= 5s, within radius

    def test_resets_when_leaves_radius(self):
        det = LoiteringDetector(radius=0.05, seconds=5.0)
        det.detect({"x": 0.53, "y": 0.98, "timestamp": 0.0}, 0.0)
        # Strays outside radius -> re-anchor, no emit.
        assert det.detect({"x": 0.8, "y": 0.5, "timestamp": 1.0}, 1.0) is False
        assert det.detect({"x": 0.8, "y": 0.5, "timestamp": 2.0}, 2.0) is False

    def test_preserves_continuous_duration_after_emit(self):
        det = LoiteringDetector(radius=0.05, seconds=5.0)
        p = {"x": 0.53, "y": 0.98, "timestamp": 0.0}
        det.detect(p, 0.0)
        assert det.detect(p, 6.0) is True
        assert det.is_active is True
        assert det.current_duration(7.0) == pytest.approx(7.0)
        # Remains active but does NOT re-emit every frame.
        assert det.detect(p, 7.0) is False

    def test_active_episode_ends_and_duration_resets_outside_radius(self):
        det = LoiteringDetector(radius=0.05, seconds=5.0)
        p = {"x": 0.53, "y": 0.98, "timestamp": 0.0}
        det.detect(p, 0.0)
        assert det.detect(p, 5.0) is True
        assert det.detect({"x": 0.8, "y": 0.5}, 6.0) is False
        assert det.is_active is False
        assert det.current_duration(6.0) == 0.0
