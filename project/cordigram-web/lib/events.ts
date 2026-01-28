export const CURRENT_PROFILE_UPDATED_EVENT =
  "cordigram:current-profile-updated" as const;

export function emitCurrentProfileUpdated(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CURRENT_PROFILE_UPDATED_EVENT));
}
