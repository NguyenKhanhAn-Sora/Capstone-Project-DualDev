/** Khoảng cách (px) từ đáy để coi là đang xem tin mới nhất. */
export const CHAT_SCROLL_BOTTOM_THRESHOLD_PX = 100;

export function isChatNearBottom(
  container: HTMLElement,
  threshold = CHAT_SCROLL_BOTTOM_THRESHOLD_PX,
): boolean {
  return (
    container.scrollHeight - container.scrollTop - container.clientHeight <
    threshold
  );
}

export function scrollChatContainerToBottom(
  container: HTMLElement | null,
  behavior: ScrollBehavior = "auto",
): void {
  if (!container) return;
  if (behavior === "smooth") {
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  } else {
    container.scrollTop = container.scrollHeight;
  }
}
