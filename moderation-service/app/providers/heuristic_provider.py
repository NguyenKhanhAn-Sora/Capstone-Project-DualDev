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
        ycrcb = cv2.cvtColor(bgr, cv2.COLOR_BGR2YCrCb)

        hsv_skin_mask = cv2.inRange(
            hsv,
            np.array([0, 18, 45], dtype=np.uint8),
            np.array([26, 200, 255], dtype=np.uint8),
        )
        ycrcb_skin_mask = cv2.inRange(
            ycrcb,
            np.array([0, 135, 85], dtype=np.uint8),
            np.array([255, 180, 135], dtype=np.uint8),
        )

        combined_skin_mask = cv2.bitwise_and(
            skin_mask.astype(np.uint8) * 255,
            cv2.bitwise_or(hsv_skin_mask, ycrcb_skin_mask),
        )
        skin_kernel = np.ones((3, 3), dtype=np.uint8)
        combined_skin_mask = cv2.morphologyEx(
            combined_skin_mask,
            cv2.MORPH_OPEN,
            skin_kernel,
            iterations=1,
        )
        combined_skin_mask = cv2.morphologyEx(
            combined_skin_mask,
            cv2.MORPH_CLOSE,
            skin_kernel,
            iterations=1,
        )
        refined_skin_ratio = float(np.count_nonzero(combined_skin_mask) / total_pixels)

        height = arr.shape[0]
        upper_end = max(1, int(height * 0.35))
        middle_end = max(upper_end + 1, int(height * 0.7))
        upper_skin_ratio = float(np.count_nonzero(combined_skin_mask[:upper_end, :]) / total_pixels)
        middle_skin_ratio = float(
            np.count_nonzero(combined_skin_mask[upper_end:middle_end, :]) / total_pixels
        )
        lower_skin_ratio = float(np.count_nonzero(combined_skin_mask[middle_end:, :]) / total_pixels)

        largest_skin_blob_ratio = 0.0
        component_count, _, component_stats, _ = cv2.connectedComponentsWithStats(
            combined_skin_mask,
            connectivity=8,
        )
        if component_count > 1:
            largest_area = int(component_stats[1:, cv2.CC_STAT_AREA].max(initial=0))
            largest_skin_blob_ratio = float(largest_area / total_pixels)

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
        dark_metal_mask = (sat < 55) & (val > 35) & (val < 170)
        dark_metal_ratio = float(np.count_nonzero(dark_metal_mask) / total_pixels)

        blue_dominant_mask = (blue > red * 1.12) & (blue > green * 1.08)
        blue_dominant_ratio = float(np.count_nonzero(blue_dominant_mask) / total_pixels)

        pink_dominant_mask = (
            (red > 120)
            & (blue > 105)
            & (green > 80)
            & (red > green * 1.05)
            & (blue > green * 1.02)
        )
        pink_dominant_ratio = float(np.count_nonzero(pink_dominant_mask) / total_pixels)

        laplacian_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        low_texture_signal = self._normalize(140.0 - laplacian_var, low=20.0, high=120.0)

        gray_blur = cv2.GaussianBlur(gray, (7, 7), 0)
        residual_texture = float(np.mean(np.abs(gray.astype(np.float32) - gray_blur.astype(np.float32))))
        flat_region_signal = self._normalize(22.0 - residual_texture, low=3.0, high=18.0)

        pastel_mask = (sat > 35) & (sat < 165) & (val > 145)
        pastel_ratio = float(np.count_nonzero(pastel_mask) / total_pixels)
        high_sat_ratio = float(np.count_nonzero((sat > 95) & (val > 95)) / total_pixels)
        stylized_signal = min(
            1.0,
            (self._normalize(pink_dominant_ratio, low=0.16, high=0.52) * 0.55)
            + (self._normalize(pastel_ratio, low=0.2, high=0.62) * 0.25)
            + (low_texture_signal * 0.20),
        )

        anime_safe_signal = min(
            1.0,
            (stylized_signal * 0.45)
            + (self._normalize(high_sat_ratio, low=0.12, high=0.42) * 0.20)
            + (flat_region_signal * 0.20)
            + (self._normalize(upper_skin_ratio, low=0.06, high=0.24) * 0.15),
        )

        line_density = float(np.count_nonzero(edges) / total_pixels)

        broad_skin_signal = self._normalize(refined_skin_ratio, low=0.48, high=0.9)
        contiguous_skin_signal = self._normalize(
            largest_skin_blob_ratio,
            low=0.24,
            high=0.62,
        )
        nudity = broad_skin_signal * 0.35 + contiguous_skin_signal * 0.65

        torso_exposure_signal = self._normalize(
            (middle_skin_ratio * 1.35 + lower_skin_ratio * 1.65) - (upper_skin_ratio * 0.55),
            low=0.08,
            high=0.38,
        )
        explicit_nudity_evidence = min(
            1.0,
            (self._normalize(refined_skin_ratio, low=0.58, high=0.9) * 0.35)
            + (self._normalize(largest_skin_blob_ratio, low=0.33, high=0.72) * 0.45)
            + (torso_exposure_signal * 0.20),
        )

        if explicit_nudity_evidence < 0.42:
            nudity *= 0.55

        if anime_safe_signal >= 0.52 and explicit_nudity_evidence < 0.62:
            suppression = 0.12 + (0.28 * (1.0 - explicit_nudity_evidence))
            nudity *= suppression

        if upper_skin_ratio > (middle_skin_ratio + lower_skin_ratio) * 1.4:
            nudity *= 0.35

        violence = max(
            self._normalize(vivid_red_ratio, low=0.05, high=0.20),
            self._normalize(blood_ratio, low=0.04, high=0.18),
        )
        gore = max(
            self._normalize(dark_red_ratio, low=0.02, high=0.14),
            self._normalize(blood_ratio, low=0.03, high=0.14),
        )

        line_signal = min(1.0, (long_line_count / 180.0) + (diagonal_line_count / 120.0))
        metallic_signal = max(
            self._normalize(metallic_ratio, low=0.22, high=0.58),
            self._normalize(dark_metal_ratio, low=0.24, high=0.62),
        )
        weapons = (
            metallic_signal * 0.72
            + self._normalize(line_density, low=0.055, high=0.19) * 0.18
            + line_signal * 0.10
        )
        if metallic_signal < 0.2:
            weapons = min(weapons, 0.26)
        if anime_safe_signal >= 0.58 and metallic_signal < 0.35 and high_sat_ratio >= 0.16:
            weapons = min(weapons, 0.34)

        if violence < 0.15 and gore < 0.12 and weapons < 0.2:
            if refined_skin_ratio < 0.62 or largest_skin_blob_ratio < 0.28:
                nudity *= 0.12

        if blue_dominant_ratio >= 0.45 and violence < 0.2 and gore < 0.16:
            nudity *= 0.2

        if largest_skin_blob_ratio < 0.22:
            nudity = min(nudity, 0.45)

        if (
            stylized_signal >= 0.45
            and violence < 0.22
            and gore < 0.18
            and weapons < 0.24
            and largest_skin_blob_ratio < 0.52
        ):
            suppression = 0.18 + (0.22 * (1.0 - min(1.0, stylized_signal)))
            nudity *= suppression

        if anime_safe_signal >= 0.6 and explicit_nudity_evidence < 0.5:
            nudity = min(nudity, 0.3)

        if refined_skin_ratio < 0.55 and largest_skin_blob_ratio < 0.32:
            nudity = min(nudity, 0.58)

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
