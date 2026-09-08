import logging
import sys

from config import AI_SERVICE_NAME, LOG_LEVEL


def get_logger(name: str = "ai_engine") -> logging.Logger:
    logger = logging.getLogger(name)

    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        formatter = logging.Formatter(
            fmt=f"%(asctime)s | {AI_SERVICE_NAME} | %(name)s | %(levelname)s | %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
        handler.setFormatter(formatter)
        logger.addHandler(handler)

    logger.setLevel(getattr(logging, LOG_LEVEL.upper(), logging.INFO))
    return logger
