from __future__ import annotations

from io import BytesIO

import cv2
import numpy as np
from PIL import Image

from app.providers.base import ImageModerationProvider, RawModerationResult


class HeuristicImageModerationProvider(ImageModerationProvider):
    name = "heuristic-v2"

    def moderate(self, image_bytes: bytes) -> RawModerationResult:
        image = Image.open(BytesIO(image_bytes)).convert("RGB")
        arr = np.asarray(image, dtype=np.uint8)

        if arr.size == 0:
            return RawModerationResult(
                nudity=0.0,
                violence=0.0,
                gore=0.0,
                weapons=0.0,
                sensitive=0.0,
            )

        red = arr[:, :, 0].astype(np.float32)
        green = arr[:, :, 1].astype(np.float32)
        blue = arr[:, :, 2].astype(np.float32)

        total_pixels = float(arr.shape[0] * arr.shape[1])

        skin_mask = (
            (red > 95)
            & (green > 40)
            & (blue > 20)
            & ((np.maximum(np.maximum(red, green), blue) - np.minimum(np.minimum(red, green), blue)) > 15)
            & (np.abs(red - green) > 15)
            & (red > green)
            & (red > blue)
        )
        skin_ratio = float(np.count_nonzero(skin_mask) / total_pixels)

        vivid_red_mask = (
            (red > 110)
            & (red > green * 1.20)
            & (red > blue * 1.20)
            & ((red - green) > 20)
            & ((red - blue) > 20)
        )
        vivid_red_ratio = float(np.count_nonzero(vivid_red_mask) / total_pixels)

        dark_red_mask = (
            (red > 70)
            & (red < 180)
            & (green < 90)
            & (blue < 90)
            & (red > green * 1.35)
            & (red > blue * 1.35)
        )
        dark_red_ratio = float(np.count_nonzero(dark_red_mask) / total_pixels)

        rgb_uint8 = arr.astype(np.uint8)
        bgr = cv2.cvtColor(rgb_uint8, cv2.COLOR_RGB2BGR)
        hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)

        blood_low_1 = np.array([0, 70, 40], dtype=np.uint8)
        blood_high_1 = np.array([12, 255, 255], dtype=np.uint8)
        blood_low_2 = np.array([165, 70, 40], dtype=np.uint8)
        blood_high_2 = np.array([180, 255, 255], dtype=np.uint8)
        blood_mask = cv2.inRange(hsv, blood_low_1, blood_high_1) | cv2.inRange(
            hsv, blood_low_2, blood_high_2
        )
        blood_ratio = float(np.count_nonzero(blood_mask) / total_pixels)

        gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
        edges = cv2.Canny(gray, 80, 180)
        lines = cv2.HoughLinesP(
            edges,
            rho=1,
            theta=np.pi / 180,
            threshold=80,
            minLineLength=max(30, int(min(arr.shape[0], arr.shape[1]) * 0.08)),
            maxLineGap=8,
        )

        long_line_count = 0
        diagonal_line_count = 0
        if lines is not None:
            for segment in lines:
                x1, y1, x2, y2 = segment[0]
                dx = float(x2 - x1)
                dy = float(y2 - y1)
                length = float(np.hypot(dx, dy))
                if length < 40:
                    continue
                long_line_count += 1
                angle = abs(np.degrees(np.arctan2(dy, dx)))
                angle = min(angle, abs(180 - angle))
                if 18 <= angle <= 72:
                    diagonal_line_count += 1

        sat = hsv[:, :, 1].astype(np.float32)
        val = hsv[:, :, 2].astype(np.float32)
        metallic_mask = (sat < 45) & (val > 70)
        metallic_ratio = float(np.count_nonzero(metallic_mask) / total_pixels)

        line_density = float(np.count_nonzero(edges) / total_pixels)

        nudity = self._normalize(skin_ratio, low=0.18, high=0.55)
        violence = max(
            self._normalize(vivid_red_ratio, low=0.05, high=0.20),
            self._normalize(blood_ratio, low=0.04, high=0.18),
        )
        gore = max(
            self._normalize(dark_red_ratio, low=0.02, high=0.14),
            self._normalize(blood_ratio, low=0.03, high=0.14),
        )

        line_signal = min(1.0, (long_line_count / 220.0) + (diagonal_line_count / 140.0))
        weapons = max(
            self._normalize(metallic_ratio, low=0.35, high=0.7) * 0.6
            + self._normalize(line_density, low=0.06, high=0.2) * 0.4,
            line_signal,
        )

        sensitive = min(
            1.0,
            max(
                nudity * 0.9,
                violence * 1.0,
                gore * 1.0,
                weapons * 0.95,
            ),
        )

        return RawModerationResult(
            nudity=round(nudity, 4),
            violence=round(violence, 4),
            gore=round(gore, 4),
            weapons=round(weapons, 4),
            sensitive=round(sensitive, 4),
        )

    @staticmethod
    def _normalize(value: float, low: float, high: float) -> float:
        if high <= low:
            return 0.0
        raw = (value - low) / (high - low)
        return float(min(1.0, max(0.0, raw)))
