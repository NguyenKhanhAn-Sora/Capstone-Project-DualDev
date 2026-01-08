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
