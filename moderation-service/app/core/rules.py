from __future__ import annotations

from app.schemas import ModerationDecision, ModerationScores


def _resolved_threshold(value: float | None, fallback: float) -> float:
    if value is None:
        return fallback
    return max(0.0, min(1.0, float(value)))


def decide(
    scores: ModerationScores,
    blur_threshold: float,
    reject_threshold: float,
    violence_blur_threshold: float | None = None,
    violence_reject_threshold: float | None = None,
    gore_blur_threshold: float | None = None,
    gore_reject_threshold: float | None = None,
    weapons_blur_threshold: float | None = None,
    weapons_reject_threshold: float | None = None,
) -> tuple[ModerationDecision, list[str]]:
    reasons: list[str] = []

    scores_dict = scores.model_dump()

    blur_threshold_by_label = {
        "nudity": blur_threshold,
        "violence": _resolved_threshold(violence_blur_threshold, blur_threshold),
        "gore": _resolved_threshold(gore_blur_threshold, blur_threshold),
        "weapons": _resolved_threshold(weapons_blur_threshold, blur_threshold),
        "sensitive": blur_threshold,
    }
    reject_threshold_by_label = {
        "nudity": reject_threshold,
        "violence": _resolved_threshold(violence_reject_threshold, reject_threshold),
        "gore": _resolved_threshold(gore_reject_threshold, reject_threshold),
        "weapons": _resolved_threshold(weapons_reject_threshold, reject_threshold),
        "sensitive": reject_threshold,
    }

    reject_hit_label: str | None = None
    reject_hit_score = -1.0
    for label, value in scores_dict.items():
        threshold = reject_threshold_by_label.get(label, reject_threshold)
        if label == "weapons":
            has_violence_context = (
                float(scores_dict.get("violence", 0.0)) >= 0.45
                or float(scores_dict.get("gore", 0.0)) >= 0.4
                or float(scores_dict.get("sensitive", 0.0)) >= 0.7
            )
            if not has_violence_context:
                continue
        if value >= threshold and value > reject_hit_score:
            reject_hit_label = label
            reject_hit_score = value

    if reject_hit_label is not None:
        threshold = reject_threshold_by_label.get(reject_hit_label, reject_threshold)
        reasons.append(
            f"{reject_hit_label} score {reject_hit_score:.2f} >= reject threshold {threshold:.2f}"
        )
        return ModerationDecision.REJECT, reasons

    blur_hit_label: str | None = None
    blur_hit_score = -1.0
    for label, value in scores_dict.items():
        threshold = blur_threshold_by_label.get(label, blur_threshold)
        if label == "weapons":
            has_violence_context = (
                float(scores_dict.get("violence", 0.0)) >= 0.3
                or float(scores_dict.get("gore", 0.0)) >= 0.25
                or float(scores_dict.get("sensitive", 0.0)) >= 0.55
            )
            if not has_violence_context:
                continue
        if value >= threshold and value > blur_hit_score:
            blur_hit_label = label
            blur_hit_score = value

    if blur_hit_label is not None:
        threshold = blur_threshold_by_label.get(blur_hit_label, blur_threshold)
        reasons.append(
            f"{blur_hit_label} score {blur_hit_score:.2f} >= blur threshold {threshold:.2f}"
        )
        return ModerationDecision.BLUR, reasons

    highest_label = max(scores_dict, key=scores_dict.get)
    highest_score = scores_dict[highest_label]

    reasons.append(
        f"max score {highest_score:.2f} is below blur threshold {blur_threshold:.2f}"
    )
    return ModerationDecision.APPROVE, reasons
