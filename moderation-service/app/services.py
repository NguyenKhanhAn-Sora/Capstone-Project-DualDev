from __future__ import annotations

from app.core.rules import decide
from app.providers.base import ImageModerationProvider
from app.schemas import ImageModerationResponse, ModerationScores


class ImageModerationService:
    def __init__(
        self,
        provider: ImageModerationProvider,
        blur_threshold: float,
        reject_threshold: float,
        reject_margin: float,
        uncertainty_margin: float,
        hard_reject_single_label_threshold: float,
        nudity_blur_threshold: float,
        nudity_reject_threshold: float,
        violence_blur_threshold: float,
        violence_reject_threshold: float,
        gore_blur_threshold: float,
        gore_reject_threshold: float,
        weapons_blur_threshold: float,
        weapons_reject_threshold: float,
    ) -> None:
        self._provider = provider
        self._blur_threshold = blur_threshold
        self._reject_threshold = reject_threshold
        self._reject_margin = reject_margin
        self._uncertainty_margin = uncertainty_margin
        self._hard_reject_single_label_threshold = hard_reject_single_label_threshold
        self._nudity_blur_threshold = nudity_blur_threshold
        self._nudity_reject_threshold = nudity_reject_threshold
        self._violence_blur_threshold = violence_blur_threshold
        self._violence_reject_threshold = violence_reject_threshold
        self._gore_blur_threshold = gore_blur_threshold
        self._gore_reject_threshold = gore_reject_threshold
        self._weapons_blur_threshold = weapons_blur_threshold
        self._weapons_reject_threshold = weapons_reject_threshold

    def moderate(self, image_bytes: bytes, processing_ms: int) -> ImageModerationResponse:
        raw = self._provider.moderate(image_bytes)
        scores = ModerationScores(
            nudity=raw.nudity,
            violence=raw.violence,
            gore=raw.gore,
            weapons=raw.weapons,
            sensitive=raw.sensitive,
        )
        decision, reasons = decide(
            scores=scores,
            blur_threshold=self._blur_threshold,
            reject_threshold=self._reject_threshold,
            reject_margin=self._reject_margin,
            uncertainty_margin=self._uncertainty_margin,
            hard_reject_single_label_threshold=self._hard_reject_single_label_threshold,
            nudity_blur_threshold=self._nudity_blur_threshold,
            nudity_reject_threshold=self._nudity_reject_threshold,
            violence_blur_threshold=self._violence_blur_threshold,
            violence_reject_threshold=self._violence_reject_threshold,
            gore_blur_threshold=self._gore_blur_threshold,
            gore_reject_threshold=self._gore_reject_threshold,
            weapons_blur_threshold=self._weapons_blur_threshold,
            weapons_reject_threshold=self._weapons_reject_threshold,
        )

        return ImageModerationResponse(
            decision=decision,
            scores=scores,
            reasons=reasons,
            provider=self._provider.name,
            blurThreshold=self._blur_threshold,
            rejectThreshold=self._reject_threshold,
            processingMs=processing_ms,
        )
