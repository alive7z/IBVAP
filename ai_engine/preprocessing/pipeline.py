import numpy as np

from config import FRAME_HEIGHT, FRAME_WIDTH
from preprocessing.resize import resize_frame, validate_frame
from schemas.frame import Frame
from utils.logger import get_logger

logger = get_logger("preprocessing_pipeline")


def preprocess_frame(
    frame: Frame,
    target_width: int = FRAME_WIDTH,
    target_height: int = FRAME_HEIGHT,
) -> Frame | None:
    image = frame.image

    if not validate_frame(image):
        logger.warning("Invalid frame %s — skipping", frame.frame_id)
        return None

    resized = resize_frame(image, target_width, target_height, preserve_aspect=True)

    frame.image = resized
    frame.width = target_width
    frame.height = target_height
    return frame
