const DEFAULT_WEB_BASE = "https://www.cordigram.com";

const webBaseUrl =
  process.env.NEXT_PUBLIC_SOCIAL_URL?.replace(/\/$/, "") ??
  process.env.NEXT_PUBLIC_WEB_BASE?.replace(/\/$/, "") ?? DEFAULT_WEB_BASE;

export function getWebBaseUrl(): string {
  return webBaseUrl;
}
