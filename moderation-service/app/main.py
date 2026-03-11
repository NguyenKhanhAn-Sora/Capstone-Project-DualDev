from __future__ import annotations

from fastapi import FastAPI

from app.api.routes import router as moderation_router
from app.core.settings import get_settings

settings = get_settings()

app = FastAPI(title=settings.app_name)
app.include_router(moderation_router)


@app.get("/health", tags=["system"])
def health() -> dict[str, str]:
    return {"status": "ok", "environment": settings.environment}
