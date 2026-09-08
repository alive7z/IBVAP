import time

from fastapi import FastAPI

from api.routes import router
from config import AI_SERVICE_NAME

app = FastAPI(title=AI_SERVICE_NAME, docs_url="/docs")
app.include_router(router, prefix="")


def create_app() -> FastAPI:
    return app
