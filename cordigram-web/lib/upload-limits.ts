/** Khớp `FREE_MAX_UPLOAD_BYTES` / `BoostService.computeLimits` trên backend. */
export const DEFAULT_FREE_MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

export function formatUploadLimitExceededMessage(maxBytes: number): string {
  const mb = Math.round(maxBytes / (1024 * 1024));
  if (mb <= 100) {
    return "File vượt quá giới hạn 100MB. Nâng cấp Boost để tải lên tối đa 300MB hoặc 600MB.";
  }
  if (mb <= 300) {
    return "File vượt quá giới hạn 300MB (Boost cơ bản). Nâng cấp lên gói Boost để tải lên tối đa 600MB.";
  }
  return "File vượt quá giới hạn 600MB cho phép.";
}
