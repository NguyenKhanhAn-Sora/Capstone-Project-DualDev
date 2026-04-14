"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import styles from "../server-view.module.css";
import {
  buildEmojiRenderMap,
  fetchAdminChannelMessages,
  fetchAdminEmojiPicker,
  fetchAdminServerView,
  type AdminServerViewResponse,
} from "@/lib/server-preview-api";

type AdminPayload = {
  roles?: string[];
  exp?: number;
};

function decodeJwt(token: string): AdminPayload | null {
  try {
    const payload = token.split(".")[1];
    const json = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
    );
    return json as AdminPayload;
  } catch {
    return null;
  }
}

type RawMessage = {
  _id: string;
  content?: string;
  messageType?: string;
  giphyId?: string | null;
  customStickerUrl?: string | null;
  voiceUrl?: string | null;
  voiceDuration?: number | null;
  attachments?: string[];
  reactions?: Array<{ userId?: unknown; emoji: string }>;
  createdAt?: string;
  senderId?: {
    _id?: string;
    email?: string;
    displayName?: string;
    username?: string;
    avatarUrl?: string;
  };
  replyTo?: { content?: string; messageType?: string } | null;
};

const MODERATION_NOTICE =
  "⚠️ Hình ảnh đã bị xóa do vi phạm chính sách nội dung.";

/** Khớp cordigram-web `messages/page.tsx` — inline + jumbo khi tin chỉ là :emoji: */
const CUSTOM_EMOJI_INLINE_PX = 22;
const CUSTOM_EMOJI_JUMBO_PX = 48;
const CUSTOM_EMOJI_JUMBO_MAX_COUNT = 3;

function getServerCustomEmojiRenderSizePx(
  text: string,
  map: Record<string, string>,
): number {
  const trimmed = text.trim();
  if (!trimmed) return CUSTOM_EMOJI_INLINE_PX;
  const stripped = trimmed.replace(/\s+/g, "");
  if (!stripped.length) return CUSTOM_EMOJI_INLINE_PX;
  if (!/^(:[a-zA-Z0-9_]{1,80}:)+$/.test(stripped)) return CUSTOM_EMOJI_INLINE_PX;
  const tokens = stripped.match(/:[a-zA-Z0-9_]{1,80}:/g) ?? [];
  if (
    tokens.length === 0 ||
    tokens.length > CUSTOM_EMOJI_JUMBO_MAX_COUNT
  ) {
    return CUSTOM_EMOJI_INLINE_PX;
  }
  const allResolved = tokens.every((t) => {
    const name = t.slice(1, -1).toLowerCase();
    return Boolean(map[name]);
  });
  return allResolved ? CUSTOM_EMOJI_JUMBO_PX : CUSTOM_EMOJI_INLINE_PX;
}

function renderTextWithCustomEmojis(
  text: string,
  map: Record<string, string>,
  emojiPx: number,
  isJumboEmojiRow: boolean,
): React.ReactNode {
  const re = /:([a-zA-Z0-9_]{1,80}):/g;
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      nodes.push(
        <span key={`t-${last}`}>{text.slice(last, m.index)}</span>,
      );
    }
    const url = map[m[1].toLowerCase()];
    if (url) {
      nodes.push(
        <img
          key={`e-${m.index}`}
          src={url}
          alt={m[0]}
          className={styles.customEmojiImg}
          width={emojiPx}
          height={emojiPx}
          draggable={false}
          style={{
            width: emojiPx,
            height: emojiPx,
            minWidth: emojiPx,
            minHeight: emojiPx,
            maxWidth: emojiPx,
            maxHeight: emojiPx,
            margin: isJumboEmojiRow ? "2px 4px 2px 0" : undefined,
          }}
        />,
      );
    } else {
      nodes.push(<span key={`l-${m.index}`}>{m[0]}</span>);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    nodes.push(<span key="tail">{text.slice(last)}</span>);
  }
  return nodes.length ? nodes : text;
}

/** Sticker máy chủ + Giphy — cùng giới hạn như cordigram-web (GiphyMessage / customSticker). */
function stickerAndGiphyImgStyle(messageType: string): React.CSSProperties {
  const isSticker = messageType === "sticker";
  return {
    maxWidth: isSticker ? 200 : 300,
    maxHeight: isSticker ? 200 : 300,
    width: "auto",
    height: "auto",
    borderRadius: 8,
    display: "block",
    objectFit: "contain" as const,
  };
}

function MessageBubble({
  msg,
  emojiMap,
}: {
  msg: RawMessage;
  emojiMap: Record<string, string>;
}) {
  const text = msg.content ?? "";
  const type = msg.messageType || "text";
  const emojiPx = getServerCustomEmojiRenderSizePx(text, emojiMap);
  const isJumboEmojiRow = emojiPx >= CUSTOM_EMOJI_JUMBO_PX;

  if (text.includes(MODERATION_NOTICE)) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 10px",
          borderRadius: 4,
          background: "rgba(237, 66, 69, 0.15)",
          color: "#ed4245",
          fontSize: 13,
        }}
      >
        Hình ảnh đã bị xóa do vi phạm chính sách nội dung.
      </div>
    );
  }

  if (type === "gif" || type === "sticker") {
    if (msg.customStickerUrl) {
      return (
        <img
          src={msg.customStickerUrl}
          alt="sticker"
          draggable={false}
          style={{
            maxWidth: 200,
            maxHeight: 200,
            borderRadius: 8,
            display: "block",
            objectFit: "contain",
          }}
        />
      );
    }
    if (msg.giphyId) {
      const src = `https://i.giphy.com/${msg.giphyId}.gif`;
      return (
        <img
          src={src}
          alt={type}
          draggable={false}
          style={stickerAndGiphyImgStyle(type)}
        />
      );
    }
  }

  if (type === "voice" && msg.voiceUrl) {
    return (
      <div>
        <div className={styles.bubble} style={{ marginBottom: 6 }}>
          Tin nhắn thoại
          {msg.voiceDuration != null
            ? ` · ${Math.round(msg.voiceDuration)}s`
            : ""}
        </div>
        <audio
          src={msg.voiceUrl}
          controls
          preload="metadata"
          style={{ maxWidth: "100%", height: 32 }}
        />
      </div>
    );
  }

  if (type === "system" || type === "welcome") {
    return (
      <div className={styles.bubble}>
        {renderTextWithCustomEmojis(
          text,
          emojiMap,
          emojiPx,
          isJumboEmojiRow,
        )}
      </div>
    );
  }

  const attach = Array.isArray(msg.attachments) ? msg.attachments : [];
  const images = attach.filter((u) => /\.(png|jpe?g|gif|webp)(\?|$)/i.test(u));

  return (
    <div className={styles.bubble}>
      {text
        ? renderTextWithCustomEmojis(
            text,
            emojiMap,
            emojiPx,
            isJumboEmojiRow,
          )
        : null}
      {images.map((url) => (
        <img
          key={url}
          src={url}
          alt=""
          className={styles.attachmentImg}
          draggable={false}
        />
      ))}
    </div>
  );
}

function formatTime(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function senderLabel(s: RawMessage["senderId"]) {
  if (!s) return "Người dùng";
  return (
    s.displayName?.trim() ||
    s.username?.trim() ||
    s.email?.split("@")[0] ||
    "Người dùng"
  );
}

export default function AdminServerReadOnlyPage() {
  const router = useRouter();
  const params = useParams<{ serverId: string }>();
  const serverId = String(params?.serverId || "");

  const [bootChecked, setBootChecked] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [serverName, setServerName] = useState("");
  const [channels, setChannels] = useState<AdminServerViewResponse["channels"]>(
    [],
  );
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(
    null,
  );
  const [messages, setMessages] = useState<RawMessage[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [msgError, setMsgError] = useState<string | null>(null);
  const [emojiMap, setEmojiMap] = useState<Record<string, string>>({});

  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("adminAccessToken") || ""
      : "";

  useEffect(() => {
    if (typeof window === "undefined") return;
    const t = localStorage.getItem("adminAccessToken") || "";
    if (!t) {
      router.replace("/login");
      return;
    }
    const decoded = decodeJwt(t);
    if (!decoded?.roles?.includes("admin")) {
      router.replace("/login");
      return;
    }
    if (decoded.exp && decoded.exp * 1000 < Date.now()) {
      router.replace("/login");
      return;
    }
    setBootChecked(true);
  }, [router]);

  useEffect(() => {
    if (!bootChecked || !serverId || !token) return;
    let cancelled = false;
    setLoadError(null);
    (async () => {
      try {
        const [view, emojiRes] = await Promise.all([
          fetchAdminServerView(serverId, token),
          fetchAdminEmojiPicker(serverId, token).catch(() => ({
            contextServerId: serverId,
            groups: [] as { serverId: string; emojis: { name: string; imageUrl: string }[] }[],
          })),
        ]);
        if (cancelled) return;
        setServerName(view.server?.name || "Máy chủ");
        const ch = [...(view.channels || [])].sort(
          (a, b) => (a.position ?? 0) - (b.position ?? 0),
        );
        setChannels(ch);
        setEmojiMap(buildEmojiRenderMap(serverId, emojiRes));
        const firstText = ch.find((c) => c.type === "text");
        setSelectedChannelId(firstText ? String(firstText._id) : null);
      } catch (e) {
        if (!cancelled) {
          setLoadError(
            e instanceof Error ? e.message : "Không tải được máy chủ",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bootChecked, serverId, token]);

  const loadMessages = useCallback(
    async (channelId: string) => {
      if (!token || !serverId) return;
      setMsgLoading(true);
      setMsgError(null);
      try {
        const pack = await fetchAdminChannelMessages(
          serverId,
          channelId,
          token,
          100,
          0,
        );
        const list = (pack.messages || []) as RawMessage[];
        setMessages(list);
      } catch (e) {
        setMessages([]);
        setMsgError(
          e instanceof Error ? e.message : "Không tải được tin nhắn",
        );
      } finally {
        setMsgLoading(false);
      }
    },
    [serverId, token],
  );

  useEffect(() => {
    if (!selectedChannelId) {
      setMessages([]);
      return;
    }
    const ch = channels.find((c) => String(c._id) === selectedChannelId);
    if (ch?.type !== "text") {
      setMessages([]);
      return;
    }
    void loadMessages(selectedChannelId);
  }, [selectedChannelId, channels, loadMessages]);

  const selectedChannel = useMemo(
    () => channels.find((c) => String(c._id) === selectedChannelId),
    [channels, selectedChannelId],
  );

  const textChannels = useMemo(
    () => channels.filter((c) => c.type === "text"),
    [channels],
  );
  const voiceChannels = useMemo(
    () => channels.filter((c) => c.type === "voice"),
    [channels],
  );

  if (!bootChecked) {
    return (
      <div className={styles.page}>
        <div className={styles.empty}>Đang kiểm tra phiên đăng nhập…</div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.topBar}>
        <Link href="/community-discovery" className={styles.backLink}>
          ← Quay lại Khám phá cộng đồng
        </Link>
        <div className={styles.titleBlock}>
          <div className={styles.serverName}>{serverName || "—"}</div>
        </div>
        <span className={styles.badge}>Chỉ xem</span>
      </header>

      {loadError ? (
        <div className={styles.error}>{loadError}</div>
      ) : (
        <div className={styles.body}>
          <aside className={styles.channelRail}>
            <div className={styles.railHeader}>Kênh chat</div>
            <div className={styles.channelList}>
              {textChannels.map((c) => {
                const id = String(c._id);
                const active = id === selectedChannelId;
                return (
                  <button
                    key={id}
                    type="button"
                    className={`${styles.channelBtn} ${active ? styles.channelBtnActive : ""}`}
                    onClick={() => setSelectedChannelId(id)}
                  >
                    <span>#</span>
                    <span>{c.name}</span>
                  </button>
                );
              })}
            </div>
            {voiceChannels.length > 0 ? (
              <>
                <div className={styles.railHeader}>Kênh thoại</div>
                <div className={styles.channelList}>
                  {voiceChannels.map((c) => (
                    <div
                      key={String(c._id)}
                      className={`${styles.channelBtn} ${styles.channelVoice}`}
                      title="Chỉ xem danh sách kênh — không có lịch sử chat"
                    >
                      <span aria-hidden>🔊</span>
                      <span>{c.name}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </aside>

          <main className={styles.main}>
            <div className={styles.channelTitle}>
              {selectedChannel
                ? selectedChannel.type === "text"
                  ? `# ${selectedChannel.name}`
                  : "Chọn kênh chat"
                : "Không có kênh chat"}
            </div>
            <div className={styles.messagesScroll}>
              {msgError ? (
                <div className={styles.error}>{msgError}</div>
              ) : msgLoading ? (
                <div className={styles.empty}>Đang tải tin nhắn…</div>
              ) : !selectedChannelId ||
                selectedChannel?.type !== "text" ? (
                <div className={styles.empty}>
                  Chọn một kênh chat để xem nội dung.
                </div>
              ) : messages.length === 0 ? (
                <div className={styles.empty}>Chưa có tin nhắn.</div>
              ) : (
                messages.map((msg) => {
                  const rx = msg.reactions || [];
                  const grouped = new Map<string, number>();
                  for (const r of rx) {
                    const e = r.emoji || "";
                    grouped.set(e, (grouped.get(e) || 0) + 1);
                  }
                  return (
                    <div key={String(msg._id)} className={styles.msgRow}>
                      {msg.senderId?.avatarUrl ? (
                        <img
                          src={msg.senderId.avatarUrl}
                          alt=""
                          className={styles.avatar}
                        />
                      ) : (
                        <div
                          className={`${styles.avatar} ${styles.avatarPlaceholder}`}
                        >
                          {senderLabel(msg.senderId).charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className={styles.msgBody}>
                        <div className={styles.msgMeta}>
                          <span className={styles.author}>
                            {senderLabel(msg.senderId)}
                          </span>
                          <span className={styles.time}>
                            {formatTime(msg.createdAt)}
                          </span>
                        </div>
                        {msg.replyTo ? (
                          <div
                            style={{
                              fontSize: 12,
                              color: "#949ba4",
                              marginBottom: 4,
                              borderLeft: "3px solid #4e5058",
                              paddingLeft: 8,
                            }}
                          >
                            Trả lời:{" "}
                            {msg.replyTo.messageType === "gif"
                              ? "GIF"
                              : msg.replyTo.messageType === "sticker"
                                ? "Sticker"
                                : msg.replyTo.content || "…"}
                          </div>
                        ) : null}
                        <MessageBubble msg={msg} emojiMap={emojiMap} />
                        {grouped.size > 0 ? (
                          <div className={styles.reactionsReadonly}>
                            {[...grouped.entries()].map(([emoji, n]) => (
                              <span
                                key={emoji}
                                className={styles.reactionPill}
                              >
                                {emoji} {n}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </main>
        </div>
      )}

      <footer className={styles.footerNote}>
        Chế độ xem Admin — chỉ đọc. Không chat, không thêm reaction, không thao
        tác máy chủ. Emoji máy chủ hiển thị theo dữ liệu duyệt.
      </footer>
    </div>
  );
}
