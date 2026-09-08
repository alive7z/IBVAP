"""Virtual fence: crossing detection, crossing direction, and proximity.

A virtual fence is a configured line segment (from Node) in normalized
coordinates. Crossing is detected by checking whether the previous and current
reference points lie on opposite sides of the line AND the connecting segment
intersects the fence. Dedup is handled via per-track crossing state so a track
lingering near the fence does not repeatedly emit.
"""

from config import FENCE_PROXIMITY_THRESHOLD
from context.geometry import (
    Point,
    distance_point_to_segment,
    segments_intersect,
    side_of_line,
    validate_point,
)


class VirtualFence:
    def __init__(self, zone_code: str, name: str, segment: tuple[dict, dict]):
        self.zoneCode = zone_code
        self.name = name
        self.segment = segment

    @staticmethod
    def from_zone(zone: dict):
        """Build a VirtualFence from a VIRTUAL_FENCE zone config.

        The zone's coordinates are treated as a polyline; if it is a polygon
        (>=3 points) the fence line is taken from the first two vertices.
        """
        pts = zone.get("coordinates") or []
        if len(pts) < 2:
            return None
        return VirtualFence(
            zone_code=zone["zoneCode"],
            name=zone.get("name", ""),
            segment=(pts[0], pts[1]),
        )


class FenceState:
    """Per-track-zone fence crossing state."""

    def __init__(self, segment: tuple[dict, dict]):
        a, b = validate_point(segment[0]), validate_point(segment[1])
        self._a: Point = a
        self._b: Point = b
        self._last_side: float | None = None
        self._last_crossed_at: float | None = None
        self._prev_point: dict | None = None

    def _classify_side(self, point) -> float:
        try:
            return side_of_line(point, self._a, self._b)
        except ValueError:
            return 0.0

    def crossing_direction(self, point, now: float) -> dict | None:
        """detect a crossing using prev->current. Returns a direction label or None."""
        if self._prev_point is None:
            self._prev_point = dict(point)
            self._last_side = self._classify_side(point)
            return None

        current_side = self._classify_side(point)
        prev_side = self._last_side

        def _sign(v):
            if abs(v) < 1e-9:
                return 0
            return 1 if v > 0 else -1

        sp = _sign(prev_side)
        sc = _sign(current_side)

        crossed = False
        if sp != 0 and sc != 0 and sp != sc:
            crossed = segments_intersect(self._prev_point, point, self._a, self._b)
        elif sp == 0 or sc == 0:
            crossed = True  # landed exactly on the line

        self._prev_point = dict(point)
        self._last_side = current_side

        if not crossed:
            return None

        direction = "A_TO_B" if _sign(current_side) > _sign(prev_side) else "B_TO_A"
        self._last_crossed_at = now
        return {"direction": direction}

    def proximity(self, point) -> float:
        try:
            return distance_point_to_segment(point, self._a, self._b)
        except ValueError:
            return 1.0


class VirtualFenceManager:
    def __init__(self, fences: list[VirtualFence], proximity_threshold: float = FENCE_PROXIMITY_THRESHOLD):
        self._fences: list[VirtualFence] = fences or []
        self._threshold = proximity_threshold
        self._states: dict[int, dict[str, FenceState]] = {}

    @property
    def enabled(self) -> bool:
        return bool(self._fences)

    @property
    def fences(self) -> list[str]:
        return [f.zoneCode for f in self._fences]

    @property
    def fence_objects(self) -> list["VirtualFence"]:
        return list(self._fences)

    @staticmethod
    def from_zones(zones: list[dict], proximity_threshold: float = FENCE_PROXIMITY_THRESHOLD):
        fences = []
        for z in zones or []:
            if z.get("zoneType") != "VIRTUAL_FENCE" or z.get("enabled") is False:
                continue
            f = VirtualFence.from_zone(z)
            if f:
                fences.append(f)
        return VirtualFenceManager(fences, proximity_threshold)

    def _state(self, track_id: int, fence: VirtualFence) -> FenceState:
        per_track = self._states.setdefault(track_id, {})
        if fence.zoneCode not in per_track:
            per_track[fence.zoneCode] = FenceState(fence.segment)
        return per_track[fence.zoneCode]

    def update(self, track_id: int, point, now: float) -> list[dict]:
        """Feed one reference point. Returns crossing events:
        {'fenceCode','name','direction'} once per actual crossing."""
        try:
            validate_point(point)
        except ValueError:
            return []

        events = []
        for fence in self._fences:
            st = self._state(track_id, fence)
            crossed = st.crossing_direction(point, now)
            if crossed:
                events.append({
                    "fenceCode": fence.zoneCode,
                    "name": fence.name,
                    "direction": crossed["direction"],
                })
        return events

    def proximity_events(self, track_id: int, point) -> list[dict]:
        """Return proximity events for fences within threshold. Emits at most
        once per track+zone episode (state keyed by zone)."""
        try:
            validate_point(point)
        except ValueError:
            return []

        events = []
        for fence in self._fences:
            st = self._state(track_id, fence)
            dist = st.proximity(point)
            if dist <= self._threshold and not getattr(st, "_proximity_emitted", False):
                st._proximity_emitted = True
                events.append({
                    "fenceCode": fence.zoneCode,
                    "name": fence.name,
                    "distance": round(dist, 4),
                })
            elif dist > self._threshold:
                st._proximity_emitted = False
        return events

    def active_proximities(self, track_id: int, point) -> list[dict]:
        """Return current near-fence state without emitting a transition.

        FENCE_PROXIMITY is stored once as a context event, but risk temporal
        confirmation needs a current condition on every frame. This accessor
        deliberately does not touch the one-shot `_proximity_emitted` flag.
        """
        try:
            validate_point(point)
        except ValueError:
            return []

        active = []
        for fence in self._fences:
            dist = self._state(track_id, fence).proximity(point)
            if dist <= self._threshold:
                active.append({
                    "fenceCode": fence.zoneCode,
                    "name": fence.name,
                    "distance": round(dist, 4),
                })
        return active

    def remove_track(self, track_id: int) -> None:
        self._states.pop(track_id, None)
