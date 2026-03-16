from __future__ import annotations

import json
from typing import Any
from urllib import error as urlerror
from urllib import request as urlrequest

from app.providers.base import ImageModerationProvider, RawModerationResult


class SightengineImageModerationProvider(ImageModerationProvider):
    name = "sightengine-v1"

    def __init__(
        self,
        api_user: str | None,
        api_secret: str | None,
        endpoint: str,
        timeout_sec: float,
        fallback_provider: ImageModerationProvider | None = None,
    ) -> None:
        self._api_user = (api_user or "").strip()
        self._api_secret = (api_secret or "").strip()
        self._endpoint = endpoint.strip() or "https://api.sightengine.com/1.0/check.json"
        self._timeout_sec = max(1.0, float(timeout_sec))
        self._fallback_provider = fallback_provider

    def moderate(self, image_bytes: bytes) -> RawModerationResult:
        payload = self._call_sightengine(image_bytes)
        if payload is None:
            if self._fallback_provider is not None:
                return self._fallback_provider.moderate(image_bytes)
            return RawModerationResult(0.0, 0.0, 0.0, 0.0, 0.0)

        nudity = max(
            self._pick_probability(payload, "nudity.sexual_activity"),
            self._pick_probability(payload, "nudity.sexual_display"),
            self._pick_probability(payload, "nudity.porn"),
            self._pick_probability(payload, "nudity.erotica"),
            self._pick_probability(payload, "nudity.raw"),
        )
        suggestive = max(
            self._pick_probability(payload, "nudity.suggestive"),
            self._pick_probability(payload, "nudity.very_suggestive"),
        )
        nudity = min(1.0, max(nudity, suggestive * 0.7))

        violence = max(
            self._pick_probability(payload, "violence.prob"),
            self._pick_probability(payload, "violence"),
        )
        gore = max(
            self._pick_probability(payload, "gore.prob"),
            self._pick_probability(payload, "gore"),
            self._pick_probability(payload, "medical.prob"),
        )
        weapons = max(
            self._pick_probability(payload, "weapon.prob"),
            self._pick_probability(payload, "weapon"),
            self._pick_probability(payload, "weapons.prob"),
            self._pick_probability(payload, "weapons"),
        )

        sensitive = min(1.0, max(nudity * 0.95, violence, gore, weapons * 0.98))

        return RawModerationResult(
            nudity=round(float(nudity), 4),
            violence=round(float(violence), 4),
            gore=round(float(gore), 4),
            weapons=round(float(weapons), 4),
            sensitive=round(float(sensitive), 4),
        )

    def _call_sightengine(self, image_bytes: bytes) -> dict[str, Any] | None:
        if not self._api_user or not self._api_secret:
            return None

        form_data = {
            "models": "nudity-2.1,wad,gore,violence,genai",
            "api_user": self._api_user,
            "api_secret": self._api_secret,
        }
        boundary = "----cordigram-sightengine-boundary"
        body = self._encode_multipart(form_data, image_bytes, boundary)

        req = urlrequest.Request(
            self._endpoint,
            data=body,
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
            method="POST",
        )
        try:
            with urlrequest.urlopen(req, timeout=self._timeout_sec) as resp:
                raw = resp.read().decode("utf-8", errors="ignore")
                parsed = json.loads(raw)
                if not isinstance(parsed, dict):
                    return None
                status = str(parsed.get("status", "success")).lower()
                if status not in {"success", "ok"}:
                    return None
                return parsed
        except (urlerror.URLError, TimeoutError, json.JSONDecodeError):
            return None

    @staticmethod
    def _encode_multipart(data: dict[str, str], image_bytes: bytes, boundary: str) -> bytes:
        lines: list[bytes] = []
        for key, value in data.items():
            lines.append(f"--{boundary}".encode("utf-8"))
            lines.append(f'Content-Disposition: form-data; name="{key}"'.encode("utf-8"))
            lines.append(b"")
            lines.append(value.encode("utf-8"))

        lines.append(f"--{boundary}".encode("utf-8"))
        lines.append(b'Content-Disposition: form-data; name="media"; filename="upload.jpg"')
        lines.append(b"Content-Type: image/jpeg")
        lines.append(b"")
        lines.append(image_bytes)
        lines.append(f"--{boundary}--".encode("utf-8"))
        lines.append(b"")

        return b"\r\n".join(lines)

    @staticmethod
    def _pick_probability(payload: dict[str, Any], path: str) -> float:
        value = SightengineImageModerationProvider._walk(payload, path)
        if isinstance(value, (int, float)):
            return float(min(1.0, max(0.0, value)))
        if isinstance(value, str):
            try:
                parsed = float(value)
            except ValueError:
                return 0.0
            return float(min(1.0, max(0.0, parsed)))
        return 0.0

    @staticmethod
    def _walk(payload: dict[str, Any], path: str) -> Any:
        cursor: Any = payload
        for segment in path.split("."):
            if not isinstance(cursor, dict) or segment not in cursor:
                return None
            cursor = cursor[segment]
        return cursor
