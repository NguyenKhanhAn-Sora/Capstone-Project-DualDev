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

    high_severity_labels = ("violence", "gore", "weapons")

    reject_hit_label: str | None = None
    reject_hit_score = -1.0
    reject_uncertain_reasons: list[str] = []
    for label in high_severity_labels:
        value = scores_dict.get(label, 0.0)
        threshold = reject_threshold_by_label.get(label, reject_threshold)
        if value < threshold:
            continue

        second_signal = any(
            scores_dict.get(other, 0.0)
            >= blur_threshold_by_label.get(other, blur_threshold) * 0.9
            for other in high_severity_labels
            if other != label
        )
        sensitive_support = sensitive_score >= max(0.72, threshold - 0.10)
        hard_single_signal = value >= max(threshold + reject_margin, hard_reject_single_label_threshold)

        if sensitive_support or second_signal or hard_single_signal:
            if value > reject_hit_score:
                reject_hit_label = label
                reject_hit_score = value
        else:
            reject_uncertain_reasons.append(
                f"{label} score {value:.2f} reached reject threshold but lacked corroboration"
            )

    if reject_hit_label is not None:
        threshold = reject_threshold_by_label.get(reject_hit_label, reject_threshold)
        reasons.append(
            f"{reject_hit_label} score {reject_hit_score:.2f} >= reject threshold {threshold:.2f}"
        )
        return ModerationDecision.REJECT, reasons

    nudity_reject_threshold_resolved = reject_threshold_by_label.get(
        "nudity",
        reject_threshold,
    )
    has_harm_corroboration = (
        violence_score >= blur_threshold_by_label.get("violence", blur_threshold) * 0.9
        or gore_score >= blur_threshold_by_label.get("gore", blur_threshold) * 0.9
        or weapons_score >= blur_threshold_by_label.get("weapons", blur_threshold) * 0.9
    )

    if (
        nudity_score >= nudity_reject_threshold_resolved
        and sensitive_score >= 0.99
        and has_harm_corroboration
        and (nudity_score - nudity_reject_threshold_resolved) >= 0.02
    ):
        reasons.append(
            "nudity is extremely high and corroborated by additional harmful signals"
        )
        return ModerationDecision.REJECT, reasons

    if nudity_score >= nudity_reject_threshold_resolved and not has_harm_corroboration:
        reasons.append(
            "nudity is high but uncorroborated, downgraded from reject to blur"
        )

    reasons.extend(reject_uncertain_reasons)

    blur_hit_label: str | None = None
    blur_hit_score = -1.0
    blur_hit_threshold = blur_threshold
    for label, value in scores_dict.items():
        if label == "sensitive":
            continue
        threshold = blur_threshold_by_label.get(label, blur_threshold)
        if value >= threshold and value > blur_hit_score:
            blur_hit_label = label
            blur_hit_score = value
            blur_hit_threshold = threshold

    if blur_hit_label is not None:
        threshold = blur_threshold_by_label.get(blur_hit_label, blur_threshold)
        if blur_hit_score >= (reject_threshold_by_label.get(blur_hit_label, reject_threshold) - uncertainty_margin):
            reasons.append(
                f"{blur_hit_label} is in uncertainty band near reject; downgraded to blur"
            )
        reasons.append(
            f"{blur_hit_label} score {blur_hit_score:.2f} >= blur threshold {threshold:.2f}"
        )
        return ModerationDecision.BLUR, reasons

    if (
        violence_score < 0.22
        and gore_score < 0.20
        and weapons_score < 0.22
        and sensitive_score < 0.9
        and nudity_score < max(0.98, blur_threshold_by_label.get("nudity", blur_threshold) + 0.05)
    ):
        reasons.append("content appears low-risk after multi-signal safety check")
        return ModerationDecision.APPROVE, reasons

    highest_label = max(scores_dict, key=scores_dict.get)
    highest_score = scores_dict[highest_label]

    reasons.append(
        f"max score {highest_score:.2f} is below blur threshold {blur_hit_threshold:.2f}"
    )
    return ModerationDecision.APPROVE, reasons
