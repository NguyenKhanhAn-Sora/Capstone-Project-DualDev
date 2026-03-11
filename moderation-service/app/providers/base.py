from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass(slots=True)
class RawModerationResult:
    nudity: float
    violence: float
    gore: float
    weapons: float
    sensitive: float


class ImageModerationProvider(ABC):
    name: str

    @abstractmethod
    def moderate(self, image_bytes: bytes) -> RawModerationResult:
        raise NotImplementedError
