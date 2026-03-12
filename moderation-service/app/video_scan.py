from __future__ import annotations

from pathlib import Path
import tempfile

import cv2
import numpy as np


def extract_sampled_frames(
    video_bytes: bytes,
    sample_interval_sec: float,
    max_frames: int,
) -> list[tuple[int, float, np.ndarray]]:
    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".mp4")
    temp_path = Path(temp_file.name)
    try:
        temp_file.write(video_bytes)
        temp_file.flush()
        temp_file.close()

        capture = cv2.VideoCapture(str(temp_path))
        if not capture.isOpened():
            raise ValueError("Cannot open video stream")

        fps = capture.get(cv2.CAP_PROP_FPS)
        if not fps or fps <= 0 or np.isnan(fps):
            fps = 24.0

        sample_every = max(1, int(round(fps * sample_interval_sec)))

        sampled: list[tuple[int, float, np.ndarray]] = []
        frame_index = 0

        while True:
            ok, frame = capture.read()
            if not ok:
                break

            if frame_index % sample_every == 0:
                timestamp_sec = frame_index / fps
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                sampled.append((frame_index, timestamp_sec, rgb))
                if len(sampled) >= max_frames:
                    break

            frame_index += 1

        capture.release()
        return sampled
    finally:
        try:
            temp_path.unlink(missing_ok=True)
        except Exception:
            pass
