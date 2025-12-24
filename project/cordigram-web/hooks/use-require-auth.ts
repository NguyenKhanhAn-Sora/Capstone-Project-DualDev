"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { isAccessTokenValid } from "@/lib/auth";

export function useRequireAuth(): boolean {
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
      if (!valid) {
        router.replace("/login");
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
        router.replace("/");
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
