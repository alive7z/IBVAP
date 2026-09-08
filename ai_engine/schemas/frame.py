from dataclasses import dataclass, field
import numpy as np


@dataclass
class Frame:
    frame_id: str
    source_id: str
    frame_index: int
    captured_at: float
    source_timestamp_ms: float
    width: int
    height: int
    image: np.ndarray = field(repr=False)
    video_time: float = 0.0

    def to_dict(self) -> dict:
        return {
            "frame_id": self.frame_id,
            "source_id": self.source_id,
            "frame_index": self.frame_index,
            "captured_at": self.captured_at,
            "source_timestamp_ms": self.source_timestamp_ms,
            "width": self.width,
            "height": self.height,
            "video_time": self.video_time,
        }
