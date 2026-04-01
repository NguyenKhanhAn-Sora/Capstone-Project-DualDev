const DEFAULT_BASE_URL = "http://localhost:9999";
const DEFAULT_SOCIAL_BASE_URL = "http://localhost:3000";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, "") ?? DEFAULT_BASE_URL;
const webBaseUrl =
  process.env.NEXT_PUBLIC_SOCIAL_URL?.replace(/\/$/, "") ??
  process.env.NEXT_PUBLIC_WEB_BASE?.replace(/\/$/, "") ??
  DEFAULT_SOCIAL_BASE_URL;

export function getApiBaseUrl(): string {
  return apiBaseUrl;
}

export function getWebBaseUrl(): string {
  return webBaseUrl;
}
