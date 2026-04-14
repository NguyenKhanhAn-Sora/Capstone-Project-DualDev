/** Hồ sơ người dùng chỉ có `coverUrl`: ảnh HTTPS hoặc SVG data URL (màu nền). */

export const DEFAULT_USER_BANNER_HEX = "#5865f2";

export function parseUserCover(coverUrl: string | undefined | null): {
  bannerImageUrl: string | null;
  bannerSolidHex: string;
} {
  const t = (coverUrl ?? "").trim();
  if (!t) {
    return { bannerImageUrl: null, bannerSolidHex: DEFAULT_USER_BANNER_HEX };
  }
  if (/^https?:\/\//i.test(t)) {
    return { bannerImageUrl: t, bannerSolidHex: DEFAULT_USER_BANNER_HEX };
  }
  if (t.startsWith("data:image/svg+xml")) {
    const raw = t.includes(",") ? t.split(",").slice(1).join(",") : "";
    try {
      const decoded = raw.includes("%")
        ? decodeURIComponent(raw)
        : raw;
      const m = decoded.match(/fill="#([0-9a-fA-F]{6})"/i);
      if (m) {
        return {
          bannerImageUrl: null,
          bannerSolidHex: `#${m[1].toLowerCase()}`,
        };
      }
    } catch {
      /* ignore */
    }
  }
  return { bannerImageUrl: null, bannerSolidHex: DEFAULT_USER_BANNER_HEX };
}

function sanitizeHex(hex: string): string {
  const h = hex.replace(/^#/, "").replace(/[^0-9a-fA-F]/g, "");
  if (h.length === 3) {
    return (
      "#" +
      h
        .split("")
        .map((c) => c + c)
        .join("")
        .toLowerCase()
    );
  }
  const six = (h + "000000").slice(0, 6).toLowerCase();
  return `#${six}`;
}

export function encodeSolidBannerDataUrl(hex: string): string {
  const safe = sanitizeHex(hex).replace(/^#/, "");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 240"><rect fill="#${safe}" width="960" height="240"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function buildUserCoverUrlForSave(opts: {
  bannerImageUrl: string | null;
  bannerSolidHex: string;
}): string {
  const img = opts.bannerImageUrl?.trim();
  if (img) return img;
  return encodeSolidBannerDataUrl(opts.bannerSolidHex || DEFAULT_USER_BANNER_HEX);
}
