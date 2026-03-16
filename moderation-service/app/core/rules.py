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
    reject_margin: float = 0.06,
    uncertainty_margin: float = 0.05,
    hard_reject_single_label_threshold: float = 0.94,
    nudity_blur_threshold: float | None = None,
    nudity_reject_threshold: float | None = None,
    violence_blur_threshold: float | None = None,
    violence_reject_threshold: float | None = None,
    gore_blur_threshold: float | None = None,
    gore_reject_threshold: float | None = None,
    weapons_blur_threshold: float | None = None,
    weapons_reject_threshold: float | None = None,
) -> tuple[ModerationDecision, list[str]]:
    reasons: list[str] = []

    reject_margin = max(0.0, min(0.25, float(reject_margin)))
    uncertainty_margin = max(0.0, min(0.25, float(uncertainty_margin)))
    hard_reject_single_label_threshold = max(
        0.0,
        min(1.0, float(hard_reject_single_label_threshold)),
    )

    scores_dict = scores.model_dump()
    nudity_score = scores_dict.get("nudity", 0.0)
    violence_score = scores_dict.get("violence", 0.0)
    gore_score = scores_dict.get("gore", 0.0)
    weapons_score = scores_dict.get("weapons", 0.0)
    sensitive_score = scores_dict.get("sensitive", 0.0)

    blur_threshold_by_label = {
        "nudity": _resolved_threshold(nudity_blur_threshold, blur_threshold),
        "violence": _resolved_threshold(violence_blur_threshold, blur_threshold),
        "gore": _resolved_threshold(gore_blur_threshold, blur_threshold),
        "weapons": _resolved_threshold(weapons_blur_threshold, blur_threshold),
    }
    reject_threshold_by_label = {
        "nudity": _resolved_threshold(nudity_reject_threshold, reject_threshold),
        "violence": _resolved_threshold(violence_reject_threshold, reject_threshold),
        "gore": _resolved_threshold(gore_reject_threshold, reject_threshold),
        "weapons": _resolved_threshold(weapons_reject_threshold, reject_threshold),
    }

    nudity_reject_threshold_resolved = reject_threshold_by_label.get(
        "nudity",
        reject_threshold,
    )

    # Rule 1: explicit 18+ content must be rejected regardless of style.
    if nudity_score >= nudity_reject_threshold_resolved:
        reasons.append(
            f"nudity score {nudity_score:.2f} >= reject threshold {nudity_reject_threshold_resolved:.2f}"
        )
        return ModerationDecision.REJECT, reasons

    # Rule 2: violence / gore / weapons content should be blurred.
    blur_labels = ("violence", "gore", "weapons")
    blur_hits: list[tuple[str, float, float]] = []
    for label in blur_labels:
        value = scores_dict.get(label, 0.0)
        threshold = blur_threshold_by_label.get(label, blur_threshold)
        if value >= threshold:
            blur_hits.append((label, value, threshold))

    if blur_hits:
        blur_hits.sort(key=lambda item: item[1], reverse=True)
        for label, value, threshold in blur_hits:
            reasons.append(f"{label} score {value:.2f} >= blur threshold {threshold:.2f}")
        return ModerationDecision.BLUR, reasons

    # Rule 3: all other cases are approved.
    reasons.append("no reject-level nudity and no blur-level violence/gore/weapons signals")
    return ModerationDecision.APPROVE, reasons
