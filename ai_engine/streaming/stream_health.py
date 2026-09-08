import time
from enum import Enum
from threading import Lock

from utils.logger import get_logger
from utils.time import utc_iso

logger = get_logger("stream_health")


class StreamStatus(str, Enum):
    NOT_CONFIGURED = "NOT_CONFIGURED"
    CONNECTING = "CONNECTING"
    ONLINE = "ONLINE"
    DEGRADED = "DEGRADED"
    RECONNECTING = "RECONNECTING"
    OFFLINE = "OFFLINE"
    EOF = "EOF"
    ERROR = "ERROR"
    STOPPED = "STOPPED"


class StreamHealth:
    """Tracks video source health metrics."""

    def __init__(self):
        self._lock = Lock()
        self._status: StreamStatus = StreamStatus.NOT_CONFIGURED
        self._source_type: str | None = None
        self._source_fps: float = 0.0
        self._frames_received: int = 0
        self._frames_processed: int = 0
        self._frames_dropped: int = 0
        self._read_errors: int = 0
        self._last_frame_timestamp: str | None = None
        self._processing_fps: float | None = None
        self._average_latency_ms: float | None = None
        self._error_message: str | None = None
        self._start_time: float = time.time()
        self._latency_sum: float = 0.0
        self._latency_count: int = 0
        self._stream_session_id: str | None = None
        self._reconnect_attempts: int = 0
        self._last_heartbeat_at: str | None = None

    def set_status(self, status: StreamStatus, error: str | None = None) -> None:
        with self._lock:
            self._status = status
            self._error_message = error
            if status == StreamStatus.NOT_CONFIGURED:
                logger.info("Stream status: NOT_CONFIGURED")
            elif status == StreamStatus.ONLINE:
                logger.info("Stream status: ONLINE")
            elif status == StreamStatus.EOF:
                logger.info("Stream status: EOF")
            elif status == StreamStatus.CONNECTING:
                logger.info("Stream status: CONNECTING")
            elif status == StreamStatus.DEGRADED:
                logger.warning("Stream status: DEGRADED — %s", error or "stale/no fresh frames")
            elif status == StreamStatus.RECONNECTING:
                logger.warning("Stream status: RECONNECTING — %s", error or "connection lost")
            elif status == StreamStatus.OFFLINE:
                logger.warning("Stream status: OFFLINE — %s", error or "no connection")
            elif status == StreamStatus.ERROR:
                logger.error("Stream status: ERROR — %s", error)

    def set_source_info(self, source_type: str, fps: float) -> None:
        with self._lock:
            self._source_type = source_type
            self._source_fps = fps

    def set_session(self, stream_session_id: str | None) -> None:
        with self._lock:
            self._stream_session_id = stream_session_id

    def set_reconnect_attempts(self, attempts: int) -> None:
        with self._lock:
            self._reconnect_attempts = attempts

    def record_heartbeat(self) -> None:
        with self._lock:
            self._last_heartbeat_at = utc_iso()

    def record_frame_received(self) -> None:
        with self._lock:
            self._frames_received += 1
            self._last_frame_timestamp = utc_iso()

    def record_frame_processed(self, latency_ms: float) -> None:
        with self._lock:
            self._frames_processed += 1
            self._latency_sum += latency_ms
            self._latency_count += 1
            self._average_latency_ms = self._latency_sum / self._latency_count

            elapsed = time.time() - self._start_time
            if elapsed > 0:
                self._processing_fps = self._frames_processed / elapsed

    def record_frame_dropped(self) -> None:
        with self._lock:
            self._frames_dropped += 1

    def record_read_error(self, message: str | None = None) -> None:
        with self._lock:
            self._read_errors += 1
            if message:
                self._error_message = message

    def get_report(self) -> dict:
        with self._lock:
            return {
                "configured": self._status not in (StreamStatus.NOT_CONFIGURED,),
                "status": self._status.value,
                "sourceType": self._source_type,
                "fps": self._source_fps if self._source_fps > 0 else None,
                "framesReceived": self._frames_received,
                "framesProcessed": self._frames_processed,
                "framesDropped": self._frames_dropped,
                "readErrors": self._read_errors,
                "lastFrameTimestamp": self._last_frame_timestamp,
                "processingFps": round(self._processing_fps, 2) if self._processing_fps else None,
                "averageLatencyMs": round(self._average_latency_ms, 2) if self._average_latency_ms else None,
                "errorMessage": self._error_message,
                "streamSessionId": self._stream_session_id,
                "reconnectAttempts": self._reconnect_attempts,
                "lastHeartbeatAt": self._last_heartbeat_at,
            }

    def reset(self) -> None:
        with self._lock:
            self._status = StreamStatus.NOT_CONFIGURED
            self._source_type = None
            self._source_fps = 0.0
            self._frames_received = 0
            self._frames_processed = 0
            self._frames_dropped = 0
            self._read_errors = 0
            self._last_frame_timestamp = None
            self._processing_fps = None
            self._average_latency_ms = None
            self._error_message = None
            self._start_time = time.time()
            self._latency_sum = 0.0
            self._latency_count = 0
            self._stream_session_id = None
            self._reconnect_attempts = 0
            self._last_heartbeat_at = None
