import { getApiBaseUrl, getWebBaseUrl } from "@/lib/api";

type PreviewTokenResponse = {
  token?: string;
};

const isObjectId = (value: string) => /^[a-f\d]{24}$/i.test(value);

export async function openAdminProfilePreview(userId: string): Promise<void> {
  if (typeof window === "undefined") {
    throw new Error("Profile preview is only available in the browser");
  }

  if (!isObjectId(userId)) {
    throw new Error("Invalid profile id");
  }

  const accessToken = window.localStorage.getItem("adminAccessToken") || "";
  if (!accessToken) {
    throw new Error("Missing admin access token");
  }

  const response = await fetch(
    `${getApiBaseUrl()}/admin/profile-preview/${userId}/token`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error("Unable to generate preview token");
  }

  const payload = (await response.json()) as PreviewTokenResponse;
  const token = payload?.token?.trim();
  if (!token) {
    throw new Error("Missing preview token");
  }

  const url = new URL(`/profile/${userId}`, getWebBaseUrl());
  url.searchParams.set("admin_preview", token);

  const opened = window.open(url.toString(), "_blank", "noopener,noreferrer");
  if (!opened) {
    throw new Error("Popup blocked");
  }
}
