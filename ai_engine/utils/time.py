import time
from datetime import datetime, timezone


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def utc_iso() -> str:
    return utc_now().isoformat()


def ms_now() -> float:
    return time.time() * 1000


def elapsed_ms(start: float) -> float:
    return (time.time() - start) * 1000
