from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "cordigram-moderation-service"
    environment: str = "development"

    blur_threshold: float = Field(default=0.45, ge=0.0, le=1.0)
    reject_threshold: float = Field(default=0.80, ge=0.0, le=1.0)
    reject_margin: float = Field(default=0.08, ge=0.0, le=0.25)
    uncertainty_margin: float = Field(default=0.06, ge=0.0, le=0.25)
    hard_reject_single_label_threshold: float = Field(default=0.94, ge=0.0, le=1.0)
    nudity_blur_threshold: float = Field(default=0.975, ge=0.0, le=1.0)
    nudity_reject_threshold: float = Field(default=0.999, ge=0.0, le=1.0)
    violence_blur_threshold: float = Field(default=0.55, ge=0.0, le=1.0)
    violence_reject_threshold: float = Field(default=0.82, ge=0.0, le=1.0)
    gore_blur_threshold: float = Field(default=0.5, ge=0.0, le=1.0)
    gore_reject_threshold: float = Field(default=0.78, ge=0.0, le=1.0)
    weapons_blur_threshold: float = Field(default=0.50, ge=0.0, le=1.0)
    weapons_reject_threshold: float = Field(default=0.76, ge=0.0, le=1.0)

    max_image_bytes: int = 15 * 1024 * 1024
    max_video_bytes: int = 100 * 1024 * 1024
    video_sample_interval_sec: float = Field(default=2.0, gt=0.1)
    video_max_frames: int = Field(default=60, ge=1)

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
