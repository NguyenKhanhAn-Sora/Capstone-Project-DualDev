import { getApiBaseUrl } from "./api";

export function decodeJwt(token: string): { exp?: number } | null {
  try {
    const payload = token.split(".")[1];
    const json = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
    );
    return json;
  } catch (_err) {
    return null;
  }
}

export function getAccessTokenStatus(
  token: string | null,
): "active" | "pending" | "banned" | null {
  if (!token) return null;
  const payload = decodeJwt(token) as
    | { status?: "active" | "pending" | "banned" }
    | null;
  const status = payload?.status;
  if (status === "active" || status === "pending" || status === "banned") {
    return status;
  }
  return null;
}

export function isAccessTokenValid(token: string | null): boolean {
  if (!token) return false;
  const payload = decodeJwt(token);
  if (!payload?.exp) return false;
  const nowSeconds = Date.now() / 1000;
  return payload.exp > nowSeconds;
}

const TAB_ACCESS_TOKEN_KEY = "cordigramTabAccessToken";

/**
 * Token scoped to this browser tab (sessionStorage).
 * Prevents two tabs logged in as different users from sharing one JWT via localStorage.
 */
export function getTabAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  const tab = window.sessionStorage.getItem(TAB_ACCESS_TOKEN_KEY);
  if (tab) return tab;
  return window.localStorage.getItem("accessToken");
}

/** First load in tab: pin current localStorage token to this tab if not set yet. */
export function ensureTabAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  let tab = window.sessionStorage.getItem(TAB_ACCESS_TOKEN_KEY);
  if (!tab) {
    tab = window.localStorage.getItem("accessToken");
    if (tab) {
      window.sessionStorage.setItem(TAB_ACCESS_TOKEN_KEY, tab);
    }
  }
  return tab;
}

export function getStoredAccessToken(): string | null {
  return getTabAccessToken();
}

export function setStoredAccessToken(token: string): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(TAB_ACCESS_TOKEN_KEY, token);
  window.localStorage.setItem("accessToken", token);
}

export function clearStoredAccessToken(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(TAB_ACCESS_TOKEN_KEY);
  window.localStorage.removeItem("accessToken");
}

export async function refreshSession(): Promise<string> {
  const deviceId =
    typeof window !== "undefined"
      ? window.localStorage.getItem("cordigramDeviceId")
      : null;
  const res = await fetch(`${getApiBaseUrl()}/auth/refresh`, {
    method: "POST",
    credentials: "include",
    headers: deviceId
      ? { "x-device-id": deviceId, "x-login-method": "refresh" }
      : { "x-login-method": "refresh" },
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
