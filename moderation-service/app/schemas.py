from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


class ModerationDecision(str, Enum):
    APPROVE = "approve"
    BLUR = "blur"
    REJECT = "reject"


class ModerationScores(BaseModel):
    nudity: float = Field(ge=0, le=1)
    violence: float = Field(ge=0, le=1)
    gore: float = Field(ge=0, le=1)
    weapons: float = Field(default=0.0, ge=0, le=1)
    sensitive: float = Field(ge=0, le=1)


class ImageModerationResponse(BaseModel):
    decision: ModerationDecision
    scores: ModerationScores
    reasons: list[str] = Field(default_factory=list)
    provider: str
    blurThreshold: float = Field(ge=0, le=1)
    rejectThreshold: float = Field(ge=0, le=1)
    processingMs: int = Field(ge=0)


class VideoFrameModerationResult(BaseModel):
    frameIndex: int = Field(ge=0)
    timestampSec: float = Field(ge=0)
    decision: ModerationDecision
    scores: ModerationScores
    reasons: list[str] = Field(default_factory=list)


class VideoModerationResponse(BaseModel):
    decision: ModerationDecision
    scores: ModerationScores
    reasons: list[str] = Field(default_factory=list)
    provider: str
    blurThreshold: float = Field(ge=0, le=1)
    rejectThreshold: float = Field(ge=0, le=1)
    scannedFrames: int = Field(ge=0)
    flaggedFrames: list[VideoFrameModerationResult] = Field(default_factory=list)
    processingMs: int = Field(ge=0)
