import { getApiBaseUrl } from "./api";

export function decodeJwt(token: string): { exp?: number } | null {
  try {
    const payload = token.split(".")[1];
    const json = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/"))
    );
    return json;
  } catch (_err) {
    return null;
  }
}

export function isAccessTokenValid(token: string | null): boolean {
  if (!token) return false;
  const payload = decodeJwt(token);
  if (!payload?.exp) return false;
  const nowSeconds = Date.now() / 1000;
  return payload.exp > nowSeconds;
}

export function getStoredAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("accessToken");
}

export function setStoredAccessToken(token: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("accessToken", token);
}

export function clearStoredAccessToken(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem("accessToken");
}

export async function refreshSession(): Promise<string> {
  const res = await fetch(`${getApiBaseUrl()}/auth/refresh`, {
    method: "POST",
    credentials: "include",
  });

  const text = await res.text();
  const payload = text
    ? (JSON.parse(text) as { accessToken?: string; message?: string })
    : {};

  if (!res.ok || !payload.accessToken) {
    throw new Error(payload.message || "Cannot refresh session");
  }

  setStoredAccessToken(payload.accessToken);
  return payload.accessToken;
}
