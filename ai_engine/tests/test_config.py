import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import AI_HOST, AI_PORT, AI_SERVICE_NAME, FRAME_BUFFER_SIZE, FRAME_HEIGHT, FRAME_SAMPLE_FPS, FRAME_WIDTH, NODE_API_URL, VIDEO_SOURCE


def test_config_loads():
    assert AI_HOST
    assert isinstance(AI_PORT, int)
    assert AI_PORT > 0
    assert AI_SERVICE_NAME == "IBVAP-AI"


def test_frame_config():
    assert FRAME_SAMPLE_FPS > 0
    assert FRAME_WIDTH > 0
    assert FRAME_HEIGHT > 0
    assert FRAME_BUFFER_SIZE > 0


def test_node_url():
    assert NODE_API_URL.startswith("http")


def test_video_source_default():
    assert isinstance(VIDEO_SOURCE, str)
