"""Zone presence and entry/exit state with temporal confirmation.

Zone config is passed in from Node (never read from MySQL by Python). Each
zone is {zoneCode, name, zoneType, riskLevel, coordinates:[{x,y},...], enabled}.

State is maintained per track to avoid emitting an event every frame.
"""

from config import ZONE_CONFIRM_FRAMES
from context.geometry import point_in_polygon, validate_point


class ZoneState:
    """Per-track-zone transition state with jitter confirmation."""

    def __init__(self, confirm_frames: int = ZONE_CONFIRM_FRAMES):
        self._confirm_frames = confirm_frames
        self._currently_inside = False
        self._guess_inside = None
        self._guess_count = 0
        self._entered_once = False

    @property
    def inside(self) -> bool:
        return self._currently_inside

    def submit(self, inside: bool) -> str | None:
        """Feed the current membership. Returns a transition key:
        'ENTER' if outside->inside confirmed, 'EXIT' if inside->outside
        confirmed, else None."""
        if self._guess_inside is None:
            self._guess_inside = inside
            self._guess_count = 1
        elif self._guess_inside == inside:
            self._guess_count += 1
        else:
            self._guess_inside = inside
            self._guess_count = 1

        transition = None
        if self._guess_count >= self._confirm_frames:
            if inside and not self._currently_inside:
                self._currently_inside = True
                self._entered_once = True
                transition = "ENTER"
            elif not inside and self._currently_inside:
                self._currently_inside = False
                transition = "EXIT"
            # Keep guess state aligned with confirmed state.
            self._guess_count = 0
            self._guess_inside = self._currently_inside

        return transition


class ZoneManager:
    def __init__(self, zones: list[dict], confirm_frames: int = ZONE_CONFIRM_FRAMES):
        self._confirm_frames = confirm_frames
        self._polygons: dict[str, list] = {}
        for z in zones or []:
            if z.get("enabled") is False:
                continue
            # A virtual fence is a line/polyline, not an enterable polygon.
            # Treating a 3+ point fence as a zone fabricates ZONE_ENTER/EXIT
            # transitions and can falsely satisfy REPEATED_ENTRY.
            if z.get("zoneType") == "VIRTUAL_FENCE":
                continue
            pts = z.get("coordinates") or []
            if len(pts) < 3:
                continue
            self._polygons[z["zoneCode"]] = pts
        self._states: dict[int, dict[str, ZoneState]] = {}

    @property
    def enabled(self) -> bool:
        return bool(self._polygons)

    @property
    def zones(self) -> list[str]:
        return list(self._polygons)

    def _state(self, track_id: int, zone_code: str) -> ZoneState:
        per_track = self._states.setdefault(track_id, {})
        if zone_code not in per_track:
            per_track[zone_code] = ZoneState(self._confirm_frames)
        return per_track[zone_code]

    def _inside(self, zone_code: str, point) -> bool:
        try:
            return point_in_polygon(point, self._polygons[zone_code])
        except ValueError:
            return False

    def update(self, track_id: int, point) -> list[dict]:
        """Feed one reference point for a track. Returns zone transitions.

        Each transition dict: {'zoneCode','zoneType','transition','inside'}
        transition in {'ENTER','EXIT'}.
        """
        try:
            validate_point(point)
        except ValueError:
            return []

        events = []
        for zone_code in self._polygons:
            inside = self._inside(zone_code, point)
            transition = self._state(track_id, zone_code).submit(inside)
            if transition:
                events.append({
                    "zoneCode": zone_code,
                    "transition": transition,
                    "inside": inside,
                })
        return events

    def contain_zones(self, point) -> list[str]:
        """Zones whose polygon contains the point (membership, no state)."""
        result = []
        for zone_code in self._polygons:
            if self._inside(zone_code, point):
                result.append(zone_code)
        return result

    def get_zone(self, zone_code: str) -> dict | None:
        if zone_code not in self._polygons:
            return None
        return {"zoneCode": zone_code, "coordinates": self._polygons[zone_code]}

    def remove_track(self, track_id: int) -> None:
        self._states.pop(track_id, None)


class RestrictedZoneManager(ZoneManager):
    """ZoneManager that attaches zoneType/riskLevel from the original config."""

    def __init__(self, zones: list[dict], confirm_frames: int = ZONE_CONFIRM_FRAMES):
        super().__init__(zones, confirm_frames)
        self._meta: dict[str, dict] = {}
        for z in zones or []:
            if z.get("enabled") is False:
                continue
            if z.get("zoneType") == "VIRTUAL_FENCE":
                continue
            pts = z.get("coordinates") or []
            if len(pts) < 3:
                continue
            self._meta[z["zoneCode"]] = {
                "zoneType": z.get("zoneType", "MONITORING"),
                "riskLevel": z.get("riskLevel", "LOW"),
                "name": z.get("name", ""),
            }

    def update(self, track_id: int, point) -> list[dict]:
        events = super().update(track_id, point)
        for ev in events:
            meta = self._meta.get(ev["zoneCode"], {})
            ev["zoneType"] = meta.get("zoneType", "MONITORING")
            ev["riskLevel"] = meta.get("riskLevel", "LOW")
        return events
