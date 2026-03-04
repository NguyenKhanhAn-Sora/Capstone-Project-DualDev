from __future__ import annotations

import time
from io import BytesIO

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from PIL import Image

from app.core.rules import decide
from app.core.settings import Settings, get_settings
from app.providers.heuristic_provider import HeuristicImageModerationProvider
from app.schemas import ModerationScores, VideoFrameModerationResult, VideoModerationResponse
from app.services import ImageModerationService
from app.video_scan import extract_sampled_frames

router = APIRouter(prefix="/moderate", tags=["moderation"])

_ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
_ALLOWED_VIDEO_MIME_TYPES = {
    "video/mp4",
    "video/quicktime",
    "video/webm",
    "video/x-msvideo",
}


def get_service(settings: Settings = Depends(get_settings)) -> ImageModerationService:
    provider = HeuristicImageModerationProvider()
    return ImageModerationService(
        provider=provider,
        blur_threshold=settings.blur_threshold,
        reject_threshold=settings.reject_threshold,
        nudity_blur_threshold=settings.nudity_blur_threshold,
        nudity_reject_threshold=settings.nudity_reject_threshold,
        violence_blur_threshold=settings.violence_blur_threshold,
        violence_reject_threshold=settings.violence_reject_threshold,
        gore_blur_threshold=settings.gore_blur_threshold,
        gore_reject_threshold=settings.gore_reject_threshold,
        weapons_blur_threshold=settings.weapons_blur_threshold,
        weapons_reject_threshold=settings.weapons_reject_threshold,
    )


@router.post("/image")
async def moderate_image(
    file: UploadFile = File(...),
    settings: Settings = Depends(get_settings),
    service: ImageModerationService = Depends(get_service),
):
    if file.content_type not in _ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported image type: {file.content_type}",
        )

    image_bytes = await file.read()

    if not image_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Image file is empty",
        )

    if len(image_bytes) > settings.max_image_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Image exceeds limit {settings.max_image_bytes} bytes",
        )

    start = time.perf_counter()
    try:
        response = service.moderate(image_bytes=image_bytes, processing_ms=0)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not process image: {exc}",
        ) from exc

    elapsed_ms = int((time.perf_counter() - start) * 1000)
    response.processingMs = elapsed_ms
    return response


@router.post("/video")
async def moderate_video(
    file: UploadFile = File(...),
    settings: Settings = Depends(get_settings),
    service: ImageModerationService = Depends(get_service),
):
    if file.content_type not in _ALLOWED_VIDEO_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported video type: {file.content_type}",
        )

    video_bytes = await file.read()

    if not video_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Video file is empty",
        )

    if len(video_bytes) > settings.max_video_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Video exceeds limit {settings.max_video_bytes} bytes",
        )

    started_at = time.perf_counter()
    try:
        frames = extract_sampled_frames(
            video_bytes=video_bytes,
            sample_interval_sec=settings.video_sample_interval_sec,
            max_frames=settings.video_max_frames,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not decode video: {exc}",
        ) from exc

    if not frames:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No frames could be extracted from video",
        )

    max_scores = {
        "nudity": 0.0,
        "violence": 0.0,
        "gore": 0.0,
        "weapons": 0.0,
        "sensitive": 0.0,
    }
    flagged_frames: list[VideoFrameModerationResult] = []

    for frame_index, timestamp_sec, rgb_frame in frames:
        frame_image = Image.fromarray(rgb_frame)
        buffer = BytesIO()
        frame_image.save(buffer, format="JPEG", quality=90)

        frame_result = service.moderate(image_bytes=buffer.getvalue(), processing_ms=0)

        max_scores["nudity"] = max(max_scores["nudity"], frame_result.scores.nudity)
        max_scores["violence"] = max(max_scores["violence"], frame_result.scores.violence)
        max_scores["gore"] = max(max_scores["gore"], frame_result.scores.gore)
        max_scores["weapons"] = max(max_scores["weapons"], frame_result.scores.weapons)
        max_scores["sensitive"] = max(max_scores["sensitive"], frame_result.scores.sensitive)

        if frame_result.decision in {"blur", "reject"}:
            flagged_frames.append(
                VideoFrameModerationResult(
                    frameIndex=frame_index,
                    timestampSec=round(timestamp_sec, 3),
                    decision=frame_result.decision,
                    scores=frame_result.scores,
                    reasons=frame_result.reasons,
                )
            )

    aggregate_scores = ModerationScores(**max_scores)
    decision, reasons = decide(
        scores=aggregate_scores,
        blur_threshold=settings.blur_threshold,
        reject_threshold=settings.reject_threshold,
        nudity_blur_threshold=settings.nudity_blur_threshold,
        nudity_reject_threshold=settings.nudity_reject_threshold,
        violence_blur_threshold=settings.violence_blur_threshold,
        violence_reject_threshold=settings.violence_reject_threshold,
        gore_blur_threshold=settings.gore_blur_threshold,
        gore_reject_threshold=settings.gore_reject_threshold,
        weapons_blur_threshold=settings.weapons_blur_threshold,
        weapons_reject_threshold=settings.weapons_reject_threshold,
    )

    elapsed_ms = int((time.perf_counter() - started_at) * 1000)
    return VideoModerationResponse(
        decision=decision,
        scores=aggregate_scores,
        reasons=reasons,
        provider="heuristic-v2-video",
        blurThreshold=settings.blur_threshold,
        rejectThreshold=settings.reject_threshold,
        scannedFrames=len(frames),
        flaggedFrames=flagged_frames,
        processingMs=elapsed_ms,
    )
