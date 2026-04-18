/** Chuông ngắn khi có tin mới (DM / kênh server) — chỉ dùng trên trang Messages. */
const SOUND_URL = "/sounds/universfield-new-notification-040-493469.mp3";

let lastPlayAt = 0;
const MIN_INTERVAL_MS = 350;

export function playMessageNotificationSound(): void {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (now - lastPlayAt < MIN_INTERVAL_MS) return;
  lastPlayAt = now;
  try {
    const audio = new Audio(SOUND_URL);
    audio.volume = 0.4;
    void audio.play().catch(() => {
      /* autoplay / thiếu file */
    });
  } catch {
    /* ignore */
  }
}
