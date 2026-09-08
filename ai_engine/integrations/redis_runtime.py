"""Ephemeral camera runtime state reported to Redis (optional/degraded-by-design).

ONLY runtime health is written here — no raw frames, no stream credentials, no
MySQL data. If Redis is unavailable the writer logs a warning once and continues
without ever crashing the AI pipeline or corrupting MySQL.
"""
import json
import threading
import time

from config import (
    REDIS_CAMERA_STATUS_TTL_SECONDS,
    REDIS_KEY_PREFIX,
    REDIS_URL,
)
from utils.logger import get_logger
from utils.time import utc_iso

logger = get_logger("redis_runtime")


def _camera_key(camera_code: str) -> str:
    return f"{REDIS_KEY_PREFIX}:camera:{camera_code}:runtime"


class RedisRuntimeClient:
    """Best-effort Redis writer for camera runtime state.

    Lazily connects and never raises into the caller on Redis failure. Tests can
    inject `make_client=None` to simulate an unavailable backend.
    """

    def __init__(self, url: str = REDIS_URL, enabled: bool = True,
                 key_prefix: str = REDIS_KEY_PREFIX,
                 ttl_seconds: int = REDIS_CAMERA_STATUS_TTL_SECONDS):
        self._url = url
        self._enabled = enabled
        self._key_prefix = key_prefix
        self._ttl = ttl_seconds
        self._client = None
        self._available = False
        self._warned = False
        self._lock = threading.Lock()

    @property
    def enabled(self) -> bool:
        return self._enabled

    @property
    def available(self) -> bool:
        return self._available

    def _connect(self) -> bool:
        if self._client is not None:
            return self._available
        try:
            import redis  # local import: Redis is optional at runtime
            self._client = redis.Redis.from_url(self._url, socket_connect_timeout=2.0,
                                                socket_timeout=2.0)
            self._client.ping()
            self._available = True
            logger.info("Redis runtime client connected")
        except Exception as e:
            self._available = False
            if not self._warned:
                self._warned = True
                logger.warning("Redis unavailable — runtime status cache degraded: %s", e)
        return self._available

    def publish_camera_status(self, camera_code: str, payload: dict) -> bool:
        """Write/refresh a camera runtime status key with TTL. No-op when disabled."""
        if not self._enabled:
            return False
        if not self._connect():
            return False
        data = dict(payload)
        data["cameraCode"] = camera_code
        data["lastHeartbeatAt"] = data.get("lastHeartbeatAt") or utc_iso()
        data.pop("streamUrl", None)
        data.pop("password", None)
        try:
            key = f"{self._key_prefix}:camera:{camera_code}:runtime"
            self._client.setex(key, self._ttl, json.dumps(data))
            return True
        except Exception as e:
            self._available = False
            logger.warning("Redis write degraded: %s", e)
            return False

    def close(self) -> None:
        with self._lock:
            if self._client is not None:
                try:
                    self._client.close()
                except Exception:
                    pass
                self._client = None
            self._available = False


# Module-level default used by main.py; tests construct isolated instances.
_default = None


def get_default_runtime_client() -> "RedisRuntimeClient":
    global _default
    if _default is None:
        _default = RedisRuntimeClient()
    return _default
