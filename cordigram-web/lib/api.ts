export interface ApiError<T = unknown> {
  status: number;
  message: string;
  data?: T;
}

interface FetchOptions extends RequestInit {
  path: string;
}

const DEFAULT_BASE_URL = "http://localhost:9999";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, "") ?? DEFAULT_BASE_URL;

async function toJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) {
    return {} as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    throw {
      status: res.status,
      message: "Invalid JSON response",
    } satisfies ApiError;
  }
}

export async function apiFetch<T = unknown>(options: FetchOptions): Promise<T> {
  const { path, headers, ...rest } = options;
  const url = `${apiBaseUrl}${path.startsWith("/") ? "" : "/"}${path}`;

  const res = await fetch(url, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(headers || {}),
    },
  });

  if (!res.ok) {
    const payload: { message?: string } & Record<string, unknown> =
      await toJson<{ message?: string } & Record<string, unknown>>(res).catch(
        () => ({} as { message?: string })
      );
    throw {
      status: res.status,
      message: payload.message || "Request failed",
      data: payload,
    } satisfies ApiError;
  }

  return toJson<T>(res);
}

export function getApiBaseUrl(): string {
  return apiBaseUrl;
}
