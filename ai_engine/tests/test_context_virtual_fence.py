"""Unit tests for virtual fence crossing and proximity."""

from context.virtual_fence import VirtualFenceManager

# Vertical fence: segment (0.5, 0.1) -> (0.5, 0.9).
FENCE_ZONE = {
    "zoneCode": "ZONE-08",
    "name": "Center Fence",
    "zoneType": "VIRTUAL_FENCE",
    "coordinates": [{"x": 0.50, "y": 0.10}, {"x": 0.50, "y": 0.90}],
    "enabled": True,
}


def _manager(threshold=0.05):
    return VirtualFenceManager.from_zones([FENCE_ZONE], proximity_threshold=threshold)


class TestCrossing:
    def test_left_to_right_crossing(self):
        mgr = _manager()
        # Prev on left, current on right -> crossing.
        cross = mgr.update(7, {"x": 0.45, "y": 0.5}, 0.0)
        assert cross == []
        cross = mgr.update(7, {"x": 0.55, "y": 0.5}, 0.1)
        assert len(cross) == 1
        assert cross[0]["fenceCode"] == "ZONE-08"

    def test_no_cross_if_stays_same_side(self):
        mgr = _manager()
        mgr.update(7, {"x": 0.45, "y": 0.5}, 0.0)
        cross = mgr.update(7, {"x": 0.46, "y": 0.5}, 0.1)
        assert cross == []

    def test_direction_labels(self):
        # Left side is negative, right positive (side_of_line sign).
        mgr = _manager()
        mgr.update(7, {"x": 0.40, "y": 0.5}, 0.0)
        c = mgr.update(7, {"x": 0.60, "y": 0.5}, 0.1)
        assert c[0]["direction"] in ("A_TO_B", "B_TO_A")


class TestProximity:
    def test_proximity_within_threshold_emits_once(self):
        mgr = _manager(threshold=0.05)
        # Point 0.02 away from the fence line.
        events = mgr.proximity_events(7, {"x": 0.52, "y": 0.5})
        assert len(events) == 1
        assert events[0]["fenceCode"] == "ZONE-08"
        assert events[0]["distance"] <= 0.05

    def test_proximity_dedup(self):
        mgr = _manager(threshold=0.05)
        near = {"x": 0.52, "y": 0.5}
        assert len(mgr.proximity_events(7, near)) == 1
        assert len(mgr.proximity_events(7, near)) == 0  # already emitted

    def test_proximity_handles_vertical_segment_distance(self):
        mgr = _manager(threshold=0.05)
        far = {"x": 0.95, "y": 0.5}
        assert mgr.proximity_events(7, far) == []


class TestFromZonesFiltering:
    def test_ignores_non_fence_and_disabled(self):
        zones = [
            FENCE_ZONE,
            {**FENCE_ZONE, "zoneCode": "IGNORED", "enabled": False},
        ]
        mgr = VirtualFenceManager.from_zones(zones)
        assert all(f != "IGNORED" for f in mgr.fences)
