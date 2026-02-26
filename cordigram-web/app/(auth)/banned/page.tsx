"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  clearStoredAccessToken,
  getAccessTokenStatus,
  getStoredAccessToken,
  isAccessTokenValid,
} from "@/lib/auth";

export default function BannedPage() {
  const router = useRouter();

  useEffect(() => {
    const token = getStoredAccessToken();
    if (!isAccessTokenValid(token)) {
      router.replace("/login");
      return;
    }

    if (getAccessTokenStatus(token) !== "banned") {
      router.replace("/");
    }
  }, [router]);

  const handleBackToLogin = () => {
    clearStoredAccessToken();
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.setItem("skipSessionRestore", "1");
      } catch (_err) {}
    }
    router.replace("/login?loggedOut=1");
  };

  return (
    <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-4">
      <section className="w-full max-w-xl rounded-2xl border border-white/15 bg-white/5 backdrop-blur p-8 text-center space-y-4">
        <p className="text-xs uppercase tracking-[0.2em] text-red-300">Account Status</p>
        <h1 className="text-3xl font-semibold">Your account has been suspended</h1>
        <p className="text-sm text-slate-300 leading-relaxed">
          You can still sign in to check your account status, but access to Cordigram is currently blocked due to a moderation decision.
        </p>
        <p className="text-sm text-slate-300">
          If you believe this was a mistake, please contact
          <a className="ml-1 underline decoration-dotted" href="mailto:cordigram@gmail.com">
            cordigram@gmail.com
          </a>
          .
        </p>
        <div className="pt-2">
          <button
            type="button"
            onClick={handleBackToLogin}
            className="inline-flex items-center justify-center rounded-xl bg-red-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-red-400 transition-colors"
          >
            Sign out
          </button>
        </div>
      </section>
    </main>
  );
}
