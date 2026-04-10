/** Màu nền biểu ngữ mặc định (gradient) — đồng bộ với ServerProfileSection. */
export const DEFAULT_BANNER_COLOR =
  "linear-gradient(180deg, #1f2127 0%, #090b10 100%)";

export const BANNER_PRESETS = [
  DEFAULT_BANNER_COLOR,
  "linear-gradient(180deg, #ff3ea5 0%, #eb188a 100%)",
  "linear-gradient(180deg, #ff4b3e 0%, #ee1f22 100%)",
  "linear-gradient(180deg, #ff9b3e 0%, #ea6a13 100%)",
  "linear-gradient(180deg, #ffe66e 0%, #e4be24 100%)",
  "linear-gradient(180deg, #b96cff 0%, #7f3ab1 100%)",
  "linear-gradient(180deg, #49bfff 0%, #198fd4 100%)",
  "linear-gradient(180deg, #74f0d4 0%, #4bc7b0 100%)",
  "linear-gradient(180deg, #6da91f 0%, #3f7304 100%)",
  "linear-gradient(180deg, #5e6168 0%, #2f3238 100%)",
] as const;

export type ServerBannerFields = {
  bannerUrl?: string | null;
  bannerImageUrl?: string | null;
  bannerColor?: string | null;
};

function isHttpUrl(s: string): boolean {
  return /^https?:\/\//i.test(s.trim());
}

/** Chuẩn hóa từ API (hỗ trợ dữ liệu cũ chỉ có bannerUrl). */
export function normalizeServerBanner(server: ServerBannerFields | null | undefined): {
  bannerColor: string;
  bannerImageUrl: string | null;
} {
  const raw = server;
  if (!raw) {
    return { bannerColor: DEFAULT_BANNER_COLOR, bannerImageUrl: null };
  }
  const explicitImage = raw.bannerImageUrl?.trim();
  if (explicitImage) {
    return {
      bannerColor: (raw.bannerColor?.trim() || DEFAULT_BANNER_COLOR) as string,
      bannerImageUrl: explicitImage,
    };
  }
  const legacy = raw.bannerUrl?.trim();
  if (legacy) {
    if (isHttpUrl(legacy)) {
      return {
        bannerColor: (raw.bannerColor?.trim() || DEFAULT_BANNER_COLOR) as string,
        bannerImageUrl: legacy,
      };
    }
    return { bannerColor: legacy, bannerImageUrl: null };
  }
  return {
    bannerColor: (raw.bannerColor?.trim() || DEFAULT_BANNER_COLOR) as string,
    bannerImageUrl: null,
  };
}

/** Resize ảnh biểu ngữ (JPEG) trước khi upload — tỷ lệ ~ 3:1, kích thước vừa card. */
export async function optimizeBannerImageFile(file: File): Promise<File> {
  const maxW = 960;
  const maxH = 280;
  const bitmap = await createImageBitmap(file);
  try {
    const ratio = Math.min(maxW / bitmap.width, maxH / bitmap.height, 1);
    const w = Math.max(1, Math.round(bitmap.width * ratio));
    const h = Math.max(1, Math.round(bitmap.height * ratio));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.82),
    );
    if (!blob) return file;
    return new File([blob], "server-banner.jpg", { type: "image/jpeg" });
  } finally {
    bitmap.close();
  }
}
