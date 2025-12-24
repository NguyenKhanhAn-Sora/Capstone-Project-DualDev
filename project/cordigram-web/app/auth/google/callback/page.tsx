"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function decodeJwtEmail(token: string): string | null {
  try {
    const payload = token.split(".")[1];
    const json = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/"))
    );
    return typeof json?.email === "string" ? json.email : null;
  } catch (_err) {
    return null;
  }
}

export default function GoogleCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const needsProfile = searchParams.get("needsProfile") === "1";
    const accessToken = searchParams.get("accessToken");
    const signupToken = searchParams.get("signupToken");

    if (accessToken && !needsProfile) {
      localStorage.setItem("accessToken", accessToken);
      router.replace("/");
      return;
    }

    if (signupToken && needsProfile) {
      const email = decodeJwtEmail(signupToken);
      sessionStorage.setItem("googleSignupToken", signupToken);
      if (email) sessionStorage.setItem("googleSignupEmail", email);
      router.replace("/signup?google=1");
      return;
    }

    router.replace("/login");
  }, [router, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center text-slate-700">
      <div className="text-center space-y-3">
        <p className="text-lg font-semibold">Đang xử lý đăng nhập Google...</p>
        <p className="text-sm text-slate-500">Vui lòng đợi trong giây lát.</p>
      </div>
    </div>
  );
}
