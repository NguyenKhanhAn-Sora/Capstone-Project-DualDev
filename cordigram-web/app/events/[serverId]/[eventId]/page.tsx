"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import * as serversApi from "@/lib/servers-api";
import type { EventPreviewResponse } from "@/lib/servers-api";
import { fetchCurrentProfile } from "@/lib/api";
import ApplyToJoinQuestionsModal from "@/components/ApplyToJoinQuestionsModal/ApplyToJoinQuestionsModal";
import ServerBannerStrip from "@/components/ServerBannerStrip/ServerBannerStrip";

function getToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("accessToken") || localStorage.getItem("token") || "";
}

function hasToken(): boolean {
  return !!getToken();
}

function isValidAvatarUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") return false;
  return url.startsWith("http://") || url.startsWith("https://") || url.startsWith("/");
}

export default function EventSharePage() {
  const params = useParams();
  const router = useRouter();
  const serverId = params.serverId as string;
  const eventId = params.eventId as string;
  const [data, setData] = useState<EventPreviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [userDisplayName, setUserDisplayName] = useState<string>("");
  const [serverNickname, setServerNickname] = useState("");
  const [allowDMs, setAllowDMs] = useState(true);
  const [showActivity, setShowActivity] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [applyModalOpen, setApplyModalOpen] = useState(false);
  const [applySubmitted, setApplySubmitted] = useState(false);
  const [applyForm, setApplyForm] = useState<{
    enabled: boolean;
    questions: Array<{
      id: string;
      title: string;
      type: "short" | "paragraph" | "multiple_choice";
      required: boolean;
      options?: string[];
    }>;
  } | null>(null);

  useEffect(() => {
    if (!serverId || !eventId) return;
    serversApi
      .getEventPreview(serverId, eventId)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Không tải được dữ liệu"))
      .finally(() => setLoading(false));
  }, [serverId, eventId]);

  useEffect(() => {
    if (!data || !data.isMember && hasToken()) {
      const token = getToken();
      if (!token) return;
      fetchCurrentProfile({ token })
        .then((p) => setUserDisplayName(p.displayName || p.username || "User"))
        .catch(() => setUserDisplayName(""));
    }
  }, [data]);

  useEffect(() => {
    if (!data) return;
    if (data.isMember) {
      router.replace(`/messages?server=${serverId}&event=${eventId}`);
    }
  }, [data, serverId, eventId, router]);

  const handleAccept = async () => {
    if (!hasToken()) {
      router.push(`/login?redirect=${encodeURIComponent(`/events/${serverId}/${eventId}`)}`);
      return;
    }
    setJoining(true);
    setError(null);
    try {
      const settings = await serversApi.getServerAccessSettings(serverId);
      if (settings.accessMode === "apply") {
        const form = settings.joinApplicationForm ?? { enabled: false, questions: [] };
        setApplyForm({
          enabled: Boolean(form.enabled),
          questions: form.questions ?? [],
        });
        setApplyModalOpen(true);
        return;
      }

      await serversApi.joinServer(serverId);
      router.replace(`/messages?server=${serverId}&event=${eventId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể tham gia máy chủ");
    } finally {
      setJoining(false);
    }
  };

  const submitApplyJoin = async (applyAnswers: Record<string, { text?: string; selectedOption?: string }>) => {
    if (!applyForm) return;

    for (const q of applyForm.questions) {
      if (!q.required) continue;
      const a = applyAnswers[q.id];
      if (q.type === "multiple_choice") {
        if (!a?.selectedOption) {
          setError("Vui lòng trả lời tất cả câu hỏi bắt buộc");
          return;
        }
      } else if (!a?.text?.trim()) {
        setError("Vui lòng trả lời tất cả câu hỏi bắt buộc");
        return;
      }
    }

    setJoining(true);
    setError(null);
    try {
      await serversApi.joinServer(serverId, {
        applicationAnswers: applyForm.questions.map((q) => {
          const a = applyAnswers[q.id] || {};
          return {
            questionId: q.id,
            text: q.type === "multiple_choice" ? undefined : (a.text ?? ""),
            selectedOption: q.type === "multiple_choice" ? a.selectedOption : undefined,
          };
        }),
      });
      setApplyModalOpen(false);
      setApplySubmitted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể tham gia máy chủ");
    } finally {
      setJoining(false);
    }
  };

  const handleNoThanks = () => {
    router.push("/");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#313338] flex items-center justify-center">
        <p className="text-[#b5bac1]">Đang tải...</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="min-h-screen bg-[#313338] flex items-center justify-center p-4">
        <div className="text-center text-[#b5bac1]">
          <p className="text-lg">{error}</p>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="mt-4 px-4 py-2 rounded bg-[#5865f2] text-white"
          >
            Về trang chủ
          </button>
        </div>
      </div>
    );
  }

  if (data?.isMember) {
    return (
      <div className="min-h-screen bg-[#313338] flex items-center justify-center">
        <p className="text-[#b5bac1]">Đang chuyển vào máy chủ...</p>
      </div>
    );
  }

  if (data && !data.server.isPublic) {
    return (
      <div className="min-h-screen bg-[#313338] flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <p className="text-[#f2f3f5] text-lg font-medium mb-2">
            Bạn không có quyền truy cập máy chủ này
          </p>
          <p className="text-[#b5bac1] text-sm mb-4">
            Máy chủ này là riêng tư. Chỉ thành viên được mời mới có thể truy cập.
          </p>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="px-4 py-2 rounded bg-[#5865f2] text-white"
          >
            Về trang chủ
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { server } = data;

  if (applySubmitted) {
    return (
      <div className="min-h-screen bg-[#313338] flex items-center justify-center p-4">
        <div className="w-full max-w-[420px] rounded-xl bg-[#2b2d31] shadow-xl overflow-hidden p-8 text-center">
          <div className="flex justify-center mb-4">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="#f0b232">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-2h2v2h-2zm0-4V7h2v6h-2z" />
            </svg>
          </div>
          <h2 className="text-[#f2f3f5] text-xl font-bold mb-2">Đơn đăng ký đã được gửi</h2>
          <p className="text-[#b5bac1] text-sm mb-6">
            Đơn đăng ký tham gia <strong className="text-[#f2f3f5]">{server.name}</strong> của bạn đã được gửi thành công. Vui lòng chờ chủ máy chủ hoặc quản trị viên duyệt đơn.
          </p>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="px-6 py-2 rounded-lg bg-[#5865f2] hover:bg-[#4752c4] text-white font-medium"
          >
            Về trang chủ
          </button>
        </div>
      </div>
    );
  }

  const hasAvatar = isValidAvatarUrl(server.avatarUrl ?? undefined);
  const initial = server.name.charAt(0).toUpperCase();
  const acceptLabel = userDisplayName ? `Chấp nhận với tên ${userDisplayName}` : "Chấp nhận tham gia";

  return (
    <div className="min-h-screen bg-[#313338] flex items-center justify-center p-4">
      <ApplyToJoinQuestionsModal
        open={applyModalOpen && !!applyForm}
        onClose={() => {
          if (joining) return;
          setApplyModalOpen(false);
          setError(null);
        }}
        server={{
          name: server.name,
          avatarUrl: server.avatarUrl,
          bannerUrl: server.bannerUrl,
          bannerImageUrl: server.bannerImageUrl,
          bannerColor: server.bannerColor,
          memberCount: undefined,
          createdAt: undefined,
        }}
        questions={applyForm?.questions ?? []}
        submitting={joining}
        error={error}
        onSubmit={submitApplyJoin}
      />

      <div className="w-full max-w-[420px] rounded-xl bg-[#2b2d31] shadow-xl overflow-hidden">
        <ServerBannerStrip server={server} height={112} />
        {/* Invite header */}
        <div className="pt-8 pb-4 px-6 text-center">
          <p className="text-[#f2f3f5] text-sm mb-2">Bạn được mời tham gia</p>
          <h1 className="text-[#f2f3f5] text-2xl font-bold mb-4">{server.name}</h1>
          <div className="flex justify-center mb-4">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center text-3xl font-bold text-white bg-[#1a1b1e] border-4 border-[#313338] overflow-hidden"
              style={{
                backgroundColor: hasAvatar ? undefined : "var(--color-primary, #5865f2)",
                backgroundImage: hasAvatar && server.avatarUrl ? `url(${server.avatarUrl})` : undefined,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            >
              {!hasAvatar && initial}
            </div>
          </div>
          <div className="flex items-center justify-center gap-4 text-[#b5bac1] text-sm">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#248046]" /> 1 đang trực tuyến
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#80848e]" /> 1 thành viên
            </span>
          </div>
        </div>

        {/* Server Settings */}
        <div className="px-6 pb-2">
          <button
            type="button"
            onClick={() => setSettingsOpen((o) => !o)}
            className="w-full flex items-center justify-between py-2 text-left text-[#f2f3f5] hover:bg-[#36373d] rounded-lg px-2 -mx-2"
          >
            <span className="flex items-center gap-2">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 1v6m0 6v6M4.22 4.22l4.24 4.24m3.08 3.08l4.24 4.24M1 12h6m6 0h6m-16.78 7.78l4.24-4.24m3.08-3.08l4.24-4.24" />
              </svg>
              Cài đặt máy chủ
            </span>
            <span className="text-[#b5bac1] text-xs">Bạn có thể tùy chỉnh bất cứ lúc nào</span>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={`transition-transform ${settingsOpen ? "rotate-180" : ""}`}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          {settingsOpen && (
            <div className="pt-2 pb-4 space-y-4">
              <div>
                <label className="block text-[#b5bac1] text-xs font-medium mb-1">Biệt danh trên máy chủ</label>
                <input
                  type="text"
                  value={serverNickname}
                  onChange={(e) => setServerNickname(e.target.value)}
                  placeholder="Mọi người gọi bạn là gì?"
                  className="w-full px-3 py-2 rounded bg-[#1e1f22] border border-[#313338] text-[#f2f3f5] placeholder-[#6d6f78] focus:outline-none focus:border-[#5865f2]"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#f2f3f5] text-sm">Cho phép tin nhắn trực tiếp</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={allowDMs}
                  onClick={() => setAllowDMs((v) => !v)}
                  className={`w-11 h-6 rounded-full transition-colors ${allowDMs ? "bg-[#5865f2]" : "bg-[#4e5058]"}`}
                >
                  <span
                    className={`block w-5 h-5 rounded-full bg-white shadow mt-0.5 transition-transform ${allowDMs ? "translate-x-5" : "translate-x-0.5"}`}
                  />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#f2f3f5] text-sm">Hiển thị trạng thái hoạt động</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={showActivity}
                  onClick={() => setShowActivity((v) => !v)}
                  className={`w-11 h-6 rounded-full transition-colors ${showActivity ? "bg-[#5865f2]" : "bg-[#4e5058]"}`}
                >
                  <span
                    className={`block w-5 h-5 rounded-full bg-white shadow mt-0.5 transition-transform ${showActivity ? "translate-x-5" : "translate-x-0.5"}`}
                  />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 space-y-2">
          {error && !applyModalOpen && (
            <p className="text-red-400 text-sm text-center">{error}</p>
          )}
          <button
            type="button"
            onClick={handleAccept}
            disabled={joining}
            className="w-full py-3 rounded-lg bg-[#5865f2] hover:bg-[#4752c4] text-white font-medium flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.226.073.073 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
            </svg>
            {joining ? "Đang tham gia..." : acceptLabel}
          </button>
          <button
            type="button"
            onClick={handleNoThanks}
            className="w-full py-2 text-[#b5bac1] hover:text-[#f2f3f5] text-sm font-medium"
          >
            Không, cảm ơn
          </button>
        </div>
      </div>
    </div>
  );
}
