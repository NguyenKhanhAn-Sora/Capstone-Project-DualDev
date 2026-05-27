"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getAccessTokenStatus, isAccessTokenValid, refreshSession } from "@/lib/auth";

export function useRequireAuth(opts?: {
  skip?: boolean;
  /** When true, guests (no valid token) can still render the page.
   *  The hook returns true immediately instead of redirecting to /login. */
  guestAllowed?: boolean;
}): boolean {
  const skip = opts?.skip ?? false;
  const guestAllowed = opts?.guestAllowed ?? false;
  const router = useRouter();
  const [canRender, setCanRender] = useState(false);
  const lastTokenRef = useRef<string | null>(null);
  const skipRestoreKey = "skipSessionRestore";

  useEffect(() => {
    if (skip || guestAllowed) {
      setCanRender(true);
      return;
    }

    let refreshingRef = false;

    const check = async () => {
      const token =
        typeof window !== "undefined"
          ? localStorage.getItem("accessToken")
          : null;
      lastTokenRef.current = token;
      const valid = isAccessTokenValid(token);

      if (!valid) {
        // Try silent refresh before redirecting to login
        if (!refreshingRef) {
          refreshingRef = true;
          try {
            const newToken = await refreshSession();
            lastTokenRef.current = newToken;
            if (getAccessTokenStatus(newToken) === "banned") {
              router.replace("/banned");
              setCanRender(false);
            } else {
              setCanRender(true);
            }
          } catch {
            router.replace("/login");
            setCanRender(false);
          } finally {
            refreshingRef = false;
          }
        }
        return;
      }

      if (getAccessTokenStatus(token) === "banned") {
        router.replace("/banned");
        setCanRender(false);
        return;
      }

      setCanRender(true);
    };

    check();

    const onStorage = (e: StorageEvent) => {
      if (e.key === "accessToken") {
        check();
      }
    };

    const interval = setInterval(() => {
      const token =
        typeof window !== "undefined"
          ? localStorage.getItem("accessToken")
          : null;
      if (token !== lastTokenRef.current) {
        check();
      }
    }, 500);

    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", () => { check(); });

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", () => { check(); });
      clearInterval(interval);
    };
  }, [router, skip, guestAllowed]);
  return canRender;
}

export function useRedirectIfAuthed(): boolean {
  const router = useRouter();
  const [canRender, setCanRender] = useState(false);
  const lastTokenRef = useRef<string | null>(null);

  useEffect(() => {
    const check = () => {
      const token =
        typeof window !== "undefined"
          ? localStorage.getItem("accessToken")
          : null;
      lastTokenRef.current = token;
      const valid = isAccessTokenValid(token);
      if (valid) {
        if (getAccessTokenStatus(token) === "banned") {
          router.replace("/banned");
        } else {
          router.replace("/");
        }
        setCanRender(false);
        return false;
      }
      setCanRender(true);
      return true;
    };

    check();

    const onStorage = (e: StorageEvent) => {
      if (e.key === "accessToken") {
        check();
      }
    };

    const interval = setInterval(() => {
      const token =
        typeof window !== "undefined"
          ? localStorage.getItem("accessToken")
          : null;
      if (token !== lastTokenRef.current) {
        check();
      }
    }, 500);

    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", check);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", check);
      clearInterval(interval);
    };
  }, [router]);
  return canRender;
}
