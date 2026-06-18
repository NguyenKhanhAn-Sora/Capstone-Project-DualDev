/** Khớp `FREE_MAX_UPLOAD_BYTES` / `BoostService.computeLimits` trên backend. */
export const DEFAULT_FREE_MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

export function isAllowedMessagingMediaType(mimeType: string): boolean {
  const mime = mimeType.trim().toLowerCase();
  return (
    mime.startsWith("image/") ||
    mime.startsWith("video/") ||
    mime.startsWith("audio/")
  );
}

export function isAllowedMessagingMediaFile(file: File): boolean {
  return isAllowedMessagingMediaType(file.type);
}

type UploadLimitTranslator = (key: string) => string;

export function formatUploadLimitExceededMessage(
  maxBytes: number,
  t?: UploadLimitTranslator,
): string {
  const mb = Math.round(maxBytes / (1024 * 1024));
  if (t) {
    if (mb <= 100) return t("chat.composer.uploadLimitFree");
    if (mb <= 300) return t("chat.composer.uploadLimitBasic");
    return t("chat.composer.uploadLimitMax");
  }
  if (mb <= 100) {
    return "File vượt quá giới hạn 100MB. Nâng cấp Boost để tải lên tối đa 300MB hoặc 600MB.";
  }
  if (mb <= 300) {
    return "File vượt quá giới hạn 300MB (Boost cơ bản). Nâng cấp lên gói Boost để tải lên tối đa 600MB.";
  }
  return "File vượt quá giới hạn 600MB cho phép.";
}

export function mapMessagingUploadErrorMessage(
  rawMessage: string,
  opts: { t: UploadLimitTranslator; maxUploadBytes: number },
): string {
  const msg = rawMessage.trim();
  if (!msg) return opts.t("chat.composer.uploadFailed");
  if (
    msg.includes("Only image, video, or audio") ||
    msg.includes("Only image or video")
  ) {
    return opts.t("chat.composer.onlyImageVideoAudioAllowed");
  }
  if (msg.includes("File too large")) {
    return formatUploadLimitExceededMessage(opts.maxUploadBytes, opts.t);
  }
  return msg;
}
