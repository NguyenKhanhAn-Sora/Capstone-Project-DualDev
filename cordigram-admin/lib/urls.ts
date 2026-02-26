const DEFAULT_WEB_BASE = "http://localhost:3001";

const webBaseUrl =
  process.env.NEXT_PUBLIC_WEB_BASE?.replace(/\/$/, "") ?? DEFAULT_WEB_BASE;

export function getWebBaseUrl(): string {
  return webBaseUrl;
}
