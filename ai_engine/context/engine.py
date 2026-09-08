"""Context Intelligence Engine (Phase 9).

Consumes the CONFIRMED tracks produced by the tracker plus their bounded
trajectories and produces CONTEXT EVIDENCE (zone state, fence crossings,
proximity, direction, dwell, loitering, and night movement).

It NEVER computes risk and NEVER creates alerts. `risk` stays null at the
pipeline level.

Architecture focus: per-track bounded state, temporal confirmation for
transitions, and deduplication so transitions are emitted once.
"""

import datetime
import json
import time
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from config import (
    CONTEXT_ENABLED,
    CONTEXT_TZ,
    LOITERING_RADIUS,
    LOITERING_SECONDS,
    NIGHT_END_HOUR,
    NIGHT_START_HOUR,
    REPEATED_ENTRY_COUNT,
    REPEATED_ENTRY_WINDOW_SECONDS,
    ZONE_CONFIRM_FRAMES,
)
from context.direction import compute_direction
from context.dwell import DwellTracker
from context.loitering import LoiteringDetector
from context.movement import movement_speed
from context.night import is_night
from context.trajectory import Trajectory
from context.virtual_fence import VirtualFenceManager
from context.zones import RestrictedZoneManager
from utils.logger import get_logger

logger = get_logger("context_engine")

# Controlled allowlist of context types the engine may produce.
CONTEXT_TYPES = frozenset({
    "ZONE_ENTER",
    "ZONE_EXIT",
    "RESTRICTED_ZONE_ENTRY",
    "VIRTUAL_FENCE_CROSSING",
    "FENCE_PROXIMITY",
    "LOITERING",
    "NIGHT_MOVEMENT",
    "ZONE_PRESENCE",
})


class _TrackContext:
    def __init__(
        self,
        track_id: int,
        object_type: str,
        loitering_radius: float,
        loitering_seconds: float,
    ):
        self.track_id = track_id
        self.object_type = object_type
        self.trajectory = Trajectory()
        self.dwell = DwellTracker()
        self.loitering = LoiteringDetector(radius=loitering_radius, seconds=loitering_seconds)
        self.direction = None
        self.last_seen = 0.0
        self.active_zone_codes: set[str] = set()
        self.emitted: set[str] = set()
        self.night_movement_emitted = False
        self.loitering_duration = 0.0
        self.loitering_radius = 0.0
        self.last_reference_point: dict | None = None
        self.active_fence_proximities: dict[str, dict] = {}


class ContextEngine:
    def __init__(
        self,
        zone_config: dict | None = None,
        enabled: bool = CONTEXT_ENABLED,
        confirm_frames: int = ZONE_CONFIRM_FRAMES,
        night_start: int = NIGHT_START_HOUR,
        night_end: int = NIGHT_END_HOUR,
        loitering_seconds: float = LOITERING_SECONDS,
        repeated_count: int = REPEATED_ENTRY_COUNT,
        repeated_window: float = REPEATED_ENTRY_WINDOW_SECONDS,
    ):
        self._enabled = enabled
        self._confirm_frames = confirm_frames
        self._night_start = night_start
        self._night_end = night_end
        self._loitering_seconds = loitering_seconds
        self._repeated_count = repeated_count
        self._repeated_window = repeated_window
        self._tracks: dict[int, _TrackContext] = {}
        self._config_status = "NOT_CONFIGURED"
        self._zones: list[dict] = []
        self._fences: list[dict] = []
        self._zone_manager: RestrictedZoneManager | None = None
        self._fence_manager: VirtualFenceManager | None = None
        self._config_signature: str | None = None
        self._timeout_seconds = 30.0

        # Metrics.
        self._metrics = {
            "tracksEvaluated": 0,
            "zoneEntries": 0,
            "zoneExits": 0,
            "restrictedZoneEntries": 0,
            "fenceCrossings": 0,
            "fenceProximityEvents": 0,
            "loiteringEvents": 0,
            "nightMovementEvents": 0,
            "repeatedEntryEvents": 0,
            "contextObservationsGenerated": 0,
        }

        if zone_config:
            self.set_config(zone_config)

    # ---- Configuration from Node ----
    def set_config(self, zone_config: dict) -> None:
        """zone_config is the camera context config fetched from Node."""
        zones = zone_config.get("zones") or []
        enabled_zones = [z for z in zones if z.get("enabled") is not False]
        signature = json.dumps(enabled_zones, sort_keys=True, separators=(",", ":"))
        if signature == self._config_signature:
            logger.debug(
                "Context config unchanged: preserving %d live track state(s)",
                len(self._tracks),
            )
            return False

        if self._config_signature is not None and self._tracks:
            # Geometry really changed. Existing zone/fence membership cannot be
            # projected safely onto new coordinates; reset the context episode
            # explicitly instead of manufacturing transitions or re-entries.
            logger.info(
                "Context geometry changed: resetting %d live track state(s)",
                len(self._tracks),
            )
            self._tracks.clear()

        self._config_signature = signature
        self._zones = []
        self._fences = []
        self._zones = enabled_zones

        self._zone_manager = RestrictedZoneManager(enabled_zones, self._confirm_frames)
        self._fence_manager = VirtualFenceManager.from_zones(enabled_zones)

        if enabled_zones:
            self._config_status = "READY"
        else:
            self._config_status = "NO_ZONES"

        logger.info("Context config loaded: %d zones, %d fences", len(self._zones), len(self._fence_manager.fences))
        return True

    def mark_config_unavailable(self) -> None:
        self._config_status = "CONFIG_UNAVAILABLE"

    @property
    def config_status(self) -> str:
        return self._config_status

    @property
    def enabled(self) -> bool:
        return self._enabled and self._config_status != "CONFIG_UNAVAILABLE"

    def zones_loaded(self) -> int:
        return len(self._zones)

    def fences_loaded(self) -> int:
        return len(self._fence_manager.fences) if self._fence_manager else 0

    # ---- Overlays for development-only annotated video ----
    def zone_overlays(self) -> list[dict]:
        return [
            {"zoneCode": z["zoneCode"], "zoneType": z.get("zoneType"), "name": z.get("name"), "coordinates": z.get("coordinates", [])}
            for z in self._zones
        ]

    def fence_overlays(self) -> list[dict]:
        if not self._fence_manager:
            return []
        return [
            {"zoneCode": f.zoneCode, "name": f.name, "a": f.segment[0], "b": f.segment[1]}
            for f in self._fence_manager.fence_objects
        ]

    def trace_state(self, track_id: int) -> dict:
        """Debug snapshot of one track's live context state (gated by env)."""
        ctx = self._tracks.get(track_id)
        if not ctx:
            return {}
        return {
            "loiteringActive": ctx.loitering.is_active,
            "loiteringSeconds": ctx.loitering_duration,
            "loiteringRadius": ctx.loitering_radius,
            "nightMovementEmitted": ctx.night_movement_emitted,
            "activeZones": sorted(ctx.active_zone_codes),
            "emitted": sorted(ctx.emitted),
        }

    # ---- Helpers ----
    def _ctx(self, track_id: int, object_type: str) -> _TrackContext:
        if track_id not in self._tracks:
            self._tracks[track_id] = _TrackContext(
                track_id,
                object_type,
                loitering_radius=LOITERING_RADIUS,
                loitering_seconds=self._loitering_seconds,
            )
        return self._tracks[track_id]

    def _emit_key(self, track_id: int, key: str) -> bool:
        ctx = self._tracks.get(track_id)
        if not ctx:
            return False
        if key in ctx.emitted:
            return False
        ctx.emitted.add(key)
        return True

    # ---- Main update ----
    def update(self, confirmed_tracks: list[dict], now: float | None = None,
               occurred_at: float | None = None,
               source_timestamp_ms: int | None = None) -> list[dict]:
        """confirmed_tracks: list of {trackId, objectType, referencePoint, ...}.

        `now` is the monotonic evaluation timeline used for dwell/loitering/
        transition duration math. File runs pass video time; the live pipeline
        passes wall-clock epoch time so duration advances with real elapsed time.

        `occurred_at` is the real UTC epoch (seconds) at which the observation
        is being produced. It is used for `occurredAt` and for wall-clock-based
        night detection. Defaults to `time.time()`.

        `source_timestamp_ms` is the position inside the source video (ms),
        stored on every emitted observation. Defaults to 0.

        Returns a bounded list of NEW context events (dicts). Caller is
        responsible for generating observationIds and delivering to Node.
        """
        if not self._enabled:
            return []
        if self._config_status == "CONFIG_UNAVAILABLE":
            return []
        if now is None:
            now = time.time()
        if occurred_at is None:
            occurred_at = time.time()
        if source_timestamp_ms is None:
            source_timestamp_ms = 0

        events: list[dict] = []

        for tr in confirmed_tracks:
            track_id = tr["trackId"]
            point = tr.get("referencePoint")
            if not point:
                continue

            ctx = self._ctx(track_id, tr.get("objectType", "PERSON"))
            ctx.last_seen = now
            point = dict(point)
            point["timestamp"] = now
            ctx.last_reference_point = {"x": point["x"], "y": point["y"]}
            ctx.trajectory.add(point)
            ctx.dwell.touch(now)
            self._metrics["tracksEvaluated"] += 1

            # ---- Zone presence + transitions ----
            if self._zone_manager:
                transitions = self._zone_manager.update(track_id, point)
                for t in transitions:
                    zone_code = t["zoneCode"]
                    zone_type = t["zoneType"]
                    if t["transition"] == "ENTER":
                        ctx.dwell.enter_zone(zone_code, now)
                        ctx.active_zone_codes.add(zone_code)
                        self._metrics["zoneEntries"] += 1
                        if zone_type == "RESTRICTED":
                            self._metrics["restrictedZoneEntries"] += 1
                            if self._emit_key(track_id, f"RESTRICTED_ZONE_ENTRY:{zone_code}"):
                                events.append(self._event("RESTRICTED_ZONE_ENTRY", track_id, point, occurred_at, source_timestamp_ms, {
                                    "zoneCode": zone_code,
                                    "zoneType": zone_type,
                                    "direction": self._current_direction(ctx),
                                    "dwellSeconds": 0,
                                }))
                        else:
                            if self._emit_key(track_id, f"ZONE_ENTER:{zone_code}"):
                                events.append(self._event("ZONE_ENTER", track_id, point, occurred_at, source_timestamp_ms, {
                                    "zoneCode": zone_code,
                                    "zoneType": zone_type,
                                    "direction": self._current_direction(ctx),
                                }))
                    elif t["transition"] == "EXIT":
                        dwell_seconds = round(ctx.dwell.zone_dwell(zone_code, now), 2)
                        ctx.dwell.exit_zone(zone_code)
                        ctx.active_zone_codes.discard(zone_code)
                        self._metrics["zoneExits"] += 1
                        if self._emit_key(track_id, f"ZONE_EXIT:{zone_code}"):
                            events.append(self._event("ZONE_EXIT", track_id, point, occurred_at, source_timestamp_ms, {
                                "zoneCode": zone_code,
                                "zoneType": zone_type,
                                "dwellSeconds": dwell_seconds,
                            }))

            # ---- Virtual fence crossing + proximity ----
            if self._fence_manager:
                for cross in self._fence_manager.update(track_id, point, now):
                    self._metrics["fenceCrossings"] += 1
                    if self._emit_key(track_id, f"VIRTUAL_FENCE_CROSSING:{cross['fenceCode']}_{cross['direction']}"):
                        events.append(self._event("VIRTUAL_FENCE_CROSSING", track_id, point, occurred_at, source_timestamp_ms, {
                            "fenceCode": cross["fenceCode"],
                            "direction": cross["direction"],
                        }))
                for prox in self._fence_manager.proximity_events(track_id, point):
                    self._metrics["fenceProximityEvents"] += 1
                    if self._emit_key(track_id, f"FENCE_PROXIMITY:{prox['fenceCode']}"):
                        events.append(self._event("FENCE_PROXIMITY", track_id, point, occurred_at, source_timestamp_ms, {
                            "fenceCode": prox["fenceCode"],
                            "distance": prox["distance"],
                        }))
                ctx.active_fence_proximities = {
                    prox["fenceCode"]: prox
                    for prox in self._fence_manager.active_proximities(track_id, point)
                }
            else:
                ctx.active_fence_proximities = {}

            # ---- Dwell / loitering ----
            was_loitering = ctx.loitering.is_active
            loitering_started = ctx.loitering.detect(point, now)
            if was_loitering and not ctx.loitering.is_active:
                # A later genuine episode may emit one new context transition.
                ctx.emitted.discard("LOITERING")
            if ctx.loitering.is_active:
                duration = ctx.loitering.current_duration(now)
                ctx.loitering_duration = round(duration, 2)
                ctx.loitering_radius = ctx.loitering.current_radius()
            else:
                ctx.loitering_duration = 0.0
                ctx.loitering_radius = 0.0

            if loitering_started:
                self._metrics["loiteringEvents"] += 1
                if self._emit_key(track_id, "LOITERING"):
                    events.append(self._event("LOITERING", track_id, point, occurred_at, source_timestamp_ms, {
                        "durationSeconds": ctx.loitering_duration,
                        "radius": ctx.loitering_radius,
                    }))

            # ---- Direction + movement (for metadata + night movement) ----
            ctx.direction = compute_direction(ctx.trajectory.points())
            speed = movement_speed(ctx.trajectory.points(), seconds=max(0.1, now - ctx.dwell.first_seen))

            # Night detection uses the real wall-clock epoch (occurred_at), NOT
            # the MP4 playback position, so we never derive clock hour from
            # video position (which would falsely classify a daytime clip).
            night = self._is_night(occurred_at)
            if night and speed["moving"] and not ctx.night_movement_emitted:
                ctx.night_movement_emitted = True
                self._metrics["nightMovementEvents"] += 1
                if self._emit_key(track_id, "NIGHT_MOVEMENT"):
                    events.append(self._event("NIGHT_MOVEMENT", track_id, point, occurred_at, source_timestamp_ms, {
                        "direction": ctx.direction["label"] if ctx.direction else "STATIONARY",
                        "normalizedUnitsPerSecond": speed["normalizedUnitsPerSecond"],
                    }))

        self._cleanup(now)
        self._metrics["contextObservationsGenerated"] += len(events)
        return events

    # ---- Night ----
    def _is_night(self, now: float) -> bool:
        try:
            tz = ZoneInfo(CONTEXT_TZ)
        except ZoneInfoNotFoundError:
            tz = ZoneInfo("UTC")
        dt = datetime.datetime.fromtimestamp(now, tz)
        hour = dt.hour
        start, end = self._night_start, self._night_end
        if start == end:
            return True
        if start < end:
            return start <= hour < end
        return hour >= start or hour < end

    def _current_direction(self, ctx) -> str:
        return ctx.direction["label"] if ctx.direction and ctx.direction.get("label") else "STATIONARY"

    def loitering_evidence(self, track_id: int) -> dict | None:
        """Return current internal LOITERING evidence without emitting an event."""
        ctx = self._tracks.get(track_id)
        if not ctx or not ctx.loitering.is_active:
            return None
        return {
            "type": "LOITERING",
            "trackId": track_id,
            "objectType": ctx.object_type,
            "metadata": {
                "durationSeconds": ctx.loitering_duration,
                "radius": ctx.loitering_radius,
            },
        }

    def active_risk_evidence(self, track_id: int) -> list[dict]:
        """Current sustained risk conditions for one continuous track.

        These values feed RiskEngine each frame but do not create duplicate
        context rows. Instantaneous conditions such as a fence crossing remain
        in InferenceWorker's bounded recent-evidence buffer instead.
        """
        ctx = self._tracks.get(track_id)
        if not ctx:
            return []

        evidence: list[dict] = []
        loitering = self.loitering_evidence(track_id)
        if loitering:
            evidence.append(loitering)

        zone_types = {
            z.get("zoneCode"): z.get("zoneType")
            for z in self._zones
        }
        for zone_code in sorted(ctx.active_zone_codes):
            if zone_types.get(zone_code) != "RESTRICTED":
                continue
            evidence.append({
                "type": "RESTRICTED_ZONE_ENTRY",
                "trackId": track_id,
                "objectType": ctx.object_type,
                "metadata": {
                    "zoneCode": zone_code,
                    "zoneType": "RESTRICTED",
                    "dwellSeconds": round(ctx.dwell.zone_dwell(zone_code, ctx.last_seen), 2),
                },
            })

        for fence_code, prox in sorted(ctx.active_fence_proximities.items()):
            evidence.append({
                "type": "FENCE_PROXIMITY",
                "trackId": track_id,
                "objectType": ctx.object_type,
                "metadata": {
                    "fenceCode": fence_code,
                    "distance": prox["distance"],
                },
            })
        return evidence

    # ---- Event builder ----
    def _event(self, ctype: str, track_id: int, point: dict, occurred_at: float, source_timestamp_ms: int, metadata: dict) -> dict:
        occurred = datetime.datetime.fromtimestamp(occurred_at, datetime.timezone.utc).isoformat().replace("+00:00", "Z")
        ev = {
            "type": ctype,
            "trackId": track_id,
            "objectType": self._tracks[track_id].object_type,
            "occurredAt": occurred,
            "sourceTimestampMs": source_timestamp_ms,
            "metadata": metadata,
            "referencePoint": {"x": round(point["x"], 4), "y": round(point["y"], 4)},
        }
        return ev

    # ---- Cleanup of lost/expired tracks ----
    def _cleanup(self, now: float) -> None:
        stale = [tid for tid, ctx in self._tracks.items() if now - ctx.last_seen > self._timeout_seconds]
        for tid in stale:
            self._remove_track(tid)

    def _remove_track(self, tid: int) -> None:
        self._tracks.pop(tid, None)
        if self._zone_manager:
            self._zone_manager.remove_track(tid)
        if self._fence_manager:
            self._fence_manager.remove_track(tid)

    # ---- Metrics ----
    def snapshot_metrics(self) -> dict:
        return {
            **self._metrics,
            "zonesLoaded": self.zones_loaded(),
            "fencesLoaded": self.fences_loaded(),
        }

    def reset(self) -> None:
        self._tracks.clear()
        # Zone/fence managers also own per-track membership/side state. Numeric
        # ByteTrack IDs are session-local, so retaining these maps across a
        # reconnect would leak old context into a new stream session.
        self._zone_manager = RestrictedZoneManager(self._zones, self._confirm_frames)
        self._fence_manager = VirtualFenceManager.from_zones(self._zones)

