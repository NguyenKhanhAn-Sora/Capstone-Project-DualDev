import { fetchCurrentProfile } from "./api";
import { getServerAccessSettings } from "./servers-api";

export const AGE_RESTRICTED_JOIN_MESSAGE =
  "Bạn chưa đủ điều kiện về độ tuổi đối với server này.";

export function calcAgeFromBirthdateString(
  birthdate: string | null | undefined,
): number | null {
  if (!birthdate?.trim()) return null;
  const d = new Date(birthdate);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age;
}

function getAuthToken(): string {
  if (typeof window === "undefined") return "";
  return (
    localStorage.getItem("accessToken") || localStorage.getItem("token") || ""
  );
}

/** Client preflight before join / accept invite on age-restricted servers. */
export async function assertAgeEligibleForServer(
  serverId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const settings = await getServerAccessSettings(serverId);
  if (!settings.isAgeRestricted) return { ok: true };

  const token = getAuthToken();
  if (!token) {
    return { ok: false, message: AGE_RESTRICTED_JOIN_MESSAGE };
  }

  const profile = await fetchCurrentProfile({ token });
  const age = calcAgeFromBirthdateString(profile.birthdate ?? null);
  if (age == null || age < 18) {
    return { ok: false, message: AGE_RESTRICTED_JOIN_MESSAGE };
  }
  return { ok: true };
}
