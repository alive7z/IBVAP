"""Live-stream connection recovery: bounded exponential backoff + stream sessions.

A "stream session" identifies one continuous decoded stream. Whenever a live
source reconnects after a failure, a NEW streamSessionId is minted so downstream
per-track state (ByteTrack, context, risk, ANPR, face) is never carried across an
unrelated session as though the same physical objects were present.
"""
import time
import uuid

from utils.logger import get_logger

logger = get_logger("reconnect")


def should_rebuild_after_no_frame(
    consecutive_failures: int,
    max_consecutive_failures: int,
    seconds_since_last_frame: float,
    tolerance_seconds: float,
) -> bool:
    """Return True only for a sustained decoded-frame outage.

    OpenCV/FFmpeg may return False several times in a tight burst during a
    temporary RTSP packet gap. Requiring a real elapsed-time gap prevents those
    sub-second bursts from minting a new stream session while still rebuilding
    a genuinely stalled/dead reader promptly.
    """
    return (
        consecutive_failures >= max(1, max_consecutive_failures)
        and seconds_since_last_frame >= max(0.0, tolerance_seconds)
    )


class ReconnectPolicy:
    """Bounded exponential backoff.

    Delays grow 1s, 2s, 4s, ... up to STREAM_RECONNECT_MAX_SECONDS, then stay at
    the cap. After a successful (re)connection the counter/backoff is reset.
    """

    def __init__(self, base_seconds: float = 1.0, max_seconds: float = 30.0, factor: float = 2.0):
        if base_seconds <= 0:
            raise ValueError("base_seconds must be > 0")
        if max_seconds < base_seconds:
            raise ValueError("max_seconds must be >= base_seconds")
        self._base = float(base_seconds)
        self._max = float(max_seconds)
        self._factor = float(factor)
        self._attempts = 0

    def current_delay(self) -> float:
        if self._attempts <= 0:
            return 0.0
        return min(self._base * (self._factor ** (self._attempts - 1)), self._max)

    @property
    def attempts(self) -> int:
        return self._attempts

    def next_delay(self) -> float:
        """Record one failed attempt and return the delay before retrying."""
        self._attempts += 1
        return self.current_delay()

    def record_success(self) -> None:
        """Reset backoff after a successful connection."""
        self._attempts = 0

    def reset(self) -> None:
        self._attempts = 0

    def to_dict(self) -> dict:
        return {
            "attempts": self._attempts,
            "currentDelaySeconds": round(self.current_delay(), 2),
            "maxDelaySeconds": self._max,
            "baseDelaySeconds": self._base,
        }


def new_stream_session_id() -> str:
    """Short unique id for one decoded stream session."""
    return uuid.uuid4().hex[:12]


class ReconnectController:
    """Coordinates connect -> degrade -> reconnect transitions for one source.

    The caller drives read()/reconnect(); this helper tracks backoff and session
    lifecycle so the reconnect loop never spins in a tight loop.
    """

    def __init__(self, policy: ReconnectPolicy | None = None,
                 max_delay_seconds: float = 30.0) -> None:
        self._policy = policy or ReconnectPolicy(max_seconds=max_delay_seconds)
        self._session_id: str | None = None
        self._last_session_id: str | None = None
        self._active = True

    @property
    def policy(self) -> ReconnectPolicy:
        return self._policy

    @property
    def session_id(self) -> str | None:
        return self._session_id

    @property
    def last_session_id(self) -> str | None:
        return self._last_session_id

    @property
    def active(self) -> bool:
        return self._active

    def begin_session(self) -> str:
        """Mint a new stream session (used on (re)connect). Returns the id."""
        self._last_session_id = self._session_id
        self._session_id = new_stream_session_id()
        self._policy.record_success()
        return self._session_id

    def session_changed(self) -> bool:
        """True when the current session differs from the previous one (reconnect)."""
        return (
            self._session_id is not None
            and self._last_session_id is not None
            and self._session_id != self._last_session_id
        )

    def on_failure(self) -> float:
        """Record a failure and return how long to wait before retrying (seconds)."""
        return self._policy.next_delay()

    def stop(self) -> None:
        self._active = False

    def to_dict(self) -> dict:
        return {
            "sessionId": self._session_id,
            "lastSessionId": self._last_session_id,
            "sessionChanged": self.session_changed(),
            "active": self._active,
            "backoff": self._policy.to_dict(),
        }
