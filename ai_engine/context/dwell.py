"""Dwell duration bookkeeping for tracks and zones."""


class DwellTracker:
    """Tracks first-seen/last-seen and per-zone entered timestamps."""

    def __init__(self):
        self.first_seen = None
        self.last_seen = None
        self.zone_entered_at: dict[str, float] = {}

    def touch(self, now: float) -> None:
        if self.first_seen is None:
            self.first_seen = now
        self.last_seen = now

    def enter_zone(self, zone_code: str, now: float) -> None:
        if zone_code not in self.zone_entered_at:
            self.zone_entered_at[zone_code] = now

    def exit_zone(self, zone_code: str) -> None:
        self.zone_entered_at.pop(zone_code, None)

    def track_duration(self, now: float) -> float:
        if self.first_seen is None:
            return 0.0
        return max(0.0, now - self.first_seen)

    def zone_dwell(self, zone_code: str, now: float) -> float:
        entered = self.zone_entered_at.get(zone_code)
        if entered is None:
            return 0.0
        return max(0.0, now - entered)
