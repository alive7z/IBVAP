import time

from schemas.frame import Frame
from utils.logger import get_logger
from utils.time import ms_now

logger = get_logger("frame_sampler")


class FrameSampler:
    """Selects frames from a video source at a configured sampling rate."""

    def __init__(self, source_fps: float, target_fps: float, source_id: str = "VIDEO_FILE", index_based: bool = False):
        self._source_fps = source_fps
        self._target_fps = target_fps
        self._source_id = source_id
        self._index_based = index_based

        if source_fps <= 0:
            self._interval = 0.0
        else:
            self._interval = 1.0 / target_fps

        # For index-based (file) sampling, skip every Nth frame so the output
        # rate tracks source_fps -> target_fps regardless of processing speed.
        if index_based and source_fps > 0 and target_fps > 0 and target_fps < source_fps:
            self._stride = max(1, int(round(source_fps / target_fps)))
        else:
            self._stride = 1

        self._last_sample_time: float = 0.0
        self._frame_index: int = 0
        self._sampled_count: int = 0
        self._skipped_count: int = 0

        logger.info(
            "Sampler created: source=%.1f fps, target=%.1f fps, interval=%.3f s, index_based=%s, stride=%d",
            source_fps,
            target_fps,
            self._interval,
            index_based,
            self._stride,
        )

    def should_sample(self) -> bool:
        if self._source_fps <= 0:
            return True

        if self._index_based:
            # Deterministic: sample the 1st frame of every stride window.
            return ((self._frame_index - 1) % self._stride) == 0

        now = time.monotonic()
        elapsed = now - self._last_sample_time

        if elapsed >= self._interval:
            self._last_sample_time = now
            return True

        return False

    def process_frame(self, image) -> Frame | None:
        self._frame_index += 1

        if not self.should_sample():
            self._skipped_count += 1
            return None

        self._sampled_count += 1
        h, w = image.shape[:2]
        video_time = self._frame_index / self._source_fps if self._source_fps > 0 else 0.0

        return Frame(
            frame_id=f"{self._source_id}_{self._frame_index:08d}",
            source_id=self._source_id,
            frame_index=self._frame_index,
            captured_at=time.time(),
            # For local video files (index-based) sourceTimestampMs is the
            # position in the video (ms). For live/time-based sources it is
            # wall-clock ms. These are intentionally separate time domains.
            source_timestamp_ms=(
                round(video_time * 1000) if self._index_based else int(ms_now())
            ),
            width=w,
            height=h,
            image=image,
            video_time=video_time,
        )

    @property
    def frame_index(self) -> int:
        return self._frame_index

    @property
    def sampled_count(self) -> int:
        return self._sampled_count

    @property
    def skipped_count(self) -> int:
        return self._skipped_count

    def get_stats(self) -> dict:
        return {
            "sourceFps": self._source_fps,
            "targetFps": self._target_fps,
            "framesReceived": self._frame_index,
            "framesSampled": self._sampled_count,
            "framesSkipped": self._skipped_count,
        }
