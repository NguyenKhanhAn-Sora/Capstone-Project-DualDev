"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getAccessTokenStatus, isAccessTokenValid } from "@/lib/auth";

export function useRequireAuth(): boolean {
  const router = useRouter();
  const [canRender, setCanRender] = useState(false);
  const lastTokenRef = useRef<string | null>(null);
  const skipRestoreKey = "skipSessionRestore";

  useEffect(() => {
    const check = () => {
      const token =
        typeof window !== "undefined"
          ? localStorage.getItem("accessToken")
          : null;
      const previous = lastTokenRef.current;
      lastTokenRef.current = token;
      const valid = isAccessTokenValid(token);
      if (!valid) {
        if (previous && !token && typeof window !== "undefined") {
          window.sessionStorage.setItem(skipRestoreKey, "1");
        }
        router.replace("/login");
        setCanRender(false);
        return false;
      }

      if (getAccessTokenStatus(token) === "banned") {
        router.replace("/banned");
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
